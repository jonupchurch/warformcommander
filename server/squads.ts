/**
 * Roster service (Feature 7, US2) — a signed-in player's saved squads. Every write validates the
 * config against the shared engine `validate()` before it touches the DB (A4/SC-003: no illegal army
 * persisted) and derives the matchmaking power rating from the same call. Ownership (A2) is checked
 * on every read/write/delete; the actor is resolved at the boundary (`requireSession`), never a
 * client id.
 *
 * Server-only.
 */

import { and, asc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { squads } from "@/db/schema";
import type { SquadConfig } from "@/db/types";
import { validateSquad } from "@/sim/validate";

import { type SessionUser } from "./authz";
import { err, ok, type Result } from "./result";
import { getCurrentRuleset } from "./ruleset";

export type Squad = typeof squads.$inferSelect;

/** Baseline roster cap (FR-009). The schema allows slots 0..63; a future non-P2W bundle raises this. */
export const BASELINE_SLOTS = 8;

/** Save a new squad into a roster slot. Rejects an illegal army, a full slot, and an over-cap slot. */
export async function saveSquad(
  actor: SessionUser,
  input: { slotIndex: number; name: string; config: SquadConfig },
): Promise<Result<Squad>> {
  if (input.slotIndex < 0 || input.slotIndex >= BASELINE_SLOTS) {
    return err("SLOT_CAP_EXCEEDED", `slot ${input.slotIndex} is beyond the ${BASELINE_SLOTS}-slot baseline`);
  }
  // Validate against the LIVE ruleset (what battles resolve against), so a build using hot-added
  // equipment is accepted here iff it would be legal in battle — never the frozen engine default.
  const { ruleset } = await getCurrentRuleset();
  const v = validateSquad(input.config, ruleset);
  if (!v.ok) return err("VALIDATION_FAILED", v.errors.map((e) => `${e.code}: ${e.reason}`).join("; "));

  const db = getDb();
  const taken = await db
    .select({ id: squads.id })
    .from(squads)
    .where(and(eq(squads.userId, actor.id), eq(squads.slotIndex, input.slotIndex)))
    .limit(1);
  if (taken.length) return err("SLOT_TAKEN", `roster slot ${input.slotIndex} is occupied`);

  const [row] = await db
    .insert(squads)
    .values({
      userId: actor.id,
      name: input.name,
      slotIndex: input.slotIndex,
      config: input.config,
      powerRating: v.powerRating,
    })
    .returning();
  return ok(row);
}

/** Load one of the actor's squads by id. */
export async function loadSquad(actor: SessionUser, id: string): Promise<Result<Squad>> {
  const [row] = await getDb().select().from(squads).where(eq(squads.id, id)).limit(1);
  if (!row) return err("NOT_FOUND");
  if (row.userId !== actor.id) return err("NOT_OWNER");
  return ok(row);
}

/** The actor's full roster, ordered by slot. */
export async function listSquads(actor: SessionUser): Promise<Result<Squad[]>> {
  const rows = await getDb()
    .select()
    .from(squads)
    .where(eq(squads.userId, actor.id))
    .orderBy(asc(squads.slotIndex));
  return ok(rows);
}

/** The actor's **attackable** squads — those not currently designated for defense (US3-AS5). */
export async function listAttackable(actor: SessionUser): Promise<Result<Squad[]>> {
  const rows = await getDb()
    .select()
    .from(squads)
    .where(and(eq(squads.userId, actor.id), isNull(squads.defenseSlot)))
    .orderBy(asc(squads.slotIndex));
  return ok(rows);
}

/** Rename / overwrite / move a squad. Re-validates a new config and bumps `updatedAt`. */
export async function updateSquad(
  actor: SessionUser,
  id: string,
  patch: { name?: string; config?: SquadConfig; slotIndex?: number },
): Promise<Result<Squad>> {
  const db = getDb();
  const [row] = await db.select().from(squads).where(eq(squads.id, id)).limit(1);
  if (!row) return err("NOT_FOUND");
  if (row.userId !== actor.id) return err("NOT_OWNER");

  const set: Partial<typeof squads.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.config !== undefined) {
    const { ruleset } = await getCurrentRuleset();
    const v = validateSquad(patch.config, ruleset);
    if (!v.ok) return err("VALIDATION_FAILED", v.errors.map((e) => `${e.code}: ${e.reason}`).join("; "));
    set.config = patch.config;
    set.powerRating = v.powerRating;
  }
  if (patch.slotIndex !== undefined && patch.slotIndex !== row.slotIndex) {
    if (patch.slotIndex < 0 || patch.slotIndex >= BASELINE_SLOTS) {
      return err("SLOT_CAP_EXCEEDED", `slot ${patch.slotIndex} is beyond the ${BASELINE_SLOTS}-slot baseline`);
    }
    const taken = await db
      .select({ id: squads.id })
      .from(squads)
      .where(and(eq(squads.userId, actor.id), eq(squads.slotIndex, patch.slotIndex)))
      .limit(1);
    if (taken.length) return err("SLOT_TAKEN", `roster slot ${patch.slotIndex} is occupied`);
    set.slotIndex = patch.slotIndex;
  }

  const [updated] = await db.update(squads).set(set).where(eq(squads.id, id)).returning();
  return ok(updated);
}

/** Delete one of the actor's squads. Referencing snapshots/matches are retained (FK set null). A squad
 *  currently assigned to a defense slot cannot be deleted — undesignate it first (trust boundary: the
 *  guard is here, not just in the UI). */
export async function deleteSquad(actor: SessionUser, id: string): Promise<Result<void>> {
  const db = getDb();
  const [row] = await db
    .select({ userId: squads.userId, defenseSlot: squads.defenseSlot })
    .from(squads)
    .where(eq(squads.id, id))
    .limit(1);
  if (!row) return err("NOT_FOUND");
  if (row.userId !== actor.id) return err("NOT_OWNER");
  if (row.defenseSlot !== null) {
    return err("SQUAD_DESIGNATED", "undesignate the squad from defense before deleting it");
  }
  await db.delete(squads).where(eq(squads.id, id));
  return ok(undefined);
}
