import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { AccessService } from "../access/access.service";
import { unitScope } from "../access/scope";
import { BusinessError, NotFoundInScopeError } from "../common/business-error";
import type { CurrentContext } from "../context/current-context";
import { PrismaService } from "../prisma/prisma.service";

/** 异常附件：判为超标的记录最多附 3 张照片（产品范围代定 7） */
export const MAX_PHOTOS_PER_ENTRY = 3;
const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private root(): string {
    return resolve(process.env.FILE_STORAGE_DIR ?? join(process.cwd(), ".storage"));
  }

  /**
   * 上传走后端。业务记录只存相对 key，不存开发者电脑上的路径，也不存永久公开 URL
   * （docs/kaispan-compatibility.md）。第一版落在本地磁盘，正式接入时换对象存储，
   * 换的只有这两个私有方法。
   */
  async attachPhoto(
    ctx: CurrentContext,
    entryId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    this.access.assertCanFillHaccp(ctx);

    if (!ALLOWED.has(file.mimetype)) {
      throw new BusinessError("UNSUPPORTED_FILE_TYPE", "只收 JPEG / PNG / WebP / HEIC 照片");
    }
    if (file.size > MAX_BYTES) {
      throw new BusinessError("FILE_TOO_LARGE", `照片最大 ${MAX_BYTES / 1024 / 1024} MB`);
    }

    const entry = await this.prisma.formEntry.findFirst({
      where: { id: entryId, ...unitScope(ctx) },
      include: { photos: { select: { id: true } } },
    });
    if (!entry) throw new NotFoundInScopeError();
    // 先判「轮得到你吗」，再判「能不能加」。反过来的话，一条已经满 3 张的记录
    // 会对外人回「张数满了」，等于顺口确认了这条记录的状态。
    if (entry.createdById !== ctx.userId && !this.access.canManageHaccp(ctx)) {
      throw new BusinessError("NOT_YOUR_ENTRY", "只能给自己填的记录加照片", 403);
    }
    if (entry.voidedAt) throw new BusinessError("ENTRY_VOIDED", "这条已经作废了，别再往上加东西");
    if (entry.status === "draft") throw new BusinessError("DRAFT_NO_PHOTOS", "草稿先提交，照片挂在记录上");

    const breaches = Object.keys((entry.breaches ?? {}) as Record<string, unknown>);
    // 照片是异常附件，不是随手拍。正常记录不挂照片，卫生局资料包才不会变成相册
    if (breaches.length === 0) {
      throw new BusinessError("NO_BREACH_NO_PHOTO", "只有判为超标的记录才需要留照片");
    }
    if (entry.photos.length >= MAX_PHOTOS_PER_ENTRY) {
      throw new BusinessError("TOO_MANY_PHOTOS", `一条记录最多 ${MAX_PHOTOS_PER_ENTRY} 张照片`);
    }

    const extension = file.mimetype.split("/")[1] ?? "bin";
    const storageKey = `${ctx.organizationId}/${ctx.unitId}/${entry.entryDate.toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    const target = join(this.root(), storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.buffer);

    return this.prisma.fileObject.create({
      data: {
        ...unitScope(ctx),
        storageKey,
        mimeType: file.mimetype,
        byteSize: file.size,
        entryId: entry.id,
        createdById: ctx.userId,
      },
      select: { id: true, mimeType: true, byteSize: true, createdAt: true },
    });
  }

  /** 下载也走后端：拿到 id 不等于拿得到文件，范围还要再查一次 */
  async read(ctx: CurrentContext, fileId: string): Promise<{ mimeType: string; body: Buffer }> {
    const file = await this.prisma.fileObject.findFirst({ where: { id: fileId, ...unitScope(ctx) } });
    if (!file) throw new NotFoundInScopeError();

    const target = join(this.root(), file.storageKey);
    if (!target.startsWith(this.root())) throw new NotFoundInScopeError();
    return { mimeType: file.mimeType, body: await readFile(target) };
  }

  async listForEntry(ctx: CurrentContext, entryId: string) {
    return this.prisma.fileObject.findMany({
      where: { entryId, ...unitScope(ctx) },
      select: { id: true, mimeType: true, byteSize: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }
}
