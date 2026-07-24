/**
 * The Customize surface's effect breakdown — the pure explanation layer behind it.
 *
 * The point of these tests is the module's core promise: **numbers come from the ruleset, never from
 * authored copy**, so a balance change can never leave the Garage lying to the player. Each case
 * therefore mutates the fixture ruleset and asserts the rendered text follows.
 */

import { describe, expect, it } from 'vitest';

import {
  explainDefense,
  explainDial,
  explainTargeting,
  explainUtility,
  explainWeapon,
  summarizeBuild,
} from '@/lib/garage/explain';
import type { DefenseModule, UtilityModule, WeaponModule } from '@/lib/garage/loadout-options';
import type { BehaviorDials } from '@/sim/model';
import { DEFAULT_STANCE_MODS } from '@/sim/ruleset';
import type { Ruleset } from '@/sim/ruleset';

import { defaultRuleset } from './ruleset-fixture';

const rs = defaultRuleset;
const weapon = (id: string) => rs.equipment[id] as WeaponModule;
const defense = (id: string) => rs.equipment[id] as DefenseModule;
const utility = (id: string) => rs.equipment[id] as UtilityModule;

const values = (ex: { effects: { label: string; value: string }[] }, label: string) =>
  ex.effects.filter((e) => e.label === label).map((e) => e.value);

describe('weapons', () => {
  it('reports the native-family bonus using the ruleset value, not a hardcoded one', () => {
    const native = explainWeapon(weapon('HeavyCannon'), 'HeavyTank', rs);
    expect(values(native, 'Native bonus')[0]).toBe('+12% damage');

    const bumped: Ruleset = { ...rs, globals: { ...rs.globals, nativeBonus: 2500 } };
    const after = explainWeapon(weapon('HeavyCannon'), 'HeavyTank', bumped);
    expect(values(after, 'Native bonus')[0]).toBe('+25% damage');
  });

  it('calls out a forfeited bonus for an off-family weapon', () => {
    const ex = explainWeapon(weapon('SiegeLaser'), 'HeavyTank', rs);
    expect(values(ex, 'Native bonus')[0]).toContain('Forfeited');
  });

  it('explains that the generalist Mech never earns the bonus', () => {
    const ex = explainWeapon(weapon('PulseLaser'), 'Mech', rs);
    expect(values(ex, 'Native bonus')[0]).toContain('never earns it');
  });

  it('reads the damage matrix live', () => {
    const ex = explainWeapon(weapon('PulseLaser'), 'Mech', rs);
    expect(values(ex, 'Damage family')[0]).toBe('Energy — ×0.70 vs shields, ×1.60 vs armour');

    const flipped: Ruleset = {
      ...rs,
      damageMatrix: { ...rs.damageMatrix, energy: { vsShields: 9000, vsArmor: 11000 } },
    };
    const after = explainWeapon(weapon('PulseLaser'), 'Mech', flipped);
    expect(values(after, 'Damage family')[0]).toBe('Energy — ×0.90 vs shields, ×1.10 vs armour');
  });

  it('surfaces a damage delta and a reach override', () => {
    const ex = explainWeapon(weapon('Railgun'), 'HeavyTank', rs);
    expect(values(ex, 'Damage')[0]).toBe('+25');
    expect(values(ex, 'Penetration')[0]).toBe('+50%');
    expect(values(ex, 'Reach')[0]).toContain('Deep');
  });

  it('derives fire rate from the ruleset tick table', () => {
    const ex = explainWeapon(weapon('Railgun'), 'HeavyTank', rs);
    expect(values(ex, 'Fire rate')[0]).toBe('Siege — 1 shot / 10 ticks (1.0/s)');
  });

  it('omits stat lines that are zero', () => {
    const ex = explainWeapon(weapon('HeavyCannon'), 'HeavyTank', rs);
    expect(values(ex, 'Damage')).toHaveLength(0);
  });

  it('shows an energy weapon contesting air only when the ruleset enables it (v2)', () => {
    // Off by default — no Air line, and a kinetic weapon never gets one.
    expect(values(explainWeapon(weapon('SiegeLaser'), 'HeavyTank', rs), 'Air')).toHaveLength(0);
    const on: Ruleset = { ...rs, airMods: { ...rs.airMods, energyAirDmgMult: 7500 } };
    expect(values(explainWeapon(weapon('HeavyCannon'), 'HeavyTank', on), 'Air')).toHaveLength(0);
    // Enabled — an energy weapon reports its live intermediate air rate.
    expect(values(explainWeapon(weapon('SiegeLaser'), 'HeavyTank', on), 'Air')[0]).toBe(
      'Contests aircraft at ×0.75 damage, from the front line only',
    );
  });
});

describe('defenses', () => {
  it('describes a shield pool from its deltas', () => {
    const ex = explainDefense(defense('DeflectorShield'), rs);
    expect(values(ex, 'Shield')[0]).toBe('+250 pool · +6 regen/tick · 25 tick delay');
  });

  it('describes special mitigation', () => {
    const ex = explainDefense(defense('BlastPlating'), rs);
    expect(values(ex, 'Mitigation')[0]).toBe('Explosive splash taken ×0.60');
  });

  it('reports a tradeoff as a cost', () => {
    const ex = explainDefense(defense('CompositeArmor'), rs);
    const move = ex.effects.find((e) => e.label === 'Move speed');
    expect(move?.value).toBe('-1');
    expect(move?.tone).toBe('cost');
  });

  it('shows the Balanced default granting real armor and a shield (no longer a no-op)', () => {
    // v2: the old "Standard Hull" no-op default is now Balanced — a modest mix, no drawback. The id
    // StandardHullMech is retained from v1, but the module is the Balanced family.
    const ex = explainDefense(defense('StandardHullMech'), rs);
    expect(values(ex, 'Armor')).toHaveLength(1);
    expect(values(ex, 'Shield')).toHaveLength(1);
    expect(ex.effects.every((e) => e.value !== 'None — this slot grants nothing')).toBe(true);
  });

  it('describes an ablative pool with its save chance and non-regen caveat', () => {
    const ex = explainDefense(defense('MechAblative'), rs);
    // Mech mount scale is ×1.0, so the pool shows its full base of 600 and the 20% default save.
    expect(values(ex, 'Ablative')[0]).toBe('+600 one-time pool · 20% chance per hit not to deplete');
    expect(ex.caveat).toMatch(/never regenerates/);
  });

  it('scales the displayed defensive numbers by mount class', () => {
    // The heli mount carries a ×0.6 scale, so the SAME ablative module shows a smaller pool than the
    // Mech's — the Garage displays what the unit actually receives, not the module's unscaled base.
    const heli = explainDefense(defense('HeliAblative'), rs);
    expect(values(heli, 'Ablative')[0]).toBe('+360 one-time pool · 20% chance per hit not to deplete');
  });

  it('reads the ablative save chance live from the ruleset', () => {
    const tuned: Ruleset = { ...rs, ablativeMods: { saveChance: 3500 } };
    const ex = explainDefense(defense('MechAblative'), tuned);
    expect(values(ex, 'Ablative')[0]).toContain('35% chance');
  });

  it('describes reactive plating with the live rate and its adapts-slowly caveat', () => {
    const ex = explainDefense(defense('MechReactive'), rs);
    // Default reactive rate is ×0.8 against the most-absorbed family, read from the ruleset.
    expect(values(ex, 'Reactive')[0]).toBe('damage from the most-absorbed family ×0.80 once it adapts');
    expect(ex.caveat).toMatch(/opens exactly as Balanced/);
    // The rate is live data, not authored text.
    const tuned: Ruleset = { ...rs, reactiveMods: { rate: 6000 } };
    expect(values(explainDefense(defense('MechReactive'), tuned), 'Reactive')[0]).toContain('×0.60');
  });
});

describe('utilities', () => {
  it('describes a cadence shift in tiers', () => {
    const ex = explainUtility(utility('Autoloader'), rs);
    expect(values(ex, 'Fire rate')[0]).toBe('1 tier faster');
  });

  it('pluralises and signs a multi-tier cadence shift', () => {
    const base = utility('Autoloader');
    expect(values(explainUtility({ ...base, cadenceShift: 2 }, rs), 'Fire rate')[0]).toBe(
      '2 tiers faster',
    );
    const slower = explainUtility({ ...base, cadenceShift: -1 }, rs);
    expect(values(slower, 'Fire rate')[0]).toBe('1 tier slower');
    expect(slower.effects.find((e) => e.label === 'Fire rate')?.tone).toBe('cost');
  });

  it('lists the capabilities a utility unlocks', () => {
    const ex = explainUtility(utility('CombatAI'), rs);
    expect(values(ex, 'Unlocks')).toContain('A second Plan-B trigger slot');
  });

  it('flags the Rangefinder as having no effect', () => {
    const ex = explainUtility(utility('Rangefinder'), rs);
    expect(ex.caveat).toMatch(/No effect yet/);
  });

  it('still renders computed effects for equipment with no authored copy', () => {
    const invented: UtilityModule = {
      kind: 'Utility',
      id: 'TargetingUplink',
      name: 'Targeting Uplink',
      unlocks: [],
      cadenceShift: 0,
      statDeltas: {
        damage: 0,
        accuracy: 500,
        splash: 0,
        penetration: 0,
        evasion: 0,
        armorPct: 0,
        critChance: 0,
        moveSpeed: 0,
        targetDraw: 0,
        cadenceTier: null,
        reach: null,
      },
    };
    const ex = explainUtility(invented, rs);
    expect(ex.blurb).toBe('');
    expect(values(ex, 'Accuracy')[0]).toBe('+5%');
  });
});

describe('dials', () => {
  it('explains stance as a two-sided magnitude trade, toned by side', () => {
    const agg = explainDial('stance', 'Aggressive', rs);
    expect(agg.effects.find((e) => e.label === 'Output')?.tone).toBe('gain');
    expect(agg.effects.find((e) => e.label === 'Damage taken')?.tone).toBe('cost');

    const def = explainDial('stance', 'Defensive', rs);
    expect(def.effects.find((e) => e.label === 'Output')?.tone).toBe('cost');
    expect(def.effects.find((e) => e.label === 'Damage taken')?.tone).toBe('gain');

    // Neutral is the identity baseline — no trade.
    expect(explainDial('stance', 'Neutral', rs).effects.some((e) => e.value.includes('Neutral'))).toBe(
      true,
    );
  });

  it('reads the stance magnitudes live from the ruleset', () => {
    const tuned: Ruleset = {
      ...rs,
      stanceMods: { ...DEFAULT_STANCE_MODS, aggressiveOutput: 13000, defensiveTaken: 7000 },
    };
    expect(
      explainDial('stance', 'Aggressive', tuned).effects.find((e) => e.label === 'Output')?.value,
    ).toBe('×1.30');
    expect(
      explainDial('stance', 'Defensive', tuned).effects.find((e) => e.label === 'Damage taken')?.value,
    ).toBe('×0.70');
  });

  it('gives every stance and movement mode a blurb', () => {
    for (const stance of ['Aggressive', 'Neutral', 'Defensive']) {
      expect(explainDial('stance', stance, rs).blurb, `${stance} blurb`).not.toBe('');
    }
    for (const move of ['Hold', 'Advance', 'FallBack', 'Kite']) {
      expect(explainDial('movement', move, rs).blurb, `${move} blurb`).not.toBe('');
    }
  });

  it('explains a targeting chain by its priority filters then fallback', () => {
    const chain = explainTargeting({ priority1: 'TargetSupport', fallback: 'Furthest' });
    expect(values(chain, 'Priority 1')[0]).toBe('Target Support');
    expect(values(chain, 'Fallback')[0]).toBe('Furthest');
    expect(chain.blurb).not.toBe('');

    // A bare chain (no filters) explains purely by position.
    const bare = explainTargeting({ fallback: 'Closest' });
    expect(values(bare, 'Priority')[0]).toContain('None');
    expect(bare.blurb).not.toBe('');
  });
});

describe('build summary', () => {
  it('lists equipment by name and every v3 dial', () => {
    const dials: BehaviorDials = {
      targeting: { priority1: 'TargetArmor', fallback: 'Closest' },
      movement: 'Hold',
      stance: 'Neutral',
    };
    const lines = summarizeBuild(
      { weapon: 'HeavyCannon', defense: 'CompositeArmor', utilities: ['FireControl', 'Autoloader'] },
      dials,
      rs,
    );
    expect(lines.find((l) => l.label === 'Weapon')?.value).toBe('Heavy Cannon');
    expect(lines.find((l) => l.label === 'Slot 2')?.value).toBe('Autoloader');
    expect(lines.find((l) => l.label === 'Targeting')?.value).toBe('Target Armor');
    expect(lines.find((l) => l.label === 'Position')?.value).toBe('Hold');
    expect(lines.find((l) => l.label === 'Stance')?.value).toBe('Neutral');
  });

  it('falls back to the raw id for equipment missing from the ruleset', () => {
    const dials: BehaviorDials = {
      targeting: { fallback: 'Closest' },
      movement: 'Hold',
      stance: 'Neutral',
    };
    const lines = summarizeBuild(
      { weapon: 'NoSuchGun', defense: 'CompositeArmor', utilities: [] },
      dials,
      rs,
    );
    expect(lines.find((l) => l.label === 'Weapon')?.value).toBe('NoSuchGun');
  });
});
