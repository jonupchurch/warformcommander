/**
 * Feature 10 profile assembly (US1/US2) — server-side reads over Feature 7. The load-bearing
 * guarantees: displayed career equals `ladder_standings` (SC-001), only public columns cross the
 * boundary (no email/role — SC-007), recorded matches project to rows with Summary/Playback hrefs and
 * practice opponents hidden, an unknown handle is NOT_FOUND, and badges/rank derive from the career.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getOwnProfile, getProfileByHandle } from '@/server/profile';
import { startRankedMatch } from '@/server/arena';
import { startPracticeMatch } from '@/server/practice';

import { truncateAll, closeDb, createTestUser } from './db-setup';
import { seedStanding } from './ladder-fixtures';
import { seedAttacker, seedDefender, seedSquad } from './arena-fixtures';

beforeEach(truncateAll);
afterAll(closeDb);

describe('getProfileByHandle — career equals the standing (SC-001) + public-only (SC-007)', () => {
  it('projects ladder_standings to career, recomputes record/win-rate, derives badges + rank, hides private fields', async () => {
    const id = await seedStanding({
      handle: 'ACE',
      attackWins: 60,
      attackLosses: 30,
      defenseWins: 27,
      defenseLosses: 25,
      totalDamage: 1_500_000,
      matchesPlayed: 142,
      bestStreak: 12,
    });

    const res = await getProfileByHandle('ACE', null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const vm = res.value;

    // career == standing (net = 60 − 25 = 35), record/win-rate recomputed
    expect(vm.career.netVictories).toBe(35);
    expect(vm.career.wins).toBe(87);
    expect(vm.career.record).toBe('87–55');
    expect(vm.career.winRatePct).toBe(Math.round((87 / 142) * 100));

    // identity carries ONLY public fields — never email / role
    expect(Object.keys(vm.identity).sort()).toEqual(['avatarUrl', 'enlistedAt', 'handle', 'isBot', 'isOwn']);
    expect(vm.identity.handle).toBe('ACE');
    expect(vm.identity.isOwn).toBe(false); // anonymous viewer

    // badges derive from the career (Heavy Ordnance earned at 1.5M damage; Centurion in-progress at 87 wins)
    expect(vm.badges.find((b) => b.id === 'heavy-ordnance')?.state).toBe('earned');
    expect(vm.badges.find((b) => b.id === 'centurion')?.state).toBe('in-progress');
    void id;
  });

  it('is NOT_FOUND for an unknown handle', async () => {
    const res = await getProfileByHandle('nobody', null);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('NOT_FOUND');
  });
});

describe('getOwnProfile — recorded matches project to rows', () => {
  it('a ranked attack appears with side=attack + Summary/Playback hrefs by matchId', async () => {
    const { ctx, squadId } = await seedAttacker();
    const defender = await seedDefender({ count: 1 });
    const rec = await startRankedMatch(ctx, { attackSquadId: squadId, ticketSnapshotId: defender.snapshotIds[0] });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const res = await getOwnProfile(ctx.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const vm = res.value;

    const row = vm.recentMatches.find((r) => r.matchId === rec.value.matchId)!;
    expect(row.side).toBe('attack');
    expect(['W', 'L']).toContain(row.result);
    expect(row.summaryHref).toBe(`/matches/${rec.value.matchId}/summary`);
    expect(row.playbackHref).toBe(`/battle/${rec.value.matchId}`);
    expect(vm.identity.isOwn).toBe(true);
    // the attacker fielded a squad → a most-fielded unit is derivable
    expect(vm.mostFieldedUnit).not.toBeNull();
  });

  it('hides the opponent on a practice row', async () => {
    const { ctx, squadId } = await seedAttacker();
    const other = await createTestUser();
    const opponentSquadId = await seedSquad(other.id, 0);
    const rec = await startPracticeMatch(ctx, { attackSquadId: squadId, opponentSquadId });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;

    const res = await getOwnProfile(ctx.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.value.recentMatches.find((r) => r.matchId === rec.value.matchId)!;
    expect(row.isPractice).toBe(true);
    expect(row.opponent).toEqual({ kind: 'hidden' });
  });
});
