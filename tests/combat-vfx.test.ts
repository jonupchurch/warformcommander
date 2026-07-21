/**
 * `pickCombatVfx` (Battle Playback VFX) — the pure fire/hit/death selector a `UnitSprite` renders
 * from a tick's events + the static per-column damage types. Exercised without rendering: only the
 * event→VFX rules (whose column fired, what struck it, last-hit-wins, died) carry the signal.
 */

import { describe, expect, it } from 'vitest';

import { pickCombatVfx } from '@/components/battle/combat-vfx';
import type { WireEvent } from '@/sim/replay-reader';
import type { DamageType } from '@/sim/ruleset';

const hit = (a: number, d: number): WireEvent => ({ t: 'hit', a, d, dmg: 10, layer: 'Hull', crit: false, splash: false });
const miss = (a: number, d: number): WireEvent => ({ t: 'miss', a, d });
const death = (u: number): WireEvent => ({ t: 'death', u, k: 0 });

// columns: 0 = friendly kinetic, 1 = enemy energy, 2 = enemy explosive
const TYPES: (DamageType | null)[] = ['Kinetic', 'Energy', 'Explosive'];

describe('pickCombatVfx', () => {
  it('no events → nothing fires', () => {
    expect(pickCombatVfx([], 0, TYPES)).toEqual({
      fired: false,
      muzzleType: null,
      impacted: false,
      impactType: null,
      died: false,
    });
  });

  it('firing (attacker of a hit) → muzzle keyed to its own damage type', () => {
    const v = pickCombatVfx([hit(0, 1)], 0, TYPES);
    expect(v.fired).toBe(true);
    expect(v.muzzleType).toBe('Kinetic');
  });

  it('a whiff (attacker of a miss) still shows a muzzle flash — no standalone shot event exists', () => {
    const v = pickCombatVfx([miss(0, 1)], 0, TYPES);
    expect(v.fired).toBe(true);
    expect(v.muzzleType).toBe('Kinetic');
    expect(v.impacted).toBe(false);
  });

  it("a hit on this column → explosion keyed to the ATTACKER's damage type", () => {
    // col 0 (friendly) struck by col 2 (enemy explosive)
    const v = pickCombatVfx([hit(2, 0)], 0, TYPES);
    expect(v.impacted).toBe(true);
    expect(v.impactType).toBe('Explosive');
    expect(v.fired).toBe(false);
  });

  it('one splash shot hitting several defenders → each defender takes an impact, attacker fires once', () => {
    // col 0 hits d1 (direct) + d2 (splash) — 0 fires once; 1 and 2 each get struck.
    const evs: WireEvent[] = [hit(0, 1), hit(0, 2)];
    expect(pickCombatVfx(evs, 0, TYPES).fired).toBe(true);
    expect(pickCombatVfx(evs, 1, TYPES)).toMatchObject({ impacted: true, impactType: 'Kinetic' });
    expect(pickCombatVfx(evs, 2, TYPES)).toMatchObject({ impacted: true, impactType: 'Kinetic' });
  });

  it('multiple hits on one column in a tick → the last attacker wins (deterministic single burst)', () => {
    const v = pickCombatVfx([hit(1, 0), hit(2, 0)], 0, TYPES);
    expect(v.impacted).toBe(true);
    expect(v.impactType).toBe('Explosive'); // col 2 was last
  });

  it('firing and being hit in the same tick both register (distinct edges)', () => {
    const v = pickCombatVfx([hit(0, 2), hit(1, 0)], 0, TYPES);
    expect(v.fired).toBe(true);
    expect(v.muzzleType).toBe('Kinetic');
    expect(v.impacted).toBe(true);
    expect(v.impactType).toBe('Energy');
  });

  it('death on this column registers alongside its final impact', () => {
    const v = pickCombatVfx([hit(1, 0), death(0)], 0, TYPES);
    expect(v.died).toBe(true);
    expect(v.impacted).toBe(true);
  });

  it('events for other columns are ignored', () => {
    const v = pickCombatVfx([hit(1, 2), miss(2, 1), death(1)], 0, TYPES);
    expect(v).toEqual({ fired: false, muzzleType: null, impacted: false, impactType: null, died: false });
  });

  it('missing damageTypes → flags still set, types fall back to null (untyped flash)', () => {
    const v = pickCombatVfx([hit(0, 2), hit(1, 0)], 0, undefined);
    expect(v.fired).toBe(true);
    expect(v.muzzleType).toBeNull();
    expect(v.impacted).toBe(true);
    expect(v.impactType).toBeNull();
  });
});
