"use server";

import { setHandle } from "@/server/handle";
import { requireSession } from "@/server/session";

export type ClaimHandleResult = { ok: true } | { ok: false; error: string };

/**
 * Claim a commander handle at registration (Feature 7 onboarding). Server-authoritative: the actor is
 * the resolved session, never a client id. Returns a typed result; the client navigates into the app
 * on success (the DB-session strategy surfaces the new handle on the next request, clearing the gate).
 */
export async function claimHandle(raw: string): Promise<ClaimHandleResult> {
  const user = await requireSession();
  const res = await setHandle(user, raw);
  return res.ok ? { ok: true } : { ok: false, error: res.reason ?? "Could not set that handle." };
}
