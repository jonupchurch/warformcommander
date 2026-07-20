/**
 * US3 dial + Plan-B gating (T026/T027). The client gate table mirrors the engine's V7 exactly (only
 * Adaptive energy / Opportunist stance / Target-Air are gated), and the Plan-B slot count is the
 * derived `planBSlots` (1 base, 2 with Combat AI, V6). Every claim is cross-checked against
 * `validateArmy` — what the server re-runs — so the UI never diverges from the engine (P8).
 */

import { describe, expect, it } from 'vitest';

import { dialOptionLocked } from '@/lib/garage/dials';
import { garageReducer, freshSession, type EditorAction } from '@/lib/garage/editor-reducer';
import { defaultFor } from '@/lib/garage/preset-catalog';
import { toSquadConfig } from '@/lib/garage/to-squad-config';
import type { DraftMachine, DraftSlot } from '@/lib/garage/types';
import { deriveEffectiveStats, unlockedCapabilities } from '@/sim/derive';
import { validateArmy } from '@/sim/legality';
import type { PlanBTrigger, ZoneId } from '@/sim/model';

import { defaultRuleset as rs } from './ruleset-fixture';

/** A machine with an explicit utility set (so we control which capabilities are unlocked). */
function heavy(utilities: string[], patch: Partial<DraftMachine> = {}): DraftMachine {
  const seed = defaultFor('Grizzly', rs);
  return {
    typeId: 'HeavyTank',
    variantId: 'Grizzly',
    loadout: { ...seed.loadout, utilities },
    dials: seed.dials,
    planB: seed.planB,
    zone: 'Front',
    ...patch,
  };
}

const NO_AI = ['FireControl', 'DriveServos', 'ECMSuite'];
const WITH_AI = ['CombatAI', 'DriveServos', 'ECMSuite'];

/** A legal 5-squad whose slot 0 is the machine under test. */
function armyWith(slot0: DraftMachine) {
  const rest: Array<[string, ZoneId]> = [
    ['Scout', 'Front'],
    ['Vanguard', 'Middle'],
    ['Gunship', 'Air'],
    ['Longbow', 'Rear'],
  ];
  const machines = [
    slot0,
    ...rest.map(([v, zone]): DraftSlot => {
      const seed = defaultFor(v, rs);
      return {
        typeId: rs.chassis[v].typeId,
        variantId: v,
        loadout: seed.loadout,
        dials: seed.dials,
        planB: seed.planB,
        zone,
      };
    }),
  ] as [DraftSlot, DraftSlot, DraftSlot, DraftSlot, DraftSlot];
  return { name: 'x', machines };
}

describe('dialOptionLocked mirrors the engine V7 gate table (T026)', () => {
  it('only the three engine-gated options lock without their capability', () => {
    expect(dialOptionLocked('energy', 'Adaptive', [])).toBe(true);
    expect(dialOptionLocked('stance', 'Opportunist', [])).toBe(true);
    expect(dialOptionLocked('targetRule', 'TargetAir', [])).toBe(true);
    // Everything else is ungated (the engine allows it → the UI must not disable it).
    expect(dialOptionLocked('energy', 'Overdrive', [])).toBe(false);
    expect(dialOptionLocked('movement', 'Kite', [])).toBe(false);
    expect(dialOptionLocked('targetRule', 'FocusFire', [])).toBe(false);
  });

  it('the required capability unlocks the option', () => {
    expect(dialOptionLocked('energy', 'Adaptive', ['AdaptiveEnergy'])).toBe(false);
    expect(dialOptionLocked('stance', 'Opportunist', ['OpportunistStance'])).toBe(false);
  });
});

describe('unlockedCapabilities drives the gate (T026)', () => {
  it('Combat AI unlocks Adaptive + Opportunist; a plain utility set unlocks nothing', () => {
    expect(unlockedCapabilities({ weapon: 'x', defense: 'y', utilities: NO_AI }, rs)).toEqual([]);
    const caps = unlockedCapabilities({ weapon: 'x', defense: 'y', utilities: WITH_AI }, rs);
    expect(caps).toContain('AdaptiveEnergy');
    expect(caps).toContain('OpportunistStance');
    expect(caps).toContain('ExtraPlanBSlot');
  });
});

describe('gated dial choices agree with the engine V7', () => {
  it('Adaptive energy is illegal without Combat AI and legal with it', () => {
    const locked = armyWith(heavy(NO_AI, { dials: { ...defaultFor('Grizzly', rs).dials, energy: 'Adaptive' } }));
    expect(validateArmy(toSquadConfig(locked), rs).some((e) => e.code === 'DialGating' && e.instanceId === 0)).toBe(true);

    const unlocked = armyWith(heavy(WITH_AI, { dials: { ...defaultFor('Grizzly', rs).dials, energy: 'Adaptive' } }));
    expect(validateArmy(toSquadConfig(unlocked), rs).some((e) => e.code === 'DialGating')).toBe(false);
  });
});

describe('Plan-B slot count = derived planBSlots (T027, V6)', () => {
  const t1: PlanBTrigger = {
    slot: 'Slot1',
    condition: { HullBelowPct: 5000 },
    dial: 'Movement',
    planBValue: { Movement: 'FallBack' },
  };
  const t2: PlanBTrigger = {
    slot: 'Slot2',
    condition: 'ShieldDown',
    dial: 'Energy',
    planBValue: { Energy: 'Overdrive' },
  };

  it('1 slot without Combat AI, 2 with it', () => {
    const noAi = deriveEffectiveStats(heavy(NO_AI), rs);
    const withAi = deriveEffectiveStats(heavy(WITH_AI), rs);
    expect(noAi.ok && noAi.stats.planBSlots).toBe(1);
    expect(withAi.ok && withAi.stats.planBSlots).toBe(2);
  });

  it('a 2nd trigger is illegal without Combat AI and legal with it', () => {
    const over = armyWith(heavy(NO_AI, { planB: [t1, t2] }));
    expect(validateArmy(toSquadConfig(over), rs).some((e) => e.code === 'PlanB' && e.instanceId === 0)).toBe(true);

    const ok = armyWith(heavy(WITH_AI, { planB: [t1, t2] }));
    expect(validateArmy(toSquadConfig(ok), rs).some((e) => e.code === 'PlanB')).toBe(false);
  });
});

describe('reducer dial + Plan-B actions', () => {
  function base() {
    return garageReducer(freshSession(), {
      type: 'setType',
      slot: 0,
      typeId: 'HeavyTank',
      seed: defaultFor('Grizzly', rs),
      zone: 'Front',
    });
  }
  const run = (s: ReturnType<typeof base>, ...a: EditorAction[]) => a.reduce(garageReducer, s);

  it('setDial patches the dials; addPlanB / setPlanB / removePlanB manage triggers', () => {
    const t: PlanBTrigger = {
      slot: 'Slot1',
      condition: 'ShieldDown',
      dial: 'Energy',
      planBValue: { Energy: 'Overdrive' },
    };
    let s = run(base(), { type: 'setDial', slot: 0, patch: { stance: 'Defensive' } });
    expect(s.draft.machines[0]!.dials.stance).toBe('Defensive');

    s = run(s, { type: 'addPlanB', slot: 0, trigger: t });
    expect(s.draft.machines[0]!.planB).toHaveLength(1);

    s = run(s, {
      type: 'setPlanB',
      slot: 0,
      trigger: { ...t, planBValue: { Energy: 'Fortify' } },
    });
    expect(s.draft.machines[0]!.planB[0].planBValue).toEqual({ Energy: 'Fortify' });

    s = run(s, { type: 'removePlanB', slot: 0, planBSlot: 'Slot1' });
    expect(s.draft.machines[0]!.planB).toHaveLength(0);
  });
});
