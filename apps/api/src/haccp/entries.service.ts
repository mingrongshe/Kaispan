import { Injectable } from "@nestjs/common";
import type { EntryStatus, Prisma } from "@prisma/client";
import { AccessService } from "../access/access.service";
import { unitScope } from "../access/scope";
import { BusinessError, NotFoundInScopeError } from "../common/business-error";
import type { CurrentContext } from "../context/current-context";
import { fromDateColumn, isValidIsoDate, toDateColumn, todayInStore } from "../domain/dates";
import { evaluate } from "../domain/evaluate";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "./tasks.service";
import { TemplatesService } from "./templates.service";

const MIN_LATE_REASON = 5;

export type SaveDraftInput = {
  templateId: string;
  entryDate: string;
  values: Record<string, unknown>;
  header?: Record<string, unknown>;
};

export type SubmitInput = SaveDraftInput & {
  correctiveAction?: string;
  lateReason?: string;
};

@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly tasks: TasksService,
    private readonly access: AccessService,
  ) {}

  /**
   * 草稿：只有本人看得到，不进店长列表、不判超标、不算这张表当天填过。
   * 同一个人对同一张表同一天只留一份草稿。
   */
  async saveDraft(ctx: CurrentContext, input: SaveDraftInput) {
    this.access.assertCanFillHaccp(ctx);
    const { template } = await this.requireTemplate(ctx, input);

    const existing = await this.prisma.formEntry.findFirst({
      where: {
        ...unitScope(ctx),
        templateId: template.id,
        entryDate: toDateColumn(input.entryDate),
        createdById: ctx.userId,
        status: "draft",
        voidedAt: null,
      },
    });

    const data = {
      values: input.values as Prisma.InputJsonValue,
      header: (input.header ?? undefined) as Prisma.InputJsonValue | undefined,
    };

    if (existing) return this.prisma.formEntry.update({ where: { id: existing.id }, data });

    return this.prisma.formEntry.create({
      data: {
        ...unitScope(ctx),
        templateId: template.id,
        templateVersion: template.currentVersion,
        entryDate: toDateColumn(input.entryDate),
        status: "draft",
        createdById: ctx.userId,
        ...data,
      },
    });
  }

  async discardDraft(ctx: CurrentContext, id: string): Promise<void> {
    const draft = await this.prisma.formEntry.findFirst({
      where: { id, ...unitScope(ctx), status: "draft", createdById: ctx.userId },
    });
    // 草稿不是记录，没进过任何人的列表，删掉不影响合规证据（产品范围代定 4）
    if (!draft) throw new NotFoundInScopeError("没有这份草稿，或者它不是你的");
    await this.prisma.formEntry.delete({ where: { id: draft.id } });
  }

  /**
   * 提交。能不能提交由后端说了算：
   * 必填没填拦、超标没写纠正措施拦、补填没写原因拦。
   */
  async submit(ctx: CurrentContext, input: SubmitInput) {
    this.access.assertCanFillHaccp(ctx);
    const { template, columns } = await this.requireTemplate(ctx, input);

    const result = evaluate(columns, input.values);
    if (result.missing.length > 0) {
      throw new BusinessError(
        "MISSING_REQUIRED",
        `还有必填没填：${result.missing.map((issue) => issue.label).join("、")}`,
      );
    }

    const hasBreach = result.breaches.length > 0;
    const correctiveAction = input.correctiveAction?.trim() ?? "";
    if (hasBreach && correctiveAction === "") {
      throw new BusinessError("CORRECTIVE_ACTION_REQUIRED", "有超标项，必须写纠正措施才能提交");
    }

    const today = todayInStore();
    const isLate = input.entryDate < today;
    const lateReason = input.lateReason?.trim() ?? "";
    if (isLate && lateReason.length < MIN_LATE_REASON) {
      throw new BusinessError(
        "LATE_REASON_REQUIRED",
        `这是补填 ${input.entryDate} 的记录，必须写清当天为什么没填（至少 ${MIN_LATE_REASON} 个字）`,
      );
    }
    if (input.entryDate > today) {
      throw new BusinessError("FUTURE_DATE", "不能给还没到的日子填表");
    }

    const status: EntryStatus = hasBreach ? "issue_open" : "submitted";
    const breaches = hasBreach
      ? (Object.fromEntries(
          result.breaches.map((issue) => [issue.columnId, issue.reason]),
        ) as Prisma.InputJsonValue)
      : undefined;

    const draft = await this.prisma.formEntry.findFirst({
      where: {
        ...unitScope(ctx),
        templateId: template.id,
        entryDate: toDateColumn(input.entryDate),
        createdById: ctx.userId,
        status: "draft",
      },
    });

    const data = {
      values: input.values as Prisma.InputJsonValue,
      header: (input.header ?? undefined) as Prisma.InputJsonValue | undefined,
      breaches,
      correctiveAction: hasBreach ? correctiveAction : null,
      isLate,
      lateReason: isLate ? lateReason : null,
      status,
      submittedAt: new Date(),
      templateVersion: template.currentVersion,
    };

    // 草稿转正，不另建一条，否则草稿会变成孤儿
    if (draft) return this.prisma.formEntry.update({ where: { id: draft.id }, data });

    return this.prisma.formEntry.create({
      data: {
        ...unitScope(ctx),
        templateId: template.id,
        entryDate: toDateColumn(input.entryDate),
        createdById: ctx.userId,
        ...data,
      },
    });
  }

  /**
   * 作废是标记不是删除，理由必填。员工只能作废自己提交的；店长可以作废本店任何一条。
   */
  async voidEntry(ctx: CurrentContext, id: string, reason: string) {
    const trimmed = reason.trim();
    if (trimmed === "") throw new BusinessError("VOID_REASON_REQUIRED", "作废必须写理由");

    const entry = await this.prisma.formEntry.findFirst({ where: { id, ...unitScope(ctx) } });
    if (!entry) throw new NotFoundInScopeError();
    if (entry.status === "draft") throw new BusinessError("DRAFT_NOT_VOIDABLE", "草稿直接删掉就行，不用作废");
    if (entry.voidedAt) throw new BusinessError("ALREADY_VOIDED", "这条已经作废过了");

    const mine = entry.createdById === ctx.userId;
    if (!mine && !this.access.canManageHaccp(ctx)) {
      throw new BusinessError("NOT_YOUR_ENTRY", "只能作废自己填的记录", 403);
    }

    return this.prisma.formEntry.update({
      where: { id: entry.id },
      data: { voidedAt: new Date(), voidedById: ctx.userId, voidReason: trimmed },
    });
  }

  /** 员工能只读看本店任何一张表的历史，但别人的草稿看不到 */
  async list(
    ctx: CurrentContext,
    options: { templateId?: string; from?: string; to?: string; status?: EntryStatus; includeVoided?: boolean } = {},
  ) {
    return this.prisma.formEntry.findMany({
      where: {
        ...unitScope(ctx),
        ...(options.templateId ? { templateId: options.templateId } : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.includeVoided ? {} : { voidedAt: null }),
        ...(options.from || options.to
          ? {
              entryDate: {
                ...(options.from ? { gte: toDateColumn(options.from) } : {}),
                ...(options.to ? { lte: toDateColumn(options.to) } : {}),
              },
            }
          : {}),
        OR: [{ status: { not: "draft" } }, { status: "draft", createdById: ctx.userId }],
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { createdBy: { select: { name: true } }, resolvedBy: { select: { name: true } } },
    });
  }

  async get(ctx: CurrentContext, id: string) {
    const entry = await this.prisma.formEntry.findFirst({
      where: { id, ...unitScope(ctx) },
      include: {
        createdBy: { select: { id: true, name: true } },
        resolvedBy: { select: { name: true } },
        voidedBy: { select: { name: true } },
        workOrders: { include: { equipment: { select: { id: true, name: true } } } },
      },
    });
    if (!entry) throw new NotFoundInScopeError();
    // 别人的草稿进不去，跟工时、工资那几页是同一条边界
    if (entry.status === "draft" && entry.createdById !== ctx.userId) throw new NotFoundInScopeError();
    return entry;
  }

  /** 我这一天这张表的草稿，进填表页时用来回填 */
  async myDraft(ctx: CurrentContext, templateId: string, isoDate: string) {
    return this.prisma.formEntry.findFirst({
      where: {
        ...unitScope(ctx),
        templateId,
        entryDate: toDateColumn(isoDate),
        createdById: ctx.userId,
        status: "draft",
      },
    });
  }

  private async requireTemplate(ctx: CurrentContext, input: SaveDraftInput) {
    if (!isValidIsoDate(input.entryDate)) {
      throw new BusinessError("BAD_DATE", "日期格式应该是 YYYY-MM-DD");
    }
    const loaded = await this.templates.load(ctx, input.templateId);
    if (!loaded.template.active) throw new BusinessError("TEMPLATE_INACTIVE", "这张表已经停用");

    // 店长可以替不在场的人代录，那是他的职责；员工只能填真派给他的那一张
    if (!this.access.canManageHaccp(ctx)) {
      const assigned = await this.tasks.isAssignedTo(ctx, input.templateId, input.entryDate, ctx.userId);
      if (!assigned) throw new NotFoundInScopeError("这张表这一天没有派给你");
    }
    return loaded;
  }
}

export { fromDateColumn };
