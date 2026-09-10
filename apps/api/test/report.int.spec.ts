import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayInStore } from "../src/domain/dates";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createTestApp, resetDatabase } from "./app-harness";
import { createStore, type Store } from "./store-harness";

/**
 * 月度表和检查模式。这两个是「为什么要上这套系统」的交付物 ——
 * 检查员来的时候拿得出东西，所以版式和统计必须对得上纸质原表。
 */
describe("月度表与检查模式（真实 PostgreSQL）", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: Store;
  let today: string;
  let month: string;
  let dayOfMonth: number;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    prisma = created.prisma;
    await resetDatabase(prisma);

    today = todayInStore();
    month = today.slice(0, 7);
    dayOfMonth = Number(today.slice(8));
    store = await createStore(prisma, "report", today);

    const scope = { organizationId: store.organizationId, unitId: store.unitId };
    const day = (n: number) => new Date(`${month}-${String(n).padStart(2, "0")}T00:00:00.000Z`);

    // 本月 1 号填过（正常），今天填过（超标）。中间的日子空着。
    await prisma.formEntry.create({
      data: {
        ...scope,
        templateId: store.templates["storage-temp"]!,
        templateVersion: 1,
        entryDate: day(1),
        status: "submitted",
        values: { c1: 5.1, c2: 5.2, c3: 5.4, c4: 5.0, c5: 6.0 },
        createdById: store.openerId,
        submittedAt: new Date(),
      },
    });
    await prisma.formEntry.create({
      data: {
        ...scope,
        templateId: store.templates["storage-temp"]!,
        templateVersion: 1,
        entryDate: day(dayOfMonth),
        status: "issue_open",
        values: { c1: 5.1, c2: 5.2, c3: 8.6, c4: 5.0, c5: 6.0 },
        breaches: { c3: "8.6 超出上限 7 °C" },
        correctiveAction: "已调低设定并报修",
        isLate: false,
        createdById: store.openerId,
        submittedAt: new Date(),
      },
    });
    // 作废的那条不该出现在月度表里
    await prisma.formEntry.create({
      data: {
        ...scope,
        templateId: store.templates["storage-temp"]!,
        templateVersion: 1,
        entryDate: day(1),
        status: "submitted",
        values: { c1: 9.9, c2: 9.9, c3: 9.9, c4: 9.9, c5: 9.9 },
        createdById: store.mateId,
        submittedAt: new Date(),
        voidedAt: new Date(),
        voidedById: store.managerId,
        voidReason: "重复填了一次",
      },
    });
    // 流水版式：加热温度两条
    for (const [index, temp] of [72, 68].entries()) {
      await prisma.formEntry.create({
        data: {
          ...scope,
          templateId: store.templates["heating-temp"]!,
          templateVersion: 1,
          entryDate: day(Math.min(dayOfMonth, index + 1)),
          status: temp < 70 ? "issue_open" : "submitted",
          values: { c1: "红烧肉", c2: temp },
          breaches: temp < 70 ? { c2: `${temp} 低于下限 70 °C` } : undefined,
          correctiveAction: temp < 70 ? "重新加热" : null,
          createdById: store.openerId,
          submittedAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it("月度网格一天一行，整月天数对得上", async () => {
    const response = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/monthly`)
      .query({ month })
      .set(auth(store.managerToken));
    expect(response.status).toBe(200);
    expect(response.body.layout).toBe("monthly_grid");

    const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    expect(response.body.rows).toHaveLength(daysInMonth);
    expect(response.body.rows[0].day).toBe(1);
  });

  it("填过的天有值，超标格带原因，作废的那条不出现", async () => {
    const response = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/monthly`)
      .query({ month })
      .set(auth(store.managerToken));

    const firstDay = response.body.rows[0];
    expect(firstDay.filledByName).toBe("开店的");
    // 作废那条填的是 9.9，不该盖掉正常那条
    expect(firstDay.cells.find((cell: { columnId: string }) => cell.columnId === "c3").value).toBe("5.4");

    const todayRow = response.body.rows[dayOfMonth - 1];
    const breached = todayRow.cells.find((cell: { columnId: string }) => cell.columnId === "c3");
    expect(breached.value).toBe("8.6");
    expect(breached.breach).toContain("超出上限");
  });

  it("还没到的日子不算漏填", async () => {
    const response = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/monthly`)
      .query({ month })
      .set(auth(store.managerToken));

    const future = response.body.rows.filter((row: { future: boolean }) => row.future);
    const daysInMonth = response.body.rows.length;
    expect(future).toHaveLength(daysInMonth - dayOfMonth);
    // 1 号和今天填了，中间的算漏；今天本来就填了，不涉及「今天不算漏」这条
    expect(response.body.stats.missingDays).toBe(Math.max(0, dayOfMonth - 2));
    expect(response.body.stats.entries).toBe(2);
    expect(response.body.stats.breaches).toBe(1);
  });

  it("流水版式一条记录一行，不画整月网格", async () => {
    const response = await http()
      .get(`/haccp/templates/${store.templates["heating-temp"]}/monthly`)
      .query({ month })
      .set(auth(store.managerToken));
    expect(response.body.layout).toBe("log");
    expect(response.body.rows).toHaveLength(2);
    expect(response.body.stats.missingDays).toBe(0);
  });

  it("空月份不返回一堆空行的统计假象", async () => {
    const response = await http()
      .get(`/haccp/templates/${store.templates["pest-control"]}/monthly`)
      .query({ month })
      .set(auth(store.managerToken));
    expect(response.body.stats.entries).toBe(0);
  });

  it("表头和临界值说明跟着记录一起出去", async () => {
    const response = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/monthly`)
      .query({ month })
      .set(auth(store.managerToken));
    expect(response.body.template.header.operation).toBeTruthy();
    expect(response.body.template.footnotes.length).toBeGreaterThan(0);
    expect(response.body.unitName).toBe("report 店");
  });

  it("月份格式不对要报错，不要默默给个空表", async () => {
    const response = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/monthly`)
      .query({ month: "2026/09" })
      .set(auth(store.managerToken));
    expect(response.status).toBe(400);
  });

  it("检查模式：一次给出全部七张表，封面统计对得上", async () => {
    const response = await http()
      .get("/haccp/manage/inspection")
      .query({ month })
      .set(auth(store.managerToken));
    expect(response.status).toBe(200);
    expect(response.body.reports).toHaveLength(7);
    expect(response.body.templateCount).toBe(7);
    expect(response.body.entryCount).toBe(4);
    expect(response.body.breachCount).toBe(2);
    expect(response.body.unitName).toBe("report 店");
  });

  it("检查前自查列出缺记录的表", async () => {
    const response = await http()
      .get("/haccp/manage/inspection")
      .query({ month })
      .set(auth(store.managerToken));
    const names = response.body.selfCheck.map((row: { nameZh: string }) => row.nameZh);
    expect(names).toContain("害虫防治");
    expect(names).toContain("员工培训");
  });

  it("员工看得了月度表，但打不开检查模式", async () => {
    const monthly = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/monthly`)
      .query({ month })
      .set(auth(store.openerToken));
    expect(monthly.status).toBe(200);

    const inspection = await http().get("/haccp/manage/inspection").query({ month }).set(auth(store.openerToken));
    expect(inspection.status).toBe(403);
  });

  it("另一家公司的店长拿这边的 templateId 也读不到", async () => {
    const other = await createStore(prisma, "other-report", today);
    const response = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/monthly`)
      .query({ month })
      .set(auth(other.managerToken));
    expect(response.status).toBe(404);
  });
});

describe("今天还没填不算漏填", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: Store;

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    prisma = created.prisma;
    await resetDatabase(prisma);
    store = await createStore(prisma, "pending", todayInStore());
  });

  afterAll(async () => {
    await app?.close();
  });

  it("一条记录都没有时，今天那一行不计进 missingDays", async () => {
    const today = todayInStore();
    const response = await request(app.getHttpServer())
      .get(`/haccp/templates/${store.templates["storage-temp"]}/monthly`)
      .query({ month: today.slice(0, 7) })
      .set({ Authorization: `Bearer ${store.managerToken}` });

    const dayOfMonth = Number(today.slice(8));
    // 1 号到昨天都算漏，今天不算
    expect(response.body.stats.missingDays).toBe(dayOfMonth - 1);

    const todayRow = response.body.rows[dayOfMonth - 1];
    expect(todayRow.isToday).toBe(true);
    expect(todayRow.future).toBe(false);
    expect(todayRow.entryId).toBeNull();
  });
});
