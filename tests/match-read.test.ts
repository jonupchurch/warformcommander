/**
 * Feature 8 real match read (the F5/F6 read-path swap) — `loadRealSummary` / `loadRealReplay` turn a
 * persisted ranked/practice match into the exact shapes the Battle Summary + Playback routes consume,
 * so the arena deploy → summary → replay loop is real end-to-end. A non-uuid (demo) id returns null
 * so those routes fall back to the demo battery.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { startRankedMatch } from '@/server/arena';
import { startPracticeMatch } from '@/server/practice';
import { loadRealReplay, loadRealSummary } from '@/server/match-read';

import { truncateAll, closeDb, createTestUser } from './db-setup';
import { seedAttacker, seedDefender, seedSquad } from './arena-fixtures';

beforeEach(truncateAll);
afterAll(closeDb);

describe('loadRealSummary — a real ranked match reconciles into the summary shape', () => {
  it('resolves viewer=attacker (side A), a ranked standing, and a revealed opponent', async () => {
    const { ctx, squadId } = await seedAttacker();
    const defender = await seedDefender({ count: 1 });

    const rec = await startRankedMatch(ctx, { attackSquadId: squadId, ticketSnapshotId: defender.snapshotIds[0] });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const summary = await loadRealSummary(rec.value.matchId, ctx.id);
    expect(summary).not.toBeNull();
    if (!summary) return;

    // The attacker views their own attack from side A; the result winner is a real side.
    expect(summary.ctx.viewerSide).toBe('A');
    expect(['A', 'B']).toContain(summary.result.winner);
    // Ranked standing is present with a computed before/after around the net-victory delta.
    expect(summary.ctx.standing?.mode).toBe('ranked');
    expect(typeof summary.ctx.standing?.after).toBe('number');
    expect(summary.ctx.standing?.before).toBe((summary.ctx.standing?.after ?? 0) - (summary.ctx.standing?.delta ?? 0));
    // Ranked reveals the opponent (not hidden); the derived stream is wired.
    expect(summary.ctx.opponent.hidden).toBe(false);
    expect(summary.ctx.unitOrder.length).toBeGreaterThan(0);
    expect(summary.ctx.replayRef.matchId).toBe(rec.value.matchId);
  });
});

describe('loadRealSummary — a practice match hides identity and moves no standing', () => {
  it('marks the standing unranked and the opponent hidden', async () => {
    const { ctx, squadId } = await seedAttacker();
    const other = await createTestUser();
    const opponentSquadId = await seedSquad(other.id, 0);

    const rec = await startPracticeMatch(ctx, { attackSquadId: squadId, opponentSquadId });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const summary = await loadRealSummary(rec.value.matchId, ctx.id);
    expect(summary).not.toBeNull();
    if (!summary) return;

    expect(summary.ctx.standing?.mode).toBe('practice');
    expect(summary.ctx.opponent.hidden).toBe(true);
    expect(summary.ctx.opponent.name).toBeUndefined();
  });
});

describe('loadRealReplay — real replay + viewer side, demo ids fall back to null', () => {
  it('returns the recorded replay and the viewer side for a real match', async () => {
    const { ctx, squadId } = await seedAttacker();
    const defender = await seedDefender({ count: 1 });
    const rec = await startRankedMatch(ctx, { attackSquadId: squadId, ticketSnapshotId: defender.snapshotIds[0] });
    if (!rec.ok) return;

    const loaded = await loadRealReplay(rec.value.matchId, ctx.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.playerSide).toBe('A');
    expect(loaded?.replay.games.length).toBeGreaterThan(0);
  });

  it('returns null for a non-uuid (demo) id so the route uses its demo seam', async () => {
    expect(await loadRealReplay('e2e-match')).toBeNull();
    expect(await loadRealSummary('demo-123')).toBeNull();
  });
});
