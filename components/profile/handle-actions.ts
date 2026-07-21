"use server";

import { revalidatePath } from "next/cache";

import { setHandle } from "@/server/handle";
import { requireSession } from "@/server/session";

export type RenameHandleResult = { ok: true; handle: string } | { ok: false; error: string };

/** Change the signed-in commander's handle from their profile (Feature 7 — handles are editable). */
export async function renameHandle(raw: string): Promise<RenameHandleResult> {
  const user = await requireSession();
  const res = await setHandle(user, raw);
  if (!res.ok) return { ok: false, error: res.reason ?? "Could not update your handle." };
  revalidatePath("/profile");
  return { ok: true, handle: res.value.handle };
}
