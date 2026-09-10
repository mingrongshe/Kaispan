"use server";

import { revalidatePath } from "next/cache";
import { apiSend } from "@/lib/api";
import type { ColumnDraft } from "./column-draft";

export async function setActiveAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  const result = await apiSend(`/haccp/manage/templates/${id}/active`, { active }, "PUT");
  revalidatePath("/templates");
  revalidatePath("/");
  if (!result.ok) throw new Error(result.error.message);
}

export type SaveResult = { ok: true; version: number } | { ok: false; message: string };

export async function saveVersionAction(payload: {
  templateId: string;
  nameZh: string;
  nameDe: string;
  columns: ColumnDraft[];
}): Promise<SaveResult> {
  const result = await apiSend<{ currentVersion: number }>(
    `/haccp/manage/templates/${payload.templateId}/versions`,
    {
      nameZh: payload.nameZh,
      nameDe: payload.nameDe,
      columns: payload.columns.map((column) => ({
        id: column.id || undefined,
        labelZh: column.labelZh,
        labelDe: column.labelDe || undefined,
        type: column.type,
        unit: column.unit || undefined,
        optional: column.optional,
        multiline: column.multiline,
        noteZh: column.noteZh || undefined,
        limit:
          column.min === "" && column.max === "" && column.tolerance === ""
            ? undefined
            : {
                min: column.min === "" ? null : Number(column.min),
                max: column.max === "" ? null : Number(column.max),
                tolerance: column.tolerance === "" ? null : Number(column.tolerance),
              },
        optionsText: column.optionsText || undefined,
        breachOn: column.breachOn,
        requireAll: column.requireAll,
      })),
    },
  );

  revalidatePath("/templates");
  revalidatePath("/");
  if (!result.ok) return { ok: false, message: result.error.message };
  return { ok: true, version: result.data.currentVersion };
}
