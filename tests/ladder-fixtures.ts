/**
 * Feature-9 ladder fixtures — insert known `ladder_standings` rows (over real `users`, incl. `isBot`
 * and negative-net commanders) so the read-module tests pin ordering/tiebreak/rank against a
 * controlled pool. `net_victories` is a generated column (attackWins − defenseLosses), so it is never
 * inserted — set the components and let the DB derive it.
 */

import { getDb } from '@/db';
import { ladderStandings, matches, users } from '@/db/schema';

export interface StandingSpec {
  handle?: string | null;
  isBot?: boolean;
  attackWins?: number;
  attackLosses?: number;
  defenseWins?: number;
  defenseLosses?: number;
  totalDamage?: number;
  currentStreak?: number;
  bestStreak?: number;
  matchesPlayed?: number;
}

/** Create a user + its standing row; returns the user id. */
export async function seedStanding(spec: StandingSpec = {}): Promise<string> {
  const id = crypto.randomUUID();
  const db = getDb();
  await db.insert(users).values({
    id,
    email: `${id}@example.com`,
    handle: spec.handle ?? null,
    isBot: spec.isBot ?? false,
  });
  await db.insert(ladderStandings).values({
    userId: id,
    attackWins: spec.attackWins ?? 0,
    attackLosses: spec.attackLosses ?? 0,
    defenseWins: spec.defenseWins ?? 0,
    defenseLosses: spec.defenseLosses ?? 0,
    totalDamage: spec.totalDamage ?? 0,
    currentStreak: spec.currentStreak ?? 0,
    bestStreak: spec.bestStreak ?? 0,
    matchesPlayed: spec.matchesPlayed ?? 0,
  });
  return id;
}

/** Create a bare user (no standing row) — for period-rollup tests that read `matches`, not standings. */
export async function seedUser(opts: { isBot?: boolean; handle?: string | null } = {}): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().insert(users).values({
    id,
    email: `${id}@example.com`,
    handle: opts.handle ?? null,
    isBot: opts.isBot ?? false,
  });
  return id;
}

/** Insert one recorded match (defaults to a ranked attacker win). `createdAt` places it in/out of a window. */
export async function seedMatch(opts: {
  attackerUserId?: string | null;
  defenderUserId?: string | null;
  winnerSide: 'attacker' | 'defender';
  attackerDamage?: number;
  defenderDamage?: number;
  mode?: 'ranked' | 'practice';
  createdAt?: Date;
}): Promise<void> {
  const mode = opts.mode ?? 'ranked';
  await getDb()
    .insert(matches)
    .values({
      mode,
      attackerUserId: opts.attackerUserId ?? null,
      defenderUserId: opts.defenderUserId ?? null,
      adaptation: mode === 'practice' ? 'free' : 'locked',
      winnerSide: opts.winnerSide,
      attackerGamesWon: opts.winnerSide === 'attacker' ? 2 : 0,
      defenderGamesWon: opts.winnerSide === 'defender' ? 2 : 0,
      attackerDamage: opts.attackerDamage ?? 0,
      defenderDamage: opts.defenderDamage ?? 0,
      seed: '1',
      rulesetHash: 'test',
      formatVersion: 1,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    });
}
