/**
 * US3 — defense snapshots. Designation freezes an immutable copy (edits to the source never touch
 * it, SC-004); re-designation makes a new snapshot and never mutates the old; a designated squad
 * leaves the attack pool (SC-005); the ≤3 cap / slot distinctness is a **DB** guard under a race; and
 * a snapshot referenced by history is retained (soft-deactivated), never destroyed (FR-014).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { defenseSnapshots, matches } from "@/db/schema";
import { saveSquad, updateSquad, deleteSquad, listAttackable } from "@/server/squads";
import {
  designateDefense,
  redesignateDefense,
  undesignateDefense,
  listDefense,
} from "@/server/defense";
import { truncateAll, closeDb, createTestUser } from "./db-setup";
import { validSquad, validSquadB } from "./fixtures";

beforeEach(truncateAll);
afterAll(closeDb);

/** Save N squads into roster slots 0..N-1; return their ids. */
async function saveSquads(actor: { id: string; role: "player" | "admin" }, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await saveSquad(actor, { slotIndex: i, name: `S${i}`, config: validSquad() });
    if (!r.ok) throw new Error(`save failed: ${r.error}`);
    ids.push(r.value.id);
  }
  return ids;
}

async function reloadSnapshot(id: string) {
  const [row] = await getDb().select().from(defenseSnapshots).where(eq(defenseSnapshots.id, id)).limit(1);
  return row;
}

describe("immutability (SC-004, US3-AS2/3)", () => {
  it("editing the source squad never changes an existing snapshot; re-designation adds a new one", async () => {
    const actor = await createTestUser();
    const [id] = await saveSquads(actor, 1);

    const des = await designateDefense(actor, { squadId: id, slot: 0 });
    expect(des.ok).toBe(true);
    if (!des.ok) return;
    const snap1Id = des.value.id;

    // Edit the source squad to a different valid army, several times.
    for (let i = 0; i < 3; i++) {
      const upd = await updateSquad(actor, id, { config: validSquadB() });
      expect(upd.ok).toBe(true);
    }
    // The original snapshot is unchanged.
    expect((await reloadSnapshot(snap1Id)).config).toEqual(validSquad());

    // Re-designation captures the current (edited) config in a NEW row; the old is deactivated, never mutated.
    const re = await redesignateDefense(actor, id);
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    expect(re.value.id).not.toBe(snap1Id);
    expect(re.value.config).toEqual(validSquadB());
    expect(re.value.active).toBe(true);

    const old = await reloadSnapshot(snap1Id);
    expect(old.active).toBe(false);
    expect(old.config).toEqual(validSquad()); // never mutated
    expect((await listDefense(actor)).ok).toBe(true);
  });
});

describe("pool exclusivity (SC-005, US3-AS5)", () => {
  it("a designated squad leaves the attack pool; all-designated ⇒ empty pool", async () => {
    const actor = await createTestUser();
    const [s0, s1, s2] = await saveSquads(actor, 3);

    expect((await designateDefense(actor, { squadId: s0, slot: 0 })).ok).toBe(true);
    let pool = await listAttackable(actor);
    expect(pool.ok && pool.value.map((s) => s.id).sort()).toEqual([s1, s2].sort());

    expect((await designateDefense(actor, { squadId: s1, slot: 1 })).ok).toBe(true);
    expect((await designateDefense(actor, { squadId: s2, slot: 2 })).ok).toBe(true);
    pool = await listAttackable(actor);
    expect(pool.ok && pool.value).toHaveLength(0); // no free squad to attack with
    expect((await listDefense(actor)).ok && (await listDefense(actor)).ok).toBe(true);
  });
});

describe("≤3 cap + slot distinctness are DB invariants (SC-005, US3-AS4)", () => {
  it("rejects a slot beyond 0..2 and a concurrent double-designation to the same slot", async () => {
    const actor = await createTestUser();
    const [s0, s1] = await saveSquads(actor, 2);

    // Out-of-range slot (a genuine 4th slot) is rejected.
    const beyond = await designateDefense(actor, { squadId: s0, slot: 3 });
    expect(beyond.ok).toBe(false);
    if (!beyond.ok) expect(beyond.error).toBe("DEFENSE_CAP_EXCEEDED");

    // Two squads race for the SAME slot — the partial-unique index (not app code) rejects the loser.
    const [r0, r1] = await Promise.all([
      designateDefense(actor, { squadId: s0, slot: 0 }),
      designateDefense(actor, { squadId: s1, slot: 0 }),
    ]);
    const wins = [r0, r1].filter((r) => r.ok).length;
    const races = [r0, r1].filter((r) => !r.ok && r.error === "SLOT_OCCUPIED_RACE").length;
    expect(wins).toBe(1);
    expect(races).toBe(1);

    // Exactly one ACTIVE snapshot exists at slot 0.
    const active = await getDb()
      .select()
      .from(defenseSnapshots)
      .where(and(eq(defenseSnapshots.defenseSlot, 0), eq(defenseSnapshots.active, true)));
    expect(active).toHaveLength(1);
  });
});

describe("snapshot retention (FR-014, US3-AS6)", () => {
  it("undesignating and deleting the source squad retain the (soft-deactivated) snapshot", async () => {
    const actor = await createTestUser();
    const [id] = await saveSquads(actor, 1);
    const des = await designateDefense(actor, { squadId: id, slot: 0 });
    expect(des.ok).toBe(true);
    if (!des.ok) return;
    const snapId = des.value.id;

    // A historical match references the snapshot.
    await getDb().insert(matches).values({
      mode: "ranked",
      adaptation: "locked",
      winnerSide: "attacker",
      attackerGamesWon: 2,
      defenderGamesWon: 0,
      defenderSnapshotId: snapId,
      seed: "123",
      rulesetHash: "deadbeef",
      formatVersion: 1,
    });

    // Undesignate → snapshot soft-deactivated but retained.
    expect((await undesignateDefense(actor, id)).ok).toBe(true);
    let snap = await reloadSnapshot(snapId);
    expect(snap).toBeTruthy();
    expect(snap.active).toBe(false);

    // Delete the source squad → snapshot persists with sourceSquadId nulled (FK set null).
    expect((await deleteSquad(actor, id)).ok).toBe(true);
    snap = await reloadSnapshot(snapId);
    expect(snap).toBeTruthy();
    expect(snap.sourceSquadId).toBeNull();
  });
});
