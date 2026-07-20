/**
 * Match & replay service (Feature 7, US4) — **server-only** recording of a resolved best-of-three
 * (P6, A5). Writes a `matches` summary + a `jsonb` `replays` row (1:1) and, for ranked matches,
 * updates `ladder_standings` — all in one transaction. The outcome is **derived from the authoritative
 * replay** the server sim produced, never from a caller-supplied scalar, so no outcome can be forged.
 *
 * Scalar provenance (seed, rulesetHash, formatVersion, winner) is promoted to columns so summaries and
 * the leaderboard never parse the blob. Server-only (imports the wasm host for replay regeneration).
 */

import { and, desc, eq, or } from "drizzle-orm";

import { getDb } from "@/db";
import { matches, replays } from "@/db/schema";
import type { Replay } from "@/db/types";
import type { MatchResult } from "@/sim/model";
import { isSupported } from "@/sim/replay-reader";
import { resolveBattleRaw, type BattleInput } from "@/sim";
import { loadDefaultRuleset } from "@/sim/validate";

import { applyRankedResult } from "./standings";
import { err, ok, type Result } from "./result";

/** Milli-unit → whole-unit scale for the stored per-side damage totals. */
const SCALE = 1000;

export type MatchSummary = typeof matches.$inferSelect;

interface RecordMatchInput {
  mode: "ranked" | "practice";
  attackerUserId: string;
  defenderUserId: string | null;
  attackerSquadId: string | null;
  defenderSnapshotId: string | null;
  /** The Feature-1 wire replay the server sim produced — carries the result + provenance. */
  replay: Replay;
}

/**
 * Record a resolved match. Writes `matches` + `replays` (1:1) with matching provenance and, for
 * `ranked`, updates both participants' standings — one transaction. The winner / Bo3 score / per-side
 * damage come from the replay's embedded `result`, so the caller cannot submit a different outcome.
 */
export async function recordMatch(input: RecordMatchInput): Promise<Result<{ matchId: string }>> {
  const replay = input.replay;
  const result = replay.result as MatchResult;
  const meta = replay.meta;
  const winnerSide = result.winner === "A" ? "attacker" : "defender";
  const adaptation = meta.matchConfig.adaptation === "Free" ? "free" : "locked";
  const attackerGamesWon = result.games.filter((g) => g.winner === "A").length;
  const defenderGamesWon = result.games.filter((g) => g.winner === "B").length;
  const attackerDamage = Math.round(result.sideA.damageDealt / SCALE);
  const defenderDamage = Math.round(result.sideB.damageDealt / SCALE);

  const db = getDb();
  const matchId = await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(matches)
      .values({
        mode: input.mode,
        attackerUserId: input.attackerUserId,
        defenderUserId: input.defenderUserId,
        attackerSquadId: input.attackerSquadId,
        defenderSnapshotId: input.defenderSnapshotId,
        adaptation,
        winnerSide,
        attackerGamesWon,
        defenderGamesWon,
        attackerDamage,
        defenderDamage,
        durationTicks: result.durationTicks,
        seed: meta.seed, // numeric(20,0) — lossless u64-as-string
        rulesetHash: meta.rulesetHash,
        formatVersion: replay.formatVersion,
      })
      .returning({ id: matches.id });

    await tx.insert(replays).values({
      matchId: m.id,
      replay,
      seed: meta.seed,
      rulesetHash: meta.rulesetHash,
      formatVersion: replay.formatVersion,
      winnerSide,
    });

    if (input.mode === "ranked") {
      await applyRankedResult(tx, {
        attackerUserId: input.attackerUserId,
        defenderUserId: input.defenderUserId,
        winnerSide,
        attackerDamage,
        defenderDamage,
      });
    }
    return m.id;
  });
  return ok({ matchId });
}

/** A match summary (scalar columns only — never parses the replay blob). */
export async function getMatch(matchId: string): Promise<Result<MatchSummary>> {
  const [row] = await getDb().select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!row) return err("NOT_FOUND");
  return ok(row);
}

/** Recent matches for a user (as attacker or defender) — scalar-only, newest first. */
export async function listMatches(filter: {
  userId?: string;
  mode?: "ranked" | "practice";
  limit?: number;
}): Promise<Result<MatchSummary[]>> {
  const conds = [];
  if (filter.userId) {
    conds.push(or(eq(matches.attackerUserId, filter.userId), eq(matches.defenderUserId, filter.userId)));
  }
  if (filter.mode) conds.push(eq(matches.mode, filter.mode));
  const rows = await getDb()
    .select()
    .from(matches)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(matches.createdAt))
    .limit(filter.limit ?? 50);
  return ok(rows);
}

/**
 * The stored replay, typed. If its `formatVersion` is no longer supported, **regenerate** it from the
 * persisted seed + armies + ruleset (FR-018 — regenerate, never in-place migrate) rather than failing.
 * v1 regenerates against the engine's default ruleset (Feature 12 will supply historical rulesets by
 * hash); if regeneration is impossible, returns `UNSUPPORTED_FORMAT`.
 */
export async function getReplay(matchId: string): Promise<Result<Replay>> {
  const [row] = await getDb().select().from(replays).where(eq(replays.matchId, matchId)).limit(1);
  if (!row) return err("NOT_FOUND");
  const replay = row.replay;
  if (isSupported(replay.formatVersion)) return ok(replay);

  try {
    const meta = replay.meta;
    const input: BattleInput = {
      armies: meta.armies as [unknown, unknown],
      ruleset: loadDefaultRuleset(),
      seed: Number(meta.seed), // server-minted seeds are JS-safe (≤2^53)
      matchConfig: meta.matchConfig,
    };
    return ok(await resolveBattleRaw(input));
  } catch {
    return err("UNSUPPORTED_FORMAT", `formatVersion ${replay.formatVersion} unsupported and not regenerable`);
  }
}
