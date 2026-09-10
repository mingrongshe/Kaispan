import type { ShiftKind } from "@prisma/client";
import prototypeTemplates from "../prisma/prototype-templates.json";
import type { PrismaService } from "../src/prisma/prisma.service";

type PrototypeTemplate = {
  id: string;
  layout: "monthly-grid" | "log" | "training";
  timing: "morning" | "day" | "evening" | "any";
  frequency: { kind: "daily" | "weekly" | "yearly"; times?: number };
  name: { zh: string; de: string };
  header?: Record<string, unknown>;
  columns: unknown[];
  footnotes?: unknown[];
};

const LAYOUT = { "monthly-grid": "monthly_grid", log: "log", training: "training" } as const;
const SHIFT_FOR_TIMING: Record<string, ShiftKind> = {
  morning: "opening",
  day: "midday",
  evening: "closing",
  any: "opening",
};

export type Store = {
  organizationId: string;
  unitId: string;
  managerToken: string;
  managerId: string;
  /** 那天上开店班的人 */
  openerToken: string;
  openerId: string;
  /** 同一个开店班上的第二个人，用来验「谁填都算」 */
  mateToken: string;
  mateId: string;
  /** 完全不上班的人，用来验「别人的表进不去」 */
  outsiderToken: string;
  templates: Record<string, string>;
  fridgeEquipmentId: string;
};

/**
 * 造一整家店：组织、门店、四个人、班表、七张表、派单、五台设备。
 * 和 prisma/seed.ts 是同一套结构，只是不写死日期，方便测试挑自己的日子。
 */
export async function createStore(prisma: PrismaService, label: string, isoDate: string): Promise<Store> {
  const organization = await prisma.organization.create({ data: { name: `${label} GmbH` } });
  const unit = await prisma.unit.create({ data: { organizationId: organization.id, name: `${label} 店` } });
  const scope = { organizationId: organization.id, unitId: unit.id };

  // token 和登录码只用 ASCII：HTTP 头里放不了中文
  const make = async (name: string, slug: string, role: "employee" | "store_manager") =>
    prisma.user.create({ data: { ...scope, name, role, locale: "zh", loginCode: `${label}-${slug}` } });

  const manager = await make("店长", "manager", "store_manager");
  const opener = await make("开店的", "opener", "employee");
  const mate = await make("同班的", "mate", "employee");
  const outsider = await make("不上班的", "outsider", "employee");

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.session.createMany({
    data: [
      { token: `${label}-manager-token`, userId: manager.id, expiresAt },
      { token: `${label}-opener-token`, userId: opener.id, expiresAt },
      { token: `${label}-mate-token`, userId: mate.id, expiresAt },
      { token: `${label}-outsider-token`, userId: outsider.id, expiresAt },
    ],
  });

  await prisma.shiftDefinition.createMany({
    data: [
      { ...scope, kind: "opening" as ShiftKind, startMinutes: 390, endMinutes: 870 },
      { ...scope, kind: "midday" as ShiftKind, startMinutes: 660, endMinutes: 1140 },
      { ...scope, kind: "closing" as ShiftKind, startMinutes: 900, endMinutes: 1380 },
    ],
  });

  // 前后各铺一周班表，补填和周进度都用得上
  const rows: { organizationId: string; unitId: string; date: Date; kind: ShiftKind; userId: string }[] = [];
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  for (let offset = -7; offset <= 7; offset += 1) {
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate() + offset);
    rows.push({ ...scope, date, kind: "opening", userId: opener.id });
    rows.push({ ...scope, date, kind: "opening", userId: mate.id });
    rows.push({ ...scope, date, kind: "midday", userId: opener.id });
    rows.push({ ...scope, date, kind: "closing", userId: mate.id });
  }
  await prisma.shiftAssignment.createMany({ data: rows, skipDuplicates: true });

  const templates: Record<string, string> = {};
  const effectiveFrom = new Date(base);
  effectiveFrom.setUTCDate(base.getUTCDate() - 30);

  for (const raw of prototypeTemplates as unknown as PrototypeTemplate[]) {
    const template = await prisma.formTemplate.create({
      data: {
        ...scope,
        key: raw.id,
        layout: LAYOUT[raw.layout],
        frequencyKind: raw.frequency.kind,
        frequencyTimes: raw.frequency.times ?? 1,
        timing: raw.timing,
      },
    });
    templates[raw.id] = template.id;

    await prisma.formTemplateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        nameZh: raw.name.zh,
        nameDe: raw.name.de,
        columns: raw.columns as never,
        header: (raw.header ?? null) as never,
        footnotes: (raw.footnotes ?? null) as never,
      },
    });

    if (raw.id !== "staff-training") {
      await prisma.formAssignment.create({
        data: { ...scope, templateId: template.id, shiftKind: SHIFT_FOR_TIMING[raw.timing]!, effectiveFrom },
      });
    }
  }

  const storageTemplateId = templates["storage-temp"]!;
  const fridge = await prisma.equipment.create({
    data: { ...scope, name: "冷藏柜 2", location: "吧台", linkTemplateId: storageTemplateId, linkColumnId: "c3" },
  });

  return {
    organizationId: organization.id,
    unitId: unit.id,
    managerToken: `${label}-manager-token`,
    managerId: manager.id,
    openerToken: `${label}-opener-token`,
    openerId: opener.id,
    mateToken: `${label}-mate-token`,
    mateId: mate.id,
    outsiderToken: `${label}-outsider-token`,
    templates,
    fridgeEquipmentId: fridge.id,
  };
}
