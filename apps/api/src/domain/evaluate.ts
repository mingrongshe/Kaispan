import { hasLimit, limitFor, type Column, type Limit } from "./columns";

export type EvaluationIssue = { columnId: string; label: string; reason: string };

export type Evaluation = {
  /** 必填但没填的列 */
  missing: EvaluationIssue[];
  /** 判为超标的列。有任何一条，纠正措施就是必填 */
  breaches: EvaluationIssue[];
  /** 落在短暂容许区间里的列，提示但不拦 */
  warnings: EvaluationIssue[];
};

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function unitSuffix(unit?: string): string {
  return unit ? ` ${unit}` : "";
}

/**
 * 临界值判定。这是纸质表做不到、系统能做到的那件事，所以它在后端，
 * 不在前端 —— 前端可以先判一次给即时反馈，但能不能提交由这里说了算。
 */
export function evaluate(columns: Column[], values: Record<string, unknown>): Evaluation {
  const missing: EvaluationIssue[] = [];
  const breaches: EvaluationIssue[] = [];
  const warnings: EvaluationIssue[] = [];

  for (const column of columns) {
    const label = column.label.zh;
    const value = values[column.id];

    if (isBlank(value)) {
      if (!column.optional) missing.push({ columnId: column.id, label, reason: "必填，没有填" });
      continue;
    }

    if (column.type === "checklist" && column.requireAll) {
      const checked = new Set(Array.isArray(value) ? value.map(String) : []);
      const failed = (column.items ?? []).map((item) => item.zh).filter((item) => !checked.has(item));
      if (failed.length > 0) {
        breaches.push({ columnId: column.id, label, reason: `未通过：${failed.join("、")}` });
      }
      continue;
    }

    if (column.breachOn && typeof value === "string" && column.breachOn.includes(value)) {
      breaches.push({ columnId: column.id, label, reason: `选了「${value}」` });
      continue;
    }

    const limit = limitFor(column, values);
    if (!limit) continue;

    const numeric = toNumber(value);
    if (numeric === null) {
      breaches.push({ columnId: column.id, label, reason: "填的不是数字，判不了临界值" });
      continue;
    }

    const suffix = unitSuffix(column.unit);

    if (limit.max !== undefined && numeric > limit.max) {
      const tolerated = limit.tolerance !== undefined && numeric <= limit.tolerance;
      const issue = { columnId: column.id, label, reason: `${numeric} 超出上限 ${limit.max}${suffix}` };
      if (tolerated) warnings.push({ ...issue, reason: `${numeric} 超出上限，但在短暂容许范围内（${limit.tolerance}）` });
      else breaches.push(issue);
      continue;
    }

    if (limit.min !== undefined && numeric < limit.min) {
      const tolerated = limit.tolerance !== undefined && numeric >= limit.tolerance;
      const issue = { columnId: column.id, label, reason: `${numeric} 低于下限 ${limit.min}${suffix}` };
      if (tolerated) warnings.push({ ...issue, reason: `${numeric} 低于下限，但在短暂容许范围内（${limit.tolerance}）` });
      else breaches.push(issue);
    }
  }

  return { missing, breaches, warnings };
}

export { hasLimit };
