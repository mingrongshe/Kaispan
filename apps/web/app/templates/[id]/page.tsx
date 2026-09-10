import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";
import type { Column } from "@/lib/types";
import { TemplateEditor } from "./editor";

type EditorData = {
  id: string;
  key: string;
  currentVersion: number;
  nextVersion: number;
  entryCount: number;
  nameZh: string;
  nameDe: string;
  columns: Column[];
};

export default async function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");
  if (!me.canManageHaccp) {
    return (
      <main>
        <TopBar me={me} />
        <h1>只有店长能改表单</h1>
      </main>
    );
  }

  const { id } = await params;
  const data = await apiGet<EditorData>(`/haccp/manage/templates/${id}/editor`);
  if (!data) {
    return (
      <main>
        <TopBar me={me} />
        <h1>打不开这张表</h1>
        <Link className="button" href="/templates">
          回表单管理
        </Link>
      </main>
    );
  }

  return (
    <main>
      <TopBar me={me} />
      <h1>{data.nameZh}</h1>
      <p className="lead">
        当前第 {data.currentVersion} 版 · {data.entryCount} 条记录 ·
        改动保存成新版本，旧记录按它们自己那一版显示
      </p>
      <TemplateEditor
        templateId={data.id}
        nameZh={data.nameZh}
        nameDe={data.nameDe}
        currentVersion={data.currentVersion}
        nextVersion={data.nextVersion}
        entryCount={data.entryCount}
        columns={data.columns}
      />
      <Link href="/templates">回表单管理</Link>
    </main>
  );
}
