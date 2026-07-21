/**
 * Feature 10 badge derivation (US4, T025/T026) — pure, cosmetic, no store (SC-004/SC-005). Earned ⟺
 * measure ≥ goal; progress = min(measure/goal, 1); a boundary crossing flips exactly one badge; a
 * zero-career shows the whole catalog unearned; and a BadgeView exposes only display fields.
 */

import { describe, expect, it } from 'vitest';

import { BADGE_CATALOG, deriveBadges } from '@/lib/badges';
import type { CareerStats } from '@/lib/profile-types';

function career(over: Partial<CareerStats> = {}): CareerStats {
  return {
    attackWins: 0,
    attackLosses: 0,
    defenseWins: 0,
    defenseLosses: 0,
    netVictories: 0,
    matchesPlayed: 0,
    totalDamage: 0,
    currentStreak: 0,
    bestStreak: 0,
    wins: 0,
    losses: 0,
    record: '0–0',
    winRatePct: 0,
    ...over,
  };
}

describe('deriveBadges — earned ⟺ measure ≥ goal (SC-005)', () => {
  it('a zero career shows every catalog badge unearned at 0 progress', () => {
    const badges = deriveBadges(career());
    expect(badges).toHaveLength(BADGE_CATALOG.length);
    expect(badges.every((b) => b.state === 'in-progress')).toBe(true);
    expect(badges.every((b) => b.progress === 0)).toBe(true);
  });

  it('earns exactly the badges whose measure meets the goal, with correct progress', () => {
    const badges = deriveBadges(career({ matchesPlayed: 1, wins: 50, netVictories: 3 }));
    const first = badges.find((b) => b.id === 'first-deployment')!;
    const centurion = badges.find((b) => b.id === 'centurion')!;
    expect(first.state).toBe('earned'); // matchesPlayed 1 ≥ 1
    expect(first.progress).toBe(1);
    expect(centurion.state).toBe('in-progress'); // wins 50 < 100
    expect(centurion.progress).toBeCloseTo(0.5);
    expect(centurion.progressText).toBe('50 / 100');
  });

  it('crossing a boundary (99 → 100) flips exactly one badge and nothing else', () => {
    const at99 = deriveBadges(career({ wins: 99 }));
    const at100 = deriveBadges(career({ wins: 100 }));
    const flipped = at100.filter((b, i) => b.state !== at99[i].state);
    expect(flipped).toHaveLength(1);
    expect(flipped[0].id).toBe('centurion');
  });
});

describe('cosmetic invariant (SC-004)', () => {
  it('a BadgeView exposes only display fields — no capability/unlock/stat/gameplay value', () => {
    const [b] = deriveBadges(career({ matchesPlayed: 1 }));
    expect(Object.keys(b).sort()).toEqual(['desc', 'icon', 'id', 'name', 'progress', 'progressText', 'state']);
  });

  it('every catalog measure reads only CareerStats counters (pure, total)', () => {
    // Calling each measure against an arbitrary CareerStats never throws and returns a number.
    const c = career({ matchesPlayed: 7, totalDamage: 42 });
    for (const def of BADGE_CATALOG) {
      expect(typeof def.measure(c)).toBe('number');
    }
  });
});
