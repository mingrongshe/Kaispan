import type { CurrentContext } from "../context/current-context";

/**
 * 所有查询都必须带上租户范围。不能只凭一个全局记录 ID 读或改租户数据
 * （docs/kaispan-compatibility.md）。
 *
 * 用法是把它拼进 where，而不是查完再判断：
 *   prisma.formEntry.findFirst({ where: { id, ...unitScope(ctx) } })
 * 这样跨 organization 或跨 unit 的 id 直接查不到，而不是查到之后靠一句 if 拦住。
 */
export function orgScope(ctx: CurrentContext): { organizationId: string } {
  return { organizationId: ctx.organizationId };
}

export function unitScope(ctx: CurrentContext): { organizationId: string; unitId: string } {
  return { organizationId: ctx.organizationId, unitId: ctx.unitId };
}
