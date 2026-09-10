-- KaiSpan HACCP 初始 schema
--
-- 这份 SQL 是手写的，不是 prisma migrate 生成的。原因写在 README「关于 migration」一节：
-- 本环境的出口策略挡住了 binaries.prisma.sh，Prisma 的 schema-engine 二进制下不来，
-- 而 migrate 需要它。客户端不受影响（Prisma 7 用 driver adapter，不依赖 Rust 引擎）。
-- 目录结构和 _prisma_migrations 表都按 Prisma 的格式来，等那个域名通了，
-- `prisma migrate deploy` 能接着用同一批文件。
--
-- SQL 与 schema.prisma 是否一致，由 test/schema-conformance.int.spec.ts 逐个模型逐个字段验证。

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('employee', 'store_manager');
CREATE TYPE "Locale" AS ENUM ('zh', 'de');
CREATE TYPE "ShiftKind" AS ENUM ('opening', 'midday', 'closing');
CREATE TYPE "FormLayout" AS ENUM ('monthly_grid', 'log', 'training');
CREATE TYPE "FrequencyKind" AS ENUM ('daily', 'weekly', 'yearly');
CREATE TYPE "FormTiming" AS ENUM ('morning', 'day', 'evening', 'any');
CREATE TYPE "EntryStatus" AS ENUM ('draft', 'submitted', 'issue_open', 'issue_resolved');
CREATE TYPE "EquipmentStatus" AS ENUM ('ok', 'needs_repair', 'out_of_service');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'zh',
    "loginCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" "ShiftKind" NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "ShiftKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "layout" "FormLayout" NOT NULL,
    "frequencyKind" "FrequencyKind" NOT NULL,
    "frequencyTimes" INTEGER NOT NULL DEFAULT 1,
    "timing" "FormTiming" NOT NULL DEFAULT 'any',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "nameZh" TEXT NOT NULL,
    "nameDe" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "header" JSONB,
    "footnotes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "shiftKind" "ShiftKind" NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "entryDate" DATE NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'draft',
    "values" JSONB NOT NULL,
    "breaches" JSONB,
    "correctiveAction" TEXT,
    "header" JSONB,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateReason" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "FormEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "warrantyUntil" DATE,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'ok',
    "linkTemplateId" TEXT,
    "linkColumnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "entryId" TEXT,
    "note" TEXT NOT NULL,
    "result" TEXT,
    "openedById" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "entryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Unit_organizationId_idx" ON "Unit"("organizationId");
CREATE UNIQUE INDEX "User_loginCode_key" ON "User"("loginCode");
CREATE INDEX "User_organizationId_unitId_idx" ON "User"("organizationId", "unitId");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE UNIQUE INDEX "ShiftDefinition_unitId_kind_key" ON "ShiftDefinition"("unitId", "kind");
CREATE INDEX "ShiftDefinition_organizationId_unitId_idx" ON "ShiftDefinition"("organizationId", "unitId");
CREATE UNIQUE INDEX "ShiftAssignment_unitId_date_kind_userId_key" ON "ShiftAssignment"("unitId", "date", "kind", "userId");
CREATE INDEX "ShiftAssignment_organizationId_unitId_date_idx" ON "ShiftAssignment"("organizationId", "unitId", "date");
CREATE UNIQUE INDEX "FormTemplate_unitId_key_key" ON "FormTemplate"("unitId", "key");
CREATE INDEX "FormTemplate_organizationId_unitId_idx" ON "FormTemplate"("organizationId", "unitId");
CREATE UNIQUE INDEX "FormTemplateVersion_templateId_version_key" ON "FormTemplateVersion"("templateId", "version");
CREATE INDEX "FormAssignment_organizationId_unitId_templateId_idx" ON "FormAssignment"("organizationId", "unitId", "templateId");
CREATE INDEX "FormEntry_organizationId_unitId_templateId_entryDate_idx" ON "FormEntry"("organizationId", "unitId", "templateId", "entryDate");
CREATE INDEX "FormEntry_organizationId_unitId_status_idx" ON "FormEntry"("organizationId", "unitId", "status");
CREATE INDEX "FormEntry_createdById_status_idx" ON "FormEntry"("createdById", "status");
CREATE INDEX "Equipment_organizationId_unitId_idx" ON "Equipment"("organizationId", "unitId");
CREATE INDEX "WorkOrder_organizationId_unitId_equipmentId_idx" ON "WorkOrder"("organizationId", "unitId", "equipmentId");
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");
CREATE INDEX "FileObject_organizationId_unitId_idx" ON "FileObject"("organizationId", "unitId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormTemplateVersion" ADD CONSTRAINT "FormTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormAssignment" ADD CONSTRAINT "FormAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_linkTemplateId_fkey" FOREIGN KEY ("linkTemplateId") REFERENCES "FormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FormEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "FormEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
