import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { Ctx } from "../context/ctx.decorator";
import type { CurrentContext } from "../context/current-context";
import { SESSION_COOKIE, SessionGuard } from "../context/session.guard";
import { AccessService } from "../access/access.service";
import { AuthService } from "./auth.service";
import { LoginDto, MeDto } from "./auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  @Post("login")
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response): Promise<{ token: string }> {
    const { token, expiresAt } = await this.auth.login(body.loginCode);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });
    return { token };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    await this.auth.logout(cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  async me(@Ctx() ctx: CurrentContext): Promise<MeDto> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: ctx.userId, organizationId: ctx.organizationId },
      include: { unit: true, organization: true },
    });
    return {
      userId: ctx.userId,
      name: user.name,
      role: ctx.role,
      locale: user.locale,
      organizationId: ctx.organizationId,
      organizationName: user.organization.name,
      unitId: ctx.unitId,
      unitName: user.unit.name,
      canFillHaccp: this.access.canFillHaccp(ctx),
      canManageHaccp: this.access.canManageHaccp(ctx),
    };
  }
}
