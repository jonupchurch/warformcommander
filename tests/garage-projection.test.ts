/**
 * `toSquadConfig` — the single projection from the Garage view-model to the Feature 1 `SquadConfig`
 * (T007). Empty slots are omitted (so an incomplete draft is V1-illegal), and each machine's
 * `instanceId` is its slot index — the identity the engine tie-breaks on and the UI attributes
 * errors to.
 */

import { describe, expect, it } from 'vitest';

import { toSquadConfig } from '@/lib/garage/to-squad-config';
import type { DraftMachine, DraftSlot } from '@/lib/garage/types';
import { defaultFor } from '@/lib/garage/preset-catalog';
import type { ZoneId } from '@/sim/model';

import { defaultRuleset as rs } from './ruleset-fixture';

function machineFor(variantId: string, zone: ZoneId): DraftMachine {
  const seed = defaultFor(variantId, rs);
  return {
    typeId: rs.chassis[variantId].typeId,
    variantId,
    loadout: seed.loadout,
    dials: seed.dials,
    planB: seed.planB,
    zone,
  };
}

function draftOf(slots: DraftSlot[]) {
  const machines = [...slots, null, null, null, null, null].slice(0, 5) as [
    DraftSlot,
    DraftSlot,
    DraftSlot,
    DraftSlot,
    DraftSlot,
  ];
  return { name: 'T', machines };
}

describe('toSquadConfig (T007)', () => {
  it('an all-empty draft projects to zero machines (V1-illegal)', () => {
    expect(toSquadConfig(draftOf([])).machines).toEqual([]);
  });

  it('omits empty slots and stamps instanceId = slot index', () => {
    const draft = draftOf([
      machineFor('Grizzly', 'Front'),
      null,
      machineFor('Vanguard', 'Middle'),
      null,
      machineFor('Longbow', 'Rear'),
    ]);
    const config = toSquadConfig(draft);
    expect(config.machines.map((m) => m.instanceId)).toEqual([0, 2, 4]);
    expect(config.machines.map((m) => m.variantId)).toEqual(['Grizzly', 'Vanguard', 'Longbow']);
  });

  it('a full five projects to contiguous instanceIds 0..4 carrying every config field', () => {
    const draft = draftOf([
      machineFor('Grizzly', 'Front'),
      machineFor('Scout', 'Front'),
      machineFor('Vanguard', 'Middle'),
      machineFor('Gunship', 'Air'),
      machineFor('Longbow', 'Rear'),
    ]);
    const config = toSquadConfig(draft);
    expect(config.machines).toHaveLength(5);
    expect(config.machines.map((m) => m.instanceId)).toEqual([0, 1, 2, 3, 4]);
    const first = config.machines[0];
    expect(first).toMatchObject({
      typeId: 'HeavyTank',
      variantId: 'Grizzly',
      zone: 'Front',
    });
    expect(first.loadout.weapon).toBe('HeavyCannon'); // native-family default
  });
});
