/**
 * Shared seed helpers — keep the cold-start seed (`seed.ts`) and the test-bot seed
 * (`seed-test-bots.ts`) in agreement on how a bot's active defense snapshot is (re)written.
 *
 * `upsertActiveDefense` makes both seeds **refresh-aware**: a slot with no active snapshot is filled;
 * a slot whose active snapshot no longer matches the intended army is **replaced** (defense snapshots
 * are immutable, so the stale one is deactivated and a fresh active one inserted — respecting the
 * one-active-per-(user,slot) invariant); an already-matching slot is left untouched (idempotent).
 */

import { and, eq } from "drizzle-orm";

import type { getDb } from "./index";
import { defenseSnapshots } from "./schema";
import type { SquadConfig } from "./types";

type Db = ReturnType<typeof getDb>;

/** A stable, key-order-independent fingerprint of a squad (type/variant/loadout/dials/zone per unit). */
export function configSignature(config: SquadConfig): string {
  return config.machines
    .map((m) => {
      const d = m.dials;
      // Tolerate a stale-schema config (e.g. a v2 snapshot still in the DB has no `targeting`): a
      // missing field just yields a different signature, which correctly triggers a refresh/replace.
      const t = d.targeting ?? ({} as Partial<NonNullable<typeof d.targeting>>);
      return [
        m.typeId,
        m.variantId,
        m.zone,
        m.loadout.weapon,
        m.loadout.defense,
        [...m.loadout.utilities].sort().join("+"),
        [t.priority1 ?? "", t.priority2 ?? "", t.fallback ?? "", d.movement, d.stance].join(","),
      ].join("/");
    })
    .join("|");
}

/** Fill / replace / keep a bot's active defense in one slot. Returns which happened. */
export async function upsertActiveDefense(
  db: Db,
  args: { userId: string; slot: number; name: string; config: SquadConfig; powerRating: number },
): Promise<"created" | "replaced" | "kept"> {
  const [current] = await db
    .select({ id: defenseSnapshots.id, config: defenseSnapshots.config })
    .from(defenseSnapshots)
    .where(
      and(
        eq(defenseSnapshots.userId, args.userId),
        eq(defenseSnapshots.defenseSlot, args.slot),
        eq(defenseSnapshots.active, true),
      ),
    )
    .limit(1);

  if (current && configSignature(current.config) === configSignature(args.config)) return "kept";

  await db.transaction(async (tx) => {
    if (current) {
      // Immutable snapshots: retire the stale one rather than mutating it (keeps the one-active invariant).
      await tx
        .update(defenseSnapshots)
        .set({ active: false, deactivatedAt: new Date() })
        .where(eq(defenseSnapshots.id, current.id));
    }
    await tx.insert(defenseSnapshots).values({
      userId: args.userId,
      name: args.name,
      config: args.config,
      powerRating: args.powerRating,
      defenseSlot: args.slot,
      active: true,
    });
  });

  return current ? "replaced" : "created";
}
