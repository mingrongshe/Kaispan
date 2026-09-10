import { Injectable } from "@nestjs/common";
import { PermissionDeniedError } from "../common/business-error";
import type { CurrentContext } from "../context/current-context";

/**
 * 填写和店长管理都经过这一个模块。业务页面、controller 和 service 里不散落
 * role === "employee" 这种判断（docs/kaispan-compatibility.md）。
 *
 * 正式接入 KaiSpan 时，这两个方法内部换成向 permission catalog 查询，签名不变。
 */
@Injectable()
export class AccessService {
  /** 对应 KaiSpan 的 operations.haccp.fill，门店范围 */
  canFillHaccp(ctx: CurrentContext): boolean {
    return ctx.role === "employee" || ctx.role === "store_manager";
  }

  /** 店长管理：查看和处理本门店记录、维护模板设备班表 */
  canManageHaccp(ctx: CurrentContext): boolean {
    return ctx.role === "store_manager";
  }

  assertCanFillHaccp(ctx: CurrentContext): void {
    if (!this.canFillHaccp(ctx)) throw new PermissionDeniedError("这个账号不能填写 HACCP 表单");
  }

  assertCanManageHaccp(ctx: CurrentContext): void {
    if (!this.canManageHaccp(ctx)) throw new PermissionDeniedError("只有店长能处理 HACCP 记录");
  }
}
