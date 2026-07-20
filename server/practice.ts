/**
 * Practice orchestration (Feature 8, T038) — the no-stakes sandbox. Mirrors `startRankedMatch`'s
 * resolve/record shape with three differences: the opponent is a `squads` config (not a frozen
 * snapshot), `matchConfig.adaptation = "Free"`, and `recordMatch({ mode:"practice" })` writes a
 * match+replay but **moves no `ladder_standings` value** and keeps the opponent anonymous
 * (`defenderUserId: null`) so no response can leak the opponent's identity (FR-014/FR-015).
 */

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { squads } from '@/db/schema';
import { EngineError, resolveBattle } from '@/sim';
import { recordMatch } from '@/server/matches';
import { loadSquad } from '@/server/squads';
import type { SessionUser } from '@/server/authz';

import type { PracticeDraw, PracticeMatchRequest } from './arena-types';
import { drawPracticeOpponent } from './matchmaking';
import { err, type Result } from './result';
import { loadCurrentRuleset } from './ruleset';
import { serverSeed } from './seed';

/** Re-draw a practice opponent (Server Action), avoiding the currently-shown squad. Records nothing. */
export async function refreshPracticeOpponent(
  ctx: SessionUser,
  currentDrawSquadId?: string,
): Promise<Result<PracticeDraw>> {
  return drawPracticeOpponent(ctx, currentDrawSquadId ? [currentDrawSquadId] : []);
}

/**
 * Deploy a practice match — resolve + record server-side, return a match id. Uses the player's own
 * (owned) attack squad and the drawn opponent squad (self-excluded), resolves with `adaptation:"Free"`,
 * and records `mode:"practice"` (no standing change). The opponent identity is never persisted.
 */
export async function startPracticeMatch(
  ctx: SessionUser,
  input: PracticeMatchRequest,
): Promise<Result<{ matchId: string }>> {
  const attack = await loadSquad(ctx, input.attackSquadId);
  if (!attack.ok) return err('NOT_ATTACKABLE', 'that squad is not yours');

  const [opponent] = await getDb().select().from(squads).where(eq(squads.id, input.opponentSquadId)).limit(1);
  if (!opponent) return err('NO_PRACTICE_OPPONENT', 'the drawn opponent no longer exists');
  if (opponent.userId === ctx.id) return err('NO_PRACTICE_OPPONENT', 'cannot practice against your own squad');

  const { ruleset } = loadCurrentRuleset();
  const seed = serverSeed();

  let replay;
  try {
    const reader = await resolveBattle({
      armies: [attack.value.config, opponent.config],
      ruleset,
      seed,
      matchConfig: { adaptation: 'Free', defenderSide: 'B', bestOf: 3 },
    });
    replay = reader.replay;
  } catch (error) {
    if (error instanceof EngineError) return err('VALIDATION_FAILED', error.status);
    throw error;
  }

  return recordMatch({
    mode: 'practice',
    attackerUserId: ctx.id,
    defenderUserId: null, // anonymous — practice never records or exposes the opponent's identity
    attackerSquadId: attack.value.id,
    defenderSnapshotId: null,
    replay,
  });
}
