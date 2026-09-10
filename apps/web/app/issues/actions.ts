"use server";

import { revalidatePath } from "next/cache";
import { apiSend } from "@/lib/api";

export async function resolveIssueAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const payload = equipmentId
    ? { equipmentId, workOrderNote: String(formData.get("workOrderNote") ?? "") }
    : { note: String(formData.get("note") ?? "") };

  const result = await apiSend(`/haccp/manage/issues/${id}/resolve`, payload);
  revalidatePath(`/issues/${id}`);
  revalidatePath("/");
  if (!result.ok) throw new Error(result.error.message);
}

export async function completeWorkOrderAction(formData: FormData): Promise<void> {
  const workOrderId = String(formData.get("workOrderId"));
  const entryId = String(formData.get("entryId"));
  const result = await apiSend(`/equipment/work-orders/${workOrderId}/complete`, {
    result: String(formData.get("result") ?? ""),
  });
  revalidatePath(`/issues/${entryId}`);
  revalidatePath("/");
  if (!result.ok) throw new Error(result.error.message);
}
