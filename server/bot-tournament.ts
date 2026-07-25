/**
 * Automated bot round-robin — cold-start ladder liveness. Until there are real players, this simulates
 * a populated ladder: every bot attacks every other defender's active defense in a ranked best-of-three,
 * recording real matches + replays + standings through the **exact same server path a human attack takes**
 * (mirrors `startRankedMatch`), just fanned out. Triggered on a schedule by `/api/cron/bot-tournament`.
 *
 * WEEKLY SEASONS: the ladder resets every Monday 00:00 UTC (see `./season`). The first run of a new week
 * clears the prior season's **ranked** matches (replays cascade) and wipes standings before repopulating;
 * practice matches and current-season rows are untouched.
 *
 * Server-only (DB + wasm host).
 */

import { and, desc, eq, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { defenseSnapshots, ladderStandings, matches, squads, users } from "@/db/schema";
import type { SquadConfig } from "@/db/types";
import { EngineError, resolveBattle } from "@/sim";
import type { MatchResult } from "@/sim/model";
import { recordMatch } from "@/server/matches";
import { getCurrentRuleset } from "@/server/ruleset";

import { isNewSeason, seasonIdFor, seasonStartMs } from "./season";

export interface BotTournamentSummary {
  /** Monotonic weekly season index (see `./season`). */
  season: number;
  /** Whether this run reset the ladder for a new week. */
  seasonReset: boolean;
  attackers: number;
  defenders: number;
  played: number;
  failed: number;
  /** Per-participant tally for this run, best net first. */
  standings: { handle: string; net: number; atkW: number; atkL: number; defW: number; defL: number }[];
}

/** A bot + the army/squad it attacks with. */
interface Attacker {
  userId: string;
  handle: string;
  squadId: string | null;
  config: SquadConfig;
}
/** Any user with an active defense snapshot. */
interface Defender {
  userId: string;
  handle: string;
  snapshotId: string;
  config: SquadConfig;
}

/** A user's active defense (lowest slot), or null if they field none. */
async function activeSnapshot(userId: string): Promise<{ id: string; config: SquadConfig } | null> {
  const [row] = await getDb()
    .select({ id: defenseSnapshots.id, config: defenseSnapshots.config })
    .from(defenseSnapshots)
    .where(and(eq(defenseSnapshots.userId, userId), eq(defenseSnapshots.active, true)))
    .orderBy(defenseSnapshots.defenseSlot)
    .limit(1);
  return row ?? null;
}

/**
 * The army a bot attacks with: its dedicated "Offense" roster squad if it has one (the tournament
 * seeder creates these), else it attacks with a copy of its own active defense, else its first roster
 * squad. Returns null only for a bot with no squads and no defense (skipped as an attacker).
 */
async function attackerFor(userId: string, handle: string): Promise<Attacker | null> {
  const roster = await getDb().select().from(squads).where(eq(squads.userId, userId));
  const offense = roster.find((s) => s.name === "Offense");
  if (offense) return { userId, handle, squadId: offense.id, config: offense.config };
  const snap = await activeSnapshot(userId);
  if (snap) return { userId, handle, squadId: null, config: snap.config };
  if (roster[0]) return { userId, handle, squadId: roster[0].id, config: roster[0].config };
  return null;
}

/** Reset the ladder for a new weekly season: drop the prior season's ranked matches + all standings. */
async function resetSeason(startMs: number): Promise<void> {
  const db = getDb();
  // Ranked history from *prior* seasons only (practice + current-season rows kept); replays cascade.
  await db.delete(matches).where(and(eq(matches.mode, "ranked"), lt(matches.createdAt, new Date(startMs))));
  await db.delete(ladderStandings); // recreated by applyRankedResult as this run records matches
}

export async function runBotTournament(): Promise<BotTournamentSummary> {
  const db = getDb();
  const now = Date.now();
  const season = seasonIdFor(now);

  // --- Weekly boundary: reset once iff the last ranked match belongs to an earlier season. ---
  const [lastRanked] = await db
    .select({ createdAt: matches.createdAt })
    .from(matches)
    .where(eq(matches.mode, "ranked"))
    .orderBy(desc(matches.createdAt))
    .limit(1);
  const seasonReset = isNewSeason(lastRanked?.createdAt.getTime() ?? null, now);
  if (seasonReset) await resetSeason(seasonStartMs(season));

  // --- Participants: attackers = bots; defenders = everyone with an active defense (bots + humans). ---
  const allUsers = await db.select().from(users);

  const attackers: Attacker[] = [];
  for (const b of allUsers.filter((u) => u.isBot)) {
    const a = await attackerFor(b.id, b.handle ?? b.id);
    if (a) attackers.push(a);
  }

  const defenders: Defender[] = [];
  for (const u of allUsers) {
    const snap = await activeSnapshot(u.id);
    if (snap) defenders.push({ userId: u.id, handle: u.handle ?? u.id, snapshotId: snap.id, config: snap.config });
  }

  // --- Round-robin: each bot attacks every other defender, ranked Bo3 (same path as a human attack). ---
  const { ruleset } = await getCurrentRuleset();
  const cfg = { adaptation: "Locked", defenderSide: "B", bestOf: 3 } as const;
  const tally: Record<string, { handle: string; atkW: number; atkL: number; defW: number; defL: number }> = {};
  const bump = (h: string) => (tally[h] ??= { handle: h, atkW: 0, atkL: 0, defW: 0, defL: 0 });
  // A per-run seed base so results vary run-to-run but stay reproducible from the stored seed.
  const seedBase = now % Number.MAX_SAFE_INTEGER;
  let played = 0;
  let failed = 0;

  for (let i = 0; i < attackers.length; i++) {
    const atk = attackers[i];
    for (let j = 0; j < defenders.length; j++) {
      const def = defenders[j];
      if (def.userId === atk.userId) continue; // never attack your own defense
      const seed = (seedBase + i * 1000 + j) % Number.MAX_SAFE_INTEGER;
      try {
        const reader = await resolveBattle({ armies: [atk.config, def.config], ruleset, seed, matchConfig: cfg });
        const rec = await recordMatch({
          mode: "ranked",
          attackerUserId: atk.userId,
          defenderUserId: def.userId,
          attackerSquadId: atk.squadId,
          defenderSnapshotId: def.snapshotId,
          replay: reader.replay,
        });
        if (!rec.ok) {
          failed++;
          continue;
        }
        const attackerWon = (reader.replay.result as MatchResult).winner === "A";
        const A = bump(atk.handle);
        const D = bump(def.handle);
        if (attackerWon) {
          A.atkW++;
          D.defL++;
        } else {
          A.atkL++;
          D.defW++;
        }
        played++;
      } catch (error) {
        failed++;
        if (!(error instanceof EngineError)) throw error; // a real bug should surface, not be swallowed
      }
    }
  }

  const standings = Object.values(tally)
    .map((t) => ({ ...t, net: t.atkW + t.defW - t.atkL - t.defL }))
    .sort((a, b) => b.net - a.net);

  return { season, seasonReset, attackers: attackers.length, defenders: defenders.length, played, failed, standings };
}
