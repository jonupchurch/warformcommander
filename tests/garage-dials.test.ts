/**
 * v3 dial + Plan-B behavior (garage). v3 removed **all** capability-gated dial options (the engine
 * dropped V7 dial-gating) and collapsed stance to three universal postures, so the only remaining
 * gate is the Plan-B slot count (1 base, 2 with Combat AI, V6). Every claim is cross-checked against
 * `validateArmy` — what the server re-runs — so the UI never diverges from the engine (P8).
 */

import { describe, expect, it } from 'vitest';

import { MOVEMENT_OPTIONS, STANCE_OPTIONS } from '@/lib/garage/dials';
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

describe('v3 dial options are ungated (the engine dropped V7 dial-gating)', () => {
  it('offers three universal stances and four movement modes', () => {
    expect(STANCE_OPTIONS).toEqual(['Aggressive', 'Neutral', 'Defensive']);
    expect(MOVEMENT_OPTIONS).toEqual(['Hold', 'Advance', 'FallBack', 'Kite']);
  });

  it('any stance / movement / targeting-chain choice on a legal build never trips a DialGating error', () => {
    for (const stance of STANCE_OPTIONS) {
      for (const movement of MOVEMENT_OPTIONS) {
        const m = heavy(NO_AI, {
          dials: { targeting: { priority1: 'TargetArmor', fallback: 'Furthest' }, movement, stance },
        });
        const errs = validateArmy(toSquadConfig(armyWith(m)), rs);
        expect(errs.some((e) => e.code === 'DialGating')).toBe(false);
      }
    }
  });
});

describe('Combat AI unlocks the extra Plan-B slot (V6)', () => {
  it('a plain utility set unlocks nothing; Combat AI unlocks the extra slot', () => {
    expect(unlockedCapabilities({ weapon: 'x', defense: 'y', utilities: NO_AI }, rs)).toEqual([]);
    expect(unlockedCapabilities({ weapon: 'x', defense: 'y', utilities: WITH_AI }, rs)).toContain(
      'ExtraPlanBSlot',
    );
  });
});

describe('Plan-B slot count = derived planBSlots (V6)', () => {
  const t1: PlanBTrigger = {
    slot: 'Slot1',
    condition: { HullBelowPct: 5000 },
    dial: 'Movement',
    planBValue: { Movement: 'FallBack' },
  };
  const t2: PlanBTrigger = {
    slot: 'Slot2',
    condition: 'ShieldDown',
    dial: 'Stance',
    planBValue: { Stance: 'Aggressive' },
  };

  it('1 slot without Combat AI, 2 with it', () => {
    const noAi = deriveEffectiveStats(heavy(NO_AI), rs);
    const withAi = deriveEffectiveStats(heavy(WITH_AI), rs);
    expect(noAi.ok && noAi.stats.planBSlots).toBe(1);
    expect(withAi.ok && withAi.stats.planBSlots).toBe(2);
  });

  it('a 2nd trigger is illegal without Combat AI and legal with it', () => {
    const over = armyWith(heavy(NO_AI, { planB: [t1, t2] }));
    expect(
      validateArmy(toSquadConfig(over), rs).some((e) => e.code === 'PlanB' && e.instanceId === 0),
    ).toBe(true);

    const ok = armyWith(heavy(WITH_AI, { planB: [t1, t2] }));
    expect(validateArmy(toSquadConfig(ok), rs).some((e) => e.code === 'PlanB')).toBe(false);
  });
});

describe('reducer dial + Plan-B actions (v3)', () => {
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

  it('setDial patches a scalar dial and the targeting chain; addPlanB / setPlanB / removePlanB manage triggers', () => {
    const t: PlanBTrigger = {
      slot: 'Slot1',
      condition: 'ShieldDown',
      dial: 'Stance',
      planBValue: { Stance: 'Defensive' },
    };
    let s = run(base(), { type: 'setDial', slot: 0, patch: { stance: 'Defensive' } });
    expect(s.draft.machines[0]!.dials.stance).toBe('Defensive');

    s = run(s, {
      type: 'setDial',
      slot: 0,
      patch: { targeting: { priority1: 'TargetSupport', fallback: 'Furthest' } },
    });
    expect(s.draft.machines[0]!.dials.targeting).toEqual({
      priority1: 'TargetSupport',
      fallback: 'Furthest',
    });

    s = run(s, { type: 'addPlanB', slot: 0, trigger: t });
    expect(s.draft.machines[0]!.planB).toHaveLength(1);

    s = run(s, { type: 'setPlanB', slot: 0, trigger: { ...t, planBValue: { Stance: 'Aggressive' } } });
    expect(s.draft.machines[0]!.planB[0].planBValue).toEqual({ Stance: 'Aggressive' });

    s = run(s, { type: 'removePlanB', slot: 0, planBSlot: 'Slot1' });
    expect(s.draft.machines[0]!.planB).toHaveLength(0);
  });
});
