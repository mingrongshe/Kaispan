import { redirect } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";
import { SHIFT_LABEL, type TaskRow } from "@/lib/types";
import { assignTemplateAction, setShiftAction } from "./actions";

type Shift = { id: string; date: string; kind: "opening" | "midday" | "closing"; user: { id: string; name: string } };
type Staff = { id: string; name: string; role: string };

const KINDS = ["opening", "midday", "closing"] as const;
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");
  if (!me.canManageHaccp) {
    return (
      <main>
        <TopBar me={me} />
        <h1>只有店长能排班</h1>
      </main>
    );
  }

  const { week } = await searchParams;
  const tasksNow = await apiGet<{ today: string }>("/haccp/tasks");
  const monday = mondayOf(week ?? tasksNow?.today ?? new Date().toISOString().slice(0, 10));
  const sunday = addDays(monday, 6);

  const [shifts, staff, tasks] = await Promise.all([
    apiGet<Shift[]>(`/haccp/manage/shifts?from=${monday}&to=${sunday}`),
    apiGet<Staff[]>("/haccp/manage/staff"),
    apiGet<{ tasks: TaskRow[] }>("/haccp/tasks"),
  ]);

  const byCell = new Map<string, Shift[]>();
  for (const shift of shifts ?? []) {
    const key = `${shift.date.slice(0, 10)}|${shift.kind}`;
    byCell.set(key, [...(byCell.get(key) ?? []), shift]);
  }

  return (
    <main>
      <TopBar me={me} />
      <h1>班表与派单</h1>
      <p className="lead">
        派单派给班次，不点名。那天谁上这个班，表就落到谁头上；班表改了，派单自动跟着改。
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="button" href={`/shifts?week=${addDays(monday, -7)}`}>
          ‹ 上周
        </Link>
        <span className="name">
          {monday} 到 {sunday}
        </span>
        <Link className="button" href={`/shifts?week=${addDays(monday, 7)}`}>
          下周 ›
        </Link>
      </div>

      <h2>这一周谁上哪个班</h2>
      {Array.from({ length: 7 }, (_, index) => addDays(monday, index)).map((date, index) => (
        <div className="card" key={date}>
          <div className="name">
            {WEEKDAYS[index]} {date}
          </div>
          {KINDS.map((kind) => {
            const current = byCell.get(`${date}|${kind}`) ?? [];
            return (
              <form key={kind} action={setShiftAction} className="row" style={{ marginTop: 8 }}>
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="kind" value={kind} />
                <span className="sub" style={{ width: 64 }}>
                  {SHIFT_LABEL[kind]}
                </span>
                <div className="grow row">
                  {(staff ?? [])
                    .filter((person) => person.role === "employee")
                    .map((person) => (
                      <label key={person.id} style={{ display: "flex", gap: 6, margin: 0, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          name="userIds"
                          value={person.id}
                          defaultChecked={current.some((shift) => shift.user.id === person.id)}
                          style={{ width: "auto" }}
                        />
                        {person.name}
                      </label>
                    ))}
                </div>
                <button type="submit">存这一班</button>
              </form>
            );
          })}
        </div>
      ))}

      <h2>哪张表归哪个班</h2>
      {(tasks?.tasks ?? []).map((task) => (
        <form className="card tight row" key={task.templateId} action={assignTemplateAction}>
          <input type="hidden" name="templateId" value={task.templateId} />
          <div className="grow">
            <span className="name">{task.nameZh}</span>
            <div className="sub">
              现在：{task.shiftKind ? SHIFT_LABEL[task.shiftKind] : "没派单"}
            </div>
          </div>
          <select name="shiftKind" defaultValue={task.shiftKind ?? ""} style={{ width: 130 }}>
            <option value="">不派单</option>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {SHIFT_LABEL[kind]}
              </option>
            ))}
          </select>
          <input type="date" name="fromDate" defaultValue={monday} style={{ width: 160 }} />
          <button type="submit">改派</button>
        </form>
      ))}
      <p className="sub">
        改派从你选的那天起生效，旧规则在那天封口。这样上个月的记录不会被算成「本来该另一个人填」。
      </p>
    </main>
  );
}
