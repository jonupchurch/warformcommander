/**
 * Commander handle assignment (Feature 7 onboarding) — the server-authoritative write behind the
 * registration gate and the profile rename control. Validates with the shared rules, enforces
 * **case-insensitive** uniqueness (so `Ace` and `ace` can't coexist), then sets `users.handle` for the
 * acting user only (identity originates server-side — the actor is the resolved session, never a
 * client id). Returns a typed {@link Result}; never a raw DB error.
 */

import { and, eq, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { handleKey, validateHandle } from "@/lib/handle";

import type { SessionUser } from "./authz";
import { err, ok, type Result } from "./result";

/** Claim or change the acting commander's handle. `VALIDATION_FAILED` (format) / `HANDLE_TAKEN` (dupe). */
export async function setHandle(user: SessionUser, raw: string): Promise<Result<{ handle: string }>> {
  const check = validateHandle(raw);
  if (!check.ok) return err("VALIDATION_FAILED", check.reason);

  const db = getDb();
  const key = handleKey(check.value);

  // Case-insensitive uniqueness among *other* users (re-saving your own handle is a no-op, not a clash).
  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.handle}) = ${key}`, ne(users.id, user.id)))
    .limit(1);
  if (clash.length > 0) return err("HANDLE_TAKEN", "That handle is already taken.");

  try {
    await db.update(users).set({ handle: check.value }).where(eq(users.id, user.id));
  } catch {
    // The DB's unique(handle) constraint caught a same-case race the SELECT above missed.
    return err("HANDLE_TAKEN", "That handle is already taken.");
  }
  return ok({ handle: check.value });
}
