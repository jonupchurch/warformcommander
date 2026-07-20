/**
 * Feature 6 MVP reduction (T016) — the O(events) per-machine damage pass. Sums reconcile with the
 * result side totals (Feature 1 SC-002), kills are attributed to the killer, and the reduction is
 * omitted (undefined) when no events are present so the MVP is simply dropped (FR-010).
 */

import { describe, expect, it } from 'vitest';

import type { MatchResult } from '@/sim/model';
import { perMachineDamageFromEvents } from '@/lib/battle-summary/mvp';

import { loadBatteryReplay } from './replay-fixtures';

describe('perMachineDamageFromEvents — reconciles with the result (SC-002)', () => {
  const replay = loadBatteryReplay();
  const result = replay.result as MatchResult;
  const damage = perMachineDamageFromEvents(replay.games, replay.meta.unitOrder)!;

  it('returns one entry per machine, aligned to unitOrder', () => {
    expect(damage).toHaveLength(replay.meta.unitOrder.length);
    damage.forEach((d, i) => {
      expect(d.column).toBe(i);
      expect(d.side).toBe(replay.meta.unitOrder[i]!.side);
    });
  });

  it('Σ damage dealt per side equals the result side totals — zero drift', () => {
    const sumBySide = (side: 'A' | 'B') =>
      damage.filter((d) => d.side === side).reduce((s, d) => s + d.damageDealt, 0);
    expect(sumBySide('A')).toBe(result.sideA.damageDealt);
    expect(sumBySide('B')).toBe(result.sideB.damageDealt);
  });

  it('total kills equals the number of deaths with an attributed killer', () => {
    const totalKills = damage.reduce((s, d) => s + d.kills, 0);
    const deaths = replay.games
      .flatMap((g) => g.events.flat())
      .filter((e) => e.t === 'death' && e.k != null).length;
    expect(totalKills).toBe(deaths);
    expect(totalKills).toBeGreaterThan(0);
  });

  it('damage absorbed is non-negative and the top dealer has real numbers', () => {
    const top = damage.reduce((best, d) => (d.damageDealt > best.damageDealt ? d : best));
    expect(top.damageDealt).toBeGreaterThan(0);
    expect(damage.every((d) => d.damageAbsorbed >= 0)).toBe(true);
  });
});

describe('omission when events are absent (FR-010)', () => {
  it('returns undefined for no games and for games with only empty event ticks', () => {
    expect(perMachineDamageFromEvents(undefined, [])).toBeUndefined();
    expect(perMachineDamageFromEvents([], [])).toBeUndefined();
    const emptyGame = { gameResult: {} as never, snapshots: [], events: [[], []] };
    expect(perMachineDamageFromEvents([emptyGame], [{ side: 'A', instanceId: 0, typeId: 'HeavyTank', variantId: 'X' }])).toBeUndefined();
  });
});
