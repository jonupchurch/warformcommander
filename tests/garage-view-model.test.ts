/**
 * The derived editor views (view-model): `computeValidationView` indexes the shared `validateArmy`
 * result by slot / army level, and `computeStatPreview` surfaces the selected machine's derived stats
 * + the squad aggregate — every number from Feature 1's shared derivation, so the preview equals the
 * engine (SC-002).
 */

import { describe, expect, it } from 'vitest';

import { defaultFor } from '@/lib/garage/preset-catalog';
import type { DraftMachine, DraftSlot, DraftSquad } from '@/lib/garage/types';
import { armyPowerRating } from '@/sim/derive';
import { toSquadConfig } from '@/lib/garage/to-squad-config';
import { computeStatPreview, computeValidationView } from '@/lib/garage/view-model';
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

function draftOf(slots: DraftSlot[], name = 'T'): DraftSquad {
  const machines = [...slots, null, null, null, null, null].slice(0, 5) as [
    DraftSlot,
    DraftSlot,
    DraftSlot,
    DraftSlot,
    DraftSlot,
  ];
  return { name, machines };
}

// A draft that satisfies the construction caps too: ≤2 of any type (Mech ×2, the rest ×1) and exactly
// one backline-reaching weapon (D2 ≤1) — the Gunship's RocketPods (AnyGround). Every other weapon here
// is Nearest, so this is the boundary-legal case (exactly one indirect).
const legalDraft = () =>
  draftOf([
    machineFor('Grizzly', 'Front'),
    machineFor('Scout', 'Front'),
    machineFor('Vanguard', 'Middle'),
    machineFor('Gunship', 'Air'),
    machineFor('Sentinel', 'Middle'),
  ]);

describe('computeValidationView', () => {
  it('a legal five-machine draft is legal with no errors', () => {
    const v = computeValidationView(legalDraft(), rs);
    expect(v.isLegal).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.squadLevel).toEqual([]);
  });

  it('an incomplete draft surfaces a squad-level size error (V1)', () => {
    const v = computeValidationView(draftOf([machineFor('Grizzly', 'Front')]), rs);
    expect(v.isLegal).toBe(false);
    expect(v.squadLevel.some((e) => e.code === 'SquadSize')).toBe(true);
  });

  it('an off-home placement is attributed to its slot (V3, bySlot)', () => {
    const draft = legalDraft();
    draft.machines[0]!.zone = 'Air'; // a heavy tank in the air
    const v = computeValidationView(draft, rs);
    expect(v.isLegal).toBe(false);
    expect(v.bySlot[0]?.some((e) => e.code === 'HomeZone')).toBe(true);
  });
});

describe('computeStatPreview', () => {
  it('surfaces the selected machine stats, squad power, and native-bonus tell', () => {
    const draft = legalDraft();
    const p = computeStatPreview(draft, 0, rs);
    expect(p.effective?.hull).toBe(rs.variants.Grizzly.hull);
    expect(p.nativeBonusApplies).toBe(true); // HeavyCannon (Kinetic) on Kinetic-native heavy
    expect(p.machinePower).toBeGreaterThan(0);
    expect(p.squadPower).toBe(armyPowerRating(toSquadConfig(draft), rs));
  });

  it('with no selection there is no effective block but the squad still aggregates', () => {
    const p = computeStatPreview(legalDraft(), null, rs);
    expect(p.effective).toBeNull();
    expect(p.machinePower).toBe(0);
    expect(p.squadPower).toBeGreaterThan(0);
  });

  it('summaryTags report AA readiness from the squad composition', () => {
    // A ground-only squad has no way to engage air → NO AA. (legalDraft carries a Gunship, which IS
    // air-capable by default in current content, so we replace it with a ground unit here.)
    const noAir = legalDraft();
    noAir.machines[3] = machineFor('Hunter', 'Middle');
    expect(computeStatPreview(noAir, 0, rs).summaryTags).toContain('NO AA');
    // Swap in a Rocket-Artillery (air-capable by default) → AA READY.
    const withAA = legalDraft();
    withAA.machines[3] = machineFor('Sentry', 'Middle');
    expect(computeStatPreview(withAA, 0, rs).summaryTags).toContain('AA READY');
  });
});
