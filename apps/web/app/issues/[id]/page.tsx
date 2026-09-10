import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";
import type { Column } from "@/lib/types";
import { completeWorkOrderAction, resolveIssueAction } from "../actions";

type Candidate = { id: string; name: string; location: string | null; status: string; linkColumnId: string | null };

type EntryDetail = {
  id: string;
  entryDate: string;
  status: string;
  values: Record<string, unknown>;
  breaches: Record<string, string> | null;
  correctiveAction: string | null;
  filledBy: { name: string };
  resolutionNote: string | null;
  workOrders: { id: string; note: string; result: string | null; completedAt: string | null }[];
  template: { nameZh: string; columns: Column[] };
};

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");
  if (!me.canManageHaccp) {
    return (
      <main>
        <TopBar me={me} />
        <h1>只有店长能处理异常</h1>
        <Link className="button" href="/">
          回今天
        </Link>
      </main>
    );
  }

  const { id } = await params;
  const [entry, candidates] = await Promise.all([
    apiGet<EntryDetail>(`/haccp/entries/${id}`),
    apiGet<Candidate[]>(`/haccp/manage/issues/${id}/equipment-candidates`),
  ]);
  if (!entry) {
    return (
      <main>
        <TopBar me={me} />
        <h1>找不到这条异常</h1>
      </main>
    );
  }

  const labels = new Map(entry.template.columns.map((column) => [column.id, column.label.zh]));
  const openOrders = entry.workOrders.filter((order) => order.completedAt === null);
  const mustUseEquipment = (candidates ?? []).length > 0;

  return (
    <main>
      <TopBar me={me} />
      <h1>处理异常</h1>
      <p className="lead">
        {entry.template.nameZh} · {entry.entryDate} · {entry.filledBy.name} 填的
      </p>

      <div className="card">
        <div className="name">超出临界值的项</div>
        {Object.entries(entry.breaches ?? {}).map(([columnId, reason]) => (
          <div key={columnId} className="sub" style={{ color: "var(--danger)" }}>
            {labels.get(columnId) ?? columnId}：{String(entry.values[columnId])} · {reason}
          </div>
        ))}
        {entry.correctiveAction ? (
          <p className="sub" style={{ marginBottom: 0 }}>员工当场写的纠正措施：{entry.correctiveAction}</p>
        ) : null}
      </div>

      {entry.status === "issue_resolved" ? (
        <div className="banner ok">这条已经处理完了。{entry.resolutionNote}</div>
      ) : openOrders.length > 0 ? (
        <div className="card">
          <div className="banner warn">
            维修单开了，但还没填结果。填了结果、标记完成，这条异常才算闭环。
          </div>
          {openOrders.map((order) => (
            <form key={order.id} action={completeWorkOrderAction} style={{ marginBottom: 12 }}>
              <input type="hidden" name="workOrderId" value={order.id} />
              <input type="hidden" name="entryId" value={entry.id} />
              <label htmlFor={`result-${order.id}`}>{order.note}</label>
              <textarea id={`result-${order.id}`} name="result" required placeholder="修了什么、现在解决了没有" />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="primary" type="submit">
                  标记完成
                </button>
              </div>
            </form>
          ))}
        </div>
      ) : mustUseEquipment ? (
        <form className="card" action={resolveIssueAction}>
          <input type="hidden" name="id" value={entry.id} />
          <div className="banner warn">
            这是温度类超标，要挂到一台具体的机器上并开维修单。写一句处理结果关不掉它 ——
            冰箱不会因为记了一笔就好起来。
          </div>
          <label htmlFor="equipmentId">哪台设备</label>
          <select id="equipmentId" name="equipmentId" required>
            {(candidates ?? []).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
                {candidate.location ? `（${candidate.location}）` : ""}
              </option>
            ))}
          </select>
          <label htmlFor="workOrderNote" style={{ marginTop: 12 }}>
            什么坏了
          </label>
          <textarea id="workOrderNote" name="workOrderNote" required placeholder="例如：温度爬到 8.6，压缩机声音不对" />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" type="submit">
              开维修单
            </button>
          </div>
        </form>
      ) : (
        <form className="card" action={resolveIssueAction}>
          <input type="hidden" name="id" value={entry.id} />
          <label htmlFor="note">处理结果</label>
          <p className="sub" style={{ marginTop: 0 }}>
            这类异常挂不到机器上，写清做了什么、解决了没有就算处理完。
          </p>
          <textarea id="note" name="note" required placeholder="例如：已通知专业公司，周五上门；这批货已退回供应商" />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" type="submit">
              标记已处理
            </button>
          </div>
        </form>
      )}

      <Link href={`/records/${entry.id}`}>看这条记录的全部内容</Link>
    </main>
  );
}
