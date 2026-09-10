import { describe, expect, it } from "vitest";
import { shiftDays, todayInStore, weekRange } from "./dates";
import { dueState, periodFor } from "./schedule";

describe("周期", () => {
  it("每日表一天一格", () => {
    expect(periodFor("daily", "2026-09-10")).toMatchObject({ start: "2026-09-10", end: "2026-09-10" });
  });

  it("一周从周一算起", () => {
    // 2026-09-10 是周四
    expect(weekRange("2026-09-10")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
    expect(weekRange("2026-09-07")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
    expect(weekRange("2026-09-13")).toEqual({ start: "2026-09-07", end: "2026-09-13" });
  });

  it("日期加减跨月正常", () => {
    expect(shiftDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("门店当地的今天是 YYYY-MM-DD", () => {
    expect(todayInStore()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("还差几次", () => {
  it("每日表填过就不再出现", () => {
    expect(dueState("daily", 1, 0, "2026-09-10").due).toBe(true);
    expect(dueState("daily", 1, 1, "2026-09-10").due).toBe(false);
  });

  it("每周两次的表：做了一次仍然出现，标着还差一次", () => {
    const partial = dueState("weekly", 2, 1, "2026-09-10");
    expect(partial.due).toBe(true);
    expect(partial.remaining).toBe(1);
    expect(dueState("weekly", 2, 2, "2026-09-10").due).toBe(false);
  });

  it("每年一次的表过了 10 月才催", () => {
    expect(dueState("yearly", 1, 0, "2026-05-10").due).toBe(false);
    expect(dueState("yearly", 1, 0, "2026-11-10").due).toBe(true);
    expect(dueState("yearly", 1, 1, "2026-11-10").due).toBe(false);
  });
});
