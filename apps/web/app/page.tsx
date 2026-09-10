import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";
import { QuickFill } from "@/components/quick-fill";
import { canQuickFill } from "@/lib/check";
import { frequencyLabel, SHIFT_LABEL, TIMING_LABEL, type Column, type TaskRow } from "@/lib/types";

type TasksResponse = { date: string; today: string; tasks: TaskRow[]; missed: { templateId: string; nameZh: string; missing: string[] }[] };
type MyTasksResponse = { date: string; tasks: TaskRow[] };
type TemplateColumns = { id: string; columns: Column[] };
type IssueGroup = {
  key: string;
  templateId: string;
  templateName: string;
  columnLabel: string;
  equipmentId: string | null;
  equipmentName: string | null;
  dates: string[];
  latestValue: string;
  latestReason: string;
  entryIds: string[];
  consecutiveDays: number;
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");

  const { date } = await searchParams;
  const query = date ? `?date=${date}` : "";

  return (
    <main>
      <TopBar me={me} />
      {me.canManageHaccp ? <ManagerHome query={query} /> : <EmployeeHome query={query} />}
    </main>
  );
}

async function EmployeeHome({ query }: { query: string }) {
  const [data, templates] = await Promise.all([
    apiGet<MyTasksResponse>(`/haccp/my-tasks${query}`),
    apiGet<TemplateColumns[]>("/haccp/templates"),
  ]);
  if (!data) return <p className="empty">读不到待办。</p>;
  const columnsOf = new Map((templates ?? []).map((template) => [template.id, template.columns]));

  return (
    <>
      <h1>等你处理</h1>
      <p className="lead">{data.date} · 派给你的表填完就从这里消失。</p>
      {data.tasks.length === 0 ? (
        <div className="card">
          <p className="empty">今天没有派给你的表。</p>
        </div>
      ) : (
        data.tasks.map((task) => (
          <div className="card" key={task.templateId}>
            <div className="row">
              <div className="grow">
                <div className="name">{task.nameZh}</div>
                <div className="sub">
                  {TIMING_LABEL[task.timing]} · {frequencyLabel(task.frequencyKind, task.frequencyTimes)} ·{" "}
                  {task.columnCount} 项
                  {task.due.needed > 1 ? ` · ${task.due.window.label}还差 ${task.due.remaining} 次` : ""}
                </div>
                {task.lastEntry ? (
                  <div className="sub">
                    上次 {task.lastEntry.entryDate} {task.lastEntry.filledByName}：{task.lastEntry.summary}
                  </div>
                ) : null}
              </div>
              <Link className="button primary" href={`/fill/${task.templateId}${query}`}>
                填写
              </Link>
              {(() => {
                const columns = columnsOf.get(task.templateId);
                return columns && canQuickFill(columns) ? (
                  <QuickFill
                    templateId={task.templateId}
                    entryDate={data.date}
                    columns={columns}
                    people={task.assignees}
                  />
                ) : null;
              })()}
            </div>
          </div>
        ))
      )}
    </>
  );
}

async function ManagerHome({ query }: { query: string }) {
  const [data, groups, templates] = await Promise.all([
    apiGet<TasksResponse>(`/haccp/tasks${query}`),
    apiGet<IssueGroup[]>("/haccp/manage/issue-groups"),
    apiGet<TemplateColumns[]>("/haccp/templates"),
  ]);
  const columnsOf = new Map((templates ?? []).map((template) => [template.id, template.columns]));
  if (!data) return <p className="empty">读不到今天的表。</p>;

  const due = data.tasks.filter((task) => task.due.due);
  const done = data.tasks.filter((task) => !task.due.due);

  return (
    <>
      <h1>HACCP 管理</h1>
      <p className="lead">
        {data.date}
        {data.date !== data.today ? "（不是今天）" : ""} · 今天还有 {due.length} 张表要填
      </p>

      {groups && groups.length > 0 ? (
        <>
          <h2>出事了</h2>
          <p className="sub" style={{ marginTop: -6 }}>
            按测量点聚起来看。同一台机器连着好几天同一个问题，那是一件事，不是好几件。
          </p>
          {groups.map((group) => (
            <div className="card" key={group.key}>
              <div className="row">
                <div className="grow">
                  <div className="name">
                    {group.equipmentName ?? group.columnLabel}
                    {group.consecutiveDays >= 2 ? (
                      <span className="pill due" style={{ marginLeft: 8 }}>
                        连续 {group.consecutiveDays} 天
                      </span>
                    ) : null}
                  </div>
                  <div className="sub">
                    {group.templateName} · {group.columnLabel} · 最新一次 {group.latestReason}
                  </div>
                  <div className="sub">
                    {group.dates.length} 条待处理：{group.dates.join("、")}
                  </div>
                </div>
                <div className="row">
                  {group.equipmentId ? (
                    <Link className="button" href={`/equipment/${group.equipmentId}`}>
                      看这台设备
                    </Link>
                  ) : null}
                  <Link className="button primary" href={`/issues/${group.entryIds[0]}`}>
                    去处理
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </>
      ) : null}

      <h2>今天要填</h2>
      {due.length === 0 ? <p className="empty">都填完了。</p> : null}
      {due.map((task) => (
        <TaskCard key={task.templateId} task={task} query={query} columns={columnsOf.get(task.templateId)} date={data.date} />
      ))}

      {data.missed.length > 0 ? (
        <>
          <h2>过去 7 天漏掉的</h2>
          {data.missed.map((row) => (
            <div className="card tight" key={row.templateId}>
              <div className="row">
                <div className="grow">
                  <span className="name">{row.nameZh}</span>{" "}
                  <span className="sub">漏 {row.missing.length} 天 · 最近 {row.missing[row.missing.length - 1]}</span>
                </div>
                <Link className="button" href={`/fill/${row.templateId}?date=${row.missing[row.missing.length - 1]}`}>
                  去补
                </Link>
              </div>
            </div>
          ))}
        </>
      ) : null}

      {done.length > 0 ? (
        <>
          <h2>现在不用管的</h2>
          {done.map((task) => (
            <TaskCard key={task.templateId} task={task} query={query} columns={columnsOf.get(task.templateId)} date={data.date} />
          ))}
        </>
      ) : null}
    </>
  );
}

function TaskCard({
  task,
  query,
  columns,
  date,
}: {
  task: TaskRow;
  query: string;
  columns?: Column[];
  date: string;
}) {
  return (
    <div className="card">
      <div className="row">
        <div className="grow">
          <div className="name">
            {task.nameZh}{" "}
            {task.due.needed > 1 && task.due.due ? (
              <span className="pill warn">{task.due.window.label}还差 {task.due.remaining} 次</span>
            ) : null}
            {!task.due.due ? (
              <span className="pill ok">
                {task.due.done >= task.due.needed ? "已完成" : "本年内，还不着急"}
              </span>
            ) : null}
          </div>
          <div className="sub">
            {TIMING_LABEL[task.timing]} · {frequencyLabel(task.frequencyKind, task.frequencyTimes)} ·{" "}
            {task.columnCount} 项
          </div>
          <div className="sub">
            派给：
            {task.shiftKind ? SHIFT_LABEL[task.shiftKind] : "没派单"}
            {task.shiftKind
              ? task.assignees.length > 0
                ? ` · ${task.assignees.map((person) => person.name).join("、")}`
                : " · 班表这天没排人"
              : ""}
          </div>
          {task.lastEntry ? (
            <div className="sub">
              上次 {task.lastEntry.entryDate} {task.lastEntry.filledByName}：{task.lastEntry.summary}
              {task.lastEntry.hasBreach ? " ⚠" : ""}
            </div>
          ) : (
            <div className="sub">还没有记录</div>
          )}
        </div>
        <Link className="button primary" href={`/fill/${task.templateId}${query}`}>
          填写
        </Link>
        {task.due.due && columns && canQuickFill(columns) ? (
          <QuickFill templateId={task.templateId} entryDate={date} columns={columns} people={task.assignees} />
        ) : null}
      </div>
    </div>
  );
}
