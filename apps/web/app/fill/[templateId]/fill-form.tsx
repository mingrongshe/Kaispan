"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkColumn, describeLimit, hasLimit, type FieldState } from "@/lib/check";
import type { Column } from "@/lib/types";
import { saveDraftAction, submitAction } from "../actions";

type Props = {
  templateId: string;
  templateName: string;
  entryDate: string;
  isLate: boolean;
  columns: Column[];
  initialValues: Record<string, unknown>;
  people: { userId: string; name: string }[];
  footnotes: { zh: string; de?: string }[] | null;
};

export function FillForm(props: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(props.initialValues);
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [lateReason, setLateReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const states = useMemo(() => {
    const map: Record<string, FieldState> = {};
    for (const column of props.columns) map[column.id] = checkColumn(column, values);
    return map;
  }, [props.columns, values]);

  const breached = props.columns.filter((column) => states[column.id]?.level === "breach");
  const missing = props.columns.filter((column) => states[column.id]?.level === "missing");
  const needsCorrective = breached.length > 0;
  const canSubmit =
    missing.length === 0 &&
    (!needsCorrective || correctiveAction.trim() !== "") &&
    (!props.isLate || lateReason.trim().length >= 5);

  const set = (id: string, value: unknown) => {
    setValues((previous) => ({ ...previous, [id]: value }));
    setSaved(null);
  };

  const saveDraft = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveDraftAction({ templateId: props.templateId, entryDate: props.entryDate, values });
      if (result.ok) setSaved("草稿存好了，只有你自己看得到");
      else setError(result.message);
    });
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitAction({
        templateId: props.templateId,
        entryDate: props.entryDate,
        values,
        correctiveAction: needsCorrective ? correctiveAction : undefined,
        lateReason: props.isLate ? lateReason : undefined,
      });
      if (result.ok) router.push(`/records/${result.id}?submitted=1`);
      else setError(result.message);
    });
  };

  return (
    <>
      {props.isLate ? (
        <div className="banner warn">
          这是补填 {props.entryDate} 的记录。记录会标上「补填」，并且要写清当天为什么没填。
        </div>
      ) : null}
      {error ? <div className="banner breach">{error}</div> : null}
      {saved ? <div className="banner ok">{saved}</div> : null}

      <div className="card">
        <div className="fields">
          {props.columns.map((column) => (
            <Field
              key={column.id}
              column={column}
              value={values[column.id]}
              state={states[column.id] ?? { level: "ok" }}
              values={values}
              people={props.people}
              onChange={(value) => set(column.id, value)}
            />
          ))}
        </div>
      </div>

      {needsCorrective ? (
        <div className="card">
          <div className="banner breach">
            有 {breached.length} 项超标：
            {breached.map((column) => column.label.zh).join("、")}。不写纠正措施不能提交。
          </div>
          <label htmlFor="corrective">纠正措施</label>
          <textarea
            id="corrective"
            value={correctiveAction}
            onChange={(event) => setCorrectiveAction(event.target.value)}
            placeholder="例如：已调低设定并报修；已移出并废弃"
          />
        </div>
      ) : null}

      {props.isLate ? (
        <div className="card">
          <label htmlFor="late">当天为什么没填（至少 5 个字）</label>
          <textarea id="late" value={lateReason} onChange={(event) => setLateReason(event.target.value)} />
        </div>
      ) : null}

      <div className="row">
        <button type="button" onClick={saveDraft} disabled={pending}>
          存草稿
        </button>
        <button type="button" className="primary" onClick={submit} disabled={pending || !canSubmit}>
          提交
        </button>
        {missing.length > 0 ? (
          <span className="sub">还差 {missing.length} 项没填：{missing.map((c) => c.label.zh).join("、")}</span>
        ) : null}
      </div>

      {props.footnotes && props.footnotes.length > 0 ? (
        <div className="footnotes">
          {props.footnotes.map((note, index) => (
            <p key={index}>{note.zh}</p>
          ))}
        </div>
      ) : null}
    </>
  );
}

function Field({
  column,
  value,
  state,
  values,
  people,
  onChange,
}: {
  column: Column;
  value: unknown;
  state: FieldState;
  values: Record<string, unknown>;
  people: { userId: string; name: string }[];
  onChange: (value: unknown) => void;
}) {
  const wide = column.type === "checklist" || column.multiline;
  const limitText = describeLimit(column, values);

  return (
    <div className={`field${wide ? " wide" : ""}${state.level === "breach" ? " breach" : ""}`}>
      <label htmlFor={column.id}>
        {column.label.zh}
        {column.optional ? "（选填）" : ""}
        {limitText ? ` · ${limitText}` : ""}
      </label>

      {column.type === "choice" ? (
        <div className="choices">
          {(column.options ?? []).map((option) => (
            <button
              key={option.zh}
              type="button"
              aria-pressed={value === option.zh}
              onClick={() => onChange(value === option.zh ? "" : option.zh)}
            >
              {option.zh}
            </button>
          ))}
        </div>
      ) : column.type === "checklist" ? (
        <div className="checks">
          {(column.items ?? []).map((item) => {
            const checked = Array.isArray(value) && value.includes(item.zh);
            return (
              <label key={item.zh}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const current = Array.isArray(value) ? (value as string[]) : [];
                    onChange(event.target.checked ? [...current, item.zh] : current.filter((one) => one !== item.zh));
                  }}
                />
                {item.zh}
              </label>
            );
          })}
        </div>
      ) : column.type === "person" ? (
        <select id={column.id} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
          <option value="">选一个人</option>
          {people.map((person) => (
            <option key={person.userId} value={person.name}>
              {person.name}
            </option>
          ))}
        </select>
      ) : column.multiline ? (
        <textarea
          id={column.id}
          value={String(value ?? "")}
          placeholder={column.placeholder?.zh}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={column.id}
          type={column.type === "temp" || column.type === "number" ? "number" : "text"}
          step="0.1"
          value={String(value ?? "")}
          placeholder={column.placeholder?.zh}
          onChange={(event) =>
            onChange(
              column.type === "temp" || column.type === "number"
                ? event.target.value === ""
                  ? ""
                  : Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}

      {state.message ? (
        <div className={`msg ${state.level === "breach" ? "breach" : state.level === "warn" ? "warn" : "hint"}`}>
          {state.message}
        </div>
      ) : column.note ? (
        <div className="msg hint">{column.note.zh}</div>
      ) : hasLimit(column) ? null : null}
    </div>
  );
}
