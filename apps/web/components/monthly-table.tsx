import type { Column } from "@/lib/types";

export type MonthlyCell = { columnId: string; value: string; breach: string | null };
export type MonthlyRow = {
  date: string;
  day: number;
  entryId: string | null;
  filledByName: string | null;
  status: string | null;
  isLate: boolean;
  future: boolean;
  isToday: boolean;
  cells: MonthlyCell[];
};
export type MonthlyReport = {
  month: string;
  organizationName: string;
  unitName: string;
  layout: "monthly_grid" | "log" | "training";
  template: {
    id: string;
    key: string;
    nameZh: string;
    nameDe: string;
    version: number;
    columns: Column[];
    header: { operation?: string; inspector?: string; referent?: string; topic?: string };
    footnotes: { zh: string; de?: string }[] | null;
  };
  rows: MonthlyRow[];
  stats: { entries: number; breaches: number; missingDays: number; late: number };
};

/**
 * 月度表，版式照纸质原表：月度网格一天一行，流水表一条记录一行。
 *
 * 超标格做三重编码 —— 颜色、一个 `!`、打印时的黑色粗边和网点底纹。
 * 打印出来是黑白的，只靠红色等于没标。
 */
export function MonthlyTable({ report }: { report: MonthlyReport }) {
  const { template, rows, stats } = report;
  const empty = stats.entries === 0;

  return (
    <section className="sheet">
      <header className="sheet-head">
        <h2 className="sheet-title">
          {template.nameZh}
          <span className="sheet-de"> · {template.nameDe}</span>
        </h2>
        <dl className="kv sheet-meta">
          <dt>Operation</dt>
          <dd>{template.header.operation ?? report.organizationName}</dd>
          <dt>门店</dt>
          <dd>{report.unitName}</dd>
          <dt>期间</dt>
          <dd>{report.month}</dd>
          {template.header.inspector ? (
            <>
              <dt>Inspector</dt>
              <dd>{template.header.inspector}</dd>
            </>
          ) : null}
          {template.header.referent ? (
            <>
              <dt>Referent</dt>
              <dd>{template.header.referent}</dd>
            </>
          ) : null}
          {template.header.topic ? (
            <>
              <dt>Training topic</dt>
              <dd>{template.header.topic}</dd>
            </>
          ) : null}
        </dl>
        <p className="sub sheet-stats">
          记录 {stats.entries} · 异常 {stats.breaches}
          {report.layout === "monthly_grid" ? ` · 到今天为止空着 ${stats.missingDays} 天` : ""}
          {stats.late > 0 ? ` · 补填 ${stats.late}` : ""}
        </p>
      </header>

      {empty ? (
        // 空月份不画 31 行空网格：那是 1300 像素的噪音，一句话就说清了
        <p className="empty">这个月还没有记录。</p>
      ) : (
        <div className="scroll">
          <table className="grid">
            <thead>
              <tr>
                <th className="col-day">{report.layout === "monthly_grid" ? "日" : "日期"}</th>
                {template.columns.map((column) => (
                  <th key={column.id}>
                    {column.label.zh}
                    {column.unit ? ` (${column.unit})` : ""}
                  </th>
                ))}
                <th className="col-who">填写人</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                // 今天还没填不算漏：截止点是当天午夜
                const missing = row.entryId === null && !row.future && !row.isToday;
                const pending = row.entryId === null && row.isToday;
                return (
                  <tr
                    key={row.date + row.entryId}
                    className={missing ? "missing" : pending ? "pending" : row.future ? "future" : ""}
                  >
                    <td className="col-day">
                      {report.layout === "monthly_grid" ? row.day : row.date}
                      {row.isLate ? <span className="mark-late" title="补填">补</span> : null}
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.columnId} className={cell.breach ? "breach" : ""} title={cell.breach ?? undefined}>
                        {cell.value}
                        {cell.breach ? <span className="mark-breach">!</span> : null}
                      </td>
                    ))}
                    <td className="col-who">
                      {row.filledByName ?? (row.future ? "" : pending ? "今天还没填" : "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {template.footnotes && template.footnotes.length > 0 ? (
        <div className="footnotes">
          {template.footnotes.map((note, index) => (
            <p key={index}>{note.zh}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
