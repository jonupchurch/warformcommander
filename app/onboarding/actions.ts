"use server";

import { redirect } from "next/navigation";

import { setHandle } from "@/server/handle";
import { requireSession } from "@/server/session";

export type ClaimHandleError = { error: string };

/**
 * Claim a commander handle at registration (Feature 7 onboarding). Server-authoritative: the actor is
 * the resolved session, never a client id. On success the action **redirects** into the app itself
 * (canonical mutate-then-navigate) — so the client never races `router.push` + `router.refresh`, which
 * left the "Claiming…" button stuck. On failure it returns a typed error for the form to surface.
 */
export async function claimHandle(raw: string): Promise<ClaimHandleError | undefined> {
  const user = await requireSession();
  const res = await setHandle(user, raw);
  if (!res.ok) return { error: res.reason ?? "Could not set that handle." };
  redirect("/garage"); // NEXT_REDIRECT — the framework navigates the client on success
}
