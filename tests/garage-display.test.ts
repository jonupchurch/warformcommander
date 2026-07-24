/**
 * Pure Garage display projections — the 7 stat bars, the 4 dial tiles, and the enum humanizer. These
 * turn engine values (milli/bp) into the mockup's readouts; keeping them pure makes them testable
 * without rendering.
 */

import { describe, expect, it } from 'vitest';

import { defaultFor } from '@/lib/garage/preset-catalog';
import {
  MACHINE_TYPE_LABEL,
  UNIT_ICON_KEY,
  dialTiles,
  familyTone,
  humanize,
  statBars,
  zoneTone,
} from '@/lib/garage/display';
import { deriveEffectiveStats } from '@/sim/derive';

import { defaultRuleset as rs } from './ruleset-fixture';

function grizzlyStats() {
  const seed = defaultFor('Grizzly', rs);
  const r = deriveEffectiveStats(
    { typeId: 'HeavyTank', variantId: 'Grizzly', loadout: seed.loadout },
    rs,
  );
  if (!r.ok) throw new Error('derive failed');
  return r.stats;
}

describe('statBars', () => {
  it('renders the 7 mockup bars in order with unit-scaled displays', () => {
    const bars = statBars(grizzlyStats());
    expect(bars.map((b) => b.label)).toEqual([
      'HULL',
      'ARMOR',
      'SHIELD',
      'DAMAGE',
      'FIRE RATE',
      'SPEED',
      'EVASION',
    ]);
    const byLabel = Object.fromEntries(bars.map((b) => [b.label, b]));
    // Derived with the default Balanced defense (v2): the Grizzly's base hull was rebased to 1479
    // and the Balanced default adds +5% armor (30% → 35%) plus a small shield pool.
    expect(byLabel.HULL.display).toBe('1479'); // 1_479_000 milli → 1479 units
    expect(byLabel.ARMOR.display).toBe('35%'); // 3000 bp base + 500 bp Balanced → 35%
    expect(byLabel.DAMAGE.display).toBe('35'); // HeavyCannon identity → 35
  });

  it('an air-locked machine shows AIR for speed', () => {
    const seed = defaultFor('Gunship', rs);
    const r = deriveEffectiveStats(
      { typeId: 'AttackHeli', variantId: 'Gunship', loadout: seed.loadout },
      rs,
    );
    if (!r.ok) throw new Error('derive failed');
    const speed = statBars(r.stats).find((b) => b.label === 'SPEED');
    expect(speed?.display).toBe('AIR');
  });
});

describe('dialTiles + humanize', () => {
  it('humanizes PascalCase enum values', () => {
    expect(humanize('FocusFire')).toBe('Focus Fire');
    expect(humanize('FallBack')).toBe('Fall Back');
  });

  it('projects the 3 behavior dials (v3 — the energy tile was removed)', () => {
    const seed = defaultFor('Grizzly', rs);
    const tiles = dialTiles(seed.dials);
    expect(tiles.map((t) => t.label)).toEqual(['TARGET', 'POSITION', 'STANCE']);
    // STOCK_DIALS targeting is a bare chain, so the tile shows its fallback selector.
    expect(tiles[0].value).toBe('Closest');
  });
});

describe('mappings', () => {
  it('maps every machine type to an icon key + label', () => {
    expect(UNIT_ICON_KEY.AttackHeli).toBe('heli');
    expect(MACHINE_TYPE_LABEL.RocketArtillery).toBe('Rocket Artillery');
  });

  it('maps families and zones to tones', () => {
    expect(familyTone('Kinetic')).toBe('kinetic');
    expect(zoneTone('Air')).toBe('air');
  });
});
