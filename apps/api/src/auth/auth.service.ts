import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { BusinessError } from "../common/business-error";
import { PrismaService } from "../prisma/prisma.service";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 演示登录：用户输入登录码，后端核对之后签发一个服务端会话。
 * 会话 token 是后端生成的随机值，请求身上只带它，不带角色、组织和门店。
 * 正式接入 KaiSpan 时整个替换成 Supabase Auth，CurrentContext 的形状不变。
 */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(loginCode: string): Promise<{ token: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { loginCode } });
    if (!user) throw new BusinessError("INVALID_LOGIN_CODE", "登录码不对");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({ data: { token, userId: user.id, expiresAt } });
    return { token, expiresAt };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { token } });
  }
}
