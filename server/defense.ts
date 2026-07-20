/**
 * Defense-snapshot service (Feature 7, US3) — the heart of async-PvP fairness (P5/P6).
 *
 * Designating a squad **freezes an immutable copy** of its config; later edits to the source squad
 * never touch it. The ≤3 cap, slot distinctness, and attack/defense pool exclusivity are **DB
 * invariants** (partial-unique indexes + copy-on-designate), not just app checks — every mutation
 * runs in a transaction and relies on the indexes as the final race guard (A6).
 *
 * Server-only.
 */

import { and, asc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { squads, defenseSnapshots } from "@/db/schema";

import { type SessionUser } from "./authz";
import { err, ok, type Result } from "./result";

export type DefenseSnapshot = typeof defenseSnapshots.$inferSelect;

/** The number of base-defense slots (0..2) — a structural cap (DB check + partial-unique). */
export const MAX_DEFENSE_SLOTS = 3;

/** Postgres unique-violation (23505) — the partial-unique defense-slot index rejecting a race. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/**
 * Designate a **non-designated** squad into a free defense slot (0..2). Transactional: insert a frozen
 * snapshot (active) then move the squad out of the attack pool; the partial-unique indexes reject a
 * race that would create a 4th active snapshot or a duplicate slot (SLOT_OCCUPIED_RACE).
 */
export async function designateDefense(
  actor: SessionUser,
  input: { squadId: string; slot: number },
): Promise<Result<DefenseSnapshot>> {
  const { squadId, slot } = input;
  if (slot < 0 || slot >= MAX_DEFENSE_SLOTS) {
    return err("DEFENSE_CAP_EXCEEDED", `slot ${slot} is beyond the ${MAX_DEFENSE_SLOTS} defense slots`);
  }
  const db = getDb();
  const [s] = await db.select().from(squads).where(eq(squads.id, squadId)).limit(1);
  if (!s) return err("NOT_FOUND");
  if (s.userId !== actor.id) return err("NOT_OWNER");
  if (s.defenseSlot !== null) return err("ALREADY_DESIGNATED");

  try {
    return await db.transaction(async (tx) => {
      const [snap] = await tx
        .insert(defenseSnapshots)
        .values({
          userId: actor.id,
          sourceSquadId: s.id,
          name: s.name,
          config: s.config, // FROZEN copy at designation instant
          powerRating: s.powerRating,
          schemaVersion: s.schemaVersion,
          defenseSlot: slot,
          active: true,
        })
        .returning();
      // Conditional move out of the attack pool — 0 rows ⇒ the squad was designated concurrently.
      const moved = await tx
        .update(squads)
        .set({ defenseSlot: slot })
        .where(and(eq(squads.id, s.id), isNull(squads.defenseSlot)))
        .returning({ id: squads.id });
      if (moved.length === 0) throw Object.assign(new Error("squad race"), { code: "SQUAD_RACE" });
      return ok(snap);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return err("SLOT_OCCUPIED_RACE", `defense slot ${slot} is occupied`);
    if ((e as { code?: string })?.code === "SQUAD_RACE") return err("ALREADY_DESIGNATED");
    throw e;
  }
}

/**
 * Re-designate an already-designated squad at its **current** slot: deactivate the old snapshot and
 * insert a **new** one capturing the squad's current config. The old row is never mutated
 * (immutability, US3-AS3) — re-designation is how an edited defense is pushed live.
 */
export async function redesignateDefense(
  actor: SessionUser,
  squadId: string,
): Promise<Result<DefenseSnapshot>> {
  const db = getDb();
  const [s] = await db.select().from(squads).where(eq(squads.id, squadId)).limit(1);
  if (!s) return err("NOT_FOUND");
  if (s.userId !== actor.id) return err("NOT_OWNER");
  if (s.defenseSlot === null) return err("NOT_DESIGNATED");
  const slot = s.defenseSlot;

  return await db.transaction(async (tx) => {
    await tx
      .update(defenseSnapshots)
      .set({ active: false, deactivatedAt: new Date() })
      .where(
        and(
          eq(defenseSnapshots.userId, actor.id),
          eq(defenseSnapshots.defenseSlot, slot),
          eq(defenseSnapshots.active, true),
        ),
      );
    const [snap] = await tx
      .insert(defenseSnapshots)
      .values({
        userId: actor.id,
        sourceSquadId: s.id,
        name: s.name,
        config: s.config, // fresh frozen copy of the current config
        powerRating: s.powerRating,
        schemaVersion: s.schemaVersion,
        defenseSlot: slot,
        active: true,
      })
      .returning();
    return ok(snap);
  });
}

/**
 * Undesignate a squad: return it to the attack pool and **soft-deactivate** its snapshot (retained,
 * never destroyed, so a match that referenced it stays valid — FR-014).
 */
export async function undesignateDefense(
  actor: SessionUser,
  squadId: string,
): Promise<Result<void>> {
  const db = getDb();
  const [s] = await db.select().from(squads).where(eq(squads.id, squadId)).limit(1);
  if (!s) return err("NOT_FOUND");
  if (s.userId !== actor.id) return err("NOT_OWNER");
  if (s.defenseSlot === null) return err("NOT_DESIGNATED");

  await db.transaction(async (tx) => {
    await tx.update(squads).set({ defenseSlot: null }).where(eq(squads.id, s.id));
    await tx
      .update(defenseSnapshots)
      .set({ active: false, deactivatedAt: new Date() })
      .where(
        and(
          eq(defenseSnapshots.userId, actor.id),
          eq(defenseSnapshots.sourceSquadId, s.id),
          eq(defenseSnapshots.active, true),
        ),
      );
  });
  return ok(undefined);
}

/** The actor's active defense snapshots (≤3), ordered by slot — what matchmaking serves from. */
export async function listDefense(actor: SessionUser): Promise<Result<DefenseSnapshot[]>> {
  const rows = await getDb()
    .select()
    .from(defenseSnapshots)
    .where(and(eq(defenseSnapshots.userId, actor.id), eq(defenseSnapshots.active, true)))
    .orderBy(asc(defenseSnapshots.defenseSlot));
  return ok(rows);
}
