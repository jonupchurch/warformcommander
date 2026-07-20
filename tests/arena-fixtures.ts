/**
 * Feature-8 test fixtures (T004) — seed the arena pool: attackers with attackable squads, and
 * defenders (real + bot) each holding 1–3 active defense snapshots, plus assorted squads for the
 * practice draw. Inserts directly against the shared Feature-7 schema (config is a real engine-valid
 * army from `tests/fixtures.ts`, so it resolves).
 */

import { getDb } from '@/db';
import { defenseSnapshots, squads } from '@/db/schema';
import type { SquadConfig } from '@/sim/model';
import type { SessionUser } from '@/server/authz';

import { createTestUser } from './db-setup';
import { validSquad, validSquadB } from './fixtures';

/** Insert one active defense snapshot for a user; returns its id. */
export async function seedSnapshot(userId: string, slot: number, config: SquadConfig = validSquadB()): Promise<string> {
  const [row] = await getDb()
    .insert(defenseSnapshots)
    .values({ userId, sourceSquadId: null, name: `Defense ${slot}`, config, powerRating: 1000, defenseSlot: slot, active: true })
    .returning({ id: defenseSnapshots.id });
  return row!.id;
}

/** Insert an attackable squad (defenseSlot null) for a user; returns its id. */
export async function seedSquad(userId: string, slotIndex: number, config: SquadConfig = validSquad()): Promise<string> {
  const [row] = await getDb()
    .insert(squads)
    .values({ userId, name: `Squad ${slotIndex}`, slotIndex, config, powerRating: 1000, defenseSlot: null })
    .returning({ id: squads.id });
  return row!.id;
}

/** A user with one attackable squad — the caller in ranked/practice tests. */
export async function seedAttacker(): Promise<{ ctx: SessionUser; squadId: string }> {
  const ctx = await createTestUser();
  const squadId = await seedSquad(ctx.id, 0);
  return { ctx, squadId };
}

/** A defender (real or bot) holding `count` active snapshots (1–3). */
export async function seedDefender(opts: { isBot?: boolean; count?: number } = {}): Promise<{ userId: string; snapshotIds: string[] }> {
  const user = await createTestUser({ isBot: opts.isBot ?? false });
  const count = opts.count ?? 1;
  const snapshotIds: string[] = [];
  for (let slot = 0; slot < count; slot += 1) {
    snapshotIds.push(await seedSnapshot(user.id, slot));
  }
  return { userId: user.id, snapshotIds };
}
