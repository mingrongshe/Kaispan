import type { Column } from "./types";

/**
 * 前端的即时判定。和后端 src/domain/evaluate.ts 是同一套规则，
 * 但它只负责「填的时候当场看见红」这件事 —— 能不能提交由后端说了算，
 * 这里判漏了也拦得住，判多了后端会放行。
 */
export type FieldState = { level: "ok" | "warn" | "breach" | "missing"; message?: string };

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function limitFor(column: Column, values: Record<string, unknown>) {
  if (column.limitBy) {
    const driver = values[column.limitBy.field];
    return typeof driver === "string" ? column.limitBy.map[driver] : undefined;
  }
  return column.limit;
}

export function hasLimit(column: Column): boolean {
  return Boolean(column.limit || column.limitBy || column.breachOn || column.requireAll);
}

export function checkColumn(column: Column, values: Record<string, unknown>): FieldState {
  const value = values[column.id];
  if (isBlank(value)) {
    return column.optional ? { level: "ok" } : { level: "missing" };
  }

  if (column.type === "checklist" && column.requireAll) {
    const checked = new Set(Array.isArray(value) ? value.map(String) : []);
    const failed = (column.items ?? []).map((item) => item.zh).filter((item) => !checked.has(item));
    return failed.length > 0
      ? { level: "breach", message: `未通过：${failed.join("、")}` }
      : { level: "ok", message: "全项通过" };
  }

  if (column.breachOn && typeof value === "string" && column.breachOn.includes(value)) {
    return { level: "breach", message: `选了「${value}」，要写纠正措施` };
  }

  const limit = limitFor(column, values);
  if (!limit) return { level: "ok" };

  const numeric = typeof value === "number" ? value : Number(String(value));
  if (!Number.isFinite(numeric)) return { level: "breach", message: "填的不是数字" };

  const unit = column.unit ? ` ${column.unit}` : "";
  if (limit.max !== undefined && numeric > limit.max) {
    if (limit.tolerance !== undefined && numeric <= limit.tolerance) {
      return { level: "warn", message: `超出上限 ${limit.max}${unit}，还在短暂容许范围内` };
    }
    return { level: "breach", message: `超出上限 ${limit.max}${unit}` };
  }
  if (limit.min !== undefined && numeric < limit.min) {
    if (limit.tolerance !== undefined && numeric >= limit.tolerance) {
      return { level: "warn", message: `低于下限 ${limit.min}${unit}，还在短暂容许范围内` };
    }
    return { level: "breach", message: `低于下限 ${limit.min}${unit}` };
  }
  return { level: "ok", message: "在临界值内" };
}

export function describeLimit(column: Column, values: Record<string, unknown>): string | null {
  const limit = limitFor(column, values);
  if (!limit) return null;
  const unit = column.unit ? ` ${column.unit}` : "";
  const parts: string[] = [];
  if (limit.min !== undefined) parts.push(`≥ ${limit.min}`);
  if (limit.max !== undefined) parts.push(`≤ ${limit.max}`);
  if (limit.tolerance !== undefined) parts.push(`短暂容许 ${limit.tolerance}`);
  return parts.length > 0 ? `${parts.join(" · ")}${unit}` : null;
}

/**
 * 这张表能不能就地填。
 *
 * 只对「全部字段都是温度 / 单选 / 人员」的表开放 —— 有清单、多行文本的表硬塞进一行
 * 反而更难用，那些仍然跳完整填表页。
 * 放在这里而不是客户端组件里，是因为服务端也要用它决定渲不渲染那个按钮。
 */
export function canQuickFill(columns: Column[]): boolean {
  return (
    columns.length > 0 &&
    columns.length <= 8 &&
    columns.every((column) => ["temp", "number", "choice", "person"].includes(column.type))
  );
}
