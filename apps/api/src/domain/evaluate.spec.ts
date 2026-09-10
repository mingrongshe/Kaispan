import { describe, expect, it } from "vitest";
import type { Column } from "./columns";
import { evaluate } from "./evaluate";

const fridge: Column = {
  id: "c1",
  label: { zh: "冷藏柜 2" },
  type: "temp",
  unit: "°C",
  limit: { min: 4, max: 7 },
};

describe("临界值判定", () => {
  it("在范围内不算超标", () => {
    const result = evaluate([fridge], { c1: 5.2 });
    expect(result.breaches).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it("超上限算超标，理由里带上限值", () => {
    const result = evaluate([fridge], { c1: 8.6 });
    expect(result.breaches).toHaveLength(1);
    expect(result.breaches[0]?.reason).toBe("8.6 超出上限 7 °C");
  });

  it("低于下限也算超标", () => {
    expect(evaluate([fridge], { c1: 1 }).breaches).toHaveLength(1);
  });

  it("必填没填算 missing 而不是超标", () => {
    const result = evaluate([fridge], {});
    expect(result.missing).toHaveLength(1);
    expect(result.breaches).toHaveLength(0);
  });

  it("标了 optional 的列可以空着", () => {
    const optional: Column = { ...fridge, id: "c2", optional: true };
    expect(evaluate([optional], {}).missing).toHaveLength(0);
  });

  it("短暂容许范围内判警告不判超标", () => {
    const freezer: Column = {
      id: "c1",
      label: { zh: "冷冻间" },
      type: "temp",
      unit: "°C",
      limit: { max: -18, tolerance: -15 },
    };
    const warned = evaluate([freezer], { c1: -16 });
    expect(warned.breaches).toHaveLength(0);
    expect(warned.warnings).toHaveLength(1);

    expect(evaluate([freezer], { c1: -12 }).breaches).toHaveLength(1);
  });

  it("字符串数字也判得了（表单传上来的就是字符串）", () => {
    expect(evaluate([fridge], { c1: "8.6" }).breaches).toHaveLength(1);
  });

  it("填的不是数字要拦住，不能当没看见", () => {
    expect(evaluate([fridge], { c1: "有点凉" }).breaches).toHaveLength(1);
  });
});

describe("条件限值", () => {
  const kind: Column = {
    id: "c1",
    label: { zh: "菜品类型" },
    type: "choice",
    options: [{ zh: "热菜" }, { zh: "冷菜 / 沙拉" }],
  };
  const temp: Column = {
    id: "c3",
    label: { zh: "出餐温度" },
    type: "temp",
    unit: "°C",
    limitBy: { field: "c1", map: { 热菜: { min: 65 }, "冷菜 / 沙拉": { max: 7 } } },
  };

  it("热菜 60 度超标", () => {
    expect(evaluate([kind, temp], { c1: "热菜", c3: 60 }).breaches).toHaveLength(1);
  });

  it("同样是 60 度，冷菜才是超标的那一种", () => {
    expect(evaluate([kind, temp], { c1: "热菜", c3: 70 }).breaches).toHaveLength(0);
    expect(evaluate([kind, temp], { c1: "冷菜 / 沙拉", c3: 10 }).breaches).toHaveLength(1);
  });
});

describe("选项与清单", () => {
  it("选中 breachOn 里的选项算超标", () => {
    const pest: Column = {
      id: "c1",
      label: { zh: "备餐区 / 厨房" },
      type: "choice",
      options: [{ zh: "无发现" }, { zh: "有痕迹" }, { zh: "发现活体" }],
      breachOn: ["有痕迹", "发现活体"],
    };
    expect(evaluate([pest], { c1: "无发现" }).breaches).toHaveLength(0);
    expect(evaluate([pest], { c1: "发现活体" }).breaches).toHaveLength(1);
  });

  it("清单要求全项通过，缺一项算超标并写明缺哪项", () => {
    const checklist: Column = {
      id: "c4",
      label: { zh: "感官检查" },
      type: "checklist",
      items: [{ zh: "无污染" }, { zh: "包装完好" }, { zh: "气味正常" }],
      requireAll: true,
    };
    expect(evaluate([checklist], { c4: ["无污染", "包装完好", "气味正常"] }).breaches).toHaveLength(0);
    const partial = evaluate([checklist], { c4: ["无污染"] });
    expect(partial.breaches).toHaveLength(1);
    expect(partial.breaches[0]?.reason).toContain("气味正常");
  });
});
