"use server";

import { revalidatePath } from "next/cache";
import { apiSend } from "@/lib/api";

export type ActionResult = { ok: true; id: string; status?: string } | { ok: false; code: string; message: string };

export async function saveDraftAction(payload: {
  templateId: string;
  entryDate: string;
  values: Record<string, unknown>;
}): Promise<ActionResult> {
  const result = await apiSend<{ id: string }>("/haccp/drafts", payload);
  if (!result.ok) return { ok: false, ...result.error };
  return { ok: true, id: result.data.id };
}

export async function submitAction(payload: {
  templateId: string;
  entryDate: string;
  values: Record<string, unknown>;
  correctiveAction?: string;
  lateReason?: string;
}): Promise<ActionResult> {
  const result = await apiSend<{ id: string; status: string }>("/haccp/entries", payload);
  if (!result.ok) return { ok: false, ...result.error };
  revalidatePath("/");
  revalidatePath("/records");
  return { ok: true, id: result.data.id, status: result.data.status };
}
