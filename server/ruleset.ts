/**
 * The **live-ruleset store** (Feature 12) — the real Postgres-backed implementation that replaces
 * Feature 8's v1-default placeholder. The single source of truth for "the current balance table":
 * the resolve path reads it authoritatively on every match (no stale window, SC-008); an admin edits
 * it here, and the edit takes effect for the **next** match with no redeploy (FR-006/FR-010).
 *
 * A save is one atomic transaction — a new append-only `rulesets` revision, the `current_ruleset`
 * pointer swap (guarded by an optimistic `version`, FR-012), and one auto-published `balance` post
 * (FR-013/014) — committing together or not at all. Recorded replays are self-contained (they carry
 * their own `rulesetHash` + snapshots) and are **never** touched by an edit (SC-003).
 *
 * **Server only** (DB + wasm hash).
 */

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { currentRuleset, posts, rulesets } from "@/db/schema";
import { assertAdmin, type SessionUser } from "@/server/authz";
import { diffRuleset, renderDiffOneLiner, renderDiffSummary, type RulesetDiffEntry } from "@/server/ruleset-diff";
import { validateRuleset } from "@/server/ruleset-validate";
import { hashRuleset } from "@/sim/ruleset-hash";
import type { Ruleset } from "@/sim/ruleset";
import { loadDefaultRuleset } from "@/sim/validate";

/** The authoritative current ruleset the resolve path reads. */
export interface CurrentRuleset {
  revisionId: string;
  ruleset: Ruleset;
  rulesetHash: string;
}

/** The editor's loaded state — includes the concurrency `version` it must echo back on save. */
export interface RulesetForEdit {
  revisionId: string;
  data: Ruleset;
  rulesetHash: string;
  version: number;
}

export type SaveRulesetResult =
  | { noop: true; revisionId: string; rulesetHash: string; version: number }
  | { noop: false; revisionId: string; rulesetHash: string; version: number; postId: string }
  | { error: "VALIDATION_FAILED"; reason: string }
  | { error: "STALE_EDIT" }
  | { error: "NOT_ADMIN" };

/** Thrown inside the save transaction to force a rollback when the optimistic version check loses. */
class StaleEditError extends Error {}

/** Read the current revision joined to its data + concurrency version, or `null` if unseeded. */
async function loadCurrentRow(): Promise<RulesetForEdit | null> {
  const [row] = await getDb()
    .select({
      revisionId: rulesets.id,
      data: rulesets.data,
      rulesetHash: rulesets.rulesetHash,
      version: currentRuleset.version,
    })
    .from(currentRuleset)
    .innerJoin(rulesets, eq(rulesets.id, currentRuleset.rulesetId))
    .where(eq(currentRuleset.id, "current"))
    .limit(1);
  return row ?? null;
}

/**
 * Cold-start seed (FR-009): insert the engine's canonical default as revision 1 and point
 * `current_ruleset` at it. Race-safe — the pointer insert is `ON CONFLICT DO NOTHING` on the
 * singleton PK, so a concurrent first-read never double-points (a losing racer's orphan revision is
 * harmless; history is append-only). Mirrors Feature 7's never-empty-by-seed cold-start (P5).
 */
async function bootstrapCurrentRuleset(): Promise<void> {
  const data = loadDefaultRuleset();
  const rulesetHash = hashRuleset(data);
  await getDb().transaction(async (tx) => {
    const [rev] = await tx
      .insert(rulesets)
      .values({ data, rulesetHash, editorId: null, parentId: null, note: "bootstrap seed" })
      .returning({ id: rulesets.id });
    await tx
      .insert(currentRuleset)
      .values({ id: "current", rulesetId: rev.id, version: 1 })
      .onConflictDoNothing();
  });
}

/** The current row, seeding the default on first access so it is never empty (FR-009). */
async function ensureCurrentRow(): Promise<RulesetForEdit> {
  let row = await loadCurrentRow();
  if (!row) {
    await bootstrapCurrentRuleset();
    row = await loadCurrentRow();
  }
  if (!row) throw new Error("ruleset store: bootstrap failed to establish a current ruleset");
  return row;
}

/**
 * The authoritative current ruleset — read **fresh from Postgres** on every call (no per-instance
 * cache), so a saved edit is visible to the very next match (SC-008, P6). Feature 8's resolve path
 * calls this to obtain the `ruleset` it passes into `resolve` (the seam that replaced
 * `loadCurrentRuleset()`).
 */
export async function getCurrentRuleset(): Promise<CurrentRuleset> {
  const row = await ensureCurrentRow();
  return { revisionId: row.revisionId, ruleset: row.data, rulesetHash: row.rulesetHash };
}

/** The current ruleset + its concurrency `version`, for the admin editor to load (admin-only). */
export async function getRulesetForEdit(actor: SessionUser): Promise<RulesetForEdit> {
  assertAdmin(actor);
  return ensureCurrentRow();
}

/**
 * Save an edited ruleset (admin-only). Validates → diffs against the current revision → short-circuits
 * a no-op → otherwise runs one transaction: append the revision, swap the pointer (guarded by
 * `expectedVersion`), and auto-publish one `balance` post. Returns a typed result; never a raw DB error.
 */
export async function saveRuleset(
  actor: SessionUser,
  input: { data: Ruleset; expectedVersion: number; note?: string },
): Promise<SaveRulesetResult> {
  try {
    assertAdmin(actor);
  } catch {
    return { error: "NOT_ADMIN" };
  }

  // Trust boundary: reject a structurally invalid / out-of-bounds ruleset BEFORE any persistence.
  const validation = validateRuleset(input.data);
  if (!validation.ok) return { error: "VALIDATION_FAILED", reason: validation.reason };

  const current = await ensureCurrentRow();
  const diff = diffRuleset(current.data, input.data);

  // No-op save: nothing changed ⇒ no new revision, no post (FR-015).
  if (diff.length === 0) {
    return { noop: true, revisionId: current.revisionId, rulesetHash: current.rulesetHash, version: current.version };
  }

  const rulesetHash = hashRuleset(input.data);

  try {
    return await getDb().transaction(async (tx) => {
      const [rev] = await tx
        .insert(rulesets)
        .values({
          data: input.data,
          rulesetHash,
          editorId: actor.id,
          parentId: current.revisionId,
          note: input.note ?? null,
        })
        .returning({ id: rulesets.id });

      const swapped = await tx
        .update(currentRuleset)
        .set({ rulesetId: rev.id, version: sql`${currentRuleset.version} + 1`, updatedAt: new Date() })
        .where(and(eq(currentRuleset.id, "current"), eq(currentRuleset.version, input.expectedVersion)))
        .returning({ version: currentRuleset.version });

      if (swapped.length === 0) throw new StaleEditError(); // another admin saved first — roll back

      const [post] = await tx
        .insert(posts)
        .values(balancePostValues(rev.id, current.revisionId, rulesetHash, diff, actor.id))
        .returning({ id: posts.id });

      return { noop: false, revisionId: rev.id, rulesetHash, version: swapped[0].version, postId: post.id };
    });
  } catch (error) {
    if (error instanceof StaleEditError) return { error: "STALE_EDIT" };
    throw error;
  }
}

/** The auto-published `balance` post for a changing save (FR-014, data-model → Balance post shape). */
function balancePostValues(
  revisionId: string,
  parentId: string,
  rulesetHash: string,
  diff: RulesetDiffEntry[],
  editorId: string,
) {
  const changeCount = diff.length;
  return {
    slug: `balance-${revisionId.slice(0, 8)}`,
    title: `Balance Update — ${changeCount} change${changeCount === 1 ? "" : "s"}`,
    excerpt: renderDiffOneLiner(diff),
    body: renderDiffSummary(diff),
    type: "balance" as const,
    status: "published" as const,
    authorId: editorId,
    metadata: { diff, rulesetId: revisionId, rulesetHash, parentId },
    publishedAt: new Date(),
  };
}
