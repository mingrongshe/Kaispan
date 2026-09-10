import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * 业务错误至少返回一个稳定的 code 和一句可读的 message（docs/kaispan-compatibility.md）。
 * code 是给前端和测试用的，改了就是破坏性变更；message 是给人看的，可以改。
 */
export class BusinessError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}

export class NotAuthenticatedError extends BusinessError {
  constructor(message = "没有登录，或者登录已经过期") {
    super("NOT_AUTHENTICATED", message, HttpStatus.UNAUTHORIZED);
  }
}

export class PermissionDeniedError extends BusinessError {
  constructor(message = "当前账号没有这个操作的权限") {
    super("PERMISSION_DENIED", message, HttpStatus.FORBIDDEN);
  }
}

/**
 * 跨 organization / unit 的访问一律按「找不到」返回，不告诉调用方那条数据存在。
 */
export class NotFoundInScopeError extends BusinessError {
  constructor(message = "在当前门店范围内找不到这条数据") {
    super("NOT_FOUND_IN_SCOPE", message, HttpStatus.NOT_FOUND);
  }
}
