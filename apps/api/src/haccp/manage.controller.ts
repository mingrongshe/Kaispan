import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { HaccpAccessGuard, RequireHaccpFill, RequireHaccpManage } from "../access/haccp-access.guard";
import { Ctx } from "../context/ctx.decorator";
import type { CurrentContext } from "../context/current-context";
import { SessionGuard } from "../context/session.guard";
import { AssignTemplateDto, ResolveDto, SetShiftDefinitionDto, SetShiftDto, WeekQuery } from "./haccp.dto";
import { ManageService } from "./manage.service";

/** 店长那一层：处理异常、排班、派单。员工调这里一律 403。 */
@ApiTags("haccp-manage")
@Controller("haccp/manage")
@UseGuards(SessionGuard, HaccpAccessGuard)
export class ManageController {
  constructor(private readonly manage: ManageService) {}

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
