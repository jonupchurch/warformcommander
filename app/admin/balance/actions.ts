"use server";

/**
 * Admin balance Server Action (Feature 12, US1/US2 — admin-api.md). The **layer-3** authorization
 * check: a Server Action is directly callable (a client can POST to it without ever rendering the
 * gated layout), so it re-checks `requireAdmin()` server-side here — never trusting that the layout
 * or `proxy.ts` ran (research B1; a forged `admin` client value is structurally ignored). On success
 * it revalidates the editor's cached read so the display reflects the new revision (the resolve path
 * never caches, so it needs no invalidation).
 */

import { revalidatePath } from "next/cache";

import { saveRuleset, type SaveRulesetResult } from "@/server/ruleset";
import { requireAdmin } from "@/server/session";
import type { Ruleset } from "@/sim/ruleset";

export interface SaveRulesetInput {
  data: Ruleset;
  expectedVersion: number;
  note?: string;
}

export async function saveRulesetAction(input: SaveRulesetInput): Promise<SaveRulesetResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { error: "NOT_ADMIN" };
  }
  const result = await saveRuleset(admin, input);
  if (!("error" in result)) revalidatePath("/admin/balance");
  return result;
}
