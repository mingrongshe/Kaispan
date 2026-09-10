"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkColumn } from "@/lib/check";
import type { Column } from "@/lib/types";
import { emptyDraft, limitSummary, toDraft, type ColumnDraft } from "../column-draft";
import { saveVersionAction } from "../actions";

const TYPE_LABEL: Record<ColumnDraft["type"], string> = {
  temp: "温度",
  number: "数字",
  text: "文字",
  choice: "单选",
  checklist: "清单",
  person: "人员",
  signature: "签名",
};

export function TemplateEditor(props: {
  templateId: string;
  nameZh: string;
  nameDe: string;
  currentVersion: number;
  nextVersion: number;
  entryCount: number;
  columns: Column[];
}) {
  const router = useRouter();
  const [nameZh, setNameZh] = useState(props.nameZh);
  const [nameDe, setNameDe] = useState(props.nameDe);
  const [drafts, setDrafts] = useState<ColumnDraft[]>(props.columns.map(toDraft));
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (index: number, change: Partial<ColumnDraft>) =>
    setDrafts((previous) => previous.map((draft, i) => (i === index ? { ...draft, ...change } : draft)));

  const move = (index: number, delta: number) =>
    setDrafts((previous) => {
      const next = [...previous];
      const target = index + delta;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  const remove = (index: number) => {
    setDrafts((previous) => previous.filter((_, i) => i !== index));
    setOpenIndex(null);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveVersionAction({ templateId: props.templateId, nameZh, nameDe, columns: drafts });
      if (result.ok) router.push("/templates");
      else {
        setError(result.message);
        setConfirming(false);
      }
    });
  };

  return (
    <>
      {error ? <div className="banner breach">{error}</div> : null}

      <div className="card">
        <div className="fields">
          <div className="field">
            <label htmlFor="nameZh">表名（中文）</label>
            <input id="nameZh" value={nameZh} onChange={(event) => setNameZh(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nameDe">表名（Deutsch）</label>
            <input id="nameDe" value={nameDe} onChange={(event) => setNameDe(event.target.value)} />
          </div>
        </div>
      </div>

      <h2>测量点</h2>
      {drafts.map((draft, index) => (
        <div className="card tight" key={`${draft.id || "new"}-${index}`}>
          {/* 标题常驻可扫，详细配置按需展开：全展开的话一页 70 多个控件，扫不动 */}
          <div className="row">
            <button type="button" onClick={() => setOpenIndex(openIndex === index ? null : index)} style={{ width: 34 }}>
              {openIndex === index ? "−" : "+"}
            </button>
            <div className="grow">
              <span className="name">{draft.labelZh || "（还没起名）"}</span>{" "}
              <span className="sub">
                {TYPE_LABEL[draft.type]} · {limitSummary(draft)}
                {draft.optional ? " · 选填" : ""}
                {draft.id ? "" : " · 新加的"}
              </span>
            </div>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
              ↑
            </button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === drafts.length - 1}>
              ↓
            </button>
            <button type="button" onClick={() => remove(index)}>
              删除
            </button>
          </div>

          {openIndex === index ? (
            <div className="fields" style={{ marginTop: 12 }}>
              <div className="field">
                <label>名称（中文）</label>
                <input value={draft.labelZh} onChange={(event) => patch(index, { labelZh: event.target.value })} />
              </div>
              <div className="field">
                <label>名称（Deutsch）</label>
                <input value={draft.labelDe} onChange={(event) => patch(index, { labelDe: event.target.value })} />
              </div>
              <div className="field">
                <label>类型</label>
                <select
                  value={draft.type}
                  onChange={(event) => patch(index, { type: event.target.value as ColumnDraft["type"] })}
                >
                  {Object.entries(TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>单位</label>
                <input value={draft.unit} onChange={(event) => patch(index, { unit: event.target.value })} />
              </div>

              {draft.hasLimitBy ? (
                <div className="field wide">
                  <div className="banner warn" style={{ marginBottom: 0 }}>
                    这一列的限值随另一列的取值变化（出餐温度按热菜冷菜切，入库验收按商品类别切）。
                    这里改不了，保存时原样保留 —— 假装能改比不给改更糟。
                  </div>
                </div>
              ) : draft.type === "temp" || draft.type === "number" ? (
                <>
                  <div className="field">
                    <label>下限</label>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.min}
                      onChange={(event) => patch(index, { min: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>上限</label>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.max}
                      onChange={(event) => patch(index, { max: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>短暂容许</label>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.tolerance}
                      onChange={(event) => patch(index, { tolerance: event.target.value })}
                    />
                  </div>
                </>
              ) : null}

              {draft.type === "choice" || draft.type === "checklist" ? (
                <div className="field wide">
                  <label>选项（一行一个，可以写成「中文|Deutsch」）</label>
                  <textarea
                    value={draft.optionsText}
                    onChange={(event) => patch(index, { optionsText: event.target.value })}
                  />
                  {draft.type === "choice" ? (
                    <div className="checks" style={{ marginTop: 8 }}>
                      <span className="sub">哪些选项算超标</span>
                      {draft.optionsText
                        .split("\n")
                        .map((line) => line.split("|")[0]!.trim())
                        .filter((line) => line !== "")
                        .map((option) => (
                          <label key={option}>
                            <input
                              type="checkbox"
                              checked={draft.breachOn.includes(option)}
                              onChange={(event) =>
                                patch(index, {
                                  breachOn: event.target.checked
                                    ? [...draft.breachOn, option]
                                    : draft.breachOn.filter((one) => one !== option),
                                })
                              }
                            />
                            {option}
                          </label>
                        ))}
                    </div>
                  ) : (
                    <label className="sub" style={{ marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={draft.requireAll}
                        onChange={(event) => patch(index, { requireAll: event.target.checked })}
                        style={{ width: "auto", marginRight: 6 }}
                      />
                      全项通过才算合格
                    </label>
                  )}
                </div>
              ) : null}

              <div className="field wide">
                <label>字段提示（填表时显示在下面）</label>
                <input value={draft.noteZh} onChange={(event) => patch(index, { noteZh: event.target.value })} />
              </div>

              <div className="field wide checks">
                <label>
                  <input
                    type="checkbox"
                    checked={draft.optional}
                    onChange={(event) => patch(index, { optional: event.target.checked })}
                  />
                  选填（不填也能提交）
                </label>
                {draft.type === "text" ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.multiline}
                      onChange={(event) => patch(index, { multiline: event.target.checked })}
                    />
                    多行输入
                  </label>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ))}

      <button type="button" onClick={() => setDrafts((previous) => [...previous, emptyDraft()])}>
        + 加一个测量点
      </button>

      <h2>改完之后填表页长这样</h2>
      <Preview drafts={drafts} />

      <div className="card">
        {confirming ? (
          <>
            <p style={{ marginTop: 0 }}>
              保存会生成第 {props.nextVersion} 版。第 {props.currentVersion} 版原样留着，
              已有的 {props.entryCount} 条记录还按它们自己那一版显示，不会被改名或改限值影响。
            </p>
            <div className="row">
              <button type="button" onClick={() => setConfirming(false)}>
                取消
              </button>
              <button type="button" className="primary" onClick={save} disabled={pending}>
                保存为 v{props.nextVersion}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="primary" onClick={() => setConfirming(true)} disabled={pending}>
            保存为 v{props.nextVersion}
          </button>
        )}
      </div>
    </>
  );
}

/** 实时预览：改动即时反映到填写界面，不用保存了才知道长什么样 */
function Preview({ drafts }: { drafts: ColumnDraft[] }) {
  const columns = useMemo<Column[]>(
    () =>
      drafts.map((draft) => ({
        id: draft.id || `preview-${draft.labelZh}`,
        label: { zh: draft.labelZh || "（还没起名）", de: draft.labelDe },
        type: draft.type,
        unit: draft.unit || undefined,
        optional: draft.optional,
        note: draft.noteZh ? { zh: draft.noteZh } : undefined,
        limit:
          draft.min === "" && draft.max === "" && draft.tolerance === ""
            ? undefined
            : {
                ...(draft.min === "" ? {} : { min: Number(draft.min) }),
                ...(draft.max === "" ? {} : { max: Number(draft.max) }),
                ...(draft.tolerance === "" ? {} : { tolerance: Number(draft.tolerance) }),
              },
        options:
          draft.type === "choice"
            ? draft.optionsText
                .split("\n")
                .filter((line) => line.trim() !== "")
                .map((line) => ({ zh: line.split("|")[0]!.trim() }))
            : undefined,
        items:
          draft.type === "checklist"
            ? draft.optionsText
                .split("\n")
                .filter((line) => line.trim() !== "")
                .map((line) => ({ zh: line.split("|")[0]!.trim() }))
            : undefined,
        breachOn: draft.breachOn.length > 0 ? draft.breachOn : undefined,
        requireAll: draft.type === "checklist" ? draft.requireAll : undefined,
      })),
    [drafts],
  );

  return (
    <div className="card">
      <div className="fields">
        {columns.map((column) => {
          const state = checkColumn(column, {});
          return (
            <div className="field" key={column.id}>
              <label>
                {column.label.zh}
                {column.optional ? "（选填）" : ""}
                {column.limit
                  ? ` · ${[column.limit.min !== undefined ? `≥ ${column.limit.min}` : "", column.limit.max !== undefined ? `≤ ${column.limit.max}` : ""].filter(Boolean).join(" · ")}${column.unit ? ` ${column.unit}` : ""}`
                  : ""}
              </label>
              {column.type === "choice" ? (
                <div className="choices">
                  {(column.options ?? []).map((option) => (
                    <button type="button" key={option.zh} disabled>
                      {option.zh}
                    </button>
                  ))}
                </div>
              ) : column.type === "checklist" ? (
                <div className="checks">
                  {(column.items ?? []).map((item) => (
                    <label key={item.zh}>
                      <input type="checkbox" disabled /> {item.zh}
                    </label>
                  ))}
                </div>
              ) : (
                <input disabled placeholder={column.unit ?? ""} />
              )}
              {state.level === "missing" ? <div className="msg hint">必填</div> : null}
              {column.note ? <div className="msg hint">{column.note.zh}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
