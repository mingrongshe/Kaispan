import { Injectable } from "@nestjs/common";
import { AccessService } from "../access/access.service";
import { unitScope } from "../access/scope";
import { BusinessError, NotFoundInScopeError } from "../common/business-error";
import type { CurrentContext } from "../context/current-context";
import { fromDateColumn, shiftDays, toDateColumn, todayInStore } from "../domain/dates";
import { limitFor, type Column } from "../domain/columns";
import { PrismaService } from "../prisma/prisma.service";
import { TemplatesService } from "../haccp/templates.service";

export type TrendPoint = { date: string; value: number; breach: boolean };

@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly access: AccessService,
  ) {}

  /** 员工也看得到设备和趋势（只读）。他量到 6.9 时该知道这台机器这个月一直在爬。 */
  async list(ctx: CurrentContext) {
    return this.prisma.equipment.findMany({
      where: unitScope(ctx),
      orderBy: { createdAt: "asc" },
      include: { workOrders: { where: { completedAt: null }, select: { id: true } } },
    });
  }

  async get(ctx: CurrentContext, id: string) {
    const equipment = await this.prisma.equipment.findFirst({
      where: { id, ...unitScope(ctx) },
      include: {
        workOrders: {
          orderBy: { openedAt: "desc" },
          include: { openedBy: { select: { name: true } }, completedBy: { select: { name: true } } },
        },
      },
    });
    if (!equipment) throw new NotFoundInScopeError();
    return equipment;
  }

  async create(
    ctx: CurrentContext,
    input: { name: string; location?: string; linkTemplateId?: string; linkColumnId?: string },
  ) {
    this.access.assertCanManageHaccp(ctx);
    if (input.name.trim() === "") throw new BusinessError("NAME_REQUIRED", "设备得有个名字");
    if (input.linkTemplateId) await this.templates.load(ctx, input.linkTemplateId);

    return this.prisma.equipment.create({
      data: {
        ...unitScope(ctx),
        name: input.name.trim(),
        location: input.location?.trim() || null,
        linkTemplateId: input.linkTemplateId ?? null,
        linkColumnId: input.linkColumnId ?? null,
      },
    });
  }

  /**
   * 维修单填了结果、标记完成，对应的异常记录才算闭环。
   * 这台设备没有未完成的维修单了，状态自动回「正常」。
   */
  async completeWorkOrder(ctx: CurrentContext, workOrderId: string, result: string) {
    this.access.assertCanManageHaccp(ctx);
    const trimmed = result.trim();
    if (trimmed === "") throw new BusinessError("RESULT_REQUIRED", "写清修了什么，才算完成");

    const workOrder = await this.prisma.workOrder.findFirst({ where: { id: workOrderId, ...unitScope(ctx) } });
    if (!workOrder) throw new NotFoundInScopeError();
    if (workOrder.completedAt) throw new BusinessError("ALREADY_COMPLETED", "这张维修单已经完成了");

    await this.prisma.workOrder.update({
      where: { id: workOrder.id },
      data: { result: trimmed, completedById: ctx.userId, completedAt: new Date() },
    });

    const stillOpen = await this.prisma.workOrder.count({
      where: { ...unitScope(ctx), equipmentId: workOrder.equipmentId, completedAt: null },
    });
    if (stillOpen === 0) {
      await this.prisma.equipment.update({ where: { id: workOrder.equipmentId }, data: { status: "ok" } });
    }

    if (workOrder.entryId) {
      const openForEntry = await this.prisma.workOrder.count({
        where: { ...unitScope(ctx), entryId: workOrder.entryId, completedAt: null },
      });
      if (openForEntry === 0) {
        await this.prisma.formEntry.updateMany({
          where: { id: workOrder.entryId, ...unitScope(ctx), status: "issue_open" },
          data: {
            status: "issue_resolved",
            resolvedAt: new Date(),
            resolvedById: ctx.userId,
            resolutionNote: `维修完成：${trimmed}`,
          },
        });
      }
    }

    return this.get(ctx, workOrder.equipmentId);
  }

  /**
   * 这台设备关联的那个测量点，最近 N 天的读数。
   * 冰箱不是突然坏的，温度会先缓慢爬几周 —— 纸质表一天一行翻不出趋势，这是数字化真正赢过纸的地方。
   */
  async trend(ctx: CurrentContext, equipmentId: string, days = 30): Promise<{
    points: TrendPoint[];
    limit: { min?: number; max?: number } | null;
    unit: string | null;
    columnLabel: string | null;
  }> {
    const equipment = await this.prisma.equipment.findFirst({ where: { id: equipmentId, ...unitScope(ctx) } });
    if (!equipment) throw new NotFoundInScopeError();
    if (!equipment.linkTemplateId || !equipment.linkColumnId) {
      return { points: [], limit: null, unit: null, columnLabel: null };
    }

    const { columns } = await this.templates.load(ctx, equipment.linkTemplateId);
    const column = columns.find((item: Column) => item.id === equipment.linkColumnId);
    if (!column) return { points: [], limit: null, unit: null, columnLabel: null };

    const today = todayInStore();
    const entries = await this.prisma.formEntry.findMany({
      where: {
        ...unitScope(ctx),
        templateId: equipment.linkTemplateId,
        voidedAt: null,
        status: { in: ["submitted", "issue_open", "issue_resolved"] },
        entryDate: { gte: toDateColumn(shiftDays(today, -days)), lte: toDateColumn(today) },
      },
      orderBy: { entryDate: "asc" },
      select: { entryDate: true, values: true, breaches: true },
    });

    const points: TrendPoint[] = [];
    for (const entry of entries) {
      const values = entry.values as Record<string, unknown>;
      const raw = values[equipment.linkColumnId];
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value)) continue;
      const breaches = (entry.breaches ?? {}) as Record<string, unknown>;
      points.push({
        date: fromDateColumn(entry.entryDate),
        value,
        breach: equipment.linkColumnId in breaches,
      });
    }

    const limit = limitFor(column, {}) ?? null;
    return {
      points,
      limit: limit ? { min: limit.min, max: limit.max } : null,
      unit: column.unit ?? null,
      columnLabel: column.label.zh,
    };
  }
}
