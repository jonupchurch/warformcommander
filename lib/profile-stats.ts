/**
 * Profile stat derivations (Feature 10) — **pure, no I/O**. These are the SC-001 contract (displayed
 * career == `ladder_standings`) and the match/activity projections. Keeping them pure is what makes
 * the equality cheaply testable.
 */

import type { LadderStanding } from '@/server/standings';
import type { MatchSummary } from '@/server/matches';

import type { CareerStats, MatchRow, WeekBucket } from './profile-types';

/** Project a `ladder_standings` row to `CareerStats`: copy every counter, recompute record/win-rate. */
export function toCareerStats(standing: LadderStanding): CareerStats {
  const attackWins = standing.attackWins;
  const attackLosses = standing.attackLosses;
  const defenseWins = standing.defenseWins;
  const defenseLosses = standing.defenseLosses;
  const wins = attackWins + defenseWins;
  const losses = attackLosses + defenseLosses;
  const matchesPlayed = standing.matchesPlayed;
  return {
    attackWins,
    attackLosses,
    defenseWins,
    defenseLosses,
    netVictories: standing.netVictories ?? attackWins - defenseLosses,
    matchesPlayed,
    totalDamage: standing.totalDamage,
    currentStreak: standing.currentStreak,
    bestStreak: standing.bestStreak,
    wins,
    losses,
    record: `${wins}–${losses}`,
    winRatePct: Math.round((wins / Math.max(matchesPlayed, 1)) * 100),
  };
}

/** Did the subject win this match? (attacker won ⟺ winnerSide 'attacker', etc.) */
function subjectWon(m: MatchSummary, subjectUserId: string): boolean {
  const isAttacker = m.attackerUserId === subjectUserId;
  return isAttacker ? m.winnerSide === 'attacker' : m.winnerSide === 'defender';
}

/**
 * Project a `matches` row to a display `MatchRow` from the subject's perspective. Pure — the opponent
 * handle is resolved upstream (server assembly) and passed in: a truthy handle ⇒ a linkable commander,
 * `null` ⇒ a deleted participant. Practice hides the opponent (FR-011).
 */
export function toMatchRow(m: MatchSummary, subjectUserId: string, opponentHandle: string | null): MatchRow {
  const isAttacker = m.attackerUserId === subjectUserId;
  const isPractice = m.mode === 'practice';
  const subjectGames = isAttacker ? m.attackerGamesWon : m.defenderGamesWon;
  const oppGames = isAttacker ? m.defenderGamesWon : m.attackerGamesWon;

  let opponent: MatchRow['opponent'];
  if (isPractice) opponent = { kind: 'hidden' };
  else if (opponentHandle) opponent = { kind: 'commander', handle: opponentHandle, profileHref: `/commander/${opponentHandle}` };
  else opponent = { kind: 'deleted' };

  return {
    matchId: m.id,
    result: subjectWon(m, subjectUserId) ? 'W' : 'L',
    side: isAttacker ? 'attack' : 'defense',
    score: `${subjectGames} – ${oppGames}`,
    opponent,
    isPractice,
    summaryHref: `/matches/${m.id}/summary`,
    playbackHref: `/battle/${m.id}`,
    playedAt: m.createdAt,
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Bucket the subject's matches into the most recent `weeks` calendar weeks (W/L per week), oldest →
 * newest (`W1`..`W{weeks}`). Pure given `now` (defaulted for the server; fixed in tests). Matches
 * older than the window are dropped.
 */
export function toWeekBuckets(
  matches: MatchSummary[],
  subjectUserId: string,
  weeks: number,
  now: Date = new Date(),
): WeekBucket[] {
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, j) => ({ label: `W${j + 1}`, wins: 0, losses: 0 }));
  const nowMs = now.getTime();
  for (const m of matches) {
    const weeksAgo = Math.floor((nowMs - m.createdAt.getTime()) / WEEK_MS);
    if (weeksAgo < 0 || weeksAgo >= weeks) continue;
    const bucket = buckets[weeks - 1 - weeksAgo]; // oldest → newest
    if (subjectWon(m, subjectUserId)) bucket.wins += 1;
    else bucket.losses += 1;
  }
  return buckets;
}
