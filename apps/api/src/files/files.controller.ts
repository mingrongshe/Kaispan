import { Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { HaccpAccessGuard, RequireHaccpFill } from "../access/haccp-access.guard";
import { BusinessError } from "../common/business-error";
import { Ctx } from "../context/ctx.decorator";
import type { CurrentContext } from "../context/current-context";
import { SessionGuard } from "../context/session.guard";
import { FilesService } from "./files.service";

@ApiTags("files")
@Controller("haccp")
@UseGuards(SessionGuard, HaccpAccessGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post("entries/:id/photos")
  @RequireHaccpFill()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 8 * 1024 * 1024 } }))
  async upload(
    @Ctx() ctx: CurrentContext,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BusinessError("NO_FILE", "没收到文件");
    return this.files.attachPhoto(ctx, id, file);
  }

  @Get("entries/:id/photos")
  @RequireHaccpFill()
  list(@Ctx() ctx: CurrentContext, @Param("id") id: string) {
    return this.files.listForEntry(ctx, id);
  }

  @Get("photos/:id")
  @RequireHaccpFill()
  async download(@Ctx() ctx: CurrentContext, @Param("id") id: string, @Res() res: Response) {
    const file = await this.files.read(ctx, id);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(file.body);
  }
}
