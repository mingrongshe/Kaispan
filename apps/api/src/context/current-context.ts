/**
 * 当前用户上下文。整个后端只有 ContextService 一处生成它，controller 和 service 不各自解析
 * 用户、组织和门店（docs/kaispan-compatibility.md）。
 *
 * 前端传来的 userId / organizationId / unitId / role 一律不可信：这四个值只从已验证的
 * 服务端会话推出来，业务请求身上只带登录凭证。
 */
export type CurrentContextRole = "employee" | "store_manager";

export type CurrentContext = {
  userId: string;
  organizationId: string;
  unitId: string;
  role: CurrentContextRole;
};

/** 挂在 express request 上的键名，只有 ContextService 和 SessionGuard 用得到。 */
export const CURRENT_CONTEXT_KEY = "kaispanCurrentContext" as const;
