/**
 * 日期口径。表上写的是哪一天（entryDate），跟提交时刻是两回事。
 * 截止点是「记录日期的午夜」，按门店所在时区算，不是服务器时区（产品范围第六节）。
 */
export const STORE_TIME_ZONE = "Europe/Berlin";

/** 门店当地的今天，返回 YYYY-MM-DD */
export function todayInStore(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** YYYY-MM-DD → 存进 DATE 列的 Date（UTC 零点，避免时区把日期挪走一天） */
export function toDateColumn(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function fromDateColumn(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export function shiftDays(isoDate: string, days: number): string {
  const date = toDateColumn(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return fromDateColumn(date);
}

/** 一周从周一算起 */
export function weekRange(isoDate: string): { start: string; end: string } {
  const date = toDateColumn(isoDate);
  const weekday = (date.getUTCDay() + 6) % 7;
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - weekday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: fromDateColumn(start), end: fromDateColumn(end) };
}

export function yearRange(isoDate: string): { start: string; end: string } {
  const year = isoDate.slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function monthRange(isoMonth: string): { start: string; end: string; days: number } {
  const [year, month] = isoMonth.split("-").map(Number);
  if (!year || !month) throw new Error(`月份格式不对：${isoMonth}`);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${isoMonth}-01`, end: `${isoMonth}-${String(days).padStart(2, "0")}`, days };
}
