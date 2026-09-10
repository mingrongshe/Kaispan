"use server";

import { revalidatePath } from "next/cache";
import { apiSend } from "@/lib/api";

export async function setShiftAction(formData: FormData): Promise<void> {
  const date = String(formData.get("date"));
  const kind = String(formData.get("kind"));
  const userIds = formData.getAll("userIds").map(String).filter(Boolean);
  const result = await apiSend("/haccp/manage/shifts", { date, kind, userIds }, "PUT");
  revalidatePath("/shifts");
  revalidatePath("/");
  if (!result.ok) throw new Error(result.error.message);
}

export async function assignTemplateAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get("templateId"));
  const shiftKind = String(formData.get("shiftKind") ?? "");
  const fromDate = String(formData.get("fromDate"));
  const result = await apiSend(
    `/haccp/manage/templates/${templateId}/assignment`,
    { shiftKind: shiftKind === "" ? null : shiftKind, fromDate },
    "PUT",
  );
  revalidatePath("/shifts");
  revalidatePath("/");
  if (!result.ok) throw new Error(result.error.message);
}
