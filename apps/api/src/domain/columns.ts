/**
 * 表单列的定义。结构照 references/haccp-prototype.html 里的 haccpTemplates()，
 * 存在 FormTemplateVersion.columns 这个 JSON 列里，不另发明一套。
 */
export type Bilingual = { zh: string; de?: string };

export type Limit = {
  min?: number;
  max?: number;
  /** 短暂容许：超出 max（或低于 min）但没超过这个值，算警告不算超标 */
  tolerance?: number;
};

export type ColumnType = "temp" | "number" | "text" | "choice" | "checklist" | "person" | "signature";

export type Column = {
  id: string;
  label: Bilingual;
  type: ColumnType;
  unit?: string;
  note?: Bilingual;
  placeholder?: Bilingual;
  multiline?: boolean;
  optional?: boolean;
  limit?: Limit;
  /** 限值随另一列的取值变化：出餐温度按热菜 / 冷菜切，入库验收按商品类别切 */
  limitBy?: { field: string; map: Record<string, Limit> };
  options?: Bilingual[];
  /** 选中这些选项算超标 */
  breachOn?: string[];
  items?: Bilingual[];
  /** 清单必须全项通过，缺一项算超标 */
  requireAll?: boolean;
};

export type TemplateHeader = {
  operation?: string;
  inspector?: string;
  referent?: string;
  topic?: string;
};

export function parseColumns(raw: unknown): Column[] {
  if (!Array.isArray(raw)) throw new Error("模板的 columns 不是数组");
  return raw as Column[];
}

/** 这一列有没有可判定的临界值。没有的列不该显示「在临界值内」。 */
export function hasLimit(column: Column): boolean {
  return Boolean(column.limit || column.limitBy || column.breachOn || column.requireAll);
}

/** 取这一列在当前填写内容下适用的限值 */
export function limitFor(column: Column, values: Record<string, unknown>): Limit | undefined {
  if (column.limitBy) {
    const driver = values[column.limitBy.field];
    if (typeof driver !== "string") return undefined;
    return column.limitBy.map[driver];
  }
  return column.limit;
}
