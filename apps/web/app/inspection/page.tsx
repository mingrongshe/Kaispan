import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { MonthlyTable, type MonthlyReport } from "@/components/monthly-table";
import { apiGet, type Me } from "@/lib/api";

type Inspection = {
  month: string;
  organizationName: string;
  unitName: string;
  generatedAt: string;
  templateCount: number;
  entryCount: number;
  breachCount: number;
  selfCheck: { templateId: string; nameZh: string; entries: number; missingDays: number }[];
  reports: MonthlyReport[];
};

function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2026, (index ?? 1) - 1 + delta, 1)).toISOString().slice(0, 7);
}

export default async function InspectionPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");
  if (!me.canManageHaccp) {
    return (
      <main>
        <TopBar me={me} />
        <h1>只有店长能打开检查模式</h1>
        <Link className="button" href="/">
          回今天
        </Link>
      </main>
    );
  }

  const { month } = await searchParams;
  const data = await apiGet<Inspection>(`/haccp/manage/inspection${month ? `?month=${month}` : ""}`);
  if (!data) {
    return (
      <main>
        <TopBar me={me} />
        <h1>检查模式</h1>
        <p className="empty">读不到这个月的记录。</p>
      </main>
    );
  }

  return (
    <main>
      <div className="no-print">
        <TopBar me={me} />
        <div className="row" style={{ marginBottom: 14 }}>
          <Link className="button" href={`/inspection?month=${shiftMonth(data.month, -1)}`}>
            ‹ 上个月
          </Link>
          <span className="name">{data.month}</span>
          <Link className="button" href={`/inspection?month=${shiftMonth(data.month, 1)}`}>
            下个月 ›
          </Link>
          <span className="sub">这一页没有任何操作按钮，屏幕转过去就能给检查员看。打印时每张表另起一页。</span>
        </div>

        {/* 检查前自查：这是给店长看的，打印件里不出现 */}
        {data.selfCheck.length > 0 ? (
          <div className="selfcheck">
            <div className="name">检查前先补这几处</div>
            {data.selfCheck.map((row) => (
              <div key={row.templateId} className="row" style={{ marginTop: 6 }}>
                <span className="grow">
                  {row.nameZh}：
                  {row.entries === 0
                    ? "这个月一条记录都没有"
                    : `到今天为止空着 ${row.missingDays} 天`}
                </span>
                <Link className="button" href={`/monthly?templateId=${row.templateId}&month=${data.month}`}>
                  看这张表
                </Link>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="cover">
        <h1>HACCP 记录汇总</h1>
        <dl className="kv">
          <dt>公司</dt>
          <dd>{data.organizationName}</dd>
          <dt>门店</dt>
          <dd>{data.unitName}</dd>
          <dt>期间</dt>
          <dd>{data.month}</dd>
          <dt>表单</dt>
          <dd>{data.templateCount} 张</dd>
          <dt>记录</dt>
          <dd>
            {data.entryCount} 条{data.breachCount > 0 ? `，其中 ${data.breachCount} 条有异常并已记录处理` : ""}
          </dd>
          <dt>生成时间</dt>
          <dd>{new Date(data.generatedAt).toLocaleString("zh-CN")}</dd>
        </dl>
      </div>

      {data.reports.map((report) => (
        <MonthlyTable key={report.template.id} report={report} />
      ))}
    </main>
  );
}
