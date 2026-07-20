/**
 * US2 loadout gating (T023) — the pickers offer only mount-legal options, dedup is enforced, and the
 * native-family bonus is legible. The pure option helpers + reducer edits are unit-tested here; the
 * engine's V4/V5 are the ultimate authority, so we also confirm an illegal edit is caught by
 * `validateArmy` (what the server re-runs).
 */

import { describe, expect, it } from 'vitest';

import { garageReducer, freshSession, type EditorAction } from '@/lib/garage/editor-reducer';
import {
  defenseOptions,
  isNativeWeapon,
  utilityOptions,
  weaponOptions,
} from '@/lib/garage/loadout-options';
import { defaultFor } from '@/lib/garage/preset-catalog';
import { toSquadConfig } from '@/lib/garage/to-squad-config';
import type { DraftSlot } from '@/lib/garage/types';
import { validateArmy } from '@/sim/legality';
import type { ZoneId } from '@/sim/model';

import { defaultRuleset as rs } from './ruleset-fixture';

describe('mount-gated options (V4 crossover)', () => {
  it('weaponOptions lists every family that fits the mount, and only that mount', () => {
    const opts = weaponOptions('HeavyTank', rs);
    expect(opts.length).toBeGreaterThan(1);
    expect(opts.every((w) => w.mountClass === 'Heavy')).toBe(true);
    const families = new Set(opts.map((w) => w.family));
    expect(families.has('Kinetic')).toBe(true);
    expect(families.has('Energy')).toBe(true); // the Siege Laser off-family crossover
  });

  it('defenseOptions are all the machine mount; utilityOptions are ungated (all utilities)', () => {
    expect(defenseOptions('HeavyTank', rs).every((d) => d.mountClass === 'Heavy')).toBe(true);
    expect(utilityOptions(rs).every((u) => u.kind === 'Utility')).toBe(true);
    expect(utilityOptions(rs).length).toBeGreaterThanOrEqual(4); // enough for a 4-utility variant
  });
});

describe('native-family bonus (P1 sidegrade tell)', () => {
  it('a native-family weapon earns the bonus; an off-family one does not; Mech never does', () => {
    const heavyCannon = weaponOptions('HeavyTank', rs).find((w) => w.id === 'HeavyCannon')!;
    const siegeLaser = weaponOptions('HeavyTank', rs).find((w) => w.id === 'SiegeLaser')!;
    expect(isNativeWeapon('HeavyTank', heavyCannon, rs)).toBe(true);
    expect(isNativeWeapon('HeavyTank', siegeLaser, rs)).toBe(false);
    const assaultCannon = weaponOptions('Mech', rs)[0];
    expect(isNativeWeapon('Mech', assaultCannon, rs)).toBe(false); // generalist
  });
});

describe('reducer loadout edits', () => {
  const base = () =>
    garageReducer(freshSession(), {
      type: 'setType',
      slot: 0,
      typeId: 'HeavyTank',
      seed: defaultFor('Grizzly', rs),
      zone: 'Front',
    });

  function run(session: ReturnType<typeof base>, ...actions: EditorAction[]) {
    return actions.reduce(garageReducer, session);
  }

  it('setWeapon / setDefense / setUtility swap the loadout', () => {
    const s = run(
      base(),
      { type: 'setWeapon', slot: 0, equipmentId: 'SiegeLaser' },
      { type: 'setDefense', slot: 0, equipmentId: 'CompositeArmor' },
      { type: 'setUtility', slot: 0, index: 0, equipmentId: 'Rangefinder' },
    );
    const m = s.draft.machines[0]!;
    expect(m.loadout.weapon).toBe('SiegeLaser');
    expect(m.loadout.defense).toBe('CompositeArmor');
    expect(m.loadout.utilities[0]).toBe('Rangefinder');
  });

  it('clearUtility drops a utility (leaving the slot count short — V5 will flag it)', () => {
    const s = run(base(), { type: 'clearUtility', slot: 0, index: 0 });
    expect(s.draft.machines[0]!.loadout.utilities).toHaveLength(2);
  });
});

/** A legal 5-squad with a Heavy tank in slot 0 we can then break. */
function legalArmyWithHeavyAt0() {
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
  return { name: 'x', machines };
}

describe('illegal edits are caught by the engine V4/V5 (server authority)', () => {
  it('a mount-illegal weapon → V4 MountMismatch on that machine', () => {
    const draft = legalArmyWithHeavyAt0();
    draft.machines[0]!.loadout.weapon = 'Autocannon'; // Light-mount gun on a Heavy
    const errors = validateArmy(toSquadConfig(draft), rs);
    expect(errors.some((e) => e.code === 'MountMismatch' && e.instanceId === 0)).toBe(true);
  });

  it('a duplicate utility → V5 Utilities on that machine', () => {
    const draft = legalArmyWithHeavyAt0();
    const utils = draft.machines[0]!.loadout.utilities;
    utils[1] = utils[0]; // force a duplicate
    const errors = validateArmy(toSquadConfig(draft), rs);
    expect(errors.some((e) => e.code === 'Utilities' && e.instanceId === 0)).toBe(true);
  });
});

describe('variant slot count (3 vs 4 utilities)', () => {
  it('Sentinel seeds 4 utilities; Grizzly seeds 3', () => {
    expect(defaultFor('Sentinel', rs).loadout.utilities).toHaveLength(4);
    expect(defaultFor('Grizzly', rs).loadout.utilities).toHaveLength(3);
  });
});
