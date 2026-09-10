import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";
import { STATUS_LABEL, type Column } from "@/lib/types";
import { voidEntryAction } from "../actions";

type EntryDetail = {
  id: string;
  entryDate: string;
  status: "draft" | "submitted" | "issue_open" | "issue_resolved";
  values: Record<string, unknown>;
  breaches: Record<string, string> | null;
  correctiveAction: string | null;
  isLate: boolean;
  lateReason: string | null;
  filledBy: { id: string; name: string };
  submittedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resolvedByName: string | null;
  workOrders: { id: string; note: string; result: string | null; completedAt: string | null }[];
  template: { id: string; nameZh: string; version: number; columns: Column[]; footnotes: { zh: string }[] | null };
};

function render(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.join("、");
  return String(value);
}

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");

  const { id } = await params;
  const { submitted } = await searchParams;
  const entry = await apiGet<EntryDetail>(`/haccp/entries/${id}`);
  if (!entry) {
    return (
      <main>
        <TopBar me={me} />
        <h1>找不到这条记录</h1>
        <Link className="button" href="/records">
          回全部记录
        </Link>
      </main>
    );
  }

  const canVoid = !entry.voidedAt && entry.status !== "draft" && (entry.filledBy.id === me.userId || me.canManageHaccp);

  return (
    <main>
      <TopBar me={me} />
      {submitted ? (
        <div className={`banner ${entry.status === "issue_open" ? "breach" : "ok"}`}>
          {entry.status === "issue_open"
            ? "提交了。有超标项，已经进店长的待处理。"
            : "提交了，这张表这一天算填过了。"}
        </div>
      ) : null}

      <h1>{entry.template.nameZh}</h1>
      <p className="lead">
        {entry.entryDate} · {entry.filledBy.name} 填的 · 第 {entry.template.version} 版
        {entry.isLate ? " · 补填" : ""}
      </p>

      {entry.voidedAt ? (
        <div className="banner warn">
          已作废（{entry.voidedByName}）：{entry.voidReason}。记录留着，没有删。
        </div>
      ) : null}

      <div className="card">
        <div className="scroll">
          <table>
            <tbody>
              {entry.template.columns.map((column) => {
                const breach = entry.breaches?.[column.id];
                return (
                  <tr key={column.id}>
                    <th style={{ width: "36%" }}>{column.label.zh}</th>
                    <td style={breach ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
                      {render(entry.values[column.id])}
                      {column.unit && entry.values[column.id] !== undefined ? ` ${column.unit}` : ""}
                      {breach ? <div className="sub" style={{ color: "var(--danger)" }}>{breach}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <dl className="kv">
          <dt>状态</dt>
          <dd>{STATUS_LABEL[entry.status]}</dd>
          {entry.correctiveAction ? (
            <>
              <dt>纠正措施</dt>
              <dd>{entry.correctiveAction}</dd>
            </>
          ) : null}
          {entry.lateReason ? (
            <>
              <dt>当天没填的原因</dt>
              <dd>{entry.lateReason}</dd>
            </>
          ) : null}
          {entry.resolutionNote ? (
            <>
              <dt>处理结果</dt>
              <dd>
                {entry.resolutionNote}
                {entry.resolvedByName ? `（${entry.resolvedByName}）` : ""}
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      {entry.workOrders.length > 0 ? (
        <div className="card">
          <div className="name">维修单</div>
          {entry.workOrders.map((order) => (
            <div className="sub" key={order.id}>
              {order.note} · {order.completedAt ? `已完成：${order.result}` : "还没完成"}
            </div>
          ))}
        </div>
      ) : null}

      {canVoid ? (
        <form className="card" action={voidEntryAction}>
          <input type="hidden" name="id" value={entry.id} />
          <label htmlFor="reason">作废这条记录（必须写理由）</label>
          <p className="sub" style={{ marginTop: 0 }}>
            作废不是删除。原记录留着、默认隐藏，卫生局资料里查得到发生过什么。
          </p>
          <textarea id="reason" name="reason" required placeholder="例如：温度抄反了，实际是 6.8" />
          <div className="row" style={{ marginTop: 10 }}>
            <button type="submit">作废并重填</button>
          </div>
        </form>
      ) : null}

      {entry.status === "issue_open" && me.canManageHaccp ? (
        <Link className="button primary" href={`/issues/${entry.id}`}>
          去处理这条异常
        </Link>
      ) : null}
    </main>
  );
}
