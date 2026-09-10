import { Injectable } from "@nestjs/common";
import type { EntryStatus, ShiftKind } from "@prisma/client";
import { unitScope } from "../access/scope";
import type { CurrentContext } from "../context/current-context";
import { fromDateColumn, shiftDays, toDateColumn, todayInStore } from "../domain/dates";
import { dueState, periodFor, type DueState } from "../domain/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { TemplatesService, type LoadedTemplate } from "./templates.service";

const COUNTED: EntryStatus[] = ["submitted", "issue_open", "issue_resolved"];

export type Assignee = { userId: string; name: string };

export type TaskRow = {
  templateId: string;
  templateKey: string;
  nameZh: string;
  nameDe: string;
  layout: string;
  timing: string;
  frequencyKind: string;
  frequencyTimes: number;
  columnCount: number;
  due: DueState;
  /** 派给哪个班次；没派单的表这里是 null（员工培训表就是） */
  shiftKind: ShiftKind | null;
  /** 那天上这个班的人。班表没排就是空数组，界面上写「班表未排」 */
  assignees: Assignee[];
  lastEntry: {
    entryDate: string;
    filledByName: string;
    status: EntryStatus;
    hasBreach: boolean;
    summary: string;
  } | null;
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
  ) {}

  /** 店长主页：本店今天的全貌 */
  async storeTasks(ctx: CurrentContext, isoDate: string): Promise<TaskRow[]> {
    const loaded = await this.templates.listActive(ctx);
    const rows: TaskRow[] = [];
    for (const item of loaded) rows.push(await this.buildRow(ctx, item, isoDate));
    return rows;
  }

  /** 员工端「等你处理」：只有真派给他的那几张，且这个周期还没做够 */
  async myTasks(ctx: CurrentContext, isoDate: string): Promise<TaskRow[]> {
    const rows = await this.storeTasks(ctx, isoDate);
    return rows.filter((row) => row.due.due && row.assignees.some((person) => person.userId === ctx.userId));
  }

  /** 这张表这一天是不是真派给了这个人。填表前的边界检查用它。 */
  async isAssignedTo(ctx: CurrentContext, templateId: string, isoDate: string, userId: string): Promise<boolean> {
    const shiftKind = await this.shiftKindFor(ctx, templateId, isoDate);
    if (!shiftKind) return false;
    const assignees = await this.assigneesFor(ctx, isoDate, shiftKind);
    return assignees.some((person) => person.userId === userId);
  }

  /** 过去 N 天里每日表空着的日子，按表聚合。漏填不是「今天忘了」，是「上周三忘了、月底才发现」。 */
  async missedDays(ctx: CurrentContext, isoDate: string, days = 7): Promise<
    { templateId: string; nameZh: string; missing: string[] }[]
  > {
    const loaded = (await this.templates.listActive(ctx)).filter(
      (item) => item.template.frequencyKind === "daily",
    );
    const from = shiftDays(isoDate, -days);

    const entries = await this.prisma.formEntry.findMany({
      where: {
        ...unitScope(ctx),
        voidedAt: null,
        status: { in: COUNTED },
        entryDate: { gte: toDateColumn(from), lt: toDateColumn(isoDate) },
      },
      select: { templateId: true, entryDate: true },
    });

    const filled = new Set(entries.map((entry) => `${entry.templateId}|${fromDateColumn(entry.entryDate)}`));
    const result: { templateId: string; nameZh: string; missing: string[] }[] = [];

    for (const item of loaded) {
      const missing: string[] = [];
      for (let offset = days; offset >= 1; offset -= 1) {
        const day = shiftDays(isoDate, -offset);
        if (!filled.has(`${item.template.id}|${day}`)) missing.push(day);
      }
      if (missing.length > 0) {
        result.push({ templateId: item.template.id, nameZh: item.version.nameZh, missing });
      }
    }
    return result;
  }

  private async buildRow(ctx: CurrentContext, item: LoadedTemplate, isoDate: string): Promise<TaskRow> {
    const { template, version, columns } = item;
    const window = periodFor(template.frequencyKind, isoDate);

    const doneInPeriod = await this.prisma.formEntry.count({
      where: {
        ...unitScope(ctx),
        templateId: template.id,
        voidedAt: null,
        status: { in: COUNTED },
        entryDate: { gte: toDateColumn(window.start), lte: toDateColumn(window.end) },
      },
    });

    const shiftKind = await this.shiftKindFor(ctx, template.id, isoDate);
    const assignees = shiftKind ? await this.assigneesFor(ctx, isoDate, shiftKind) : [];

    const last = await this.prisma.formEntry.findFirst({
      where: { ...unitScope(ctx), templateId: template.id, voidedAt: null, status: { in: COUNTED } },
      orderBy: [{ entryDate: "desc" }, { submittedAt: "desc" }],
      include: { createdBy: { select: { name: true } } },
    });

    return {
      templateId: template.id,
      templateKey: template.key,
      nameZh: version.nameZh,
      nameDe: version.nameDe,
      layout: template.layout,
      timing: template.timing,
      frequencyKind: template.frequencyKind,
      frequencyTimes: template.frequencyTimes,
      columnCount: columns.length,
      due: dueState(template.frequencyKind, template.frequencyTimes, doneInPeriod, isoDate),
      shiftKind,
      assignees,
      lastEntry: last
        ? {
            entryDate: fromDateColumn(last.entryDate),
            filledByName: last.createdBy.name,
            status: last.status,
            hasBreach: last.status !== "submitted",
            // 上次填写显示实测值：冰箱是慢慢坏的，「昨天 5.2 今天 6.8」比「昨天 Lisa 填的」有用
            summary: summarise(last.values as Record<string, unknown>, columns.map((column) => column.id)),
          }
        : null,
    };
  }

  private async shiftKindFor(ctx: CurrentContext, templateId: string, isoDate: string): Promise<ShiftKind | null> {
    const date = toDateColumn(isoDate);
    const assignment = await this.prisma.formAssignment.findFirst({
      where: {
        ...unitScope(ctx),
        templateId,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    return assignment?.shiftKind ?? null;
  }

  private async assigneesFor(ctx: CurrentContext, isoDate: string, kind: ShiftKind): Promise<Assignee[]> {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: { ...unitScope(ctx), date: toDateColumn(isoDate), kind },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({ userId: row.user.id, name: row.user.name }));
  }
}

function summarise(values: Record<string, unknown>, columnIds: string[]): string {
  const parts: string[] = [];
  for (const id of columnIds) {
    const value = values[id];
    if (value === undefined || value === null || value === "") continue;
    parts.push(Array.isArray(value) ? `${value.length} 项` : String(value));
    if (parts.length >= 5) break;
  }
  return parts.join(" · ");
}

export { todayInStore };
