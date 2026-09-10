import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";
import { STATUS_LABEL, type EntryRow } from "@/lib/types";

type Template = { id: string; nameZh: string };

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string; status?: string; includeVoided?: string }>;
}) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");

  const filters = await searchParams;
  const query = new URLSearchParams();
  if (filters.templateId) query.set("templateId", filters.templateId);
  if (filters.status) query.set("status", filters.status);
  if (filters.includeVoided) query.set("includeVoided", "true");

  const [rows, templates] = await Promise.all([
    apiGet<EntryRow[]>(`/haccp/entries?${query.toString()}`),
    apiGet<Template[]>("/haccp/templates"),
  ]);
  const names = new Map((templates ?? []).map((template) => [template.id, template.nameZh]));

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    return `/records?${next.toString()}`;
  };

  return (
    <main>
      <TopBar me={me} />
      <h1>全部记录</h1>
      <p className="lead">本店所有表的历史。别人的草稿不在这里。</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <Link className="button" href={link({ status: undefined })}>
          全部
        </Link>
        <Link className="button" href={link({ status: "issue_open" })}>
          有异常
        </Link>
        <Link className="button" href={link({ status: "issue_resolved" })}>
          已处理
        </Link>
        <Link className="button" href={link({ includeVoided: filters.includeVoided ? undefined : "true" })}>
          {filters.includeVoided ? "隐藏已作废" : "显示已作废"}
        </Link>
      </div>

      {!rows || rows.length === 0 ? (
        <div className="card">
          <p className="empty">没有符合条件的记录。</p>
        </div>
      ) : (
        <div className="card scroll">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>表</th>
                <th>填写人</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.entryDate}
                    {row.isLate ? <span className="pill warn" style={{ marginLeft: 6 }}>补填</span> : null}
                  </td>
                  <td>{names.get(row.templateId) ?? row.templateId}</td>
                  <td>{row.filledByName}</td>
                  <td>
                    {row.voidedAt ? (
                      <span className="pill">已作废</span>
                    ) : (
                      <span className={`pill ${row.status === "issue_open" ? "due" : row.status === "submitted" ? "ok" : ""}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    )}
                  </td>
                  <td>
                    <Link href={`/records/${row.id}`}>打开</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
