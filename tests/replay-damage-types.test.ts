/**
 * `deriveUnitDamageTypes` (Battle Playback VFX) — the per-column damage type projected once from a
 * replay's persisted `meta.armies` + ruleset. Verified against the real native-emitted battery (whose
 * armies are populated) by cross-checking each column against the shared `deriveEffectiveStats`, plus
 * the guards for a missing/opaque armies blob and an unresolvable instance.
 */

import { describe, expect, it } from 'vitest';

import { deriveEffectiveStats } from '@/sim/derive';
import type { Army } from '@/sim/model';
import { deriveUnitDamageTypes } from '@/sim/replay-damage-types';
import type { WireUnit } from '@/sim/replay-reader';
import type { DamageType } from '@/sim/ruleset';

import { loadBatteryReplay } from './replay-fixtures';
import { defaultRuleset as rs } from './ruleset-fixture';

const VALID: DamageType[] = ['Kinetic', 'Energy', 'Explosive'];

describe('deriveUnitDamageTypes', () => {
  it('resolves every column of the real battery to a valid damage type, matching deriveEffectiveStats', () => {
    const replay = loadBatteryReplay();
    const armies = replay.meta.armies as [Army, Army];
    const order = replay.meta.unitOrder;

    const types = deriveUnitDamageTypes(order, armies, rs);
    expect(types).toHaveLength(order.length);

    // Each column's type equals its OWN machine's derived type (right side, right instance).
    order.forEach((u, col) => {
      const army = u.side === 'A' ? armies[0] : armies[1];
      const machine = army.machines.find((m) => m.instanceId === u.instanceId)!;
      const derived = deriveEffectiveStats(machine, rs);
      const expected = derived.ok ? derived.stats.damageType : null;
      expect(types[col]).toBe(expected);
      if (types[col] !== null) expect(VALID).toContain(types[col]);
    });

    // The battery has real offensive units, so at least one column resolves.
    expect(types.some((t) => t !== null)).toBe(true);
  });

  it('returns all null when the armies blob is absent/opaque (graceful VFX fallback)', () => {
    const order: WireUnit[] = [
      { side: 'A', instanceId: 0, typeId: 'HeavyTank', variantId: 'Grizzly' },
      { side: 'B', instanceId: 0, typeId: 'RocketArtillery', variantId: 'Sentry' },
    ];
    expect(deriveUnitDamageTypes(order, null, rs)).toEqual([null, null]);
    expect(deriveUnitDamageTypes(order, undefined, rs)).toEqual([null, null]);
  });

  it('returns null for a column whose instance is not in its army', () => {
    const replay = loadBatteryReplay();
    const armies = replay.meta.armies as [Army, Army];
    const bogus: WireUnit[] = [{ side: 'A', instanceId: 999, typeId: 'HeavyTank', variantId: 'Grizzly' }];
    expect(deriveUnitDamageTypes(bogus, armies, rs)).toEqual([null]);
  });
});
