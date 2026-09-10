import { Injectable } from "@nestjs/common";
import type { Prisma, ShiftKind } from "@prisma/client";
import { AccessService } from "../access/access.service";
import { unitScope } from "../access/scope";
import { BusinessError, NotFoundInScopeError } from "../common/business-error";
import type { CurrentContext } from "../context/current-context";
import { isValidIsoDate, toDateColumn } from "../domain/dates";
import { PrismaService } from "../prisma/prisma.service";
import { TemplatesService } from "./templates.service";

export type ResolveInput = {
  /** 挂不上设备的异常：店长写处理结果 */
  note?: string;
  /** 温度类异常：挂到一台设备并开维修单 */
  equipmentId?: string;
  workOrderNote?: string;
};

@Injectable()
export class ManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly access: AccessService,
  ) {}

  /**
   * 待处理按「哪台设备的哪个测量点」聚合，不是按记录一条条列。
   *
   * 同一台冰箱连着五天同一个问题，列成五条独立待办会让店长以为有五件事要做；
   * 实际上是一件事：这台冰箱坏了。连续超标单独打标 —— 那是设备故障的信号。
   */
  async issueGroups(ctx: CurrentContext) {
    this.access.assertCanManageHaccp(ctx);
    const entries = await this.openIssues(ctx);

    type Group = {
      key: string;
      templateId: string;
      templateName: string;
      columnId: string;
      columnLabel: string;
      equipmentId: string | null;
      equipmentName: string | null;
      dates: string[];
      latestValue: string;
      latestReason: string;
      entryIds: string[];
    };

    const templateNames = new Map<string, { name: string; columns: Map<string, string> }>();
    const groups = new Map<string, Group>();

    for (const entry of entries) {
      if (!templateNames.has(entry.templateId)) {
        const loaded = await this.templates.load(ctx, entry.templateId, entry.templateVersion);
        templateNames.set(entry.templateId, {
          name: loaded.version.nameZh,
          columns: new Map(loaded.columns.map((column) => [column.id, column.label.zh])),
        });
      }
      const meta = templateNames.get(entry.templateId)!;
      const breaches = (entry.breaches ?? {}) as Record<string, string>;
      const values = entry.values as Record<string, unknown>;
      const date = entry.entryDate.toISOString().slice(0, 10);

      for (const [columnId, reason] of Object.entries(breaches)) {
        const key = `${entry.templateId}|${columnId}`;
        const existing = groups.get(key);
        if (existing) {
          existing.dates.push(date);
          existing.entryIds.push(entry.id);
          if (date >= existing.dates[existing.dates.length - 2]!) {
            existing.latestValue = String(values[columnId] ?? "");
            existing.latestReason = reason;
          }
          continue;
        }
        groups.set(key, {
          key,
          templateId: entry.templateId,
          templateName: meta.name,
          columnId,
          columnLabel: meta.columns.get(columnId) ?? columnId,
          equipmentId: null,
          equipmentName: null,
          dates: [date],
          latestValue: String(values[columnId] ?? ""),
          latestReason: reason,
          entryIds: [entry.id],
        });
      }
    }

    const equipment = await this.prisma.equipment.findMany({
      where: { ...unitScope(ctx), linkColumnId: { not: null } },
      select: { id: true, name: true, linkTemplateId: true, linkColumnId: true },
    });
    for (const group of groups.values()) {
      const machine = equipment.find(
        (item) => item.linkTemplateId === group.templateId && item.linkColumnId === group.columnId,
      );
      if (machine) {
        group.equipmentId = machine.id;
        group.equipmentName = machine.name;
      }
      group.dates.sort();
    }

    return [...groups.values()].map((group) => ({
      ...group,
      consecutiveDays: longestStreak(group.dates),
    }));
  }

  /** 店长的待处理：只有超标的进这里，正常记录提交即完成 */
  async openIssues(ctx: CurrentContext) {
    this.access.assertCanManageHaccp(ctx);
    return this.prisma.formEntry.findMany({
      where: { ...unitScope(ctx), status: "issue_open", voidedAt: null },
      orderBy: [{ entryDate: "asc" }],
      include: {
        createdBy: { select: { name: true } },
        template: { select: { id: true, key: true } },
        workOrders: { include: { equipment: { select: { id: true, name: true } } } },
      },
    });
  }

  /**
   * 这条异常里，哪些超标的列挂得上设备。挂得上就必须开维修单，挂不上写处理结果就算完
   * （产品范围第六节，两条路）。
   */
  async equipmentCandidates(ctx: CurrentContext, entryId: string) {
    const entry = await this.prisma.formEntry.findFirst({ where: { id: entryId, ...unitScope(ctx) } });
    if (!entry) throw new NotFoundInScopeError();

    const breachedColumns = Object.keys((entry.breaches ?? {}) as Record<string, unknown>);
    if (breachedColumns.length === 0) return [];

    return this.prisma.equipment.findMany({
      where: {
        ...unitScope(ctx),
        linkTemplateId: entry.templateId,
        linkColumnId: { in: breachedColumns },
      },
      select: { id: true, name: true, location: true, status: true, linkColumnId: true },
    });
  }

  async resolveIssue(ctx: CurrentContext, entryId: string, input: ResolveInput) {
    this.access.assertCanManageHaccp(ctx);

    const entry = await this.prisma.formEntry.findFirst({ where: { id: entryId, ...unitScope(ctx) } });
    if (!entry) throw new NotFoundInScopeError();
    if (entry.voidedAt) throw new BusinessError("ENTRY_VOIDED", "这条已经作废了");
    if (entry.status !== "issue_open") throw new BusinessError("NOT_AN_OPEN_ISSUE", "这条不在待处理里");

    const candidates = await this.equipmentCandidates(ctx, entryId);

    if (candidates.length > 0) {
      const equipmentId = input.equipmentId;
      const note = input.workOrderNote?.trim() ?? "";
      if (!equipmentId || !candidates.some((item) => item.id === equipmentId)) {
        throw new BusinessError(
          "EQUIPMENT_REQUIRED",
          `这是温度类超标，必须挂到一台设备上：${candidates.map((item) => item.name).join("、")}`,
        );
      }
      if (note === "") throw new BusinessError("WORK_ORDER_NOTE_REQUIRED", "开维修单要写清什么坏了");

      await this.prisma.$transaction([
        this.prisma.workOrder.create({
          data: { ...unitScope(ctx), equipmentId, entryId, note, openedById: ctx.userId },
        }),
        this.prisma.equipment.update({ where: { id: equipmentId }, data: { status: "needs_repair" } }),
      ]);

      // 开单不等于处理完：维修单填了结果、标记完成，这条异常才闭环
      return this.prisma.formEntry.findFirstOrThrow({
        where: { id: entryId },
        include: { workOrders: true },
      });
    }

    const note = input.note?.trim() ?? "";
    if (note === "") throw new BusinessError("RESOLUTION_NOTE_REQUIRED", "写清做了什么、解决了没有，才算处理完");

    return this.prisma.formEntry.update({
      where: { id: entry.id },
      data: {
        status: "issue_resolved",
        resolvedAt: new Date(),
        resolvedById: ctx.userId,
        resolutionNote: note,
      },
      include: { workOrders: true },
    });
  }

  // ------------------------------------------------------------ 派单与班表

  /** 派单：表 → 班次，不点名。责任人当天从班表推导。 */
  async assignTemplateToShift(ctx: CurrentContext, templateId: string, shiftKind: ShiftKind | null, fromDate: string) {
    this.access.assertCanManageHaccp(ctx);
    if (!isValidIsoDate(fromDate)) throw new BusinessError("BAD_DATE", "日期格式应该是 YYYY-MM-DD");
    const { template } = await this.templates.load(ctx, templateId);

    const current = await this.prisma.formAssignment.findFirst({
      where: { ...unitScope(ctx), templateId: template.id, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });

    // 改派不是覆盖：旧规则封口，新规则从 fromDate 起生效，
    // 否则改了今天的派单，上个月的记录会被算成「本来该另一个人填」
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    if (current) {
      operations.push(
        this.prisma.formAssignment.update({
          where: { id: current.id },
          data: { effectiveTo: toDateColumn(fromDate) },
        }),
      );
    }
    if (shiftKind) {
      operations.push(
        this.prisma.formAssignment.create({
          data: { ...unitScope(ctx), templateId: template.id, shiftKind, effectiveFrom: toDateColumn(fromDate) },
        }),
      );
    }
    await this.prisma.$transaction(operations);

    return this.prisma.formAssignment.findMany({
      where: { ...unitScope(ctx), templateId: template.id },
      orderBy: { effectiveFrom: "asc" },
    });
  }

  async shiftDefinitions(ctx: CurrentContext) {
    return this.prisma.shiftDefinition.findMany({ where: unitScope(ctx), orderBy: { startMinutes: "asc" } });
  }

  async setShiftDefinition(ctx: CurrentContext, kind: ShiftKind, startMinutes: number, endMinutes: number) {
    this.access.assertCanManageHaccp(ctx);
    if (startMinutes < 0 || endMinutes > 24 * 60 || startMinutes >= endMinutes) {
      throw new BusinessError("BAD_SHIFT_TIME", "班次时间不对：开始要早于结束，且都在一天之内");
    }
    const existing = await this.prisma.shiftDefinition.findFirst({ where: { ...unitScope(ctx), kind } });
    if (existing) {
      return this.prisma.shiftDefinition.update({ where: { id: existing.id }, data: { startMinutes, endMinutes } });
    }
    return this.prisma.shiftDefinition.create({ data: { ...unitScope(ctx), kind, startMinutes, endMinutes } });
  }

  /** 一周的班表。派单靠它推人，所以它是第一版必须有的最小件（产品范围代定 9）。 */
  async shiftsBetween(ctx: CurrentContext, from: string, to: string) {
    if (!isValidIsoDate(from) || !isValidIsoDate(to)) throw new BusinessError("BAD_DATE", "日期格式应该是 YYYY-MM-DD");
    return this.prisma.shiftAssignment.findMany({
      where: { ...unitScope(ctx), date: { gte: toDateColumn(from), lte: toDateColumn(to) } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ date: "asc" }, { kind: "asc" }],
    });
  }

  async setShift(ctx: CurrentContext, isoDate: string, kind: ShiftKind, userIds: string[]) {
    this.access.assertCanManageHaccp(ctx);
    if (!isValidIsoDate(isoDate)) throw new BusinessError("BAD_DATE", "日期格式应该是 YYYY-MM-DD");

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, ...unitScope(ctx) },
      select: { id: true },
    });
    if (users.length !== userIds.length) throw new NotFoundInScopeError("有人不在这家店的名单里");

    const date = toDateColumn(isoDate);
    await this.prisma.$transaction([
      this.prisma.shiftAssignment.deleteMany({ where: { ...unitScope(ctx), date, kind } }),
      this.prisma.shiftAssignment.createMany({
        data: users.map((user) => ({ ...unitScope(ctx), date, kind, userId: user.id })),
      }),
    ]);

    return this.shiftsBetween(ctx, isoDate, isoDate);
  }

  async staff(ctx: CurrentContext) {
    return this.prisma.user.findMany({
      where: unitScope(ctx),
      select: { id: true, name: true, role: true, locale: true },
      orderBy: { name: "asc" },
    });
  }
}

/** 连着几天是同一个问题。中间断一天就重新数。 */
function longestStreak(sortedDates: string[]): number {
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of sortedDates) {
    if (previous === null) run = 1;
    else {
      const gap = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86_400_000;
      run = gap === 1 ? run + 1 : 1;
    }
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}
