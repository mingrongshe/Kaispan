import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

export type Tenant = {
  organizationId: string;
  unitId: string;
  managerToken: string;
  employeeToken: string;
  employeeId: string;
  templateId: string;
};

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
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
}

/**
 * 造一整套租户：公司 + 门店 + 店长 + 员工 + 一张表 + 一条已提交记录。
 * 隔离测试需要至少两套，acceptance.md 说明这些测试数据不出现在演示页面。
 */
export async function createTenant(prisma: PrismaService, label: string): Promise<Tenant> {
  const organization = await prisma.organization.create({ data: { name: `${label} GmbH` } });
  const unit = await prisma.unit.create({ data: { organizationId: organization.id, name: `${label} 店` } });
  const scope = { organizationId: organization.id, unitId: unit.id };

  const manager = await prisma.user.create({
    data: { ...scope, name: `${label}-店长`, role: "store_manager", locale: "zh", loginCode: `${label}-manager` },
  });
  const employee = await prisma.user.create({
    data: { ...scope, name: `${label}-员工`, role: "employee", locale: "zh", loginCode: `${label}-employee` },
  });

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.session.createMany({
    data: [
      { token: `${label}-manager-token`, userId: manager.id, expiresAt },
      { token: `${label}-employee-token`, userId: employee.id, expiresAt },
    ],
  });

  const template = await prisma.formTemplate.create({
    data: { ...scope, key: "storage-temp", layout: "monthly_grid", frequencyKind: "daily", timing: "morning" },
  });
  await prisma.formTemplateVersion.create({
    data: {
      templateId: template.id,
      version: 1,
      nameZh: "储存 / 冷藏温度",
      nameDe: "Lager- / Kühltemperaturen",
      columns: [{ id: "c1", type: "temp", unit: "°C", limit: { min: 4, max: 7 } }],
    },
  });
  await prisma.formEntry.create({
    data: {
      ...scope,
      templateId: template.id,
      templateVersion: 1,
      entryDate: new Date("2026-09-10T00:00:00.000Z"),
      status: "issue_open",
      values: { c1: 8.6 },
      breaches: { c1: "超出上限 7°C" },
      correctiveAction: "已调低设定并报修",
      createdById: employee.id,
      submittedAt: new Date(),
    },
  });

  return {
    organizationId: organization.id,
    unitId: unit.id,
    managerToken: `${label}-manager-token`,
    employeeToken: `${label}-employee-token`,
    employeeId: employee.id,
    templateId: template.id,
  };
}
