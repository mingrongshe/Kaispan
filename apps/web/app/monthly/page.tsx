import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { MonthlyTable, type MonthlyReport } from "@/components/monthly-table";
import { apiGet, type Me } from "@/lib/api";

type Template = { id: string; nameZh: string };

function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (index ?? 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string; month?: string }>;
}) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");

  const { templateId, month } = await searchParams;
  const templates = await apiGet<Template[]>("/haccp/templates");
  const chosen = templateId ?? templates?.[0]?.id;
  if (!chosen) {
    return (
      <main>
        <TopBar me={me} />
        <h1>月度表</h1>
        <p className="empty">这家店还没有表单。</p>
      </main>
    );
  }

  const report = await apiGet<MonthlyReport>(
    `/haccp/templates/${chosen}/monthly${month ? `?month=${month}` : ""}`,
  );
  if (!report) {
    return (
      <main>
        <TopBar me={me} />
        <h1>月度表</h1>
        <p className="empty">打不开这张表。</p>
      </main>
    );
  }

  const link = (patch: { templateId?: string; month?: string }) =>
    `/monthly?templateId=${patch.templateId ?? chosen}&month=${patch.month ?? report.month}`;

  return (
    <main>
      <TopBar me={me} />
      <div className="no-print">
        <h1>月度表</h1>
        <p className="lead">跟纸质原表同一个版式。要交给卫生局就直接打印这一页。</p>

        <div className="row" style={{ marginBottom: 10 }}>
          {(templates ?? []).map((template) => (
            <Link
              key={template.id}
              className="button"
              href={link({ templateId: template.id })}
              style={template.id === chosen ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
            >
              {template.nameZh}
            </Link>
          ))}
        </div>

        <div className="row" style={{ marginBottom: 18 }}>
          <Link className="button" href={link({ month: shiftMonth(report.month, -1) })}>
            ‹ 上个月
          </Link>
          <span className="name">{report.month}</span>
          <Link className="button" href={link({ month: shiftMonth(report.month, 1) })}>
            下个月 ›
          </Link>
          {report.stats.entries === 0 ? (
            <Link className="button primary" href={`/fill/${chosen}`}>
              去填这张表
            </Link>
          ) : null}
          {me.canManageHaccp ? (
            <Link className="button" href={`/inspection?month=${report.month}`}>
              检查模式
            </Link>
          ) : null}
        </div>
      </div>

      <MonthlyTable report={report} />
    </main>
  );
}
