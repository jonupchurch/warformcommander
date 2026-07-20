/**
 * US5 — net-victory standings. A ranked result moves the attacker's and defender's counters (§13);
 * the maintained cache always reconciles with a recomputation from `matches` (SC-007); practice
 * matches move nothing; and the leaderboard orders by net victories.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { recordMatch } from "@/server/matches";
import { getStanding, getLeaderboard, recomputeStanding } from "@/server/standings";
import type { MatchResult } from "@/sim/model";
import { truncateAll, closeDb, createTestUser } from "./db-setup";
import { battleReplay } from "./fixtures";

beforeEach(truncateAll);
afterAll(closeDb);

/** Record a ranked match; the replay's winner (seed 1 ⇒ attacker) decides the standing move. */
async function rankedMatch(attackerId: string, defenderId: string, seed = 1) {
  const rec = await recordMatch({
    mode: "ranked",
    attackerUserId: attackerId,
    defenderUserId: defenderId,
    attackerSquadId: null,
    defenderSnapshotId: null,
    replay: await battleReplay(seed),
  });
  if (!rec.ok) throw new Error(`recordMatch failed: ${rec.error}`);
  return rec.value.matchId;
}

describe("ranked result moves both standings (§13, US5-AS1)", () => {
  it("an attacker win adds to the attacker and subtracts from the defender", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const replay = await battleReplay(1);
    expect((replay.result as MatchResult).winner).toBe("A"); // attacker wins on seed 1

    await rankedMatch(a.id, b.id);

    const sa = await getStanding(a.id);
    const sb = await getStanding(b.id);
    expect(sa.ok && sa.value.attackWins).toBe(1);
    expect(sa.ok && sa.value.netVictories).toBe(1);
    expect(sb.ok && sb.value.defenseLosses).toBe(1);
    expect(sb.ok && sb.value.netVictories).toBe(-1);
  });
});

describe("reconciliation from matches (SC-007, US5-AS2/3)", () => {
  it("the cached standing equals a recomputation, and practice changes nothing", async () => {
    const a = await createTestUser();
    const b = await createTestUser();

    await rankedMatch(a.id, b.id); // A attacks & wins; B loses on defense
    await rankedMatch(b.id, a.id); // B attacks & wins; A loses on defense

    // A practice match must not move anything.
    await recordMatch({
      mode: "practice",
      attackerUserId: a.id,
      defenderUserId: b.id,
      attackerSquadId: null,
      defenderSnapshotId: null,
      replay: await battleReplay(42),
    });

    for (const u of [a, b]) {
      const cached = await getStanding(u.id);
      const recomputed = await recomputeStanding(u.id);
      expect(cached.ok && recomputed.ok).toBe(true);
      if (!cached.ok || !recomputed.ok) continue;
      expect({
        attackWins: cached.value.attackWins,
        attackLosses: cached.value.attackLosses,
        defenseWins: cached.value.defenseWins,
        defenseLosses: cached.value.defenseLosses,
        netVictories: cached.value.netVictories,
        matchesPlayed: cached.value.matchesPlayed,
        totalDamage: cached.value.totalDamage,
      }).toEqual({
        attackWins: recomputed.value.attackWins,
        attackLosses: recomputed.value.attackLosses,
        defenseWins: recomputed.value.defenseWins,
        defenseLosses: recomputed.value.defenseLosses,
        netVictories: recomputed.value.netVictories,
        matchesPlayed: recomputed.value.matchesPlayed,
        totalDamage: recomputed.value.totalDamage,
      });
    }
    // Each played 1 attack (win) + 1 defense (loss) ⇒ net 0.
    const finalA = await getStanding(a.id);
    expect(finalA.ok && finalA.value.netVictories).toBe(0);
  });
});

describe("leaderboard orders by net victories (US5-AS4)", () => {
  it("returns users ordered by netVictories DESC", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await rankedMatch(a.id, b.id); // A: +1, B: -1

    const board = await getLeaderboard({ limit: 10 });
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    const nets = board.value.map((r) => r.netVictories ?? 0);
    expect(nets).toEqual([...nets].sort((x, y) => y - x)); // sorted DESC
    expect(board.value[0].userId).toBe(a.id); // the +1 leader is first
  });
});
