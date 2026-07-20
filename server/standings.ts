/**
 * Ladder-standing service (Feature 7, US5). Net victories = **attack wins − defense losses** (§13),
 * maintained transactionally as ranked matches record (the update runs inside `recordMatch`'s tx) and
 * always **reconcilable** from `matches` (SC-007). Seasons/tiers/MMR are Feature 9 — this is only the
 * net-victory substrate the Ladder/Profile read.
 *
 * Server-only.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { ladderStandings, matches } from "@/db/schema";

import { ok, type Result } from "./result";

type Db = ReturnType<typeof getDb>;
/** The transaction handle drizzle hands the `db.transaction` callback. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type LadderStanding = typeof ladderStandings.$inferSelect;

/** A per-side delta applied to one participant's standing. */
interface StandingDelta {
  attackWin: number;
  attackLoss: number;
  defenseWin: number;
  defenseLoss: number;
  damage: number;
  won: boolean;
}

async function upsertStanding(tx: Tx, userId: string, d: StandingDelta): Promise<void> {
  await tx
    .insert(ladderStandings)
    .values({
      userId,
      attackWins: d.attackWin,
      attackLosses: d.attackLoss,
      defenseWins: d.defenseWin,
      defenseLosses: d.defenseLoss,
      matchesPlayed: 1,
      totalDamage: d.damage,
      currentStreak: d.won ? 1 : 0,
      bestStreak: d.won ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: ladderStandings.userId,
      set: {
        attackWins: sql`${ladderStandings.attackWins} + ${d.attackWin}`,
        attackLosses: sql`${ladderStandings.attackLosses} + ${d.attackLoss}`,
        defenseWins: sql`${ladderStandings.defenseWins} + ${d.defenseWin}`,
        defenseLosses: sql`${ladderStandings.defenseLosses} + ${d.defenseLoss}`,
        matchesPlayed: sql`${ladderStandings.matchesPlayed} + 1`,
        totalDamage: sql`${ladderStandings.totalDamage} + ${d.damage}`,
        currentStreak: d.won ? sql`${ladderStandings.currentStreak} + 1` : sql`0`,
        bestStreak: d.won
          ? sql`greatest(${ladderStandings.bestStreak}, ${ladderStandings.currentStreak} + 1)`
          : sql`${ladderStandings.bestStreak}`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Apply one **ranked** result to both participants' standings, inside the caller's transaction
 * (called from `recordMatch`). Practice matches never reach here (FR-019). A null defender (some
 * seeded cases) updates only the attacker.
 */
export async function applyRankedResult(
  tx: Tx,
  m: {
    attackerUserId: string;
    defenderUserId: string | null;
    winnerSide: "attacker" | "defender";
    attackerDamage: number;
    defenderDamage: number;
  },
): Promise<void> {
  const attackerWon = m.winnerSide === "attacker";
  await upsertStanding(tx, m.attackerUserId, {
    attackWin: attackerWon ? 1 : 0,
    attackLoss: attackerWon ? 0 : 1,
    defenseWin: 0,
    defenseLoss: 0,
    damage: m.attackerDamage,
    won: attackerWon,
  });
  if (m.defenderUserId) {
    const defenderWon = !attackerWon;
    await upsertStanding(tx, m.defenderUserId, {
      attackWin: 0,
      attackLoss: 0,
      defenseWin: defenderWon ? 1 : 0,
      defenseLoss: defenderWon ? 0 : 1,
      damage: m.defenderDamage,
      won: defenderWon,
    });
  }
}

function zeroStanding(userId: string): LadderStanding {
  return {
    userId,
    attackWins: 0,
    attackLosses: 0,
    defenseWins: 0,
    defenseLosses: 0,
    netVictories: 0,
    matchesPlayed: 0,
    totalDamage: 0,
    currentStreak: 0,
    bestStreak: 0,
    updatedAt: new Date(0),
  };
}

/** A user's standing (a zeroed standing if they have no ranked results yet). */
export async function getStanding(userId: string): Promise<Result<LadderStanding>> {
  const [row] = await getDb()
    .select()
    .from(ladderStandings)
    .where(eq(ladderStandings.userId, userId))
    .limit(1);
  return ok(row ?? zeroStanding(userId));
}

/** The leaderboard, ordered by net victories DESC (Feature 9's read path). */
export async function getLeaderboard(
  opts: { limit?: number; offset?: number } = {},
): Promise<Result<LadderStanding[]>> {
  const rows = await getDb()
    .select()
    .from(ladderStandings)
    .orderBy(desc(ladderStandings.netVictories))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
  return ok(rows);
}

/** The reconciliation oracle (SC-007): the standing **recomputed from `matches`**, for drift checks. */
export async function recomputeStanding(
  userId: string,
): Promise<Result<Pick<LadderStanding, "userId" | "attackWins" | "attackLosses" | "defenseWins" | "defenseLosses" | "netVictories" | "matchesPlayed" | "totalDamage">>> {
  const db = getDb();
  const [att] = await db
    .select({
      wins: sql<string>`count(*) filter (where ${matches.winnerSide} = 'attacker')`,
      losses: sql<string>`count(*) filter (where ${matches.winnerSide} = 'defender')`,
      damage: sql<string>`coalesce(sum(${matches.attackerDamage}), 0)`,
      n: sql<string>`count(*)`,
    })
    .from(matches)
    .where(and(eq(matches.mode, "ranked"), eq(matches.attackerUserId, userId)));
  const [def] = await db
    .select({
      wins: sql<string>`count(*) filter (where ${matches.winnerSide} = 'defender')`,
      losses: sql<string>`count(*) filter (where ${matches.winnerSide} = 'attacker')`,
      damage: sql<string>`coalesce(sum(${matches.defenderDamage}), 0)`,
      n: sql<string>`count(*)`,
    })
    .from(matches)
    .where(and(eq(matches.mode, "ranked"), eq(matches.defenderUserId, userId)));

  const attackWins = Number(att.wins);
  const attackLosses = Number(att.losses);
  const defenseWins = Number(def.wins);
  const defenseLosses = Number(def.losses);
  return ok({
    userId,
    attackWins,
    attackLosses,
    defenseWins,
    defenseLosses,
    netVictories: attackWins - defenseLosses,
    matchesPlayed: Number(att.n) + Number(def.n),
    totalDamage: Number(att.damage) + Number(def.damage),
  });
}
