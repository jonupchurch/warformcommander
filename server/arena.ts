/**
 * Ranked orchestration (Feature 8, T015/T016) — preview (no WASM) and the single **P6 resolve/record
 * boundary** (the only WASM-invoking path here). The client supplies only which of its own squads
 * attacks and which previewed snapshot to commit against; the opponent selection, seed, ruleset, and
 * outcome are all server-decided, and `recordMatch` is called **exactly once**, immediately after the
 * local `resolveBattle`, never from a client-reachable signature (FR-009/010/012, US5, F7 rule A5).
 */

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { defenseSnapshots } from '@/db/schema';
import { armyPowerRating } from '@/sim/derive';
import { EngineError, resolveBattle } from '@/sim';
import { recordMatch } from '@/server/matches';
import { listAttackable } from '@/server/squads';
import type { SessionUser } from '@/server/authz';

import { fogPreview, type MatchTicket, type RankedMatchRequest } from './arena-types';
import { pickRankedOpponent } from './matchmaking';
import { err, ok, type Result } from './result';
import { loadCurrentRuleset } from './ruleset';
import { serverSeed } from './seed';

/**
 * Preview a ranked match (Server Action — no WASM, records nothing). Asserts the caller has ≥1
 * attackable squad (FR-001), runs matchmaking, and projects the served snapshot to a fogged
 * {@link MatchTicket} that binds the snapshot id for a later deploy. Re-invoke it to skip/re-roll.
 */
export async function previewRankedMatch(ctx: SessionUser): Promise<Result<MatchTicket>> {
  const attackable = await listAttackable(ctx);
  if (!attackable.ok) return attackable;
  if (attackable.value.length === 0) return err('NOT_ATTACKABLE', 'you have no attackable squad');

  const selection = await pickRankedOpponent(ctx);
  if (!selection.ok) return selection;

  const { ruleset } = loadCurrentRuleset();
  const power = armyPowerRating(selection.value.servedConfig, ruleset);
  return ok({
    defenderSnapshotId: selection.value.defenderSnapshotId,
    preview: fogPreview(selection.value.servedConfig, ruleset, power),
  });
}

/**
 * Deploy a ranked attack — resolve + record the whole Bo3 server-side, return only a match id. Reads
 * ONLY `attackSquadId`/`ticketSnapshotId` from `input` (its type has no other field). One
 * `resolveBattle` call with `adaptation:"Locked"` runs all three games against the one served army
 * (US3). The served snapshot is bound **by id** against the immutable frozen row regardless of its
 * current `active` flag (FR-008), and a self-match (own snapshot) is rejected (FR-004).
 */
export async function startRankedMatch(
  ctx: SessionUser,
  input: RankedMatchRequest,
): Promise<Result<{ matchId: string }>> {
  // Re-validate ownership + attackability at deploy time (FR-002).
  const attackable = await listAttackable(ctx);
  if (!attackable.ok) return attackable;
  const attackSquad = attackable.value.find((s) => s.id === input.attackSquadId);
  if (!attackSquad) return err('NOT_ATTACKABLE', 'that squad is not yours or not attackable');

  // Bind the served snapshot by id — the immutable frozen row, even if since deactivated (FR-008).
  const [snapshot] = await getDb()
    .select()
    .from(defenseSnapshots)
    .where(eq(defenseSnapshots.id, input.ticketSnapshotId))
    .limit(1);
  if (!snapshot) return err('INVALID_TICKET', 'the served snapshot no longer exists');
  if (snapshot.userId === ctx.id) return err('INVALID_TICKET', 'cannot attack your own defense');

  const { ruleset } = loadCurrentRuleset();
  const seed = serverSeed();

  let replay;
  try {
    const reader = await resolveBattle({
      armies: [attackSquad.config, snapshot.config],
      ruleset,
      seed,
      matchConfig: { adaptation: 'Locked', defenderSide: 'B', bestOf: 3 },
    });
    replay = reader.replay;
  } catch (error) {
    if (error instanceof EngineError) return err('VALIDATION_FAILED', error.status);
    throw error;
  }

  // The ONE write — server-computed result, immediately after resolve (P6, A5).
  return recordMatch({
    mode: 'ranked',
    attackerUserId: ctx.id,
    defenderUserId: snapshot.userId,
    attackerSquadId: attackSquad.id,
    defenderSnapshotId: snapshot.id,
    replay,
  });
}
