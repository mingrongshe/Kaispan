import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type FormLayout, type FrequencyKind, type FormTiming, type ShiftKind } from "@prisma/client";
import prototypeTemplates from "./prototype-templates.json";

const repoRoot = join(__dirname, "..", "..", "..");
process.loadEnvFile(existsSync(join(repoRoot, ".env")) ? join(repoRoot, ".env") : join(repoRoot, ".env.example"));

/**
 * 演示数据。一家公司一家门店，这是兼容边界允许的简化，字段本身没有省。
 * 七张表的列定义和临界值来自 prototype-templates.json，由 tools/extract-templates.mjs
 * 从 references/haccp-prototype.html 的原型代码里抠出来，不是手抄的。
 */
// 灌数据和打 migration 一样，走直连比走连接池稳（见 tools/migrate.mjs 里的说明）。
const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("缺 DATABASE_URL，看 .env.example");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type PrototypeTemplate = {
  id: string;
  layout: "monthly-grid" | "log" | "training";
  timing: "morning" | "day" | "evening" | "any";
  frequency: { kind: "daily" | "weekly" | "yearly"; times?: number };
  name: { zh: string; de: string; en?: string };
  header?: Record<string, unknown>;
  columns: unknown[];
  footnotes?: unknown[];
};

const LAYOUT: Record<PrototypeTemplate["layout"], FormLayout> = {
  "monthly-grid": "monthly_grid",
  log: "log",
  training: "training",
};

const FREQUENCY: Record<PrototypeTemplate["frequency"]["kind"], FrequencyKind> = {
  daily: "daily",
  weekly: "weekly",
  yearly: "yearly",
};

/** timing 决定这张表默认派给哪个班次（产品范围第三节：派单单位是班次） */
const SHIFT_FOR_TIMING: Record<PrototypeTemplate["timing"], ShiftKind | null> = {
  morning: "opening",
  day: "midday",
  evening: "closing",
  any: "opening",
};

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** 本周一（周一为一周开始） */
function mondayOf(value: Date): Date {
  const day = dateOnly(value);
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  return day;
}

async function main(): Promise<void> {
  // 反复执行要幂等，先清空业务数据（演示库，不是生产）
  await prisma.$transaction([
    prisma.fileObject.deleteMany(),
    prisma.workOrder.deleteMany(),
    prisma.formEntry.deleteMany(),
    prisma.equipment.deleteMany(),
    prisma.formAssignment.deleteMany(),
    prisma.formTemplateVersion.deleteMany(),
    prisma.formTemplate.deleteMany(),
    prisma.shiftAssignment.deleteMany(),
    prisma.shiftDefinition.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.unit.deleteMany(),
    prisma.organization.deleteMany(),
  ]);

  const organization = await prisma.organization.create({ data: { name: "Martin Gastro GmbH" } });
  const unit = await prisma.unit.create({
    data: { organizationId: organization.id, name: "Martin Biergarten" },
  });
  const scope = { organizationId: organization.id, unitId: unit.id };

  const [martin, olivia, james, noah] = await Promise.all([
    prisma.user.create({ data: { ...scope, name: "Martin", role: "store_manager", locale: "zh", loginCode: "martin" } }),
    prisma.user.create({ data: { ...scope, name: "Olivia", role: "employee", locale: "zh", loginCode: "olivia" } }),
    prisma.user.create({ data: { ...scope, name: "James", role: "employee", locale: "de", loginCode: "james" } }),
    prisma.user.create({ data: { ...scope, name: "Noah", role: "employee", locale: "de", loginCode: "noah" } }),
  ]);

  await prisma.shiftDefinition.createMany({
    data: [
      { ...scope, kind: "opening", startMinutes: 6 * 60 + 30, endMinutes: 14 * 60 + 30 },
      { ...scope, kind: "midday", startMinutes: 11 * 60, endMinutes: 19 * 60 },
      { ...scope, kind: "closing", startMinutes: 15 * 60, endMinutes: 23 * 60 },
    ],
  });

  // 上周、本周、下周的班表。周六开店班排两个人，用来看「一个班两个人，谁填都算」。
  const monday = mondayOf(new Date());
  const shiftRows: { organizationId: string; unitId: string; date: Date; kind: ShiftKind; userId: string }[] = [];
  for (let week = -1; week < 2; week += 1) {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + week * 7 + offset);
      shiftRows.push({ ...scope, date, kind: "opening", userId: olivia.id });
      shiftRows.push({ ...scope, date, kind: "midday", userId: james.id });
      shiftRows.push({ ...scope, date, kind: "closing", userId: noah.id });
      if (offset === 5) shiftRows.push({ ...scope, date, kind: "opening", userId: james.id });
    }
  }
  await prisma.shiftAssignment.createMany({ data: shiftRows, skipDuplicates: true });

  for (const raw of prototypeTemplates as unknown as PrototypeTemplate[]) {
    const template = await prisma.formTemplate.create({
      data: {
        ...scope,
        key: raw.id,
        layout: LAYOUT[raw.layout],
        frequencyKind: FREQUENCY[raw.frequency.kind],
        frequencyTimes: raw.frequency.times ?? 1,
        timing: raw.timing as FormTiming,
        currentVersion: 1,
      },
    });

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

    // 员工培训表不走派单，由店长直接创建（产品范围代定 2）
    const shiftKind = raw.id === "staff-training" ? null : SHIFT_FOR_TIMING[raw.timing];
    if (shiftKind) {
      await prisma.formAssignment.create({
        data: { ...scope, templateId: template.id, shiftKind, effectiveFrom: monday },
      });
    }
  }

  const storageTemp = await prisma.formTemplate.findFirstOrThrow({ where: { ...scope, key: "storage-temp" } });
  await prisma.equipment.createMany({
    data: [
      { ...scope, name: "冷藏间", location: "后厨北侧", linkTemplateId: storageTemp.id, linkColumnId: "c1" },
      { ...scope, name: "冷藏柜 1", location: "吧台", linkTemplateId: storageTemp.id, linkColumnId: "c2" },
      { ...scope, name: "冷藏柜 2", location: "吧台", linkTemplateId: storageTemp.id, linkColumnId: "c3" },
      { ...scope, name: "冷藏 1", location: "备餐区", linkTemplateId: storageTemp.id, linkColumnId: "c4" },
      { ...scope, name: "冷藏 2", location: "备餐区", linkTemplateId: storageTemp.id, linkColumnId: "c5" },
    ],
  });

  // 造一点历史，否则打开就是一片空白，看不出趋势也看不出漏填。
  // 冷藏柜 2（c3）这两周在缓慢爬升，最后爬过上限 —— 冰箱就是这么坏的。
  const storageEquipment = await prisma.equipment.findFirstOrThrow({ where: { ...scope, linkColumnId: "c3" } });
  const cleaning = await prisma.formTemplate.findFirstOrThrow({ where: { ...scope, key: "cleaning" } });
  const today = dateOnly(new Date());

  for (let back = 14; back >= 1; back -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - back);

    const drift = (14 - back) * 0.18;
    const c3 = Number((5.4 + drift).toFixed(1));
    const breached = c3 > 7;

    await prisma.formEntry.create({
      data: {
        ...scope,
        templateId: storageTemp.id,
        templateVersion: 1,
        entryDate: date,
        status: breached ? "issue_open" : "submitted",
        values: { c1: 4.8, c2: 5.2, c3, c4: 5.0, c5: 6.0 },
        breaches: breached ? { c3: `${c3} 超出上限 7 °C` } : undefined,
        correctiveAction: breached ? "已调低设定并报修" : null,
        createdById: olivia.id,
        submittedAt: date,
      },
    });

    // 清洁与消毒漏了三天，主页的「漏填」区才有东西可看
    if (back === 2 || back === 4 || back === 6) continue;
    await prisma.formEntry.create({
      data: {
        ...scope,
        templateId: cleaning.id,
        templateVersion: 1,
        entryDate: date,
        status: "submitted",
        values: {
          c0: "Noah",
          c1: "R+D 清洁并消毒",
          c2: "已完成",
          c3: "已完成",
          c4: "已完成",
          c5: "已完成",
          c6: "已完成",
        },
        createdById: noah.id,
        submittedAt: date,
      },
    });
  }

  console.log(`演示数据就绪：${organization.name} / ${unit.name}`);
  console.log(`历史：储存温度 14 天（冷藏柜 2 缓慢爬升到超标），清洁与消毒漏了 3 天`);
  console.log(`设备：${storageEquipment.name} 关联到储存温度的 c3`);
  console.log(`登录码：martin（店长）、olivia、james、noah（员工）`);
  console.log(`表单 ${prototypeTemplates.length} 张，班表两周，设备 5 台`);
  console.log(`说明：Martin 是 ${martin.role}，本周六开店班是 Olivia 和 James 两个人`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
