"use server";

import { revalidatePath } from "next/cache";
import { apiSend } from "@/lib/api";

export async function voidEntryAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "");
  const result = await apiSend(`/haccp/entries/${id}/void`, { reason });
  revalidatePath(`/records/${id}`);
  revalidatePath("/records");
  if (!result.ok) throw new Error(result.error.message);
}
