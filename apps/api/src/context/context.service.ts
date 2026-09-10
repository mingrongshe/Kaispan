import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CurrentContext } from "./current-context";

/**
 * 从登录凭证换出 CurrentContext。这是全后端唯一一处「你是谁」的判定。
 * 第一版用服务端会话表；正式接入 KaiSpan 时这里换成 Supabase Auth + membership，
 * 上层拿到的仍然是同一个 CurrentContext，不需要跟着改。
 */
@Injectable()
export class ContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(token: string | undefined): Promise<CurrentContext | null> {
    if (!token) return null;

    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;

    return {
      userId: session.user.id,
      organizationId: session.user.organizationId,
      unitId: session.user.unitId,
      role: session.user.role,
    };
  }
}
