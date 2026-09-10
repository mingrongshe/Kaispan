import { Injectable } from "@nestjs/common";
import type { FormTemplate, FormTemplateVersion } from "@prisma/client";
import { NotFoundInScopeError } from "../common/business-error";
import { unitScope } from "../access/scope";
import type { CurrentContext } from "../context/current-context";
import { parseColumns, type Column, type TemplateHeader } from "../domain/columns";
import { PrismaService } from "../prisma/prisma.service";

export type LoadedTemplate = {
  template: FormTemplate;
  version: FormTemplateVersion;
  columns: Column[];
  header: TemplateHeader;
};

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 本店在用的表单，按原型的顺序（每日的在前） */
  async listActive(ctx: CurrentContext): Promise<LoadedTemplate[]> {
    const templates = await this.prisma.formTemplate.findMany({
      where: { ...unitScope(ctx), active: true },
      include: { versions: true },
      orderBy: { createdAt: "asc" },
    });

    return templates.map((template) => {
      const version = this.pickVersion(template.versions, template.currentVersion, template.key);
      return {
        template,
        version,
        columns: parseColumns(version.columns),
        header: (version.header ?? {}) as TemplateHeader,
      };
    });
  }

  async load(ctx: CurrentContext, templateId: string, wantedVersion?: number): Promise<LoadedTemplate> {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, ...unitScope(ctx) },
      include: { versions: true },
    });
    if (!template) throw new NotFoundInScopeError("这张表不在当前门店");

    const version = this.pickVersion(template.versions, wantedVersion ?? template.currentVersion, template.key);
    return {
      template,
      version,
      columns: parseColumns(version.columns),
      header: (version.header ?? {}) as TemplateHeader,
    };
  }

  /** 记录锁定自己那一版，所以渲染旧记录时取的是旧版本 */
  private pickVersion(versions: FormTemplateVersion[], wanted: number, key: string): FormTemplateVersion {
    const found = versions.find((version) => version.version === wanted);
    if (!found) throw new NotFoundInScopeError(`表单 ${key} 没有第 ${wanted} 版`);
    return found;
  }
}
