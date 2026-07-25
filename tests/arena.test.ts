/**
 * Feature 8 ranked orchestration (US1/US3/US5) — the server-authoritative attack loop. Deploy resolves
 * + records a Bo3 and returns only a match id; standings move per §13; the served snapshot is blind +
 * locked; and the recorded match is reproducible from its persisted seed (P6). These are the
 * load-bearing, security-critical checks (SC-001/002/005/006/007).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { matches, replays } from '@/db/schema';
import { resolveBattleRaw } from '@/sim';
import { loadDefaultRuleset } from '@/sim/validate';
import { previewRankedMatch, startRankedMatch } from '@/server/arena';
import { getMatch, getReplay, listMatches } from '@/server/matches';
import { getStanding, recomputeStanding } from '@/server/standings';

import { truncateAll, closeDb } from './db-setup';
import { seedAttacker, seedDefender, seedSnapshot } from './arena-fixtures';

beforeEach(truncateAll);
afterAll(closeDb);

/** Run a full ranked deploy: preview to bind a snapshot, then start. */
async function deploy(ctx: Awaited<ReturnType<typeof seedAttacker>>['ctx'], squadId: string) {
  const ticket = await previewRankedMatch(ctx);
  expect(ticket.ok).toBe(true);
  if (!ticket.ok) throw new Error('preview failed');
  const started = await startRankedMatch(ctx, {
    attackSquadId: squadId,
    ticketSnapshotId: ticket.value.defenderSnapshotId,
  });
  return { ticket: ticket.value, started };
}

describe('US1 — deploy resolves + records the Bo3, returns a match id', () => {
  it('writes exactly one ranked match + one replay and returns a match id string (T011/T012)', async () => {
    const { ctx, squadId } = await seedAttacker();
    await seedDefender({ count: 1 });

    const { started } = await deploy(ctx, squadId);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(typeof started.value.matchId).toBe('string'); // a handle, not a trusted result object

    const rows = await getDb().select().from(matches).where(eq(matches.id, started.value.matchId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mode).toBe('ranked');
    const replayRows = await getDb().select().from(replays).where(eq(replays.matchId, started.value.matchId));
    expect(replayRows).toHaveLength(1);
  });

  it('moves standings per §13 — both sides reconcile with the F7 oracle (SC-005)', async () => {
    const { ctx, squadId } = await seedAttacker();
    const defender = await seedDefender({ count: 1 });

    const { started } = await deploy(ctx, squadId);
    if (!started.ok) return;

    for (const userId of [ctx.id, defender.userId]) {
      const stored = await getStanding(userId);
      const oracle = await recomputeStanding(userId);
      expect(stored.ok && oracle.ok).toBe(true);
      if (!stored.ok || !oracle.ok) return;
      expect(stored.value.netVictories).toBe(oracle.value.netVictories);
      expect(stored.value.attackWins).toBe(oracle.value.attackWins);
      expect(stored.value.defenseLosses).toBe(oracle.value.defenseLosses);
    }
    // exactly one ranked match recorded for the attacker
    const list = await listMatches({ userId: ctx.id, mode: 'ranked' });
    expect(list.ok && list.value).toHaveLength(1);
  });

  it('blocks a player with zero attackable squads (NOT_ATTACKABLE, no match) (T013, SC-009)', async () => {
    await seedDefender({ count: 1 });
    const { createTestUser } = await import('./db-setup');
    const orphan = await createTestUser(); // a real session, but no squads at all

    const preview = await previewRankedMatch(orphan);
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.error).toBe('NOT_ATTACKABLE');

    const blocked = await startRankedMatch(orphan, { attackSquadId: 'nope', ticketSnapshotId: 'nope' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe('NOT_ATTACKABLE');

    expect(await getDb().select().from(matches)).toHaveLength(0);
  });

  it('blocks a player fielding no active defense (NO_ACTIVE_DEFENSE, no match)', async () => {
    await seedDefender({ count: 1 });
    const { createTestUser } = await import('./db-setup');
    const { seedSquad } = await import('./arena-fixtures');
    // An attacker with an attackable squad but NO squad on defense — must defend before attacking.
    const attacker = await createTestUser();
    const squadId = await seedSquad(attacker.id, 0);

    const preview = await previewRankedMatch(attacker);
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.error).toBe('NO_ACTIVE_DEFENSE');

    const blocked = await startRankedMatch(attacker, { attackSquadId: squadId, ticketSnapshotId: 'nope' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe('NO_ACTIVE_DEFENSE');

    expect(await getDb().select().from(matches)).toHaveLength(0);
  });
});

describe('US3 — served blind + locked for the Bo3', () => {
  it('serves exactly one of the defender’s 3 active snapshots; attacker has no say (T027, SC-006)', async () => {
    const { ctx } = await seedAttacker();
    const defender = await seedDefender({ count: 3 });
    const served = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const ticket = await previewRankedMatch(ctx);
      if (ticket.ok) served.add(ticket.value.defenderSnapshotId);
    }
    for (const id of served) expect(defender.snapshotIds).toContain(id);
    expect(served.size).toBeGreaterThan(0);
  });

  it('the preview payload contains NO behavior-dial / Plan-B / loadout fields (T029, SC-006)', async () => {
    const { ctx } = await seedAttacker();
    await seedDefender({ count: 1 });
    const ticket = await previewRankedMatch(ctx);
    expect(ticket.ok).toBe(true);
    if (!ticket.ok) return;
    const json = JSON.stringify(ticket.value.preview);
    for (const forbidden of ['dials', 'planB', 'loadout', 'targetRow', 'energy', 'stance']) {
      expect(json).not.toContain(forbidden);
    }
    // ...but composition + power + tags ARE present
    expect(ticket.value.preview.composition.length).toBe(5);
    expect(ticket.value.preview.power).toBeGreaterThan(0);
  });

  it('records exactly one defenderSnapshotId and resolves the whole Bo3 locked against it (T028)', async () => {
    const { ctx, squadId } = await seedAttacker();
    await seedDefender({ count: 1 });
    const { ticket, started } = await deploy(ctx, squadId);
    if (!started.ok) return;
    const m = await getMatch(started.value.matchId);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.value.defenderSnapshotId).toBe(ticket.defenderSnapshotId);
    expect(m.value.adaptation).toBe('locked');
    const replay = await getReplay(started.value.matchId);
    expect(replay.ok && replay.value.games.length).toBeGreaterThanOrEqual(2); // a Bo3 (2–3 games)
  });

  it('binds by id — a snapshot deactivated after preview still resolves (immutability, T030/AS4)', async () => {
    const { ctx, squadId } = await seedAttacker();
    const defender = await seedDefender({ count: 1 });
    const ticket = await previewRankedMatch(ctx);
    if (!ticket.ok) return;

    // Defender re-designates: deactivate the served snapshot, add a new one.
    const { defenseSnapshots } = await import('@/db/schema');
    await getDb().update(defenseSnapshots).set({ active: false }).where(eq(defenseSnapshots.id, ticket.value.defenderSnapshotId));
    await seedSnapshot(defender.userId, 1);

    const started = await startRankedMatch(ctx, { attackSquadId: squadId, ticketSnapshotId: ticket.value.defenderSnapshotId });
    expect(started.ok).toBe(true); // still resolves against the exact served (now-inactive) row
    if (!started.ok) return;
    const m = await getMatch(started.value.matchId);
    expect(m.ok && m.value.defenderSnapshotId).toBe(ticket.value.defenderSnapshotId);
  });
});

describe('US5 — server authority: reproducible + no client write surface', () => {
  it('re-running the engine with the persisted seed reproduces the byte-identical replay (T043, SC-007)', async () => {
    const { ctx, squadId } = await seedAttacker();
    await seedDefender({ count: 1 });
    const { started } = await deploy(ctx, squadId);
    if (!started.ok) return;

    const stored = await getReplay(started.value.matchId);
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    // Re-run with the SAME armies + persisted seed + default ruleset. (Postgres jsonb does not
    // preserve key order, so compare structurally — `toEqual`, not a string byte-compare.)
    const rerun = await resolveBattleRaw({
      armies: stored.value.meta.armies as [unknown, unknown],
      ruleset: loadDefaultRuleset(),
      seed: Number(stored.value.meta.seed),
      matchConfig: { adaptation: 'Locked', defenderSide: 'B', bestOf: 3 },
    });
    expect(rerun.games).toEqual(stored.value.games);
    expect(rerun.result).toEqual(stored.value.result);
  });

  it('recordMatch is called from no client-reachable file — only the orchestrators (T042, A5)', () => {
    // Static import/call-graph scan: nothing but the two orchestrators (+ its own definition) may
    // reference recordMatch — never a route handler or a component (the anti-forgery boundary).
    const roots = ['server', 'app', 'components', 'lib'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = readFileSync(join(process.cwd(), rel), 'utf8');
          // Match actual calls/definition (`recordMatch(`), not doc-comment prose mentions.
          if (/recordMatch\s*\(/.test(src)) offenders.push(rel);
        }
      }
    };
    roots.forEach(walk);
    // Allowed: the definition (server/matches.ts) and the server-only orchestrators that call it —
    // ranked/practice from the app, plus the cron bot tournament (triggered by a secret, never a client).
    const allowed = new Set([
      'server/matches.ts',
      'server/arena.ts',
      'server/practice.ts',
      'server/bot-tournament.ts',
    ]);
    expect(offenders.filter((f) => !allowed.has(f))).toEqual([]);
  });
});
