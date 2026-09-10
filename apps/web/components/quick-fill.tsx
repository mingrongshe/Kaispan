"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkColumn, describeLimit, type FieldState } from "@/lib/check";
import type { Column } from "@/lib/types";
import { submitAction } from "@/app/fill/actions";

/**
 * 主页行内快填。早上查冰箱是走一圈量五个点，不该为此跳进跳出。
 * 超标判定和纠正措施强制填写在这里同样生效。
 * 判断哪张表能就地填的 canQuickFill 在 lib/check.ts —— 服务端也要用它。
 */
export function QuickFill(props: {
  templateId: string;
  entryDate: string;
  columns: Column[];
  people: { userId: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [corrective, setCorrective] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const states = useMemo(() => {
    const map: Record<string, FieldState> = {};
    for (const column of props.columns) map[column.id] = checkColumn(column, values);
    return map;
  }, [props.columns, values]);

  const breached = props.columns.filter((column) => states[column.id]?.level === "breach");
  const missing = props.columns.filter((column) => states[column.id]?.level === "missing");
  const canSubmit = missing.length === 0 && (breached.length === 0 || corrective.trim() !== "");

  if (done) return <span className="pill ok">{done}</span>;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        就地填
      </button>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitAction({
        templateId: props.templateId,
        entryDate: props.entryDate,
        values,
        correctiveAction: breached.length > 0 ? corrective : undefined,
      });
      if (result.ok) {
        // 不跳页：早上量冰箱的人只想填完继续干活
        setDone(result.status === "issue_open" ? "提交了，有超标" : "填好了");
        router.refresh();
      } else setError(result.message);
    });
  };

  return (
    <div className="quickfill">
      <div className="fields">
        {props.columns.map((column) => {
          const state = states[column.id] ?? { level: "ok" as const };
          const limitText = describeLimit(column, values);
          return (
            <div className={`field${state.level === "breach" ? " breach" : ""}`} key={column.id}>
              <label>
                {column.label.zh}
                {limitText ? ` · ${limitText}` : ""}
              </label>
              {column.type === "choice" ? (
                <div className="choices">
                  {(column.options ?? []).map((option) => (
                    <button
                      key={option.zh}
                      type="button"
                      aria-pressed={values[column.id] === option.zh}
                      onClick={() =>
                        setValues((previous) => ({
                          ...previous,
                          [column.id]: previous[column.id] === option.zh ? "" : option.zh,
                        }))
                      }
                    >
                      {option.zh}
                    </button>
                  ))}
                </div>
              ) : column.type === "person" ? (
                <select
                  value={String(values[column.id] ?? "")}
                  onChange={(event) => setValues((p) => ({ ...p, [column.id]: event.target.value }))}
                >
                  <option value="">选一个人</option>
                  {props.people.map((person) => (
                    <option key={person.userId} value={person.name}>
                      {person.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  step="0.1"
                  value={String(values[column.id] ?? "")}
                  onChange={(event) =>
                    setValues((p) => ({
                      ...p,
                      [column.id]: event.target.value === "" ? "" : Number(event.target.value),
                    }))
                  }
                />
              )}
              {state.message ? (
                <div className={`msg ${state.level === "breach" ? "breach" : state.level === "warn" ? "warn" : "hint"}`}>
                  {state.message}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {breached.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <label>纠正措施（{breached.map((column) => column.label.zh).join("、")} 超标，不写不能提交）</label>
          <input type="text" name="corrective" value={corrective} onChange={(event) => setCorrective(event.target.value)} />
        </div>
      ) : null}

      {error ? <div className="banner breach" style={{ marginTop: 10 }}>{error}</div> : null}

      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="primary" onClick={submit} disabled={pending || !canSubmit}>
          提交
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          收起
        </button>
        {missing.length > 0 ? <span className="sub">还差 {missing.length} 项</span> : null}
      </div>
    </div>
  );
}
