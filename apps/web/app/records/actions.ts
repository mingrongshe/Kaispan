"use server";

import { revalidatePath } from "next/cache";
import { apiSend, apiUpload } from "@/lib/api";

export async function voidEntryAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "");
  const result = await apiSend(`/haccp/entries/${id}/void`, { reason });
  revalidatePath(`/records/${id}`);
  revalidatePath("/records");
  if (!result.ok) throw new Error(result.error.message);
}

export async function uploadPhotoAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("先选一张照片");

  const result = await apiUpload(`/haccp/entries/${id}/photos`, file);
  revalidatePath(`/records/${id}`);
  revalidatePath(`/issues/${id}`);
  if (!result.ok) throw new Error(result.error.message);
}
