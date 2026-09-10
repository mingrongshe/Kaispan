import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { NotAuthenticatedError } from "../common/business-error";
import { CURRENT_CONTEXT_KEY, type CurrentContext } from "./current-context";

/**
 * controller 里拿当前上下文的唯一方式。故意不暴露 request.user 之类的东西，
 * 这样「解析身份」永远只发生在 ContextService 一处。
 */
export const Ctx = createParamDecorator((_data: unknown, executionContext: ExecutionContext): CurrentContext => {
  const request = executionContext.switchToHttp().getRequest();
  const ctx = Reflect.get(request, CURRENT_CONTEXT_KEY) as CurrentContext | undefined;
  if (!ctx) throw new NotAuthenticatedError();
  return ctx;
});
