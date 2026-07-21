/**
 * Random matchmaking (Feature 8, T014/T024/T037) — the ranked opponent + practice draw. Reads the
 * **shared** Feature-7 schema directly for a filtered random pick; owns no schema and writes nothing
 * (every write goes through Feature-7 `recordMatch`). Never self-matches; the ranked pool combines
 * real players and cold-start bots so it is never empty (P5).
 */

import { and, eq, ne, notInArray, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { defenseSnapshots, squads, users } from '@/db/schema';
import type { SessionUser } from '@/server/authz';

import type { MatchmakingSelection, PracticeDraw } from './arena-types';
import { err, ok, type Result } from './result';

/**
 * Pick a ranked opponent by a **two-step, per-player-fair** random select (research C1): (1) a
 * uniformly random eligible *defender user* — someone ≠ the attacker holding ≥1 active snapshot, from
 * the combined real+bot pool — then (2) a random *active snapshot* of that defender. Step 1 groups by
 * user so a player with three snapshots is no more likely to be drawn than one with a single snapshot.
 * `NO_OPPONENT` only if the pool is truly empty (shouldn't happen once cold-start bots exist).
 */
export async function pickRankedOpponent(ctx: SessionUser): Promise<Result<MatchmakingSelection>> {
  const db = getDb();

  const [defender] = await db
    .select({ userId: defenseSnapshots.userId, isBot: users.isBot, handle: users.handle })
    .from(defenseSnapshots)
    .innerJoin(users, eq(users.id, defenseSnapshots.userId))
    .where(and(eq(defenseSnapshots.active, true), ne(defenseSnapshots.userId, ctx.id)))
    .groupBy(defenseSnapshots.userId, users.isBot, users.handle)
    .orderBy(sql`random()`)
    .limit(1);

  if (!defender) return err('NO_OPPONENT', 'no eligible defender in the pool');

  const [snapshot] = await db
    .select({ id: defenseSnapshots.id, config: defenseSnapshots.config })
    .from(defenseSnapshots)
    .where(and(eq(defenseSnapshots.active, true), eq(defenseSnapshots.userId, defender.userId)))
    .orderBy(sql`random()`)
    .limit(1);

  if (!snapshot) return err('NO_OPPONENT', 'the selected defender has no active snapshot');

  return ok({
    defenderUserId: defender.userId,
    // Display handle with the same id-derived fallback the ladder uses when a handle is absent.
    defenderHandle: defender.handle?.trim() || `Commander ${defender.userId.slice(0, 6)}`,
    defenderSnapshotId: snapshot.id,
    poolSource: defender.isBot ? 'bot' : 'real',
    servedConfig: snapshot.config,
  });
}

/**
 * Draw a random practice opponent — a squad owned by someone other than the caller (self-exclusion is
 * always applied), optionally avoiding the ids in `exclude` (so a refresh doesn't immediately re-serve
 * the same squad). Returns identity-free (`opponentSquadId` + `opponentConfig` only — FR-014).
 */
export async function drawPracticeOpponent(
  ctx: SessionUser,
  exclude: string[] = [],
): Promise<Result<PracticeDraw>> {
  const db = getDb();
  const filters = [ne(squads.userId, ctx.id)];
  if (exclude.length > 0) filters.push(notInArray(squads.id, exclude));

  const [squad] = await db
    .select({ id: squads.id, config: squads.config })
    .from(squads)
    .where(and(...filters))
    .orderBy(sql`random()`)
    .limit(1);

  if (!squad) return err('NO_PRACTICE_OPPONENT', 'no other squad to draw for practice');

  return ok({ opponentSquadId: squad.id, opponentConfig: squad.config });
}
