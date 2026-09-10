import { Injectable } from "@nestjs/common";
import type { EntryStatus, FormLayout } from "@prisma/client";
import { unitScope } from "../access/scope";
import { AccessService } from "../access/access.service";
import { BusinessError } from "../common/business-error";
import type { CurrentContext } from "../context/current-context";
import type { Column, TemplateHeader } from "../domain/columns";
import { fromDateColumn, monthRange, toDateColumn, todayInStore } from "../domain/dates";
import { PrismaService } from "../prisma/prisma.service";
import { TemplatesService } from "./templates.service";

const COUNTED: EntryStatus[] = ["submitted", "issue_open", "issue_resolved"];

export type MonthlyCell = { columnId: string; value: string; breach: string | null };

export type MonthlyRow = {
  /** 月度网格版式是 1–31 每天一行；流水和培训版式是一条记录一行 */
  date: string;
  day: number;
  entryId: string | null;
  filledByName: string | null;
  status: EntryStatus | null;
  isLate: boolean;
  /** 这一天还没到，不算漏填 */
  future: boolean;
  /** 就是今天。截止点是当天午夜，所以今天没填还不算漏 */
  isToday: boolean;
  cells: MonthlyCell[];
};

export type MonthlyReport = {
  month: string;
  organizationName: string;
  unitName: string;
  layout: FormLayout;
  template: {
    id: string;
    key: string;
    nameZh: string;
    nameDe: string;
    version: number;
    columns: Column[];
    header: TemplateHeader;
    footnotes: unknown;
  };
  rows: MonthlyRow[];
  stats: { entries: number; breaches: number; missingDays: number; late: number };
};

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly access: AccessService,
  ) {}

  /**
   * 月度表：跟纸质原表同一个版式。月度网格一天一行，流水表一条记录一行。
   *
   * 表头的列取模板当前版本，但每条记录的值是按列 id 取的 —— 新列不复用被删掉的 id，
   * 所以改过版的月份不会串格。这一点是编辑器那边保证的（第二批），这里只是依赖它。
   */
  async monthly(ctx: CurrentContext, templateId: string, month: string): Promise<MonthlyReport> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BusinessError("BAD_MONTH", "月份格式应该是 YYYY-MM");

    const { start, end, days } = monthRange(month);
    const loaded = await this.templates.load(ctx, templateId);
    const unit = await this.prisma.unit.findFirstOrThrow({
      where: { id: ctx.unitId, organizationId: ctx.organizationId },
      include: { organization: { select: { name: true } } },
    });

    const entries = await this.prisma.formEntry.findMany({
      where: {
        ...unitScope(ctx),
        templateId,
        voidedAt: null,
        status: { in: COUNTED },
        entryDate: { gte: toDateColumn(start), lte: toDateColumn(end) },
      },
      orderBy: [{ entryDate: "asc" }, { submittedAt: "asc" }],
      include: { createdBy: { select: { name: true } } },
    });

    const today = todayInStore();
    const columnIds = loaded.columns.map((column) => column.id);

    const toCells = (entry: (typeof entries)[number]): MonthlyCell[] => {
      const values = entry.values as Record<string, unknown>;
      const breaches = (entry.breaches ?? {}) as Record<string, string>;
      return columnIds.map((columnId) => ({
        columnId,
        value: formatValue(values[columnId]),
        breach: breaches[columnId] ?? null,
      }));
    };

    let rows: MonthlyRow[];
    if (loaded.template.layout === "monthly_grid") {
      const byDate = new Map<string, (typeof entries)[number]>();
      for (const entry of entries) byDate.set(fromDateColumn(entry.entryDate), entry);

      rows = Array.from({ length: days }, (_, index) => {
        const day = index + 1;
        const date = `${month}-${String(day).padStart(2, "0")}`;
        const entry = byDate.get(date);
        return {
          date,
          day,
          entryId: entry?.id ?? null,
          filledByName: entry?.createdBy.name ?? null,
          status: entry?.status ?? null,
          isLate: entry?.isLate ?? false,
          future: date > today,
          isToday: date === today,
          cells: entry ? toCells(entry) : columnIds.map((columnId) => ({ columnId, value: "", breach: null })),
        };
      });
    } else {
      rows = entries.map((entry) => {
        const date = fromDateColumn(entry.entryDate);
        return {
          date,
          day: Number(date.slice(8)),
          entryId: entry.id,
          filledByName: entry.createdBy.name,
          status: entry.status,
          isLate: entry.isLate,
          future: false,
          isToday: date === today,
          cells: toCells(entry),
        };
      });
    }

    const breaches = entries.filter((entry) => entry.status !== "submitted").length;
    const missingDays =
      loaded.template.layout === "monthly_grid"
        // 截止点是记录日期的午夜，所以今天没填还不算漏
        ? rows.filter((row) => row.entryId === null && !row.future && !row.isToday).length
        : 0;

    return {
      month,
      organizationName: unit.organization.name,
      unitName: unit.name,
      layout: loaded.template.layout,
      template: {
        id: loaded.template.id,
        key: loaded.template.key,
        nameZh: loaded.version.nameZh,
        nameDe: loaded.version.nameDe,
        version: loaded.version.version,
        columns: loaded.columns,
        header: loaded.header,
        footnotes: loaded.version.footnotes,
      },
      rows,
      stats: {
        entries: entries.length,
        breaches,
        missingDays,
        late: entries.filter((entry) => entry.isLate).length,
      },
    };
  }

  /**
   * 导出 CSV。带 BOM，Excel 打开中文不乱码 —— 不带的话店长第一次打开就是一堆问号。
   */
  async monthlyCsv(ctx: CurrentContext, templateId: string, month: string): Promise<string> {
    const report = await this.monthly(ctx, templateId, month);
    const header = [
      report.layout === "monthly_grid" ? "日" : "日期",
      ...report.template.columns.map((column) => column.label.zh + (column.unit ? ` (${column.unit})` : "")),
      "填写人",
      "状态",
      "补填",
    ];

    const lines = [header.map(csvCell).join(",")];
    for (const row of report.rows) {
      if (row.future) continue;
      lines.push(
        [
          report.layout === "monthly_grid" ? String(row.day) : row.date,
          ...row.cells.map((cell) => (cell.breach ? `${cell.value} !` : cell.value)),
          row.filledByName ?? "",
          row.entryId ? statusLabel(row.status) : row.isToday ? "今天还没填" : "空着",
          row.isLate ? "是" : "",
        ].map(csvCell).join(","),
      );
    }

    return `\ufeff${lines.join("\r\n")}\r\n`;
  }

  /**
   * 检查模式：一次给出这个月全部七张表，只读、没有任何操作按钮，屏幕转过去就能给检查员看。
   * 顶部带一段「检查前自查」——哪张表本月缺记录、缺多少 —— 打印时隐藏，那是给店长看的，不是给检查员看的。
   */
  async inspection(ctx: CurrentContext, month: string) {
    this.access.assertCanManageHaccp(ctx);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BusinessError("BAD_MONTH", "月份格式应该是 YYYY-MM");

    const templates = await this.templates.listActive(ctx);
    const reports: MonthlyReport[] = [];
    for (const item of templates) reports.push(await this.monthly(ctx, item.template.id, month));

    const selfCheck = reports
      .filter((report) => report.stats.entries === 0 || report.stats.missingDays > 0)
      .map((report) => ({
        templateId: report.template.id,
        nameZh: report.template.nameZh,
        entries: report.stats.entries,
        missingDays: report.stats.missingDays,
      }));

    const first = reports[0];
    return {
      month,
      organizationName: first?.organizationName ?? "",
      unitName: first?.unitName ?? "",
      generatedAt: new Date().toISOString(),
      templateCount: reports.length,
      entryCount: reports.reduce((sum, report) => sum + report.stats.entries, 0),
      breachCount: reports.reduce((sum, report) => sum + report.stats.breaches, 0),
      selfCheck,
      reports,
    };
  }
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) return value.map(String).join("、");
  return String(value);
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function statusLabel(status: EntryStatus | null): string {
  if (status === "submitted") return "已完成";
  if (status === "issue_open") return "有异常待处理";
  if (status === "issue_resolved") return "异常已处理";
  return "";
}
