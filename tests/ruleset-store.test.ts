/**
 * Feature 12 — the live-ruleset store (US1 + US3), integration against the local dev Postgres. The
 * load-bearing properties: a save flips the current pointer + recomputes the hash for the **next**
 * read (SC-002), already-recorded replays are byte-unchanged (SC-003), an invalid edit never persists
 * (SC-006), concurrent edits don't lose updates (SC-007), and a changing save auto-publishes exactly
 * one balance post atomically (SC-004) while a no-op posts nothing (FR-015).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { currentRuleset, posts, replays, rulesets } from "@/db/schema";
import { getCurrentRuleset, getRulesetForEdit, saveRuleset } from "@/server/ruleset";
import { recordMatch } from "@/server/matches";
import { hashRuleset } from "@/sim/ruleset-hash";
import type { Ruleset } from "@/sim/ruleset";
import { closeDb, createTestUser, truncateAll } from "./db-setup";
import { battleReplay } from "./fixtures";

beforeEach(truncateAll);
afterAll(closeDb);

function firstVariantId(rs: Ruleset): string {
  return Object.keys(rs.variants)[0];
}

describe("getCurrentRuleset — bootstrap + authoritative read", () => {
  it("seeds the engine default on first read (never empty, FR-009)", async () => {
    const cur = await getCurrentRuleset();
    expect(cur.revisionId).toBeTruthy();
    expect(cur.rulesetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(cur.ruleset.variants).length).toBeGreaterThan(0);
    // exactly one seed revision + the singleton pointer at version 1
    expect(await getDb().select().from(rulesets)).toHaveLength(1);
    const [ptr] = await getDb().select().from(currentRuleset);
    expect(ptr.version).toBe(1);
  });
});

describe("saveRuleset — the edit takes effect for the next read (SC-002)", () => {
  it("flips the pointer, bumps the version, and recomputes the hash", async () => {
    const admin = await createTestUser({ role: "admin" });
    const before = await getCurrentRuleset();
    const edit = await getRulesetForEdit(admin);
    expect(edit.version).toBe(1);
    expect(edit.rulesetHash).toBe(before.rulesetHash);

    const data = structuredClone(edit.data);
    data.globals.nativeBonus += 100;
    const res = await saveRuleset(admin, { data, expectedVersion: edit.version });
    if (!("noop" in res) || res.noop) throw new Error(`expected a changing save, got ${JSON.stringify(res)}`);
    expect(res.version).toBe(2);
    expect(res.rulesetHash).not.toBe(before.rulesetHash);
    expect(res.rulesetHash).toBe(hashRuleset(data)); // stored hash == engine's canonical hash (SC-002 chain)

    const after = await getCurrentRuleset();
    expect(after.revisionId).toBe(res.revisionId);
    expect(after.ruleset.globals.nativeBonus).toBe(data.globals.nativeBonus);
    expect(after.rulesetHash).toBe(res.rulesetHash);
  });

  it("leaves already-recorded replays byte-identical after an edit (SC-003)", async () => {
    const admin = await createTestUser({ role: "admin" });
    const a = await createTestUser();
    const b = await createTestUser();
    const rec = await recordMatch({
      mode: "ranked",
      attackerUserId: a.id,
      defenderUserId: b.id,
      attackerSquadId: null,
      defenderSnapshotId: null,
      replay: await battleReplay(1),
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    const [beforeRow] = await getDb().select().from(replays).where(eq(replays.matchId, rec.value.matchId));
    const beforeJson = JSON.stringify(beforeRow.replay);

    const edit = await getRulesetForEdit(admin);
    const data = structuredClone(edit.data);
    data.globals.nativeBonus += 250;
    await saveRuleset(admin, { data, expectedVersion: edit.version });

    const [afterRow] = await getDb().select().from(replays).where(eq(replays.matchId, rec.value.matchId));
    expect(JSON.stringify(afterRow.replay)).toBe(beforeJson);
  });
});

describe("saveRuleset — validation + admin gates (SC-006, US2)", () => {
  it("rejects a non-admin save with NOT_ADMIN and writes nothing", async () => {
    const player = await createTestUser();
    const cur = await getCurrentRuleset(); // bootstrap the seed
    const data = structuredClone(cur.ruleset);
    data.globals.nativeBonus += 100;

    expect(await saveRuleset(player, { data, expectedVersion: 1 })).toEqual({ error: "NOT_ADMIN" });
    await expect(getRulesetForEdit(player)).rejects.toThrow();

    expect(await getDb().select().from(rulesets)).toHaveLength(1); // only the seed
    const [ptr] = await getDb().select().from(currentRuleset);
    expect(ptr.version).toBe(1);
  });

  it("rejects an invalid ruleset before any write (SC-006)", async () => {
    const admin = await createTestUser({ role: "admin" });
    const edit = await getRulesetForEdit(admin);
    const data = structuredClone(edit.data);
    data.globals.splashCap = 9999; // > 0.25 (2500 bp)

    const res = await saveRuleset(admin, { data, expectedVersion: edit.version });
    expect("error" in res && res.error).toBe("VALIDATION_FAILED");
    expect(await getDb().select().from(rulesets)).toHaveLength(1);
    const [ptr] = await getDb().select().from(currentRuleset);
    expect(ptr.version).toBe(1);
  });
});

describe("saveRuleset — concurrency (SC-007)", () => {
  it("guards concurrent edits from the same version — one wins, one STALE_EDIT, no lost update", async () => {
    const admin = await createTestUser({ role: "admin" });
    const edit = await getRulesetForEdit(admin); // version 1

    const d1 = structuredClone(edit.data);
    d1.globals.nativeBonus += 100;
    const d2 = structuredClone(edit.data);
    d2.globals.nativeBonus += 200;

    const [r1, r2] = await Promise.all([
      saveRuleset(admin, { data: d1, expectedVersion: edit.version }),
      saveRuleset(admin, { data: d2, expectedVersion: edit.version }),
    ]);
    const results = [r1, r2];
    const winners = results.filter((r) => "noop" in r && r.noop === false);
    const losers = results.filter((r) => "error" in r && r.error === "STALE_EDIT");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const [ptr] = await getDb().select().from(currentRuleset);
    expect(ptr.version).toBe(2); // exactly one successful swap
    // Atomicity: the loser's revision insert rolled back with its failed swap — seed + winner only.
    expect(await getDb().select().from(rulesets)).toHaveLength(2);
    expect(await getDb().select().from(posts)).toHaveLength(1); // one balance post, from the winner only
  });
});

describe("saveRuleset — auto-published balance post (SC-004, US3)", () => {
  it("a changing save creates exactly one published balance post carrying the diff", async () => {
    const admin = await createTestUser({ role: "admin" });
    const edit = await getRulesetForEdit(admin);
    const data = structuredClone(edit.data);
    const vId = firstVariantId(data);
    data.variants[vId].hull -= 500;
    data.globals.nativeBonus += 300;

    const res = await saveRuleset(admin, { data, expectedVersion: edit.version });
    if (!("noop" in res) || res.noop) throw new Error("expected a changing save");

    const rows = await getDb().select().from(posts);
    expect(rows).toHaveLength(1);
    const post = rows[0];
    expect(post.type).toBe("balance");
    expect(post.status).toBe("published");
    expect(post.authorId).toBe(admin.id);
    expect(post.publishedAt).toBeInstanceOf(Date);

    const meta = post.metadata as { diff: { path: string }[]; rulesetHash: string; rulesetId: string };
    expect(meta.diff.map((d) => d.path).sort()).toEqual([`variants.${vId}.hull`, "globals.nativeBonus"].sort());
    expect(meta.rulesetHash).toBe(res.rulesetHash);
    expect(meta.rulesetId).toBe(res.revisionId);
    expect(post.body).toContain(`variants.${vId}.hull`);
  });

  it("a no-op save creates no revision and no balance post (FR-015)", async () => {
    const admin = await createTestUser({ role: "admin" });
    const edit = await getRulesetForEdit(admin); // seed = rev 1

    const res = await saveRuleset(admin, { data: structuredClone(edit.data), expectedVersion: edit.version });
    expect("noop" in res && res.noop).toBe(true);

    expect(await getDb().select().from(rulesets)).toHaveLength(1); // still just the seed
    expect(await getDb().select().from(posts)).toHaveLength(0);
    const [ptr] = await getDb().select().from(currentRuleset);
    expect(ptr.version).toBe(1);
  });
});
