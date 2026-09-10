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
