/**
 * Feature 8 matchmaking (T010/T020-T022/T036) — the random opponent + practice draw. Never self,
 * never empty with cold-start bots, per-player-fair, and self-excluding for practice.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pickRankedOpponent, drawPracticeOpponent } from '@/server/matchmaking';

import { truncateAll, closeDb } from './db-setup';
import { seedAttacker, seedDefender, seedSquad } from './arena-fixtures';

beforeEach(truncateAll);
afterAll(closeDb);

describe('pickRankedOpponent — basic selection (T010, US1)', () => {
  it('returns a defender ≠ the attacker plus one active snapshot of that defender', async () => {
    const { ctx } = await seedAttacker();
    const { userId, snapshotIds } = await seedDefender({ count: 3 });

    const pick = await pickRankedOpponent(ctx);
    expect(pick.ok).toBe(true);
    if (!pick.ok) return;
    expect(pick.value.defenderUserId).toBe(userId);
    expect(pick.value.defenderUserId).not.toBe(ctx.id);
    expect(snapshotIds).toContain(pick.value.defenderSnapshotId);
    expect(pick.value.poolSource).toBe('real');
    // A handle-less defender resolves to the stable id-derived fallback (Arena shows *who* you face).
    expect(pick.value.defenderHandle).toBe(`Commander ${userId.slice(0, 6)}`);
  });

  it('surfaces the defender commander handle when they have one (US3 — identity, not behavior)', async () => {
    const { ctx } = await seedAttacker();
    const { userId } = await seedDefender({ handle: 'AceDefender' });

    const pick = await pickRankedOpponent(ctx);
    expect(pick.ok).toBe(true);
    if (!pick.ok) return;
    expect(pick.value.defenderUserId).toBe(userId);
    expect(pick.value.defenderHandle).toBe('AceDefender');
  });

  it('errors NO_OPPONENT when the pool holds only the attacker (never self-matches)', async () => {
    // `seedAttacker` already fields the attacker's own active defense snapshot — which must still never
    // be served back to them. No other defender exists, so matchmaking must error rather than self-match.
    const { ctx } = await seedAttacker();

    const pick = await pickRankedOpponent(ctx);
    expect(pick.ok).toBe(false);
    if (pick.ok) return;
    expect(pick.error).toBe('NO_OPPONENT');
  });
});

describe('pickRankedOpponent — never self / never empty / fair (US2)', () => {
  it('over 200 draws: 0 self-matches, 100% eligible non-self defender + one active snapshot (SC-004)', async () => {
    const { ctx } = await seedAttacker();
    const d1 = await seedDefender({ count: 2 });
    const d2 = await seedDefender({ count: 1 });
    const d3 = await seedDefender({ count: 3 });
    const validUsers = new Set([d1.userId, d2.userId, d3.userId]);
    const validSnaps = new Set([...d1.snapshotIds, ...d2.snapshotIds, ...d3.snapshotIds]);

    for (let i = 0; i < 200; i += 1) {
      const pick = await pickRankedOpponent(ctx);
      expect(pick.ok).toBe(true);
      if (!pick.ok) return;
      expect(pick.value.defenderUserId).not.toBe(ctx.id);
      expect(validUsers.has(pick.value.defenderUserId)).toBe(true);
      expect(validSnaps.has(pick.value.defenderSnapshotId)).toBe(true);
    }
  });

  it('with only bot defenders present, still returns a bot every time — never NO_OPPONENT (AS2, P5)', async () => {
    const { ctx } = await seedAttacker();
    const bot = await seedDefender({ isBot: true, count: 2 });
    for (let i = 0; i < 30; i += 1) {
      const pick = await pickRankedOpponent(ctx);
      expect(pick.ok).toBe(true);
      if (!pick.ok) return;
      expect(pick.value.defenderUserId).toBe(bot.userId);
      expect(pick.value.poolSource).toBe('bot');
    }
  });

  it('is per-player-fair — each defender user drawn ~equally regardless of snapshot count (T022)', async () => {
    const { ctx } = await seedAttacker();
    const many = await seedDefender({ count: 3 }); // 3 snapshots
    const few = await seedDefender({ count: 1 }); // 1 snapshot
    const counts: Record<string, number> = { [many.userId]: 0, [few.userId]: 0 };
    const N = 400;
    for (let i = 0; i < N; i += 1) {
      const pick = await pickRankedOpponent(ctx);
      if (pick.ok) counts[pick.value.defenderUserId] = (counts[pick.value.defenderUserId] ?? 0) + 1;
    }
    // Fair by USER, not weighted 3:1 by snapshot count — expect each near 50%, allow a wide band.
    expect(counts[many.userId]! / N).toBeGreaterThan(0.3);
    expect(counts[few.userId]! / N).toBeGreaterThan(0.3);
  });
});

describe('drawPracticeOpponent — random, self-excluding (US4)', () => {
  it('draws a squad owned by someone else, never the caller (T036)', async () => {
    const { ctx } = await seedAttacker();
    const other = await seedAttacker();
    for (let i = 0; i < 20; i += 1) {
      const draw = await drawPracticeOpponent(ctx);
      expect(draw.ok).toBe(true);
      if (!draw.ok) return;
      expect(draw.value.opponentSquadId).toBe(other.squadId);
    }
  });

  it('honors the exclude list so a refresh re-draws a different squad', async () => {
    const { ctx } = await seedAttacker();
    const a = await seedAttacker();
    // `third` gets its own slot-0 squad from seedAttacker; `bId` is its slot-1 squad. Exclude BOTH the
    // other attackers' slot-0 squads so `bId` is the *only* eligible draw — otherwise `third`'s slot-0
    // is also eligible and the random pick is a coin flip (this test used to be ~50% flaky).
    const third = await seedAttacker();
    const bId = await seedSquad(third.ctx.id, 1);

    const draw = await drawPracticeOpponent(ctx, [a.squadId, third.squadId]);
    expect(draw.ok).toBe(true);
    if (!draw.ok) return;
    expect(draw.value.opponentSquadId).toBe(bId);
  });
});
