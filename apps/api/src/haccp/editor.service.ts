import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AccessService } from "../access/access.service";
import { unitScope } from "../access/scope";
import { BusinessError, NotFoundInScopeError } from "../common/business-error";
import type { CurrentContext } from "../context/current-context";
import { parseColumns, type Column } from "../domain/columns";
import { PrismaService } from "../prisma/prisma.service";
import { TemplatesService } from "./templates.service";

export type ColumnInput = {
  /** 已有列带原来的 id；新列传空字符串，由后端分配 */
  id?: string;
  labelZh: string;
  labelDe?: string;
  type: Column["type"];
  unit?: string;
  optional?: boolean;
  multiline?: boolean;
  noteZh?: string;
  placeholderZh?: string;
  limit?: { min?: number | null; max?: number | null; tolerance?: number | null };
  /** choice / checklist：一行一个，支持「中文|Deutsch」 */
  optionsText?: string;
  breachOn?: string[];
  requireAll?: boolean;
};

const TYPES: Column["type"][] = ["temp", "number", "text", "choice", "checklist", "person", "signature"];

@Injectable()
export class EditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly access: AccessService,
  ) {}

  /** 表单管理列表：名称、频次、测量点数、版本、已有记录数、状态 */
  async list(ctx: CurrentContext) {
    this.access.assertCanManageHaccp(ctx);
    const templates = await this.prisma.formTemplate.findMany({
      where: unitScope(ctx),
      include: { versions: { orderBy: { version: "asc" } }, _count: { select: { entries: true } } },
      orderBy: { createdAt: "asc" },
    });

    return templates.map((template) => {
      const current = template.versions.find((version) => version.version === template.currentVersion);
      return {
        id: template.id,
        key: template.key,
        nameZh: current?.nameZh ?? template.key,
        nameDe: current?.nameDe ?? "",
        layout: template.layout,
        frequencyKind: template.frequencyKind,
        frequencyTimes: template.frequencyTimes,
        columnCount: current ? parseColumns(current.columns).length : 0,
        currentVersion: template.currentVersion,
        versions: template.versions.map((version) => version.version),
        entryCount: template._count.entries,
        active: template.active,
      };
    });
  }

  async editor(ctx: CurrentContext, templateId: string) {
    this.access.assertCanManageHaccp(ctx);
    const loaded = await this.templates.load(ctx, templateId);
    const entryCount = await this.prisma.formEntry.count({ where: { templateId, ...unitScope(ctx) } });

    return {
      id: loaded.template.id,
      key: loaded.template.key,
      layout: loaded.template.layout,
      frequencyKind: loaded.template.frequencyKind,
      frequencyTimes: loaded.template.frequencyTimes,
      active: loaded.template.active,
      currentVersion: loaded.template.currentVersion,
      nextVersion: loaded.template.currentVersion + 1,
      entryCount,
      nameZh: loaded.version.nameZh,
      nameDe: loaded.version.nameDe,
      columns: loaded.columns,
      footnotes: loaded.version.footnotes,
    };
  }

  /**
   * 保存 = 生成新版本，旧版本原样留着。已有记录锁在自己那一版，所以改名改限值都不会串到历史里。
   *
   * 最要紧的一条：**新列不复用被删掉的列 id**。删了 c5 再加一列如果还叫 c5，
   * 旧记录里 c5 的值就会被新列错认。所以扫的是这张表全部历史版本，不是当前版本。
   */
  async saveVersion(
    ctx: CurrentContext,
    templateId: string,
    input: { nameZh: string; nameDe: string; columns: ColumnInput[] },
  ) {
    this.access.assertCanManageHaccp(ctx);
    if (input.columns.length === 0) throw new BusinessError("NO_COLUMNS", "一张表至少得有一个测量点");
    if (input.nameZh.trim() === "") throw new BusinessError("NAME_REQUIRED", "表名不能空");

    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, ...unitScope(ctx) },
      include: { versions: true },
    });
    if (!template) throw new NotFoundInScopeError();

    const previous = new Map<string, Column>();
    const usedIds = new Set<string>();
    for (const version of template.versions) {
      for (const column of parseColumns(version.columns)) {
        usedIds.add(column.id);
        if (version.version === template.currentVersion) previous.set(column.id, column);
      }
    }

    // 新列的 id 从「这张表历史上用过的最大编号」往后取，绝不回收
    let highest = 0;
    for (const id of usedIds) {
      const match = /^c(\d+)$/.exec(id);
      if (match) highest = Math.max(highest, Number(match[1]));
    }
    const nextId = (): string => {
      highest += 1;
      const candidate = `c${highest}`;
      usedIds.add(candidate);
      return candidate;
    };

    const columns: Column[] = input.columns.map((raw) => {
      if (!TYPES.includes(raw.type)) throw new BusinessError("BAD_COLUMN_TYPE", `不认识的列类型：${raw.type}`);
      if (raw.labelZh.trim() === "") throw new BusinessError("COLUMN_LABEL_REQUIRED", "每个测量点都要有名字");

      const existing = raw.id ? previous.get(raw.id) : undefined;
      if (raw.id && !existing) {
        // 传了一个当前版本没有的 id：要么是瞎编的，要么是想把删掉的列按原 id 找回来。
        // 两种都不行 —— 后者会让旧记录里那一列的值被新列错认。
        throw new BusinessError("UNKNOWN_COLUMN", `当前版本没有 ${raw.id} 这一列，删掉的列不能按原 id 加回来`);
      }

      const column: Column = {
        id: existing ? existing.id : nextId(),
        label: { zh: raw.labelZh.trim(), de: raw.labelDe?.trim() || raw.labelZh.trim() },
        type: raw.type,
      };

      if (raw.unit?.trim()) column.unit = raw.unit.trim();
      if (raw.optional) column.optional = true;
      if (raw.multiline) column.multiline = true;
      if (raw.noteZh?.trim()) column.note = { zh: raw.noteZh.trim() };
      if (raw.placeholderZh?.trim()) column.placeholder = { zh: raw.placeholderZh.trim() };

      // 条件限值在编辑器里只读：出餐温度按热菜冷菜切限值这种是预置模板的高级特性，
      // 假装能改比不给改更糟。原样带过去。
      if (existing?.limitBy) column.limitBy = existing.limitBy;

      const limit = cleanLimit(raw.limit);
      if (limit && !column.limitBy) column.limit = limit;

      if (raw.type === "choice" || raw.type === "checklist") {
        const parsed = parseOptions(raw.optionsText ?? "");
        if (parsed.length === 0) throw new BusinessError("OPTIONS_REQUIRED", `「${column.label.zh}」要有选项`);
        if (raw.type === "choice") {
          column.options = parsed;
          const valid = new Set(parsed.map((option) => option.zh));
          const breachOn = (raw.breachOn ?? []).filter((value) => valid.has(value));
          if (breachOn.length > 0) column.breachOn = breachOn;
        } else {
          column.items = parsed;
          if (raw.requireAll !== false) column.requireAll = true;
        }
      }

      return column;
    });

    const version = template.currentVersion + 1;
    const currentVersion = template.versions.find((row) => row.version === template.currentVersion);

    await this.prisma.$transaction([
      this.prisma.formTemplateVersion.create({
        data: {
          templateId: template.id,
          version,
          nameZh: input.nameZh.trim(),
          nameDe: input.nameDe.trim() || input.nameZh.trim(),
          columns: columns as unknown as Prisma.InputJsonValue,
          header: (currentVersion?.header ?? undefined) as Prisma.InputJsonValue | undefined,
          footnotes: (currentVersion?.footnotes ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      }),
      this.prisma.formTemplate.update({ where: { id: template.id }, data: { currentVersion: version } }),
    ]);

    return this.editor(ctx, templateId);
  }

  /**
   * 停用 = 归档，不物理删除。已有记录的表单被真删掉，卫生局资料包会出洞。
   */
  async setActive(ctx: CurrentContext, templateId: string, active: boolean) {
    this.access.assertCanManageHaccp(ctx);
    const template = await this.prisma.formTemplate.findFirst({ where: { id: templateId, ...unitScope(ctx) } });
    if (!template) throw new NotFoundInScopeError();
    return this.prisma.formTemplate.update({ where: { id: template.id }, data: { active } });
  }
}

function cleanLimit(limit: ColumnInput["limit"]): Column["limit"] | undefined {
  if (!limit) return undefined;
  const result: NonNullable<Column["limit"]> = {};
  if (typeof limit.min === "number" && Number.isFinite(limit.min)) result.min = limit.min;
  if (typeof limit.max === "number" && Number.isFinite(limit.max)) result.max = limit.max;
  if (typeof limit.tolerance === "number" && Number.isFinite(limit.tolerance)) result.tolerance = limit.tolerance;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** 一行一个选项，支持「中文|Deutsch」——店长自己加的选项也就有了德语 */
function parseOptions(text: string): { zh: string; de?: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const [zh, de] = line.split("|").map((part) => part.trim());
      return de ? { zh: zh ?? line, de } : { zh: zh ?? line };
    });
}
