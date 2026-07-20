/**
 * US4 — server-only match recording. A resolved match writes `matches` + `replays` (1:1) with
 * provenance promoted to scalar columns; the stored jsonb round-trips to a valid, seekable Replay;
 * reads use the scalar columns; a too-old formatVersion regenerates instead of failing; and a practice
 * match changes no standing (its outcome derived from the authoritative replay, never a caller scalar).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { replays, ladderStandings } from "@/db/schema";
import type { MatchResult } from "@/sim/model";
import { parseReplay } from "@/sim/replay-reader";
import { recordMatch, getMatch, listMatches, getReplay } from "@/server/matches";
import { truncateAll, closeDb, createTestUser } from "./db-setup";
import { battleReplay } from "./fixtures";

beforeEach(truncateAll);
afterAll(closeDb);

describe("recordMatch writes match + replay 1:1 with provenance (SC-006, US4-AS1/2)", () => {
  it("stores matching scalar provenance and a valid, seekable replay", async () => {
    const attacker = await createTestUser();
    const defender = await createTestUser();
    const replay = await battleReplay(1);
    const result = replay.result as MatchResult;

    const rec = await recordMatch({
      mode: "ranked",
      attackerUserId: attacker.id,
      defenderUserId: defender.id,
      attackerSquadId: null,
      defenderSnapshotId: null,
      replay,
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const m = await getMatch(rec.value.matchId);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.value.seed).toBe(replay.meta.seed);
    expect(m.value.rulesetHash).toBe(replay.meta.rulesetHash);
    expect(m.value.formatVersion).toBe(replay.formatVersion);
    expect(m.value.winnerSide).toBe(result.winner === "A" ? "attacker" : "defender");

    // exactly one replay row, linked 1:1
    const replayRows = await getDb().select().from(replays).where(eq(replays.matchId, rec.value.matchId));
    expect(replayRows).toHaveLength(1);

    // the stored jsonb deserializes to a valid, seekable Replay (O(1) snapshot index)
    const got = await getReplay(rec.value.matchId);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    const reader = parseReplay(got.value);
    expect(reader.formatVersion).toBe(1);
    expect(Array.isArray(got.value.games[0].snapshots)).toBe(true);
  });
});

describe("scalar reads + regenerate-not-fail (US4-AS3/4, FR-018)", () => {
  it("filters by user/mode via scalar columns and regenerates an unsupported replay", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const ranked = await recordMatch({
      mode: "ranked",
      attackerUserId: a.id,
      defenderUserId: b.id,
      attackerSquadId: null,
      defenderSnapshotId: null,
      replay: await battleReplay(1),
    });
    const practice = await recordMatch({
      mode: "practice",
      attackerUserId: a.id,
      defenderUserId: b.id,
      attackerSquadId: null,
      defenderSnapshotId: null,
      replay: await battleReplay(42),
    });
    expect(ranked.ok && practice.ok).toBe(true);
    if (!ranked.ok) return;

    const listA = await listMatches({ userId: a.id });
    expect(listA.ok && listA.value.length).toBe(2);
    const onlyPractice = await listMatches({ mode: "practice" });
    expect(onlyPractice.ok && onlyPractice.value).toHaveLength(1);

    // Downgrade the stored replay's formatVersion below the supported range → getReplay regenerates.
    const [row] = await getDb().select().from(replays).where(eq(replays.matchId, ranked.value.matchId));
    const original = (row.replay.result as MatchResult).winner;
    await getDb()
      .update(replays)
      .set({ replay: { ...row.replay, formatVersion: 0 }, formatVersion: 0 })
      .where(eq(replays.matchId, ranked.value.matchId));

    const regenerated = await getReplay(ranked.value.matchId);
    expect(regenerated.ok).toBe(true);
    if (!regenerated.ok) return;
    expect(regenerated.value.formatVersion).toBe(1); // re-emitted at a supported version
    expect((regenerated.value.result as MatchResult).winner).toBe(original); // same battle
  });
});

describe("practice matches change no standing (FR-019, US4-AS5)", () => {
  it("records a practice match with mode flagged and leaves standings untouched", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const replay = await battleReplay(1);
    const rec = await recordMatch({
      mode: "practice",
      attackerUserId: a.id,
      defenderUserId: b.id,
      attackerSquadId: null,
      defenderSnapshotId: null,
      replay,
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const m = await getMatch(rec.value.matchId);
    expect(m.ok && m.value.mode).toBe("practice");
    // outcome is derived from the authoritative replay, not a caller scalar
    expect(m.ok && m.value.winnerSide).toBe((replay.result as MatchResult).winner === "A" ? "attacker" : "defender");
    // no standing rows created for a practice match
    expect(await getDb().select().from(ladderStandings)).toHaveLength(0);
  });
});
