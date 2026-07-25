/**
 * US4 presets on-ramp (T031). The risky logic is the **pure** transforms: type-scoping (a preset is
 * offered only to its own machine type), slot-fitting (a 4-utility bundle never overfills a 3-slot
 * variant, FR-013/AS4), and the apply plan the reducer consumes. Every legality claim is cross-checked
 * against `validateArmy` — the same rules the server re-runs — so the on-ramp can never field an
 * illegal squad the engine would reject (P8). (DB persistence of `savePreset` is a Feature 7 concern,
 * covered by its own suite / e2e — not re-tested here.)
 */

import { describe, expect, it } from 'vitest';

import { garageReducer, freshSession, type EditorAction } from '@/lib/garage/editor-reducer';
import { buildStockCatalog, defaultFor, type CatalogPreset } from '@/lib/garage/preset-catalog';
import {
  fitPresetToVariant,
  fitUtilities,
  planCustomApply,
  planStockApply,
  presetsForType,
  toPresetConfig,
  utilitySlots,
} from '@/lib/garage/presets';
import { toSquadConfig } from '@/lib/garage/to-squad-config';
import type { DraftMachine, DraftSlot } from '@/lib/garage/types';
import { validateArmy } from '@/sim/legality';
import type { PresetConfig } from '@/sim/model';

import { defaultRuleset as rs } from './ruleset-fixture';

/** A `PresetConfig` seeded from a variant's default build (a real, legal per-type bundle). */
function configFor(variantId: string): PresetConfig {
  const seed = defaultFor(variantId, rs);
  return { loadout: seed.loadout, dials: seed.dials, planB: seed.planB };
}

/** Look up a stock preset by variant id across the whole catalog. */
function stockOf(variantId: string): CatalogPreset {
  const preset = Object.values(buildStockCatalog(rs))
    .flat()
    .find((p) => p.variantId === variantId);
  if (!preset) throw new Error(`no stock preset for ${variantId}`);
  return preset;
}

describe('slot-layout awareness', () => {
  it('reads a variant utility count, honoring the layout (Commander = 5, Sentinel = 4, others = 3)', () => {
    expect(utilitySlots('Grizzly', rs)).toBe(3);
    expect(utilitySlots('Medic', rs)).toBe(3);
    expect(utilitySlots('CommandPost', rs)).toBe(5); // now the Commander chassis (US5) — 5 slots
    expect(utilitySlots('Sentinel', rs)).toBe(4);
  });
});

describe('fitUtilities (FR-013)', () => {
  it('truncates an over-long list to the slot count — never overfills', () => {
    const bundle = defaultFor('CommandPost', rs).loadout.utilities; // Commander stock fills its 5 slots
    expect(bundle).toHaveLength(5);
    const fit = fitUtilities(bundle, 3, rs);
    expect(fit).toHaveLength(3);
    expect(fit).toEqual(bundle.slice(0, 3));
  });

  it('drops duplicates and stale (non-utility) ids', () => {
    const dupes = ['Autoloader', 'Autoloader', 'CombatAI', 'NotAThing'];
    const fit = fitUtilities(dupes, 3, rs);
    expect(fit).toHaveLength(3);
    expect(new Set(fit).size).toBe(3); // no dupes
    expect(fit).not.toContain('NotAThing'); // stale id dropped
    expect(fit.slice(0, 2)).toEqual(['Autoloader', 'CombatAI']);
  });

  it('pads a short list up to the slot count with distinct ungated utilities', () => {
    const fit = fitUtilities(['Autoloader'], 4, rs);
    expect(fit).toHaveLength(4);
    expect(fit[0]).toBe('Autoloader');
    expect(new Set(fit).size).toBe(4);
  });
});

describe('fitPresetToVariant', () => {
  it('fits a wider bundle onto a 3-slot variant, preserving weapon/defense/dials/planB', () => {
    const cfg = configFor('CommandPost'); // Commander stock — 5 utilities
    const seed = fitPresetToVariant(cfg, 'Medic', rs); // Medic = 3 slots
    expect(seed.variantId).toBe('Medic');
    expect(seed.loadout.utilities).toHaveLength(3);
    expect(seed.loadout.weapon).toBe(cfg.loadout.weapon);
    expect(seed.loadout.defense).toBe(cfg.loadout.defense);
    expect(seed.dials).toEqual(cfg.dials);
    expect(seed.planB).toEqual(cfg.planB);
  });

  it('pads a 3-utility bundle onto a wider-slot variant', () => {
    const cfg = configFor('Medic'); // 3 utilities
    const seed = fitPresetToVariant(cfg, 'CommandPost', rs); // Commander = 5 slots (US5)
    expect(seed.loadout.utilities).toHaveLength(5);
  });
});

describe('presetsForType (FR-013 / AS3 — type scoping)', () => {
  it('offers a preset only to a machine of its own type', () => {
    const lib = [
      { id: 'a', machineTypeId: 'RearSupport', name: 'x' },
      { id: 'b', machineTypeId: 'HeavyTank', name: 'y' },
    ];
    expect(presetsForType(lib, 'RearSupport').map((p) => p.id)).toEqual(['a']);
    expect(presetsForType(lib, 'HeavyTank').map((p) => p.id)).toEqual(['b']);
    expect(presetsForType(lib, 'Mech')).toEqual([]); // a different type is not offered any
  });
});

describe('toPresetConfig', () => {
  it('extracts a deep-copied loadout/dials/planB (no aliasing back to the machine)', () => {
    const seed = defaultFor('Grizzly', rs);
    const machine: DraftMachine = {
      typeId: 'HeavyTank',
      variantId: 'Grizzly',
      loadout: seed.loadout,
      dials: seed.dials,
      planB: seed.planB,
      zone: 'Front',
    };
    const cfg = toPresetConfig(machine);
    expect(cfg.loadout).toEqual(machine.loadout);
    expect(cfg.loadout).not.toBe(machine.loadout); // copied
    expect(cfg.loadout.utilities).not.toBe(machine.loadout.utilities);
    expect(cfg.dials).not.toBe(machine.dials);
  });
});

describe('apply plans', () => {
  it('planStockApply uses the current zone when filled, else the home zone; stamps the id', () => {
    const grizzly = stockOf('Grizzly');
    expect(planStockApply(grizzly, 'Rear', rs)).toMatchObject({
      typeId: 'HeavyTank',
      zone: 'Rear', // keeps the slot's current zone
      sourcePresetId: grizzly.id,
    });
    expect(planStockApply(grizzly, null, rs).zone).toBe('Front'); // empty slot → home zone
  });

  it('planCustomApply fits to the current variant when filled, else the type default variant', () => {
    const cfg = configFor('CommandPost'); // Commander stock — 5 utilities
    const preset = { id: 'custom:1', machineTypeId: 'RearSupport' as const, config: cfg };

    const filled = planCustomApply(preset, 'Medic', 'Middle', rs);
    expect(filled.seed.variantId).toBe('Medic');
    expect(filled.seed.loadout.utilities).toHaveLength(3); // fit to Medic's 3 slots
    expect(filled.zone).toBe('Middle');
    expect(filled.sourcePresetId).toBe('custom:1');

    const empty = planCustomApply(preset, null, null, rs);
    expect(empty.seed.variantId).toBeTruthy(); // fell back to the type's default variant
    expect(empty.zone).toBe('Front'); // RearSupport home zone
  });
});

describe('reducer applyPreset verb', () => {
  it('fields an empty slot, stamps sourcePresetId, and a later hand-edit clears it', () => {
    const grizzly = stockOf('Grizzly');
    const s0 = garageReducer(freshSession(), {
      type: 'applyPreset',
      slot: 0,
      ...planStockApply(grizzly, null, rs),
    });
    const m = s0.draft.machines[0]!;
    expect(m.typeId).toBe('HeavyTank');
    expect(m.variantId).toBe('Grizzly');
    expect(m.zone).toBe('Front');
    expect(m.sourcePresetId).toBe(grizzly.id);

    const s1 = garageReducer(s0, { type: 'setWeapon', slot: 0, equipmentId: m.loadout.weapon });
    expect(s1.draft.machines[0]!.sourcePresetId).toBeUndefined(); // "modified since preset"
  });

  it('re-applies onto a filled slot keeping its zone', () => {
    const grizzly = stockOf('Grizzly');
    let s = garageReducer(freshSession(), {
      type: 'applyPreset',
      slot: 0,
      ...planStockApply(grizzly, null, rs),
    });
    s = garageReducer(s, { type: 'placeInZone', slot: 0, zone: 'Rear' });
    const cur = s.draft.machines[0]!;
    // Re-apply a custom preset; the plan takes the slot's current zone (Rear) + variant.
    const preset = { id: 'custom:2', machineTypeId: 'HeavyTank' as const, config: configFor('Grizzly') };
    s = garageReducer(s, {
      type: 'applyPreset',
      slot: 0,
      ...planCustomApply(preset, cur.variantId, cur.zone, rs),
    });
    expect(s.draft.machines[0]!.zone).toBe('Rear');
    expect(s.draft.machines[0]!.sourcePresetId).toBe('custom:2');
  });
});

describe('on-ramp fields a legal squad (SC-004) and stays legal under fitting', () => {
  const run = (s: ReturnType<typeof freshSession>, ...a: EditorAction[]) => a.reduce(garageReducer, s);

  it('five stock presets placed across zones validate clean', () => {
    // Front:2, Middle:1, Rear:1, Air:1 — within V2 caps (ground ≤3, air ≤2).
    const lineup: Array<[string, 'Air' | 'Front' | 'Middle' | 'Rear']> = [
      ['Grizzly', 'Front'],
      ['Scout', 'Front'],
      ['Vanguard', 'Middle'],
      ['Longbow', 'Rear'],
      ['Gunship', 'Air'],
    ];
    let s = freshSession();
    lineup.forEach(([variant, zone], i) => {
      s = run(s, { type: 'applyPreset', slot: i as 0, ...planStockApply(stockOf(variant), zone, rs) });
    });
    expect(validateArmy(toSquadConfig(s.draft), rs)).toEqual([]);
  });

  it('applying a 4-utility custom preset onto a 3-slot variant keeps the squad legal (no V5 overfill)', () => {
    const lineup: Array<[string, 'Air' | 'Front' | 'Middle' | 'Rear']> = [
      ['Medic', 'Rear'],
      ['Scout', 'Front'],
      ['Vanguard', 'Middle'],
      ['Longbow', 'Rear'],
      ['Gunship', 'Air'],
    ];
    let s = freshSession();
    lineup.forEach(([variant, zone], i) => {
      s = run(s, { type: 'applyPreset', slot: i as 0, ...planStockApply(stockOf(variant), zone, rs) });
    });
    // A CommandPost (5-utility) bundle applied to the Medic (3-slot) in slot 0.
    const cur = s.draft.machines[0] as DraftSlot as DraftMachine;
    const preset = { id: 'custom:3', machineTypeId: 'RearSupport' as const, config: configFor('CommandPost') };
    s = run(s, { type: 'applyPreset', slot: 0, ...planCustomApply(preset, cur.variantId, cur.zone, rs) });

    expect(s.draft.machines[0]!.loadout.utilities).toHaveLength(3); // truncated, not overfilled
    expect(validateArmy(toSquadConfig(s.draft), rs)).toEqual([]);
  });
});
