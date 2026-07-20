/**
 * Feature 8 practice sandbox (US4) — no-stakes matches. Records `mode='practice'`, moves no standing,
 * conceals the opponent's identity, and refreshes to a different hidden squad with no side effects.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { ladderStandings } from '@/db/schema';
import { getMatch } from '@/server/matches';
import { refreshPracticeOpponent, startPracticeMatch } from '@/server/practice';

import { truncateAll, closeDb } from './db-setup';
import { seedAttacker, seedSquad } from './arena-fixtures';
import { createTestUser } from './db-setup';

beforeEach(truncateAll);
afterAll(closeDb);

describe('startPracticeMatch — records practice, moves no standing (T034, SC-003)', () => {
  it('records mode=practice, leaves standings untouched, and hides the opponent identity', async () => {
    const { ctx, squadId } = await seedAttacker();
    const other = await createTestUser();
    const opponentSquadId = await seedSquad(other.id, 0);

    const rec = await startPracticeMatch(ctx, { attackSquadId: squadId, opponentSquadId });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const m = await getMatch(rec.value.matchId);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.value.mode).toBe('practice');
    expect(m.value.adaptation).toBe('free');
    expect(m.value.defenderUserId).toBeNull(); // opponent identity never persisted

    // No standing row created by a practice match (reconciled against F7's oracle behavior).
    expect(await getDb().select().from(ladderStandings)).toHaveLength(0);
  });
});

describe('refreshPracticeOpponent — re-draws a different hidden squad, no side effects (T035, FR-015)', () => {
  it('excludes the current draw and never returns the caller’s own squad (T036)', async () => {
    const { ctx } = await seedAttacker();
    const other = await createTestUser();
    const first = await seedSquad(other.id, 0);
    const second = await seedSquad(other.id, 1);

    const refreshed = await refreshPracticeOpponent(ctx, first);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.value.opponentSquadId).toBe(second); // avoided the current draw
    // draw carries only an identity-free squad config
    expect(refreshed.value).not.toHaveProperty('opponentUserId');

    // no standing side effects from a refresh
    expect(await getDb().select().from(ladderStandings)).toHaveLength(0);
  });

  it('cannot practice against your own squad', async () => {
    const { ctx, squadId } = await seedAttacker();
    const rec = await startPracticeMatch(ctx, { attackSquadId: squadId, opponentSquadId: squadId });
    expect(rec.ok).toBe(false);
    if (rec.ok) return;
    expect(rec.error).toBe('NO_PRACTICE_OPPONENT');
  });
});
