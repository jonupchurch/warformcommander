/**
 * Profile view-model types (Feature 10) — the public, render-ready shape assembled server-side from
 * Feature 7 tables. This feature adds **no persistent tables** (P8 — one source of truth); it reuses
 * Feature 1/3/7 types by import and defines only the transient projection here.
 */

import type { MachineTypeKey } from '@/components/brand/unit-icon';

export interface ProfileIdentity {
  handle: string;
  avatarUrl: string | null; // users.image; null ⇒ brand-mark fallback
  enlistedAt: Date; // users.createdAt — "ENLISTED"
  isBot: boolean; // seeded/AI marker (P5)
  isOwn: boolean; // viewer === subject (label/reach only, not data)
}

/** The projection of `ladder_standings` (FR-006). Raw fields equal the standing; record/win-rate recomputed. */
export interface CareerStats {
  attackWins: number;
  attackLosses: number;
  defenseWins: number; // "DEFENSES HELD"
  defenseLosses: number;
  netVictories: number; // headline (§13)
  matchesPlayed: number;
  totalDamage: number;
  currentStreak: number;
  bestStreak: number;
  // recomputed for display (never persisted)
  wins: number; // attackWins + defenseWins
  losses: number; // attackLosses + defenseLosses
  record: string; // `${wins}–${losses}`
  winRatePct: number; // round(wins / max(matchesPlayed,1) * 100)
}

export type OpponentRef =
  | { kind: 'commander'; handle: string; profileHref: string }
  | { kind: 'hidden' } // practice (FR-011)
  | { kind: 'deleted' }; // null participant FK (FR-012)

export interface MatchRow {
  matchId: string;
  result: 'W' | 'L';
  side: 'attack' | 'defense';
  score: string; // subject games – opponent games
  opponent: OpponentRef;
  isPractice: boolean;
  summaryHref: string; // → Feature 6 by matchId
  playbackHref: string; // → Feature 5 by matchId
  playedAt: Date;
}

export interface WeekBucket {
  label: string; // e.g. "W1"
  wins: number;
  losses: number;
}

export interface SignatureSquad {
  name: string; // squads.name; "[deleted squad]" if FK null
  games: number;
  winRatePct: number;
}

export interface MostFieldedUnit {
  type: MachineTypeKey;
  label: string;
  pickPct?: number;
}

export type BadgeIcon = { kind: 'unit'; type: MachineTypeKey } | { kind: 'star' };

export interface BadgeDefinition {
  id: string;
  name: string;
  desc: string;
  icon: BadgeIcon;
  goal: number;
  measure: (c: CareerStats) => number; // pure read of a CareerStats counter
}

export interface BadgeView {
  id: string;
  name: string;
  desc: string;
  icon: BadgeIcon;
  state: 'earned' | 'in-progress';
  progress: number; // min(measure/goal, 1)
  progressText: string; // e.g. "87 / 100"
}

export interface ProfileViewModel {
  identity: ProfileIdentity;
  ladderRank: number | null; // display-only #N; null if unranked
  career: CareerStats;
  activity: WeekBucket[];
  recentMatches: MatchRow[];
  notable: MatchRow[];
  signatureSquads: SignatureSquad[];
  mostFieldedUnit: MostFieldedUnit | null;
  badges: BadgeView[];
}
