import type { Column } from "@/lib/types";

/** 编辑器里一行的形状。数字用字符串存，空着就是「没设」，不是 0。 */
export type ColumnDraft = {
  id: string;
  labelZh: string;
  labelDe: string;
  type: Column["type"];
  unit: string;
  optional: boolean;
  multiline: boolean;
  noteZh: string;
  min: string;
  max: string;
  tolerance: string;
  optionsText: string;
  breachOn: string[];
  requireAll: boolean;
  /** 条件限值在编辑器里只读，这里只用来提示 */
  hasLimitBy: boolean;
};

export function toDraft(column: Column): ColumnDraft {
  const source = column.options ?? column.items ?? [];
  return {
    id: column.id,
    labelZh: column.label.zh,
    labelDe: column.label.de ?? "",
    type: column.type,
    unit: column.unit ?? "",
    optional: column.optional ?? false,
    multiline: column.multiline ?? false,
    noteZh: column.note?.zh ?? "",
    min: column.limit?.min === undefined ? "" : String(column.limit.min),
    max: column.limit?.max === undefined ? "" : String(column.limit.max),
    tolerance: column.limit?.tolerance === undefined ? "" : String(column.limit.tolerance),
    optionsText: source.map((option) => (option.de ? `${option.zh}|${option.de}` : option.zh)).join("\n"),
    breachOn: column.breachOn ?? [],
    requireAll: column.requireAll ?? false,
    hasLimitBy: Boolean(column.limitBy),
  };
}

export function emptyDraft(): ColumnDraft {
  return {
    id: "",
    labelZh: "",
    labelDe: "",
    type: "temp",
    unit: "°C",
    optional: false,
    multiline: false,
    noteZh: "",
    min: "",
    max: "",
    tolerance: "",
    optionsText: "",
    breachOn: [],
    requireAll: true,
    hasLimitBy: false,
  };
}

export function limitSummary(draft: ColumnDraft): string {
  if (draft.hasLimitBy) return "限值随另一列变化";
  if (draft.type === "choice" || draft.type === "checklist") {
    const count = draft.optionsText.split("\n").filter((line) => line.trim() !== "").length;
    return `${count} 个选项`;
  }
  const parts: string[] = [];
  if (draft.min !== "") parts.push(`≥ ${draft.min}`);
  if (draft.max !== "") parts.push(`≤ ${draft.max}`);
  if (draft.tolerance !== "") parts.push(`容许 ${draft.tolerance}`);
  return parts.length > 0 ? `${parts.join(" · ")}${draft.unit ? ` ${draft.unit}` : ""}` : "没有临界值";
}
