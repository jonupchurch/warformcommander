/**
 * Construction-layer deckbuilding caps (`sim/deck-rules.ts`) — the D1 type cap (≤2 of any type) and
 * the D2 indirect cap (≤1 backline-reaching weapon). These sit above the engine's V1–V8 legality and
 * are enforced at the Garage edit-time (`computeValidationView`) and the server write path
 * (`saveSquad`/`updateSquad`). Exercised against the real balance table (the parity fixture ruleset).
 */

import { describe, expect, it } from 'vitest';

import { defaultFor } from '@/lib/garage/preset-catalog';
import { isIndirectWeapon, validateDeckRules, MAX_INDIRECT, MAX_PER_TYPE } from '@/sim/deck-rules';
import type { Army, MachineInstance, ZoneId } from '@/sim/model';

import { defaultRuleset as rs } from './ruleset-fixture';

/** Build a machine from a variant's default build, optionally overriding the weapon. */
function machine(id: number, variantId: string, zone: ZoneId, weapon?: string): MachineInstance {
  const seed = defaultFor(variantId, rs);
  return {
    instanceId: id,
    typeId: rs.chassis[variantId].typeId,
    variantId,
    loadout: weapon ? { ...seed.loadout, weapon } : seed.loadout,
    dials: seed.dials,
    planB: seed.planB,
    zone,
  };
}
const army = (...machines: MachineInstance[]): Army => ({ machines });

describe('isIndirectWeapon (reach-based sniper detection)', () => {
  it('AnyGround and Deep weapons are indirect; Nearest / Air / projector are not', () => {
    expect(isIndirectWeapon('Howitzer', rs)).toBe(true); // AnyGround
    expect(isIndirectWeapon('IonCannon', rs)).toBe(true); // AnyGround
    expect(isIndirectWeapon('Railgun', rs)).toBe(true); // Deep — the "heavy kinetic" sniper
    expect(isIndirectWeapon('HeavyCannon', rs)).toBe(false); // Nearest
    expect(isIndirectWeapon('SAMBattery', rs)).toBe(false); // Air reach (anti-air, not backline)
    expect(isIndirectWeapon('ShieldProjector', rs)).toBe(false); // projector, no reach
    expect(isIndirectWeapon('NotAWeapon', rs)).toBe(false); // unknown id
  });
});

describe('validateDeckRules', () => {
  it('constants pin the agreed caps', () => {
    expect(MAX_PER_TYPE).toBe(2);
    expect(MAX_INDIRECT).toBe(1);
  });

  it('a diverse squad with one indirect weapon is compliant', () => {
    const legal = army(
      machine(0, 'Grizzly', 'Front'), // HeavyCannon — Nearest
      machine(1, 'Scout', 'Front'), // Autocannon — Nearest
      machine(2, 'Vanguard', 'Middle'), // AssaultCannon — Nearest
      machine(3, 'Gunship', 'Air', 'SAMBattery'), // Air reach — not indirect
      machine(4, 'Longbow', 'Rear'), // Howitzer — the ONE allowed indirect
    );
    expect(validateDeckRules(legal, rs)).toEqual([]);
  });

  it('D1: three of one unit type is rejected with a DeckTypeCap reason', () => {
    const overType = army(
      machine(0, 'Grizzly', 'Front'),
      machine(1, 'Grizzly', 'Middle'),
      machine(2, 'Grizzly', 'Rear'),
      machine(3, 'Scout', 'Front'),
      machine(4, 'Vanguard', 'Middle'),
    );
    const errs = validateDeckRules(overType, rs);
    expect(errs.some((e) => e.code === 'DeckTypeCap' && e.instanceId === null)).toBe(true);
    expect(errs.some((e) => e.code === 'DeckIndirectCap')).toBe(false);
  });

  it('D2: two backline-reaching weapons is rejected with a DeckIndirectCap reason', () => {
    const overIndirect = army(
      machine(0, 'Grizzly', 'Front'), // Nearest
      machine(1, 'Scout', 'Front'), // Nearest
      machine(2, 'Vanguard', 'Middle'), // Nearest
      machine(3, 'Longbow', 'Rear'), // Howitzer — indirect #1
      machine(4, 'Marksman', 'Rear', 'IonCannon'), // IonCannon — indirect #2
    );
    const errs = validateDeckRules(overIndirect, rs);
    expect(errs.some((e) => e.code === 'DeckIndirectCap' && e.instanceId === null)).toBe(true);
  });

  it('D2 counts Railgun heavies (Deep reach), not just artillery types', () => {
    const railgunLine = army(
      machine(0, 'Grizzly', 'Front', 'Railgun'), // Deep — indirect #1
      machine(1, 'Bulwark', 'Front', 'Railgun'), // Deep — indirect #2
      machine(2, 'Scout', 'Front'),
      machine(3, 'Vanguard', 'Middle'),
      machine(4, 'Gunship', 'Air', 'SAMBattery'),
    );
    const errs = validateDeckRules(railgunLine, rs);
    expect(errs.some((e) => e.code === 'DeckIndirectCap')).toBe(true);
  });
});
