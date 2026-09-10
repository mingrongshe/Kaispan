import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";
import { frequencyLabel } from "@/lib/types";
import { setActiveAction } from "./actions";

type TemplateRow = {
  id: string;
  key: string;
  nameZh: string;
  nameDe: string;
  layout: string;
  frequencyKind: string;
  frequencyTimes: number;
  columnCount: number;
  currentVersion: number;
  versions: number[];
  entryCount: number;
  active: boolean;
};

export default async function TemplatesPage() {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");
  if (!me.canManageHaccp) {
    return (
      <main>
        <TopBar me={me} />
        <h1>只有店长能改表单</h1>
        <Link className="button" href="/">
          回今天
        </Link>
      </main>
    );
  }

  const rows = await apiGet<TemplateRow[]>("/haccp/manage/templates");

  return (
    <main>
      <TopBar me={me} />
      <h1>表单管理</h1>
      <p className="lead">
        七张表是照原表预置的。开第二家店、换了冰箱、临界值要调，都在这里改。
      </p>

      {(rows ?? []).map((row) => (
        <div className="card" key={row.id}>
          <div className="row">
            <div className="grow">
              <div className="name">
                {row.nameZh}
                {row.active ? null : <span className="pill" style={{ marginLeft: 8 }}>已停用</span>}
              </div>
              <div className="sub">{row.nameDe}</div>
              <div className="sub">
                {frequencyLabel(row.frequencyKind, row.frequencyTimes)} · {row.columnCount} 个测量点 · 当前第{" "}
                {row.currentVersion} 版{row.versions.length > 1 ? `（共 ${row.versions.length} 版）` : ""} ·{" "}
                {row.entryCount} 条记录
              </div>
            </div>
            <form action={setActiveAction}>
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="active" value={row.active ? "false" : "true"} />
              <button type="submit">{row.active ? "停用" : "启用"}</button>
            </form>
            <Link className="button primary" href={`/templates/${row.id}`}>
              编辑
            </Link>
          </div>
        </div>
      ))}

      <p className="sub">
        停用不是删除。已经有记录的表被真删掉，卫生局资料包会出洞 —— 停用的表不再出现在待办里，
        历史记录和月度表照样查得到。
      </p>
    </main>
  );
}
