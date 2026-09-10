export type Bilingual = { zh: string; de?: string };

export type Column = {
  id: string;
  label: Bilingual;
  type: "temp" | "number" | "text" | "choice" | "checklist" | "person" | "signature";
  unit?: string;
  note?: Bilingual;
  placeholder?: Bilingual;
  multiline?: boolean;
  optional?: boolean;
  limit?: { min?: number; max?: number; tolerance?: number };
  limitBy?: { field: string; map: Record<string, { min?: number; max?: number; tolerance?: number }> };
  options?: Bilingual[];
  breachOn?: string[];
  items?: Bilingual[];
  requireAll?: boolean;
};

export type DueState = {
  remaining: number;
  due: boolean;
  done: number;
  needed: number;
  window: { start: string; end: string; label: string };
};

export type TaskRow = {
  templateId: string;
  templateKey: string;
  nameZh: string;
  nameDe: string;
  layout: string;
  timing: string;
  frequencyKind: string;
  frequencyTimes: number;
  columnCount: number;
  due: DueState;
  shiftKind: "opening" | "midday" | "closing" | null;
  assignees: { userId: string; name: string }[];
  lastEntry: {
    entryDate: string;
    filledByName: string;
    status: string;
    hasBreach: boolean;
    summary: string;
  } | null;
};

export type EntryRow = {
  id: string;
  templateId: string;
  entryDate: string;
  status: "draft" | "submitted" | "issue_open" | "issue_resolved";
  isLate: boolean;
  lateReason: string | null;
  filledByName: string;
  voidedAt: string | null;
  voidReason: string | null;
  resolvedByName: string | null;
};

export type Issue = {
  id: string;
  templateId: string;
  templateKey: string;
  entryDate: string;
  filledByName: string;
  breaches: Record<string, string> | null;
  correctiveAction: string | null;
  openWorkOrders: { id: string; note: string }[];
};

export const TIMING_LABEL: Record<string, string> = {
  morning: "开店前",
  day: "营业中",
  evening: "收店",
  any: "随时",
};

export const SHIFT_LABEL: Record<string, string> = {
  opening: "开店班",
  midday: "中班",
  closing: "收店班",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已完成",
  issue_open: "有异常待处理",
  issue_resolved: "异常已处理",
};

export function frequencyLabel(kind: string, times: number): string {
  if (kind === "daily") return "每日";
  if (kind === "weekly") return times > 1 ? `每周 ${times} 次` : "每周 1 次";
  return "每年 1 次";
}
