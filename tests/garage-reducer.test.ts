/**
 * The pure Garage editor reducer (T008) — each verb is an independently-testable transition over
 * `EditorSession`, kept pure/serializable via Immer (Principle VIII). Persistence is never a
 * transition here; the reducer only shapes the client draft + selection + dirty baseline.
 */

import { describe, expect, it } from 'vitest';

import {
  emptyDraft,
  freshSession,
  garageReducer,
  isDirty,
  type EditorAction,
  type MachineSeed,
} from '@/lib/garage/editor-reducer';
import { defaultFor, defaultZoneFor, defaultVariantFor } from '@/lib/garage/preset-catalog';
import type { EditorSession } from '@/lib/garage/types';

import { defaultRuleset as rs } from './ruleset-fixture';

function seedFor(variantId: string): MachineSeed {
  return defaultFor(variantId, rs);
}

/** Dispatch a chain of actions from a fresh session. */
function run(...actions: EditorAction[]): EditorSession {
  return actions.reduce(garageReducer, freshSession());
}

describe('garageReducer (T008)', () => {
  it('createSquad yields a fresh empty five-slot draft', () => {
    const s = garageReducer(freshSession(), { type: 'createSquad', name: 'Alpha' });
    expect(s.draft.name).toBe('Alpha');
    expect(s.draft.machines).toEqual([null, null, null, null, null]);
    expect(s.editingSquadId).toBeNull();
    expect(s.savedBaseline).toBeNull();
  });

  it('renameSquad updates the draft name only', () => {
    const s = run({ type: 'renameSquad', name: 'Bravo' });
    expect(s.draft.name).toBe('Bravo');
  });

  it('setType installs a fully-seeded machine at the slot with its default zone', () => {
    const s = run({
      type: 'setType',
      slot: 0,
      typeId: 'HeavyTank',
      seed: seedFor('Grizzly'),
      zone: defaultZoneFor('HeavyTank', rs),
    });
    const m = s.draft.machines[0];
    expect(m).not.toBeNull();
    expect(m).toMatchObject({ typeId: 'HeavyTank', variantId: 'Grizzly', zone: 'Front' });
    expect(m?.loadout.weapon).toBe('HeavyCannon');
  });

  it('setVariant reseeds an occupied slot and is a no-op on an empty slot', () => {
    const filled = run(
      { type: 'setType', slot: 0, typeId: 'HeavyTank', seed: seedFor('Grizzly'), zone: 'Front' },
      { type: 'setVariant', slot: 0, seed: seedFor('Bulwark') },
    );
    expect(filled.draft.machines[0]?.variantId).toBe('Bulwark');

    const empty = run({ type: 'setVariant', slot: 3, seed: seedFor('Grizzly') });
    expect(empty.draft.machines[3]).toBeNull();
  });

  it('clearSlot empties the slot and drops it from selection/placement', () => {
    const s = run(
      { type: 'setType', slot: 2, typeId: 'Mech', seed: seedFor('Vanguard'), zone: 'Middle' },
      { type: 'selectMachine', slot: 2 },
      { type: 'pickUpForPlacement', slot: 2 },
      { type: 'clearSlot', slot: 2 },
    );
    expect(s.draft.machines[2]).toBeNull();
    expect(s.selection.selectedSlot).toBeNull();
    expect(s.selection.placingSlot).toBeNull();
  });

  it('tap-to-place: pickUpForPlacement then placeInZone moves the machine and clears the pickup', () => {
    const s = run(
      { type: 'setType', slot: 1, typeId: 'HeavyTank', seed: seedFor('Grizzly'), zone: 'Front' },
      { type: 'pickUpForPlacement', slot: 1 },
      { type: 'placeInZone', slot: 1, zone: 'Middle' },
    );
    expect(s.draft.machines[1]?.zone).toBe('Middle');
    expect(s.selection.placingSlot).toBeNull();
  });

  it('setActivePane switches the Customize section', () => {
    expect(run({ type: 'setActivePane', pane: 'Loadout' }).selection.activePane).toBe('Loadout');
  });

  it('does not mutate the input session (Immer purity)', () => {
    const before = freshSession();
    const snapshot = JSON.stringify(before);
    garageReducer(before, { type: 'setType', slot: 0, typeId: 'HeavyTank', seed: seedFor('Grizzly'), zone: 'Front' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('isDirty', () => {
  it('a fresh session is clean; any fill makes it dirty', () => {
    expect(isDirty(freshSession())).toBe(false);
    const s = run({ type: 'setType', slot: 0, typeId: 'HeavyTank', seed: seedFor('Grizzly'), zone: 'Front' });
    expect(isDirty(s)).toBe(true);
  });

  it('loadSquad hydrates a clean baseline; markSaved re-cleans after an edit', () => {
    const draft = { name: 'Saved', machines: emptyDraft().machines };
    const loaded = garageReducer(freshSession(), {
      type: 'loadSquad',
      squadId: 'sq1',
      rosterSlotIndex: 0,
      defenseSlot: null,
      draft,
    });
    expect(isDirty(loaded)).toBe(false);
    expect(loaded.editingSquadId).toBe('sq1');

    const edited = garageReducer(loaded, {
      type: 'setType',
      slot: 0,
      typeId: 'LightTank',
      seed: seedFor('Scout'),
      zone: 'Front',
    });
    expect(isDirty(edited)).toBe(true);

    const saved = garageReducer(edited, { type: 'markSaved', squadId: 'sq1', rosterSlotIndex: 0 });
    expect(isDirty(saved)).toBe(false);
    expect(saved.status).toBe('Saved');
  });
});

describe('duplicateSquad', () => {
  /** A saved squad loaded into the editor (occupies slot 0, designated for defense). */
  function loadedSquad(): EditorSession {
    const draft = run(
      { type: 'setType', slot: 0, typeId: 'HeavyTank', seed: seedFor('Grizzly'), zone: 'Front' },
    ).draft;
    return garageReducer(freshSession(), {
      type: 'loadSquad',
      squadId: 'sq1',
      rosterSlotIndex: 0,
      defenseSlot: 1,
      draft: { ...draft, name: 'Alpha' },
    });
  }

  it('forks the machines into a fresh, unsaved build in the target slot', () => {
    const source = loadedSquad();
    const copy = garageReducer(source, {
      type: 'duplicateSquad',
      rosterSlotIndex: 3,
      draft: { name: 'Alpha (copy)', machines: source.draft.machines },
    });

    expect(copy.draft.name).toBe('Alpha (copy)');
    expect(copy.draft.machines).toEqual(source.draft.machines);
    // A new squad: Save must INSERT, not overwrite the source; and it lands in the free slot.
    expect(copy.editingSquadId).toBeNull();
    expect(copy.rosterSlotIndex).toBe(3);
    // No baseline ⇒ dirty; the source's defense designation does not carry over.
    expect(copy.savedBaseline).toBeNull();
    expect(copy.defenseSlot).toBeNull();
    expect(isDirty(copy)).toBe(true);
    expect(copy.status).toBe('Editing');
    expect(copy.selection).toEqual({ selectedSlot: null, placingSlot: null, activePane: 'Formation' });
  });

  it('deep-clones the draft — editing the copy does not touch the source', () => {
    const source = loadedSquad();
    const copy = garageReducer(source, {
      type: 'duplicateSquad',
      rosterSlotIndex: 1,
      draft: { name: 'Alpha (copy)', machines: source.draft.machines },
    });
    const edited = garageReducer(copy, { type: 'clearSlot', slot: 0 });

    expect(edited.draft.machines[0]).toBeNull();
    expect(source.draft.machines[0]).not.toBeNull();
  });
});

describe('defaultVariantFor', () => {
  it('returns a variant belonging to the requested type', () => {
    const v = defaultVariantFor('AttackHeli', rs);
    expect(rs.chassis[v].typeId).toBe('AttackHeli');
  });
});
