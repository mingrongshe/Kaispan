import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayInStore, shiftDays } from "../src/domain/dates";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createTestApp, resetDatabase } from "./app-harness";
import { createStore, type Store } from "./store-harness";

/**
 * docs/product-scope.md 第九节那条验收路径，从头走一遍。
 * 每一步都走 HTTP，不直接调 service —— 权限和租户范围是在 HTTP 那一层生效的。
 */
describe("第一批业务闭环（真实 PostgreSQL）", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: Store;
  let today: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    prisma = created.prisma;
    await resetDatabase(prisma);
    today = todayInStore();
    store = await createStore(prisma, "flow", today);
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it("① 派给开店班之后，当班的两个人待办里都出现", async () => {
    const opener = await http().get("/haccp/my-tasks").set(auth(store.openerToken));
    expect(opener.status).toBe(200);
    const keys = (opener.body.tasks as { templateKey: string }[]).map((task) => task.templateKey);
    expect(keys).toContain("storage-temp");

    const mate = await http().get("/haccp/my-tasks").set(auth(store.mateToken));
    expect((mate.body.tasks as { templateKey: string }[]).map((t) => t.templateKey)).toContain("storage-temp");
  });

  it("② 不上班的人待办是空的，员工培训表不走派单所以谁也不出现", async () => {
    const outsider = await http().get("/haccp/my-tasks").set(auth(store.outsiderToken));
    expect(outsider.body.tasks).toHaveLength(0);

    const opener = await http().get("/haccp/my-tasks").set(auth(store.openerToken));
    const keys = (opener.body.tasks as { templateKey: string }[]).map((task) => task.templateKey);
    expect(keys).not.toContain("staff-training");
  });

  it("③ 每周两次的表标着「本周还差几次」", async () => {
    const response = await http().get("/haccp/tasks").set(auth(store.managerToken));
    const heating = (response.body.tasks as { templateKey: string; due: { needed: number; remaining: number } }[]).find(
      (task) => task.templateKey === "heating-temp",
    );
    expect(heating?.due.needed).toBe(2);
    expect(heating?.due.remaining).toBe(2);
  });

  it("④ 草稿存得住，而且只有本人看得到", async () => {
    const saved = await http()
      .post("/haccp/drafts")
      .set(auth(store.openerToken))
      .send({ templateId: store.templates["storage-temp"], entryDate: today, values: { c1: 5.1, c2: 5.4, c3: 6.2 } });
    expect(saved.status).toBe(201);

    const mine = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/form`)
      .set(auth(store.openerToken));
    expect(mine.body.draft?.values).toMatchObject({ c1: 5.1 });

    const mate = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/form`)
      .set(auth(store.mateToken));
    expect(mate.body.draft).toBeNull();

    const managerSees = await http().get("/haccp/entries").set(auth(store.managerToken));
    expect(managerSees.body).toHaveLength(0);
  });

  it("⑤ 必填没填提交不了", async () => {
    const response = await http()
      .post("/haccp/entries")
      .set(auth(store.openerToken))
      .send({ templateId: store.templates["storage-temp"], entryDate: today, values: { c1: 5.1 } });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("MISSING_REQUIRED");
  });

  it("⑥ 有超标项、没写纠正措施，提交被拦", async () => {
    const response = await http()
      .post("/haccp/entries")
      .set(auth(store.openerToken))
      .send({
        templateId: store.templates["storage-temp"],
        entryDate: today,
        values: { c1: 5.1, c2: 5.4, c3: 8.6, c4: 5.0, c5: 6.1 },
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("CORRECTIVE_ACTION_REQUIRED");
  });

  it("⑦ 写了纠正措施能提交，落成待处理，而且草稿转正不留孤儿", async () => {
    const response = await http()
      .post("/haccp/entries")
      .set(auth(store.openerToken))
      .send({
        templateId: store.templates["storage-temp"],
        entryDate: today,
        values: { c1: 5.1, c2: 5.4, c3: 8.6, c4: 5.0, c5: 6.1 },
        correctiveAction: "已调低设定并报修",
      });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("issue_open");

    const drafts = await prisma.formEntry.count({ where: { unitId: store.unitId, status: "draft" } });
    expect(drafts).toBe(0);
  });

  it("⑧ 填完了，两个人的待办里都不再出现", async () => {
    for (const token of [store.openerToken, store.mateToken]) {
      const response = await http().get("/haccp/my-tasks").set(auth(token));
      const keys = (response.body.tasks as { templateKey: string }[]).map((task) => task.templateKey);
      expect(keys).not.toContain("storage-temp");
    }
  });

  it("⑨ 员工只读看得到同事填的记录", async () => {
    const response = await http().get("/haccp/entries").set(auth(store.mateToken));
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].filledByName).toBe("开店的");
  });

  it("⑩ 没派给他的表，进不去也提交不了", async () => {
    const response = await http()
      .post("/haccp/entries")
      .set(auth(store.outsiderToken))
      .send({
        templateId: store.templates["storage-temp"],
        entryDate: today,
        values: { c1: 5, c2: 5, c3: 5, c4: 5, c5: 5 },
      });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOT_FOUND_IN_SCOPE");
  });

  it("⑪ 温度类超标必须挂设备，只写处理结果关不掉", async () => {
    const issues = await http().get("/haccp/manage/issues").set(auth(store.managerToken));
    expect(issues.body).toHaveLength(1);
    const entryId = issues.body[0].id as string;

    const refused = await http()
      .post(`/haccp/manage/issues/${entryId}/resolve`)
      .set(auth(store.managerToken))
      .send({ note: "看过了" });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("EQUIPMENT_REQUIRED");

    const candidates = await http()
      .get(`/haccp/manage/issues/${entryId}/equipment-candidates`)
      .set(auth(store.managerToken));
    expect(candidates.body).toHaveLength(1);
    expect(candidates.body[0].name).toBe("冷藏柜 2");
  });

  it("⑫ 开维修单不等于处理完，填了结果标记完成才闭环", async () => {
    const issues = await http().get("/haccp/manage/issues").set(auth(store.managerToken));
    const entryId = issues.body[0].id as string;

    const opened = await http()
      .post(`/haccp/manage/issues/${entryId}/resolve`)
      .set(auth(store.managerToken))
      .send({ equipmentId: store.fridgeEquipmentId, workOrderNote: "温度爬到 8.6，压缩机声音不对" });
    expect(opened.status).toBe(201);
    expect(opened.body.status).toBe("issue_open");

    const fridge = await prisma.equipment.findFirstOrThrow({ where: { id: store.fridgeEquipmentId } });
    expect(fridge.status).toBe("needs_repair");

    const workOrderId = (opened.body.workOrders as { id: string }[])[0]!.id;
    const completed = await http()
      .post(`/equipment/work-orders/${workOrderId}/complete`)
      .set(auth(store.managerToken))
      .send({ result: "换了温控器" });
    expect(completed.status).toBe(201);
    expect(completed.body.status).toBe("ok");

    const entry = await prisma.formEntry.findFirstOrThrow({ where: { id: entryId } });
    expect(entry.status).toBe("issue_resolved");
    expect(entry.resolvedById).toBe(store.managerId);
  });

  it("⑬ 员工能作废自己填的记录重填，理由必填，原记录留痕", async () => {
    const list = await http().get("/haccp/entries").set(auth(store.openerToken));
    const entryId = list.body[0].id as string;

    const noReason = await http()
      .post(`/haccp/entries/${entryId}/void`)
      .set(auth(store.openerToken))
      .send({ reason: "  " });
    expect(noReason.body.code).toBe("VOID_REASON_REQUIRED");

    const voided = await http()
      .post(`/haccp/entries/${entryId}/void`)
      .set(auth(store.openerToken))
      .send({ reason: "温度抄反了，实际是 6.8" });
    expect(voided.status).toBe(201);

    // 标记不是删除
    expect(await prisma.formEntry.count({ where: { id: entryId } })).toBe(1);
    // 默认不显示
    const after = await http().get("/haccp/entries").set(auth(store.openerToken));
    expect(after.body).toHaveLength(0);
    const withVoided = await http().get("/haccp/entries").query({ includeVoided: true }).set(auth(store.openerToken));
    expect(withVoided.body).toHaveLength(1);
  });

  it("⑭ 别人填的记录，员工作废不了", async () => {
    await http()
      .post("/haccp/entries")
      .set(auth(store.openerToken))
      .send({
        templateId: store.templates["storage-temp"],
        entryDate: today,
        values: { c1: 5.1, c2: 5.4, c3: 6.8, c4: 5.0, c5: 6.1 },
      });
    const list = await http().get("/haccp/entries").set(auth(store.mateToken));
    const entryId = list.body[0].id as string;

    const refused = await http()
      .post(`/haccp/entries/${entryId}/void`)
      .set(auth(store.mateToken))
      .send({ reason: "我觉得不对" });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("NOT_YOUR_ENTRY");

    // 店长可以
    const byManager = await http()
      .post(`/haccp/entries/${entryId}/void`)
      .set(auth(store.managerToken))
      .send({ reason: "店长核对后作废" });
    expect(byManager.status).toBe(201);
  });

  it("⑮ 补填过期日期必须写原因，记录带补填标记", async () => {
    const yesterday = shiftDays(today, -1);
    const payload = {
      templateId: store.templates["storage-temp"],
      entryDate: yesterday,
      values: { c1: 5.1, c2: 5.4, c3: 6.2, c4: 5.0, c5: 6.1 },
    };

    const refused = await http().post("/haccp/entries").set(auth(store.openerToken)).send(payload);
    expect(refused.body.code).toBe("LATE_REASON_REQUIRED");

    const tooShort = await http()
      .post("/haccp/entries")
      .set(auth(store.openerToken))
      .send({ ...payload, lateReason: "忘了" });
    expect(tooShort.body.code).toBe("LATE_REASON_REQUIRED");

    const ok = await http()
      .post("/haccp/entries")
      .set(auth(store.openerToken))
      .send({ ...payload, lateReason: "当天冷库停电，进不去" });
    expect(ok.status).toBe(201);
    expect(ok.body.isLate).toBe(true);
  });

  it("⑯ 不能给还没到的日子填表", async () => {
    const response = await http()
      .post("/haccp/entries")
      .set(auth(store.openerToken))
      .send({
        templateId: store.templates["storage-temp"],
        entryDate: shiftDays(today, 1),
        values: { c1: 5, c2: 5, c3: 5, c4: 5, c5: 5 },
      });
    expect(response.body.code).toBe("FUTURE_DATE");
  });

  it("⑰ 漏填按表聚合列出来", async () => {
    const response = await http().get("/haccp/tasks").set(auth(store.managerToken));
    const missed = response.body.missed as { nameZh: string; missing: string[] }[];
    const cleaning = missed.find((row) => row.nameZh === "清洁与消毒");
    expect(cleaning?.missing.length).toBeGreaterThan(0);
  });

  it("⑱ 设备趋势读得出那台冰箱的曲线，超标点标出来", async () => {
    const response = await http()
      .get(`/equipment/${store.fridgeEquipmentId}/trend`)
      .set(auth(store.openerToken));
    expect(response.status).toBe(200);
    expect(response.body.columnLabel).toBe("冷藏柜 2");
    expect(response.body.limit).toMatchObject({ max: 7 });
    expect(response.body.points.length).toBeGreaterThan(0);
  });

  it("⑲ 员工开不了维修单", async () => {
    const response = await http()
      .post("/equipment")
      .set(auth(store.openerToken))
      .send({ name: "新冰箱" });
    expect(response.status).toBe(403);
  });

  it("⑳ 改派单不覆盖历史：旧规则封口，新规则从指定日期起生效", async () => {
    const templateId = store.templates["storage-temp"]!;
    const response = await http()
      .put(`/haccp/manage/templates/${templateId}/assignment`)
      .set(auth(store.managerToken))
      .send({ shiftKind: "closing", fromDate: shiftDays(today, 1) });
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);

    // 今天仍然算开店班的，因为新规则明天才生效
    const opener = await http().get("/haccp/my-tasks").set(auth(store.openerToken));
    expect(opener.status).toBe(200);

    const tomorrow = await http()
      .get("/haccp/tasks")
      .query({ date: shiftDays(today, 1) })
      .set(auth(store.managerToken));
    const row = (tomorrow.body.tasks as { templateKey: string; shiftKind: string }[]).find(
      (task) => task.templateKey === "storage-temp",
    );
    expect(row?.shiftKind).toBe("closing");
  });
});

describe("待处理按设备聚合", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: Store;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    prisma = created.prisma;
    await resetDatabase(prisma);
    const today = todayInStore();
    store = await createStore(prisma, "group", today);

    // 同一台冰箱连着三天同一个问题
    for (const back of [3, 2, 1]) {
      await prisma.formEntry.create({
        data: {
          organizationId: store.organizationId,
          unitId: store.unitId,
          templateId: store.templates["storage-temp"]!,
          templateVersion: 1,
          entryDate: new Date(`${shiftDays(today, -back)}T00:00:00.000Z`),
          status: "issue_open",
          values: { c1: 5, c2: 5, c3: 8.2 + back / 10, c4: 5, c5: 5 },
          breaches: { c3: "超出上限 7 °C" },
          correctiveAction: "已调低设定",
          createdById: store.openerId,
          submittedAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it("三条记录聚成一条，标着连续 3 天，直接指向那台设备", async () => {
    const response = await request(app.getHttpServer())
      .get("/haccp/manage/issue-groups")
      .set(auth(store.managerToken));
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);

    const group = response.body[0];
    expect(group.columnLabel).toBe("冷藏柜 2");
    expect(group.equipmentName).toBe("冷藏柜 2");
    expect(group.consecutiveDays).toBe(3);
    expect(group.entryIds).toHaveLength(3);
  });

  it("员工看不到聚合结果", async () => {
    const response = await request(app.getHttpServer())
      .get("/haccp/manage/issue-groups")
      .set(auth(store.openerToken));
    expect(response.status).toBe(403);
  });
});
