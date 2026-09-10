import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createTestApp, resetDatabase } from "./app-harness";

/**
 * prisma/migrations 下那份 SQL 是手写的（原因见 README「关于 migration」），
 * 所以必须有东西证明它和 schema.prisma 对得上。
 *
 * 这个测试把每个模型的每个字段都写一遍再读回来：列名错了、类型错了、约束漏了，
 * Prisma 当场报错。它不是「跑通一条 CRUD」，是逐字段的对账。
 */
describe("migration SQL 与 schema.prisma 对账（真实 PostgreSQL）", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    prisma = created.prisma;
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("十三个模型的每个字段都能写进去再读回来", async () => {
    const organization = await prisma.organization.create({ data: { name: "对账 GmbH" } });
    const unit = await prisma.unit.create({ data: { organizationId: organization.id, name: "对账店" } });
    const scope = { organizationId: organization.id, unitId: unit.id };

    const manager = await prisma.user.create({
      data: { ...scope, name: "店长", role: "store_manager", locale: "de", loginCode: "conf-manager" },
    });
    const employee = await prisma.user.create({
      data: { ...scope, name: "员工", role: "employee", loginCode: "conf-employee" },
    });
    expect(employee.locale).toBe("zh"); // 默认值来自 migration 里的 DEFAULT 'zh'

    const session = await prisma.session.create({
      data: { token: "conf-token", userId: employee.id, expiresAt: new Date("2030-01-01T00:00:00.000Z") },
    });
    expect(session.createdAt).toBeInstanceOf(Date);

    await prisma.shiftDefinition.create({
      data: { ...scope, kind: "opening", startMinutes: 390, endMinutes: 870 },
    });
    const shift = await prisma.shiftAssignment.create({
      data: { ...scope, date: new Date("2026-09-10T00:00:00.000Z"), kind: "opening", userId: employee.id },
    });
    expect(shift.date.toISOString().slice(0, 10)).toBe("2026-09-10");

    const template = await prisma.formTemplate.create({
      data: {
        ...scope,
        key: "storage-temp",
        layout: "monthly_grid",
        frequencyKind: "weekly",
        frequencyTimes: 2,
        timing: "morning",
        active: true,
        currentVersion: 2,
      },
    });
    const version = await prisma.formTemplateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        nameZh: "储存 / 冷藏温度",
        nameDe: "Lager- / Kühltemperaturen",
        columns: [{ id: "c1", type: "temp", limit: { min: 4, max: 7 } }],
        header: { operation: "对账 GmbH", inspector: "店长" },
        footnotes: [{ zh: "临界值 …", de: "Grenzwerte …" }],
      },
    });
    expect(Array.isArray(version.columns)).toBe(true);

    await prisma.formAssignment.create({
      data: {
        ...scope,
        templateId: template.id,
        shiftKind: "opening",
        effectiveFrom: new Date("2026-09-07T00:00:00.000Z"),
        effectiveTo: new Date("2026-12-31T00:00:00.000Z"),
      },
    });

    const entry = await prisma.formEntry.create({
      data: {
        ...scope,
        templateId: template.id,
        templateVersion: 1,
        entryDate: new Date("2026-09-10T00:00:00.000Z"),
        status: "issue_open",
        values: { c1: 8.6 },
        breaches: { c1: "超出上限 7°C" },
        correctiveAction: "已调低设定并报修",
        header: { operation: "对账 GmbH", inspector: "店长" },
        isLate: true,
        lateReason: "当天冷库停电，进不去",
        createdById: employee.id,
        submittedAt: new Date(),
      },
    });
    expect(entry.isLate).toBe(true);

    const equipment = await prisma.equipment.create({
      data: {
        ...scope,
        name: "冷藏柜 2",
        location: "吧台",
        brand: "Liebherr",
        model: "FKv 4143",
        warrantyUntil: new Date("2027-03-31T00:00:00.000Z"),
        status: "needs_repair",
        linkTemplateId: template.id,
        linkColumnId: "c1",
      },
    });

    const workOrder = await prisma.workOrder.create({
      data: {
        ...scope,
        equipmentId: equipment.id,
        entryId: entry.id,
        note: "温度爬到 8.6，压缩机声音不对",
        openedById: manager.id,
      },
    });
    const closed = await prisma.workOrder.update({
      where: { id: workOrder.id },
      data: { result: "换了温控器", completedById: manager.id, completedAt: new Date() },
    });
    expect(closed.result).toBe("换了温控器");

    const file = await prisma.fileObject.create({
      data: {
        ...scope,
        storageKey: "conf/2026/09/10/abc.jpg",
        mimeType: "image/jpeg",
        byteSize: 91_234,
        entryId: entry.id,
        createdById: employee.id,
      },
    });
    expect(file.storageKey).toBe("conf/2026/09/10/abc.jpg");

    // 关系读得回来
    const readBack = await prisma.formEntry.findFirstOrThrow({
      where: { id: entry.id, ...scope },
      include: { template: { include: { versions: true } }, createdBy: true, photos: true, workOrders: true },
    });
    expect(readBack.template.versions).toHaveLength(1);
    expect(readBack.photos).toHaveLength(1);
    expect(readBack.workOrders).toHaveLength(1);
    expect(readBack.createdBy.name).toBe("员工");
  });

  it("作废是标记不是删除，记录还在", async () => {
    const entry = await prisma.formEntry.findFirstOrThrow({ where: { status: "issue_open" } });
    const voided = await prisma.formEntry.update({
      where: { id: entry.id },
      data: { voidedAt: new Date(), voidReason: "温度抄反了", voidedById: entry.createdById },
    });
    expect(voided.voidedAt).toBeInstanceOf(Date);
    expect(await prisma.formEntry.count({ where: { id: entry.id } })).toBe(1);
  });

  it("唯一约束真的建上了", async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { loginCode: "conf-employee" } });
    await expect(
      prisma.user.create({
        data: {
          organizationId: user.organizationId,
          unitId: user.unitId,
          name: "重名登录码",
          role: "employee",
          loginCode: "conf-employee",
        },
      }),
    ).rejects.toThrow();
  });

  it("_prisma_migrations 里有那条 init 记录", async () => {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      select migration_name from "_prisma_migrations" where finished_at is not null order by migration_name
    `;
    expect(rows.map((row) => row.migration_name)).toContain("20260910000000_init");
  });
});
