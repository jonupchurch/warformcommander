/**
 * Feature 9 ladder view-model (US1/US2, T011/T023) — pure mapping, DB-free. The load-bearing bits:
 * the **signed** net-victory label (negatives keep their sign — FR-003), the record string, the
 * viewer-own flag, the Profile href, and the metric-specific value label.
 */

import { describe, expect, it } from 'vitest';

import { signedLabel, toLadderRows, toViewerStanding } from '@/components/ladder/view-model';
import type { LadderRowData, ViewerStanding } from '@/server/ladder/queries';

function row(over: Partial<LadderRowData> = {}): LadderRowData {
  return {
    userId: 'u1',
    handle: 'ACE',
    isBot: false,
    rank: 1,
    netVictories: 18,
    attackWins: 22,
    attackLosses: 9,
    defenseWins: 14,
    defenseLosses: 3,
    currentStreak: 4,
    bestStreak: 7,
    totalDamage: 123456,
    matchesPlayed: 48,
    metricValue: 18,
    ...over,
  };
}

describe('signedLabel', () => {
  it('signs positives, keeps negatives, plain zero', () => {
    expect(signedLabel(18)).toBe('+18');
    expect(signedLabel(-7)).toBe('-7');
    expect(signedLabel(0)).toBe('0');
  });
});

describe('toLadderRows', () => {
  it('maps fields, signs net victories, sets isViewer, builds the Profile href', () => {
    const rows = toLadderRows([row({ userId: 'me', netVictories: -7 }), row({ userId: 'other' })], 'me', 'net');
    expect(rows[0].netVictoriesLabel).toBe('-7');
    expect(rows[0].isViewer).toBe(true);
    expect(rows[0].profileHref).toBe('/profile/me');
    expect(rows[1].isViewer).toBe(false);
    expect(rows[0].record).toBe('22-9 · 14-3D');
    expect(rows[0].streak).toEqual({ current: 4, best: 7 });
  });

  it('formats the metric value label per selected metric', () => {
    expect(toLadderRows([row()], null, 'damage')[0].metricValueLabel).toBe((123456).toLocaleString());
    expect(toLadderRows([row({ netVictories: -7 })], null, 'net')[0].metricValueLabel).toBe('-7');
    expect(toLadderRows([row({ defenseWins: 14 })], null, 'defenses')[0].metricValueLabel).toBe('14');
  });

  it('falls back to a stable handle when none is set', () => {
    const rows = toLadderRows([row({ userId: 'abcdef123456', handle: null })], null, 'net');
    expect(rows[0].handle).toBe('Commander abcdef');
  });

  it('never flags a viewer when the viewer id is null (anonymous)', () => {
    expect(toLadderRows([row({ userId: 'x' })], null, 'net')[0].isViewer).toBe(false);
  });
});

describe('toViewerStanding', () => {
  it('ranked → a row flagged isViewer', () => {
    const v: ViewerStanding = { state: 'ranked', ...row({ userId: 'me', rank: 42 }) };
    const vm = toViewerStanding(v, 'net');
    expect(vm.state).toBe('ranked');
    if (vm.state !== 'ranked') return;
    expect(vm.row.rank).toBe(42);
    expect(vm.row.isViewer).toBe(true);
  });

  it('unranked → the Arena CTA (never a fabricated rank)', () => {
    const vm = toViewerStanding({ state: 'unranked' }, 'net');
    expect(vm).toEqual({ state: 'unranked', ctaHref: '/arena' });
  });
});
