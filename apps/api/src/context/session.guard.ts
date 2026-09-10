import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { NotAuthenticatedError } from "../common/business-error";
import { ContextService } from "./context.service";
import { CURRENT_CONTEXT_KEY } from "./current-context";

export const SESSION_COOKIE = "haccp_session";

/**
 * 把登录凭证换成 CurrentContext 并挂到 request 上。凭证从 cookie 取，
 * 测试和脚本可以走 Authorization: Bearer <token>。两种都只是「凭证」，不是身份声明。
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly context: ContextService) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const request = executionContext.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    const cookieToken = (request as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];

    const ctx = await this.context.resolve(bearer ?? cookieToken);
    if (!ctx) throw new NotAuthenticatedError();

    Reflect.set(request, CURRENT_CONTEXT_KEY, ctx);
    return true;
  }
}
