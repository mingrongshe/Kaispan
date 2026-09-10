import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CURRENT_CONTEXT_KEY, type CurrentContext } from "../context/current-context";
import { NotAuthenticatedError } from "../common/business-error";
import { AccessService } from "./access.service";

type HaccpCapability = "fill" | "manage";
const CAPABILITY_KEY = "haccpCapability";

/** 受保护的接口用这两个装饰器声明需要什么，而不是在方法体里判角色。 */
export const RequireHaccpFill = () => SetMetadata(CAPABILITY_KEY, "fill" satisfies HaccpCapability);
export const RequireHaccpManage = () => SetMetadata(CAPABILITY_KEY, "manage" satisfies HaccpCapability);

@Injectable()
export class HaccpAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  canActivate(executionContext: ExecutionContext): boolean {
    const capability = this.reflector.getAllAndOverride<HaccpCapability | undefined>(CAPABILITY_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);
    if (!capability) return true;

    const request = executionContext.switchToHttp().getRequest();
    const ctx = Reflect.get(request, CURRENT_CONTEXT_KEY) as CurrentContext | undefined;
    if (!ctx) throw new NotAuthenticatedError();

    if (capability === "manage") this.access.assertCanManageHaccp(ctx);
    else this.access.assertCanFillHaccp(ctx);
    return true;
  }
}
