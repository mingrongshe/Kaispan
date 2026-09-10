import type { FrequencyKind } from "@prisma/client";
import { weekRange, yearRange } from "./dates";

export type DueWindow = { start: string; end: string; label: string };

/**
 * 一张表在某一天属于哪个统计周期。
 * 每日表一天一格；每周 N 次的表按整周算进度；每年一次的表按年算。
 */
export function periodFor(kind: FrequencyKind, isoDate: string): DueWindow {
  if (kind === "daily") return { start: isoDate, end: isoDate, label: "当天" };
  if (kind === "weekly") {
    const range = weekRange(isoDate);
    return { ...range, label: "本周" };
  }
  const range = yearRange(isoDate);
  return { ...range, label: "本年" };
}

export type DueState = {
  /** 这个周期还差几次 */
  remaining: number;
  /** 今天要不要出现在待办里 */
  due: boolean;
  /** 已经做了几次 */
  done: number;
  needed: number;
  window: DueWindow;
};

/**
 * 每周 N 次的表也派给班次，从周一起每天出现在当班人的待办里、标着「本周还差 N 次」，
 * 够了本周就不再出现（产品范围代定 1）。
 *
 * 每年一次的表不走派单（代定 2），这里仍然算出进度供店长的主页用：
 * 过了 10 月还没做才催，否则只是「本年内」。
 */
export function dueState(
  kind: FrequencyKind,
  needed: number,
  doneInPeriod: number,
  isoDate: string,
): DueState {
  const window = periodFor(kind, isoDate);
  const remaining = Math.max(0, needed - doneInPeriod);
  if (remaining === 0) return { remaining, due: false, done: doneInPeriod, needed, window };

  if (kind === "yearly") {
    const month = Number(isoDate.slice(5, 7));
    return { remaining, due: month >= 10, done: doneInPeriod, needed, window };
  }

  return { remaining, due: true, done: doneInPeriod, needed, window };
}
