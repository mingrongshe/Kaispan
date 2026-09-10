import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayInStore } from "../src/domain/dates";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createTestApp, resetDatabase } from "./app-harness";
import { createStore, type Store } from "./store-harness";

// 一张 1x1 的 PNG，够真到能被当作图片收下
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("表单编辑器、异常照片、CSV 导出（真实 PostgreSQL）", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: Store;
  let today: string;
  let breachedEntryId: string;
  let normalEntryId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const created = await createTestApp();
    app = created.app;
    prisma = created.prisma;
    await resetDatabase(prisma);
    today = todayInStore();
    store = await createStore(prisma, "editor", today);

    const scope = { organizationId: store.organizationId, unitId: store.unitId };
    const breached = await prisma.formEntry.create({
      data: {
        ...scope,
        templateId: store.templates["storage-temp"]!,
        templateVersion: 1,
        entryDate: new Date(`${today}T00:00:00.000Z`),
        status: "issue_open",
        values: { c1: 5, c2: 5, c3: 8.6, c4: 5, c5: 5 },
        breaches: { c3: "8.6 超出上限 7 °C" },
        correctiveAction: "已调低设定并报修",
        createdById: store.openerId,
        submittedAt: new Date(),
      },
    });
    breachedEntryId = breached.id;

    const normal = await prisma.formEntry.create({
      data: {
        ...scope,
        templateId: store.templates["cleaning"]!,
        templateVersion: 1,
        entryDate: new Date(`${today}T00:00:00.000Z`),
        status: "submitted",
        values: { c0: "同班的", c1: "R+D 清洁并消毒", c2: "已完成", c3: "已完成", c4: "已完成", c5: "已完成", c6: "已完成" },
        createdById: store.openerId,
        submittedAt: new Date(),
      },
    });
    normalEntryId = normal.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  // ---------------------------------------------------------------- 照片

  it("正常记录不收照片 —— 卫生局资料包不该变成相册", async () => {
    const response = await http()
      .post(`/haccp/entries/${normalEntryId}/photos`)
      .set(auth(store.openerToken))
      .attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("NO_BREACH_NO_PHOTO");
  });

  it("超标记录能加照片，最多 3 张", async () => {
    for (let index = 0; index < 3; index += 1) {
      const response = await http()
        .post(`/haccp/entries/${breachedEntryId}/photos`)
        .set(auth(store.openerToken))
        .attach("file", PNG, { filename: `p${index}.png`, contentType: "image/png" });
      expect(response.status).toBe(201);
    }

    const fourth = await http()
      .post(`/haccp/entries/${breachedEntryId}/photos`)
      .set(auth(store.openerToken))
      .attach("file", PNG, { filename: "p4.png", contentType: "image/png" });
    expect(fourth.status).toBe(400);
    expect(fourth.body.code).toBe("TOO_MANY_PHOTOS");
  });

  it("只存相对 key，不存本机路径也不存公开 URL", async () => {
    const file = await prisma.fileObject.findFirstOrThrow({ where: { entryId: breachedEntryId } });
    expect(file.storageKey.startsWith("/")).toBe(false);
    expect(file.storageKey).toContain(store.unitId);
    expect(file.storageKey).not.toContain("http");
    expect(file.organizationId).toBe(store.organizationId);
    expect(file.unitId).toBe(store.unitId);
  });

  it("下载走后端，读得回原始字节", async () => {
    const list = await http().get(`/haccp/entries/${breachedEntryId}/photos`).set(auth(store.openerToken));
    expect(list.body).toHaveLength(3);

    const response = await http().get(`/haccp/photos/${list.body[0].id}`).set(auth(store.managerToken));
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(Buffer.from(response.body).equals(PNG)).toBe(true);
  });

  it("别人的记录加不了照片，另一家店的照片下不下来", async () => {
    const other = await createStore(prisma, "editor-other", today);

    const notMine = await http()
      .post(`/haccp/entries/${breachedEntryId}/photos`)
      .set(auth(store.mateToken))
      .attach("file", PNG, { filename: "x.png", contentType: "image/png" });
    expect(notMine.status).toBe(403);

    const list = await http().get(`/haccp/entries/${breachedEntryId}/photos`).set(auth(store.openerToken));
    const crossTenant = await http().get(`/haccp/photos/${list.body[0].id}`).set(auth(other.managerToken));
    expect(crossTenant.status).toBe(404);
  });

  it("不是图片的文件收不下", async () => {
    const response = await http()
      .post(`/haccp/entries/${breachedEntryId}/photos`)
      .set(auth(store.managerToken))
      .attach("file", Buffer.from("select 1"), { filename: "x.sql", contentType: "application/sql" });
    expect(response.body.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  // ---------------------------------------------------------------- 编辑器

  it("表单管理列出名称、版本、记录数、状态", async () => {
    const response = await http().get("/haccp/manage/templates").set(auth(store.managerToken));
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(7);
    const storage = response.body.find((row: { key: string }) => row.key === "storage-temp");
    expect(storage.columnCount).toBe(5);
    expect(storage.currentVersion).toBe(1);
    expect(storage.entryCount).toBe(1);
    expect(storage.active).toBe(true);
  });

  it("改名、改限值、删一列、加一列 → 保存成 v2，v1 原样留着", async () => {
    const templateId = store.templates["storage-temp"]!;
    const before = await http().get(`/haccp/manage/templates/${templateId}/editor`).set(auth(store.managerToken));
    expect(before.body.columns).toHaveLength(5);

    const columns = before.body.columns as { id: string; label: { zh: string }; type: string; unit?: string }[];
    const payload = {
      nameZh: "储存 / 冷藏温度",
      nameDe: "Lager- / Kühltemperaturen",
      columns: [
        // 改名 + 改上限
        { id: columns[0]!.id, labelZh: "后厨立式冷柜", type: "temp", unit: "°C", limit: { min: 4, max: 5 } },
        { id: columns[1]!.id, labelZh: columns[1]!.label.zh, type: "temp", unit: "°C", limit: { min: 4, max: 7 } },
        { id: columns[2]!.id, labelZh: columns[2]!.label.zh, type: "temp", unit: "°C", limit: { min: 4, max: 7 } },
        { id: columns[3]!.id, labelZh: columns[3]!.label.zh, type: "temp", unit: "°C", limit: { min: 4, max: 7 } },
        // 第 5 列删掉，加一个冷冻间
        { labelZh: "冷冻间", type: "temp", unit: "°C", limit: { max: -18, tolerance: -15 } },
      ],
    };

    const saved = await http()
      .post(`/haccp/manage/templates/${templateId}/versions`)
      .set(auth(store.managerToken))
      .send(payload);
    expect(saved.status).toBe(201);
    expect(saved.body.currentVersion).toBe(2);
    expect(saved.body.columns[0].label.zh).toBe("后厨立式冷柜");
    expect(saved.body.columns[0].limit.max).toBe(5);

    // v1 的五个原始列完整保留
    const v1 = await prisma.formTemplateVersion.findFirstOrThrow({ where: { templateId, version: 1 } });
    expect((v1.columns as { id: string }[]).map((column) => column.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("新列不复用被删掉的列 id —— 复用了旧记录就会串", async () => {
    const templateId = store.templates["storage-temp"]!;
    const editor = await http().get(`/haccp/manage/templates/${templateId}/editor`).set(auth(store.managerToken));
    const ids = (editor.body.columns as { id: string }[]).map((column) => column.id);
    expect(ids).toHaveLength(5);
    // 被删掉的是 c5，新加的那一列必须是 c6
    expect(ids).not.toContain("c5");
    expect(ids[4]).toBe("c6");
  });

  it("按原 id 把删掉的列加回来会被拒", async () => {
    const templateId = store.templates["storage-temp"]!;
    const editor = await http().get(`/haccp/manage/templates/${templateId}/editor`).set(auth(store.managerToken));
    const columns = editor.body.columns as { id: string; label: { zh: string } }[];

    const response = await http()
      .post(`/haccp/manage/templates/${templateId}/versions`)
      .set(auth(store.managerToken))
      .send({
        nameZh: "储存 / 冷藏温度",
        columns: [
          ...columns.map((column) => ({ id: column.id, labelZh: column.label.zh, type: "temp", unit: "°C" })),
          { id: "c5", labelZh: "想把 c5 弄回来", type: "temp", unit: "°C" },
        ],
      });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("UNKNOWN_COLUMN");
  });

  it("改版之后旧记录仍然按它自己那一版渲染", async () => {
    const entry = await http().get(`/haccp/entries/${breachedEntryId}`).set(auth(store.managerToken));
    expect(entry.body.template.version).toBe(1);
    // v1 里 c1 还是原来的名字，不是改后的「后厨立式冷柜」
    expect(entry.body.template.columns[0].label.zh).toBe("冷藏间");
  });

  it("新版的限值真的生效：填 6 在新上限 5 之外", async () => {
    const templateId = store.templates["storage-temp"]!;
    const editor = await http().get(`/haccp/manage/templates/${templateId}/editor`).set(auth(store.managerToken));
    const ids = (editor.body.columns as { id: string }[]).map((column) => column.id);

    const values: Record<string, number> = {};
    for (const id of ids) values[id] = 6;
    values[ids[4]!] = -16; // 冷冻间，落在短暂容许里，应当只是警告

    const check = await http()
      .post(`/haccp/templates/${templateId}/check`)
      .set(auth(store.managerToken))
      .send({ templateId, entryDate: today, values });
    expect(check.status).toBe(201);
    const breachedColumns = (check.body.breaches as { columnId: string }[]).map((issue) => issue.columnId);
    expect(breachedColumns).toContain(ids[0]);
    expect(breachedColumns).not.toContain(ids[4]);
    expect(check.body.warnings).toHaveLength(1);
  });

  it("条件限值在编辑器里改不了，保存之后原样还在", async () => {
    const templateId = store.templates["output-temp"]!;
    const editor = await http().get(`/haccp/manage/templates/${templateId}/editor`).set(auth(store.managerToken));
    const columns = editor.body.columns as {
      id: string;
      label: { zh: string };
      type: string;
      unit?: string;
      options?: { zh: string }[];
      limitBy?: unknown;
    }[];
    expect(columns[2]!.limitBy).toBeTruthy();

    const saved = await http()
      .post(`/haccp/manage/templates/${templateId}/versions`)
      .set(auth(store.managerToken))
      .send({
        nameZh: "出餐温度",
        columns: columns.map((column) => ({
          id: column.id,
          labelZh: column.label.zh,
          type: column.type,
          unit: column.unit,
          optionsText: (column.options ?? []).map((option) => option.zh).join("\n"),
          // 故意想把它改掉
          limit: { min: 0, max: 999 },
        })),
      });
    expect(saved.status).toBe(201);
    expect(saved.body.columns[2].limitBy).toBeTruthy();
    expect(saved.body.columns[2].limit).toBeUndefined();
  });

  it("停用是归档不是删除，记录还在，员工那边也不再出现", async () => {
    const templateId = store.templates["pest-control"]!;
    const off = await http()
      .put(`/haccp/manage/templates/${templateId}/active`)
      .set(auth(store.managerToken))
      .send({ active: false });
    expect(off.status).toBe(200);

    expect(await prisma.formTemplate.count({ where: { id: templateId } })).toBe(1);

    const templates = await http().get("/haccp/templates").set(auth(store.openerToken));
    expect((templates.body as { key: string }[]).map((row) => row.key)).not.toContain("pest-control");

    await http().put(`/haccp/manage/templates/${templateId}/active`).set(auth(store.managerToken)).send({ active: true });
  });

  it("员工碰不了编辑器", async () => {
    const list = await http().get("/haccp/manage/templates").set(auth(store.openerToken));
    expect(list.status).toBe(403);

    const save = await http()
      .post(`/haccp/manage/templates/${store.templates["storage-temp"]}/versions`)
      .set(auth(store.openerToken))
      .send({ nameZh: "随便改", columns: [{ labelZh: "x", type: "text" }] });
    expect(save.status).toBe(403);
  });

  // ---------------------------------------------------------------- CSV

  it("CSV 带 BOM，表头是中文列名，超标格带感叹号", async () => {
    const response = await http()
      .get(`/haccp/templates/${store.templates["storage-temp"]}/monthly.csv`)
      .query({ month: today.slice(0, 7) })
      .set(auth(store.managerToken));
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("attachment");

    const text = response.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toContain("填写人");
    expect(lines[0]).toContain("状态");
    expect(text).toContain("8.6 !");
    // 还没到的日子不导出
    expect(lines.length - 1).toBeLessThanOrEqual(Number(today.slice(8)));
  });
});
