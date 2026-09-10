import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";
import type { Column, TaskRow } from "@/lib/types";
import { FillForm } from "./fill-form";

type FormResponse = {
  date: string;
  today: string;
  isLate: boolean;
  template: {
    id: string;
    key: string;
    nameZh: string;
    nameDe: string;
    version: number;
    columns: Column[];
    header: Record<string, string>;
    footnotes: { zh: string; de?: string }[] | null;
  };
  draft: { id: string; values: Record<string, unknown> } | null;
};

export default async function FillPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");

  const { templateId } = await params;
  const { date } = await searchParams;
  const query = date ? `?date=${date}` : "";

  const form = await apiGet<FormResponse>(`/haccp/templates/${templateId}/form${query}`);
  if (!form) {
    return (
      <main>
        <TopBar me={me} />
        <h1>打不开这张表</h1>
        <p className="lead">它不在这家店，或者这一天没有派给你。</p>
        <Link className="button" href="/">
          回今天
        </Link>
      </main>
    );
  }

  // person 类型的列从本店在册的人里选，不是写死的名单
  const tasks = await apiGet<{ tasks: TaskRow[] }>(`/haccp/tasks${query}`);
  const people = new Map<string, string>();
  for (const task of tasks?.tasks ?? []) {
    for (const person of task.assignees) people.set(person.userId, person.name);
  }

  return (
    <main>
      <TopBar me={me} />
      <h1>{form.template.nameZh}</h1>
      <p className="lead">
        {form.date} · {me.unitName} · 第 {form.template.version} 版
        {form.template.header?.inspector ? ` · 负责人 ${form.template.header.inspector}` : ""}
      </p>
      <FillForm
        templateId={form.template.id}
        templateName={form.template.nameZh}
        entryDate={form.date}
        isLate={form.isLate}
        columns={form.template.columns}
        initialValues={form.draft?.values ?? {}}
        people={[...people].map(([userId, name]) => ({ userId, name }))}
        footnotes={form.template.footnotes}
      />
    </main>
  );
}
