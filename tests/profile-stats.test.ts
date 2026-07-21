/**
 * Feature 10 profile stat derivations (US1/US2, T008/T014/T015) — pure, DB-free. The SC-001 contract:
 * displayed career equals `ladder_standings` with record/win-rate recomputed; match rows read from the
 * subject's perspective (practice hidden, null participant deleted, Summary/Playback hrefs by matchId);
 * activity buckets by week.
 */

import { describe, expect, it } from 'vitest';

import { toCareerStats, toMatchRow, toWeekBuckets } from '@/lib/profile-stats';
import type { LadderStanding } from '@/server/standings';
import type { MatchSummary } from '@/server/matches';

function standing(over: Partial<LadderStanding> = {}): LadderStanding {
  return {
    userId: 'u1',
    attackWins: 60,
    attackLosses: 30,
    defenseWins: 27,
    defenseLosses: 25,
    netVictories: 35, // attackWins − defenseLosses
    matchesPlayed: 142,
    totalDamage: 1_500_000,
    currentStreak: 3,
    bestStreak: 12,
    updatedAt: new Date('2026-07-20T00:00:00Z'),
    ...over,
  };
}

function match(over: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: 'm1',
    mode: 'ranked',
    attackerUserId: 'me',
    defenderUserId: 'opp',
    attackerSquadId: 'sq1',
    defenderSnapshotId: 'snap1',
    adaptation: 'locked',
    winnerSide: 'attacker',
    attackerGamesWon: 2,
    defenderGamesWon: 1,
    attackerDamage: 500,
    defenderDamage: 300,
    durationTicks: 400,
    seed: '1',
    rulesetHash: 'h',
    formatVersion: 1,
    createdAt: new Date('2026-07-20T00:00:00Z'),
    ...over,
  } as MatchSummary;
}

describe('toCareerStats (SC-001)', () => {
  it('copies every counter and recomputes record + win rate', () => {
    const c = toCareerStats(standing());
    expect(c.attackWins).toBe(60);
    expect(c.defenseWins).toBe(27);
    expect(c.netVictories).toBe(35);
    expect(c.totalDamage).toBe(1_500_000);
    expect(c.wins).toBe(87); // 60 + 27
    expect(c.losses).toBe(55); // 30 + 25
    expect(c.record).toBe('87–55');
    expect(c.winRatePct).toBe(Math.round((87 / 142) * 100)); // 61
  });

  it('a zero standing yields a coherent all-zero CareerStats (no divide-by-zero)', () => {
    const c = toCareerStats(standing({ attackWins: 0, attackLosses: 0, defenseWins: 0, defenseLosses: 0, netVictories: 0, matchesPlayed: 0, totalDamage: 0, currentStreak: 0, bestStreak: 0 }));
    expect(c.record).toBe('0–0');
    expect(c.winRatePct).toBe(0);
  });
});

describe('toMatchRow (SC-002, perspective + opponent)', () => {
  it('computes result/side/score from the subject perspective; links Summary + Playback by matchId', () => {
    const row = toMatchRow(match(), 'me', 'RIVAL');
    expect(row.result).toBe('W'); // attacker won, subject is attacker
    expect(row.side).toBe('attack');
    expect(row.score).toBe('2 – 1');
    expect(row.opponent).toEqual({ kind: 'commander', handle: 'RIVAL', profileHref: '/commander/RIVAL' });
    expect(row.summaryHref).toBe('/matches/m1/summary');
    expect(row.playbackHref).toBe('/battle/m1');
  });

  it('reads a defense loss from the defender perspective', () => {
    const row = toMatchRow(match({ attackerUserId: 'opp', defenderUserId: 'me', winnerSide: 'attacker' }), 'me', 'RIVAL');
    expect(row.side).toBe('defense');
    expect(row.result).toBe('L'); // attacker won, subject is defender
    expect(row.score).toBe('1 – 2'); // defenderGamesWon – attackerGamesWon
  });

  it('practice hides the opponent; a null participant is deleted', () => {
    expect(toMatchRow(match({ mode: 'practice', defenderUserId: null }), 'me', null).opponent).toEqual({ kind: 'hidden' });
    expect(toMatchRow(match({ defenderUserId: null }), 'me', null).opponent).toEqual({ kind: 'deleted' });
  });
});

describe('toWeekBuckets', () => {
  it('buckets W/L by week, oldest → newest, dropping out-of-window matches', () => {
    const now = new Date('2026-07-20T00:00:00Z');
    const day = 24 * 60 * 60 * 1000;
    const matches = [
      match({ id: 'a', createdAt: new Date(now.getTime() - 1 * day), winnerSide: 'attacker' }), // this week: W
      match({ id: 'b', createdAt: new Date(now.getTime() - 2 * day), winnerSide: 'defender' }), // this week: L (subject attacker)
      match({ id: 'c', createdAt: new Date(now.getTime() - 9 * day), winnerSide: 'attacker' }), // last week: W
      match({ id: 'd', createdAt: new Date(now.getTime() - 40 * day), winnerSide: 'attacker' }), // out of a 4-week window
    ];
    const buckets = toWeekBuckets(matches, 'me', 4, now);
    expect(buckets).toHaveLength(4);
    expect(buckets[3]).toEqual({ label: 'W4', wins: 1, losses: 1 }); // newest = this week
    expect(buckets[2]).toEqual({ label: 'W3', wins: 1, losses: 0 }); // last week
    expect(buckets[0]).toEqual({ label: 'W1', wins: 0, losses: 0 }); // oldest, empty (40d dropped)
  });

  it('empty input → empty (zeroed) strip', () => {
    const buckets = toWeekBuckets([], 'me', 3, new Date('2026-07-20T00:00:00Z'));
    expect(buckets).toEqual([
      { label: 'W1', wins: 0, losses: 0 },
      { label: 'W2', wins: 0, losses: 0 },
      { label: 'W3', wins: 0, losses: 0 },
    ]);
  });
});
