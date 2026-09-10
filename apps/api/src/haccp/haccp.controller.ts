import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { HaccpAccessGuard, RequireHaccpFill } from "../access/haccp-access.guard";
import { Ctx } from "../context/ctx.decorator";
import type { CurrentContext } from "../context/current-context";
import { SessionGuard } from "../context/session.guard";
import { todayInStore } from "../domain/dates";
import { evaluate } from "../domain/evaluate";
import { EntriesService } from "./entries.service";
import { DateQuery, ListEntriesQuery, MonthQuery, SaveDraftDto, SubmitDto, VoidDto } from "./haccp.dto";
import { ReportService } from "./report.service";
import { TasksService } from "./tasks.service";
import { TemplatesService } from "./templates.service";

/**
 * 员工和店长共用的那一半：看今天要填什么、打开表、存草稿、提交、作废重填、翻历史。
 * 每个方法声明需要什么能力，查询一律带 unitScope(ctx)。
 */
@ApiTags("haccp")
@Controller("haccp")
@UseGuards(SessionGuard, HaccpAccessGuard)
export class HaccpController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly tasks: TasksService,
    private readonly entries: EntriesService,
    private readonly reports: ReportService,
  ) {}

  /** 月度表：跟纸质原表同一个版式，可打印可给检查员看 */
  @Get("templates/:id/monthly")
  @RequireHaccpFill()
  monthly(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Query() query: MonthQuery) {
    return this.reports.monthly(ctx, id, query.month ?? todayInStore().slice(0, 7));
  }

  /** 员工端「等你处理」：只有真派给他、且这个周期还没做够的 */
  @Get("my-tasks")
  @RequireHaccpFill()
  async myTasks(@Ctx() ctx: CurrentContext, @Query() query: DateQuery) {
    const date = query.date ?? todayInStore();
    return { date, tasks: await this.tasks.myTasks(ctx, date) };
  }

  /** 本店今天的全貌。员工也看得到，但他能填的只有派给他的那几张。 */
  @Get("tasks")
  @RequireHaccpFill()
  async storeTasks(@Ctx() ctx: CurrentContext, @Query() query: DateQuery) {
    const date = query.date ?? todayInStore();
    const [tasks, missed] = await Promise.all([
      this.tasks.storeTasks(ctx, date),
      this.tasks.missedDays(ctx, date),
    ]);
    return { date, today: todayInStore(), tasks, missed };
  }

  @Get("templates")
  @RequireHaccpFill()
  async listTemplates(@Ctx() ctx: CurrentContext) {
    const loaded = await this.templates.listActive(ctx);
    return loaded.map((item) => ({
      id: item.template.id,
      key: item.template.key,
      nameZh: item.version.nameZh,
      nameDe: item.version.nameDe,
      layout: item.template.layout,
      version: item.version.version,
      columns: item.columns,
      header: item.header,
      footnotes: item.version.footnotes,
    }));
  }

  /** 打开填表页要的一切：列定义、我这天的草稿、这天是不是补填 */
  @Get("templates/:id/form")
  @RequireHaccpFill()
  async form(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Query() query: DateQuery) {
    const date = query.date ?? todayInStore();
    const loaded = await this.templates.load(ctx, id);
    const draft = await this.entries.myDraft(ctx, id, date);
    return {
      date,
      today: todayInStore(),
      isLate: date < todayInStore(),
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
      draft: draft ? { id: draft.id, values: draft.values } : null,
    };
  }

  /** 前端即时反馈用的试算。能不能提交仍由 submit 说了算。 */
  @Post("templates/:id/check")
  @RequireHaccpFill()
  async check(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Body() body: SaveDraftDto) {
    const loaded = await this.templates.load(ctx, id);
    return evaluate(loaded.columns, body.values);
  }

  @Post("drafts")
  @RequireHaccpFill()
  async saveDraft(@Ctx() ctx: CurrentContext, @Body() body: SaveDraftDto) {
    const draft = await this.entries.saveDraft(ctx, body);
    return { id: draft.id, savedAt: draft.updatedAt };
  }

  @Delete("drafts/:id")
  @RequireHaccpFill()
  async discardDraft(@Ctx() ctx: CurrentContext, @Param("id") id: string) {
    await this.entries.discardDraft(ctx, id);
    return { ok: true };
  }

  @Post("entries")
  @RequireHaccpFill()
  async submit(@Ctx() ctx: CurrentContext, @Body() body: SubmitDto) {
    const entry = await this.entries.submit(ctx, body);
    return { id: entry.id, status: entry.status, isLate: entry.isLate };
  }

  @Post("entries/:id/void")
  @RequireHaccpFill()
  async voidEntry(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Body() body: VoidDto) {
    const entry = await this.entries.voidEntry(ctx, id, body.reason);
    return { id: entry.id, voidedAt: entry.voidedAt };
  }

  @Get("entries")
  @RequireHaccpFill()
  async listEntries(@Ctx() ctx: CurrentContext, @Query() query: ListEntriesQuery) {
    const rows = await this.entries.list(ctx, query);
    return rows.map((entry) => ({
      id: entry.id,
      templateId: entry.templateId,
      templateVersion: entry.templateVersion,
      entryDate: entry.entryDate.toISOString().slice(0, 10),
      status: entry.status,
      isLate: entry.isLate,
      lateReason: entry.lateReason,
      filledByName: entry.createdBy.name,
      voidedAt: entry.voidedAt,
      voidReason: entry.voidReason,
      resolvedByName: entry.resolvedBy?.name ?? null,
    }));
  }

  @Get("entries/:id")
  @RequireHaccpFill()
  async getEntry(@Ctx() ctx: CurrentContext, @Param("id") id: string) {
    const entry = await this.entries.get(ctx, id);
    const loaded = await this.templates.load(ctx, entry.templateId, entry.templateVersion);
    return {
      id: entry.id,
      entryDate: entry.entryDate.toISOString().slice(0, 10),
      status: entry.status,
      values: entry.values,
      breaches: entry.breaches,
      correctiveAction: entry.correctiveAction,
      header: entry.header,
      isLate: entry.isLate,
      lateReason: entry.lateReason,
      filledBy: entry.createdBy,
      submittedAt: entry.submittedAt,
      voidedAt: entry.voidedAt,
      voidReason: entry.voidReason,
      voidedByName: entry.voidedBy?.name ?? null,
      resolvedAt: entry.resolvedAt,
      resolutionNote: entry.resolutionNote,
      resolvedByName: entry.resolvedBy?.name ?? null,
      workOrders: entry.workOrders,
      template: {
        id: loaded.template.id,
        nameZh: loaded.version.nameZh,
        nameDe: loaded.version.nameDe,
        version: loaded.version.version,
        columns: loaded.columns,
        footnotes: loaded.version.footnotes,
      },
    };
  }
}
