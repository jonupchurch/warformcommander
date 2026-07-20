/**
 * The stock preset catalog + `defaultFor` (T010, FR-004). The load-bearing promise: the default build
 * a fresh machine seeds from is **validate-legal** for its variant — so a newly-typed squad is
 * immediately saveable (US1) — and the defaults are derived from the ruleset, never a hardcoded copy
 * of the balance table (P8).
 */

import { describe, expect, it } from 'vitest';

import {
  STOCK_DIALS,
  buildStockCatalog,
  defaultFor,
  defaultZoneFor,
} from '@/lib/garage/preset-catalog';
import { toSquadConfig } from '@/lib/garage/to-squad-config';
import type { DraftSlot } from '@/lib/garage/types';
import { deriveEffectiveStats } from '@/sim/derive';
import { validateArmy } from '@/sim/legality';
import type { ZoneId } from '@/sim/model';

import { defaultRuleset as rs } from './ruleset-fixture';

const allVariants = Object.keys(rs.chassis);

describe('defaultFor is legal-shaped for every variant (T010)', () => {
  it.each(allVariants)('%s seeds a mount-legal, slot-correct, derivable build', (variantId) => {
    const seed = defaultFor(variantId, rs);
    const typeId = rs.chassis[variantId].typeId;
    const mount = rs.machineTypes[typeId].mountClass;
    const slots = rs.chassis[variantId].slotLayoutOverride ?? rs.machineTypes[typeId].slotLayout;

    const weapon = rs.equipment[seed.loadout.weapon];
    const defense = rs.equipment[seed.loadout.defense];
    expect(weapon.kind).toBe('Weapon');
    expect(defense.kind).toBe('Defense');
    expect(weapon.kind === 'Weapon' && weapon.mountClass).toBe(mount);
    expect(defense.kind === 'Defense' && defense.mountClass).toBe(mount);

    // Slot layout respected + no duplicate utilities (V5).
    expect(seed.loadout.utilities).toHaveLength(slots.utility);
    expect(new Set(seed.loadout.utilities).size).toBe(slots.utility);

    expect(seed.dials).toEqual(STOCK_DIALS);
    expect(seed.planB).toEqual([]);

    // Derives to effective stats without a structural fault.
    const zone = defaultZoneFor(typeId, rs);
    const derived = deriveEffectiveStats(
      { instanceId: 0, typeId, variantId, loadout: seed.loadout, dials: seed.dials, planB: seed.planB, zone },
      rs,
    );
    expect(derived.ok).toBe(true);
  });
});

describe('defaultZoneFor', () => {
  it('an air-locked heli defaults to Air; ground types default to Front', () => {
    expect(defaultZoneFor('AttackHeli', rs)).toBe('Air');
    expect(defaultZoneFor('HeavyTank', rs)).toBe('Front');
  });
});

describe('buildStockCatalog', () => {
  it('groups one default preset per variant under its machine type', () => {
    const catalog = buildStockCatalog(rs);
    expect(Object.keys(catalog)).toHaveLength(7); // seven machine types
    const total = Object.values(catalog).reduce((n, ps) => n + ps.length, 0);
    expect(total).toBe(allVariants.length); // 21 variants → 21 stock presets
    // Every stock preset is tagged Stock and scoped to its type.
    for (const [typeId, presets] of Object.entries(catalog)) {
      for (const p of presets) {
        expect(p.origin).toBe('Stock');
        expect(p.typeId).toBe(typeId);
      }
    }
  });
});

describe('a squad built entirely from defaults is validate-legal end to end (SC-004 basis)', () => {
  it('the canonical 5-machine spread validates with no errors', () => {
    const spread: Array<[string, ZoneId]> = [
      ['Grizzly', 'Front'],
      ['Scout', 'Front'],
      ['Vanguard', 'Middle'],
      ['Gunship', 'Air'],
      ['Longbow', 'Rear'],
    ];
    const machines = spread.map(([variantId, zone]): DraftSlot => {
      const seed = defaultFor(variantId, rs);
      return {
        typeId: rs.chassis[variantId].typeId,
        variantId,
        loadout: seed.loadout,
        dials: seed.dials,
        planB: seed.planB,
        zone,
      };
    }) as [DraftSlot, DraftSlot, DraftSlot, DraftSlot, DraftSlot];

    const config = toSquadConfig({ name: 'Defaults', machines });
    expect(validateArmy(config, rs)).toEqual([]);
  });
});
