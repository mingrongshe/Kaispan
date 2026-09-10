import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { HaccpAccessGuard, RequireHaccpFill, RequireHaccpManage } from "../access/haccp-access.guard";
import { Ctx } from "../context/ctx.decorator";
import type { CurrentContext } from "../context/current-context";
import { SessionGuard } from "../context/session.guard";
import { todayInStore } from "../domain/dates";
import {
  AssignTemplateDto,
  MonthQuery,
  ResolveDto,
  SaveTemplateVersionDto,
  SetActiveDto,
  SetShiftDefinitionDto,
  SetShiftDto,
  WeekQuery,
} from "./haccp.dto";
import { EditorService } from "./editor.service";
import { ManageService } from "./manage.service";
import { ReportService } from "./report.service";

/** 店长那一层：处理异常、排班、派单。员工调这里一律 403。 */
@ApiTags("haccp-manage")
@Controller("haccp/manage")
@UseGuards(SessionGuard, HaccpAccessGuard)
export class ManageController {
  constructor(
    private readonly manage: ManageService,
    private readonly reports: ReportService,
    private readonly editor: EditorService,
  ) {}

  // ---------------------------------------------------------------- 表单管理与编辑器

  @Get("templates")
  @RequireHaccpManage()
  templates(@Ctx() ctx: CurrentContext) {
    return this.editor.list(ctx);
  }

  @Get("templates/:id/editor")
  @RequireHaccpManage()
  templateEditor(@Ctx() ctx: CurrentContext, @Param("id") id: string) {
    return this.editor.editor(ctx, id);
  }

  /** 保存生成新版本，旧版本原样留着，已有记录锁在自己那一版 */
  @Post("templates/:id/versions")
  @RequireHaccpManage()
  saveVersion(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Body() body: SaveTemplateVersionDto) {
    return this.editor.saveVersion(ctx, id, {
      nameZh: body.nameZh,
      nameDe: body.nameDe ?? "",
      columns: body.columns,
    });
  }

  /** 停用 = 归档，不物理删除。已有记录的表被真删掉，卫生局资料包会出洞。 */
  @Put("templates/:id/active")
  @RequireHaccpManage()
  setActive(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Body() body: SetActiveDto) {
    return this.editor.setActive(ctx, id, body.active);
  }

  /** 检查模式：一次给出这个月全部表，只读，屏幕转过去就能给检查员看 */
  @Get("inspection")
  @RequireHaccpManage()
  inspection(@Ctx() ctx: CurrentContext, @Query() query: MonthQuery) {
    return this.reports.inspection(ctx, query.month ?? todayInStore().slice(0, 7));
  }

  /** 按设备 / 测量点聚合的待处理，店长主页用这个 */
  @Get("issue-groups")
  @RequireHaccpManage()
  issueGroups(@Ctx() ctx: CurrentContext) {
    return this.manage.issueGroups(ctx);
  }

  @Get("issues")
  @RequireHaccpManage()
  async issues(@Ctx() ctx: CurrentContext) {
    const rows = await this.manage.openIssues(ctx);
    return rows.map((entry) => ({
      id: entry.id,
      templateId: entry.templateId,
      templateKey: entry.template.key,
      entryDate: entry.entryDate.toISOString().slice(0, 10),
      filledByName: entry.createdBy.name,
      breaches: entry.breaches,
      correctiveAction: entry.correctiveAction,
      openWorkOrders: entry.workOrders.filter((order) => order.completedAt === null),
    }));
  }

  @Get("issues/:id/equipment-candidates")
  @RequireHaccpManage()
  candidates(@Ctx() ctx: CurrentContext, @Param("id") id: string) {
    return this.manage.equipmentCandidates(ctx, id);
  }

  @Post("issues/:id/resolve")
  @RequireHaccpManage()
  async resolve(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Body() body: ResolveDto) {
    const entry = await this.manage.resolveIssue(ctx, id, body);
    return { id: entry.id, status: entry.status, workOrders: entry.workOrders };
  }

  @Put("templates/:id/assignment")
  @RequireHaccpManage()
  assign(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Body() body: AssignTemplateDto) {
    return this.manage.assignTemplateToShift(ctx, id, body.shiftKind ?? null, body.fromDate);
  }

  /** 班表店长和员工都看得到；只有店长能改 */
  @Get("shifts")
  @RequireHaccpFill()
  shifts(@Ctx() ctx: CurrentContext, @Query() query: WeekQuery) {
    return this.manage.shiftsBetween(ctx, query.from, query.to);
  }

  @Put("shifts")
  @RequireHaccpManage()
  setShift(@Ctx() ctx: CurrentContext, @Body() body: SetShiftDto) {
    return this.manage.setShift(ctx, body.date, body.kind, body.userIds);
  }

  @Get("shift-definitions")
  @RequireHaccpFill()
  shiftDefinitions(@Ctx() ctx: CurrentContext) {
    return this.manage.shiftDefinitions(ctx);
  }

  @Put("shift-definitions")
  @RequireHaccpManage()
  setShiftDefinition(@Ctx() ctx: CurrentContext, @Body() body: SetShiftDefinitionDto) {
    return this.manage.setShiftDefinition(ctx, body.kind, body.startMinutes, body.endMinutes);
  }

  @Get("staff")
  @RequireHaccpManage()
  staff(@Ctx() ctx: CurrentContext) {
    return this.manage.staff(ctx);
  }
}
