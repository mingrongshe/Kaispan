import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createTenant, createTestApp, resetDatabase, type Tenant } from "./app-harness";

/**
 * acceptance.md 的最低自动化检查里，属于骨架阶段就该成立的四条：
 * 员工调管理接口被拒、跨 organization 读不到、跨 unit 读不到、结果真的落在 PostgreSQL 里。
 * 剩下两条（员工提交、店长处理）等写接口做出来再补。
 */
describe("权限与租户隔离（真实 PostgreSQL）", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let martin: Tenant;
  let otherOrg: Tenant;
  let siblingUnit: { managerToken: string; employeeToken: string };

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    prisma = created.prisma;
    await resetDatabase(prisma);

    martin = await createTenant(prisma, "alpha");
    otherOrg = await createTenant(prisma, "beta");

    // 同一家公司下的第二家门店，用来证明跨 unit 也读不到
    const unit = await prisma.unit.create({
      data: { organizationId: martin.organizationId, name: "alpha 二店" },
    });
    const scope = { organizationId: martin.organizationId, unitId: unit.id };
    const manager = await prisma.user.create({
      data: { ...scope, name: "二店店长", role: "store_manager", locale: "zh", loginCode: "alpha2-manager" },
    });
    const employee = await prisma.user.create({
      data: { ...scope, name: "二店员工", role: "employee", locale: "zh", loginCode: "alpha2-employee" },
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.session.createMany({
      data: [
        { token: "alpha2-manager-token", userId: manager.id, expiresAt },
        { token: "alpha2-employee-token", userId: employee.id, expiresAt },
      ],
    });
    siblingUnit = { managerToken: "alpha2-manager-token", employeeToken: "alpha2-employee-token" };
  });

  afterAll(async () => {
    await app?.close();
  });

  it("没有登录凭证的请求被拒", async () => {
    const response = await request(app.getHttpServer()).get("/haccp/entries");
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("NOT_AUTHENTICATED");
  });

  it("员工调店长的管理接口被拒", async () => {
    const response = await request(app.getHttpServer())
      .get("/haccp/manage/issues")
      .set("Authorization", `Bearer ${martin.employeeToken}`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("PERMISSION_DENIED");
  });

  it("店长能看本店的待处理异常", async () => {
    const response = await request(app.getHttpServer())
      .get("/haccp/manage/issues")
      .set("Authorization", `Bearer ${martin.managerToken}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].templateKey).toBe("storage-temp");
  });

  it("另一个 organization 的店长看不到这边的记录", async () => {
    const response = await request(app.getHttpServer())
      .get("/haccp/manage/issues")
      .set("Authorization", `Bearer ${otherOrg.managerToken}`);
    expect(response.status).toBe(200);
    // 看得到的只有他自己那套，条数一样但 id 不同
    const ids = (response.body as { id: string }[]).map((row) => row.id);
    const mine = await prisma.formEntry.findMany({ where: { unitId: martin.unitId }, select: { id: true } });
    expect(ids).not.toContain(mine[0]?.id);
  });

  it("同一家公司、另一家门店的店长也看不到这边的记录", async () => {
    const response = await request(app.getHttpServer())
      .get("/haccp/manage/issues")
      .set("Authorization", `Bearer ${siblingUnit.managerToken}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(0);
  });

  it("按 templateId 查询也逃不出本店范围", async () => {
    // 拿本店的 token 去查别家店的 templateId，应当查不到东西而不是查到别人的
    const response = await request(app.getHttpServer())
      .get("/haccp/entries")
      .query({ templateId: otherOrg.templateId })
      .set("Authorization", `Bearer ${martin.employeeToken}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(0);
  });

  it("员工能只读看本店这张表的历史，包括同事填的", async () => {
    const response = await request(app.getHttpServer())
      .get("/haccp/entries")
      .set("Authorization", `Bearer ${martin.employeeToken}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].entryDate).toBe("2026-09-10");
  });

  it("别人的草稿不出现在列表里", async () => {
    const colleague = await prisma.user.create({
      data: {
        organizationId: martin.organizationId,
        unitId: martin.unitId,
        name: "同事",
        role: "employee",
        locale: "zh",
        loginCode: "alpha-colleague",
      },
    });
    await prisma.formEntry.create({
      data: {
        organizationId: martin.organizationId,
        unitId: martin.unitId,
        templateId: martin.templateId,
        templateVersion: 1,
        entryDate: new Date("2026-09-11T00:00:00.000Z"),
        status: "draft",
        values: { c1: 5.1 },
        createdById: colleague.id,
      },
    });

    const response = await request(app.getHttpServer())
      .get("/haccp/entries")
      .set("Authorization", `Bearer ${martin.employeeToken}`);
    expect(response.body).toHaveLength(1);
  });

  it("记录确实落在 PostgreSQL 里，不是内存", async () => {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count from "FormEntry" where "unitId" = ${martin.unitId}
    `;
    expect(Number(rows[0]?.count ?? 0)).toBeGreaterThan(0);
  });
});

/**
 * acceptance.md 的最低自动化检查第 4、5 条写的是「不能读取**或修改**另一个
 * organization / unit 的记录」。上面那一组只证明了读不到。
 * 拿着另一家店的记录 id 去写的路径，单独验一遍。
 */
describe("跨租户的写操作（真实 PostgreSQL）", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mine: Tenant;
  let otherOrg: Tenant;
  let siblingUnitManagerToken: string;
  let myEntryId: string;
  let myEquipmentId: string;

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    prisma = created.prisma;
    await resetDatabase(prisma);

    mine = await createTenant(prisma, "write-a");
    otherOrg = await createTenant(prisma, "write-b");

    const unit = await prisma.unit.create({
      data: { organizationId: mine.organizationId, name: "write-a 二店" },
    });
    const manager = await prisma.user.create({
      data: {
        organizationId: mine.organizationId,
        unitId: unit.id,
        name: "二店店长",
        role: "store_manager",
        locale: "zh",
        loginCode: "write-a2-manager",
      },
    });
    await prisma.session.create({
      data: { token: "write-a2-manager-token", userId: manager.id, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    siblingUnitManagerToken = "write-a2-manager-token";

    const entry = await prisma.formEntry.findFirstOrThrow({ where: { unitId: mine.unitId } });
    myEntryId = entry.id;

    const equipment = await prisma.equipment.create({
      data: {
        organizationId: mine.organizationId,
        unitId: mine.unitId,
        name: "冷藏柜 2",
        linkTemplateId: mine.templateId,
        linkColumnId: "c1",
      },
    });
    myEquipmentId = equipment.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it("另一个 organization 的店长作废不了这边的记录", async () => {
    const response = await http()
      .post(`/haccp/entries/${myEntryId}/void`)
      .set(auth(otherOrg.managerToken))
      .send({ reason: "我就想作废别人的" });
    expect(response.status).toBe(404);

    const after = await prisma.formEntry.findFirstOrThrow({ where: { id: myEntryId } });
    expect(after.voidedAt).toBeNull();
  });

  it("同公司另一家门店的店长也作废不了", async () => {
    const response = await http()
      .post(`/haccp/entries/${myEntryId}/void`)
      .set(auth(siblingUnitManagerToken))
      .send({ reason: "跨店作废" });
    expect(response.status).toBe(404);

    const after = await prisma.formEntry.findFirstOrThrow({ where: { id: myEntryId } });
    expect(after.voidedAt).toBeNull();
  });

  it("跨租户处理不了这边的异常", async () => {
    for (const token of [otherOrg.managerToken, siblingUnitManagerToken]) {
      const response = await http()
        .post(`/haccp/manage/issues/${myEntryId}/resolve`)
        .set(auth(token))
        .send({ note: "跨租户处理" });
      expect(response.status).toBe(404);
    }

    const after = await prisma.formEntry.findFirstOrThrow({ where: { id: myEntryId } });
    expect(after.status).toBe("issue_open");
    expect(after.resolvedById).toBeNull();
  });

  it("跨租户改不了这边表单的派单", async () => {
    const response = await http()
      .put(`/haccp/manage/templates/${mine.templateId}/assignment`)
      .set(auth(otherOrg.managerToken))
      .send({ shiftKind: "closing", fromDate: "2026-09-14" });
    expect(response.status).toBe(404);

    expect(await prisma.formAssignment.count({ where: { templateId: mine.templateId } })).toBe(0);
  });

  it("跨租户改不了这边的表单模板，也停用不了", async () => {
    const save = await http()
      .post(`/haccp/manage/templates/${mine.templateId}/versions`)
      .set(auth(otherOrg.managerToken))
      .send({ nameZh: "被别人改了", columns: [{ labelZh: "x", type: "text" }] });
    expect(save.status).toBe(404);

    const off = await http()
      .put(`/haccp/manage/templates/${mine.templateId}/active`)
      .set(auth(siblingUnitManagerToken))
      .send({ active: false });
    expect(off.status).toBe(404);

    const template = await prisma.formTemplate.findFirstOrThrow({ where: { id: mine.templateId } });
    expect(template.currentVersion).toBe(1);
    expect(template.active).toBe(true);
  });

  it("跨租户给这边的设备开不了维修单", async () => {
    const response = await http()
      .post(`/haccp/manage/issues/${myEntryId}/resolve`)
      .set(auth(otherOrg.managerToken))
      .send({ equipmentId: myEquipmentId, workOrderNote: "跨租户报修" });
    expect(response.status).toBe(404);
    expect(await prisma.workOrder.count()).toBe(0);
  });

  it("跨租户排不了这边的班", async () => {
    const response = await http()
      .put("/haccp/manage/shifts")
      .set(auth(otherOrg.managerToken))
      .send({ date: "2026-09-14", kind: "opening", userIds: [mine.employeeId] });
    // 别家店长拿这边的员工 id 排班：人不在他的名单里，按找不到处理
    expect(response.status).toBe(404);
    expect(await prisma.shiftAssignment.count({ where: { userId: mine.employeeId } })).toBe(0);
  });

  it("跨租户往这边的记录上传不了照片", async () => {
    const response = await http()
      .post(`/haccp/entries/${myEntryId}/photos`)
      .set(auth(otherOrg.managerToken))
      .attach("file", Buffer.from("fake"), { filename: "x.png", contentType: "image/png" });
    expect(response.status).toBe(404);
    expect(await prisma.fileObject.count()).toBe(0);
  });

  it("跨租户存不了草稿、提交不了记录", async () => {
    const draft = await http()
      .post("/haccp/drafts")
      .set(auth(otherOrg.employeeToken))
      .send({ templateId: mine.templateId, entryDate: "2026-09-10", values: { c1: 5 } });
    expect(draft.status).toBe(404);

    const submit = await http()
      .post("/haccp/entries")
      .set(auth(otherOrg.managerToken))
      .send({ templateId: mine.templateId, entryDate: "2026-09-10", values: { c1: 5 } });
    expect(submit.status).toBe(404);

    expect(await prisma.formEntry.count({ where: { templateId: mine.templateId } })).toBe(1);
  });
});
