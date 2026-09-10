import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireHaccpFill, RequireHaccpManage, HaccpAccessGuard } from "../access/haccp-access.guard";
import { unitScope } from "../access/scope";
import { Ctx } from "../context/ctx.decorator";
import type { CurrentContext } from "../context/current-context";
import { SessionGuard } from "../context/session.guard";
import { PrismaService } from "../prisma/prisma.service";
import { EntrySummaryDto, ListEntriesQuery } from "./haccp.dto";

/**
 * 第一批的读接口。写接口（草稿、提交、作废、派单、处理异常）在骨架检查点之后加，
 * 但边界在这里已经定型：每个方法声明需要什么能力，查询一律带 unitScope(ctx)。
 */
@ApiTags("haccp")
@Controller("haccp")
@UseGuards(SessionGuard, HaccpAccessGuard)
export class HaccpController {
  constructor(private readonly prisma: PrismaService) {}

  /** 员工能只读看本店任何一张表的全部历史（产品范围第七节） */
  @Get("entries")
  @RequireHaccpFill()
  async listEntries(@Ctx() ctx: CurrentContext, @Query() query: ListEntriesQuery): Promise<EntrySummaryDto[]> {
    const entries = await this.prisma.formEntry.findMany({
      where: {
        ...unitScope(ctx),
        ...(query.templateId ? { templateId: query.templateId } : {}),
        // 草稿只有本人看得到
        OR: [{ status: { not: "draft" } }, { status: "draft", createdById: ctx.userId }],
        // 作废的默认不显示
        voidedAt: null,
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { createdBy: { select: { name: true } } },
    });

    return entries.map((entry) => ({
      id: entry.id,
      templateId: entry.templateId,
      templateVersion: entry.templateVersion,
      entryDate: entry.entryDate.toISOString().slice(0, 10),
      status: entry.status,
      isLate: entry.isLate,
      filledByName: entry.createdBy.name,
    }));
  }

  /** 店长的待处理：只有超标的记录进这里，正常记录提交即完成 */
  @Get("manage/issues")
  @RequireHaccpManage()
  async listOpenIssues(@Ctx() ctx: CurrentContext): Promise<EntrySummaryDto[]> {
    const entries = await this.prisma.formEntry.findMany({
      where: { ...unitScope(ctx), status: "issue_open", voidedAt: null },
      orderBy: [{ entryDate: "asc" }],
      include: { createdBy: { select: { name: true } } },
    });

    return entries.map((entry) => ({
      id: entry.id,
      templateId: entry.templateId,
      templateVersion: entry.templateVersion,
      entryDate: entry.entryDate.toISOString().slice(0, 10),
      status: entry.status,
      isLate: entry.isLate,
      filledByName: entry.createdBy.name,
    }));
  }
}
