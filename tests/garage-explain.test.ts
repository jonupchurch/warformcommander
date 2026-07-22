/**
 * The Customize surface's effect breakdown — the pure explanation layer behind it.
 *
 * The point of these tests is the module's core promise: **numbers come from the ruleset, never from
 * authored copy**, so a balance change can never leave the Garage lying to the player. Each case
 * therefore mutates the fixture ruleset and asserts the rendered text follows.
 */

import { describe, expect, it } from 'vitest';

import {
  DIAL_SECTIONS,
  explainDefense,
  explainDial,
  explainUtility,
  explainWeapon,
  summarizeBuild,
} from '@/lib/garage/explain';
import type { DefenseModule, UtilityModule, WeaponModule } from '@/lib/garage/loadout-options';
import type { BehaviorDials } from '@/sim/model';
import { DEFAULT_ENERGY_MODES } from '@/sim/ruleset';
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
    expect(values(ex, 'Damage family')[0]).toBe('Energy — ×0.60 vs shields, ×1.25 vs armour');

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
  it('always shows BOTH halves of the energy trade', () => {
    // Showing only the favourable side would misrepresent the choice.
    for (const mode of ['Overdrive', 'Offense', 'Balanced', 'Defense', 'Fortify']) {
      const ex = explainDial('energy', mode, rs);
      expect(values(ex, 'Damage dealt'), `${mode} dealt`).toHaveLength(1);
      expect(values(ex, 'Damage taken'), `${mode} taken`).toHaveLength(1);
    }
  });

  it('tones each half by whether it helps or hurts', () => {
    const over = explainDial('energy', 'Overdrive', rs);
    expect(values(over, 'Damage dealt')[0]).toBe('×1.20');
    expect(values(over, 'Damage taken')[0]).toBe('×1.10');
    expect(over.effects.find((e) => e.label === 'Damage dealt')?.tone).toBe('gain');
    expect(over.effects.find((e) => e.label === 'Damage taken')?.tone).toBe('cost');

    const fort = explainDial('energy', 'Fortify', rs);
    expect(values(fort, 'Damage dealt')[0]).toBe('×0.85');
    expect(values(fort, 'Damage taken')[0]).toBe('×0.80');
    expect(fort.effects.find((e) => e.label === 'Damage dealt')?.tone).toBe('cost');
    expect(fort.effects.find((e) => e.label === 'Damage taken')?.tone).toBe('gain');
  });

  it('reads the energy table from the ruleset when it carries one', () => {
    const tuned: Ruleset = {
      ...rs,
      energyModes: {
        ...DEFAULT_ENERGY_MODES,
        fortify: { damageDealt: 7000, damageTaken: 5000 },
      },
    };
    const ex = explainDial('energy', 'Fortify', tuned);
    expect(values(ex, 'Damage dealt')[0]).toBe('×0.70');
    expect(values(ex, 'Damage taken')[0]).toBe('×0.50');
  });

  it('no longer claims the defensive modes give nothing back', () => {
    for (const mode of ['Defense', 'Fortify']) {
      expect(explainDial('energy', mode, rs).caveat).toBeUndefined();
    }
  });

  it('explains stance as a fire-allocation dial (v2 — no longer inert)', () => {
    // Every combat stance now has a blurb and no "not wired" caveat.
    for (const stance of ['Aggressive', 'Neutral', 'Defensive', 'Protector', 'Opportunist']) {
      const ex = explainDial('stance', stance, rs);
      expect(ex.blurb, `${stance} blurb`).not.toBe('');
      expect(ex.caveat).toBeUndefined();
    }
    // Aggressive draws fire (a cost); Defensive sheds it (a gain).
    expect(explainDial('stance', 'Aggressive', rs).effects.find((e) => e.label === 'Draws fire')?.tone).toBe('cost');
    expect(explainDial('stance', 'Defensive', rs).effects.find((e) => e.label === 'Sheds fire')?.tone).toBe('gain');
  });

  it('shows the Opportunist execute bonus from the ruleset', () => {
    const ex = explainDial('stance', 'Opportunist', rs);
    expect(ex.effects.find((e) => e.label === 'Execute')?.value).toBe('+30% damage vs targets under 40% hull');
    const tuned: Ruleset = { ...rs, executeMods: { threshold: 5000, bonus: 5000 } };
    expect(explainDial('stance', 'Opportunist', tuned).effects.find((e) => e.label === 'Execute')?.value).toBe(
      '+50% damage vs targets under 50% hull',
    );
  });

  it('explains the three support stances by repair priority (v2 role split)', () => {
    for (const stance of ['Triage', 'Sustain', 'Empower']) {
      const ex = explainDial('stance', stance, rs);
      expect(ex.blurb, `${stance} blurb`).not.toBe('');
      expect(ex.caveat).toBeUndefined();
      // A support stance is a repair-priority axis, so it must NOT show a fire-priority tier line.
      expect(ex.effects.find((e) => e.label === 'Draws fire' || e.label === 'Sheds fire')).toBeUndefined();
    }
    // Triage and Sustain repair different allies.
    expect(explainDial('stance', 'Triage', rs).effects.find((e) => e.label === 'Repair priority')?.value).toBe(
      'Most-damaged ally',
    );
    expect(explainDial('stance', 'Sustain', rs).effects.find((e) => e.label === 'Repair priority')?.value).toBe(
      'Most-effective ally',
    );
  });

  it('shows the Empower overshield ceiling from the ruleset', () => {
    expect(explainDial('stance', 'Empower', rs).effects.find((e) => e.label === 'Overshield')?.value).toBe(
      'up to +30% max hull as shield',
    );
    const tuned: Ruleset = { ...rs, empowerMods: { shieldCapBp: 5000 } };
    expect(explainDial('stance', 'Empower', tuned).effects.find((e) => e.label === 'Overshield')?.value).toBe(
      'up to +50% max hull as shield',
    );
  });

  it('warns that the unimplemented movement modes do not move', () => {
    for (const mode of ['Kite', 'Reposition', 'Escort']) {
      expect(explainDial('movement', mode, rs).caveat).toMatch(/No effect yet/);
    }
    expect(explainDial('movement', 'Advance', rs).caveat).toBeUndefined();
  });

  it('describes every option offered by every dial', () => {
    // Guards against adding a dial option without copy for it.
    const byDial: Record<string, string[]> = {
      targetRow: ['FrontReachable', 'LastReachable', 'FullestRow', 'WeakestRow'],
      targetRule: [
        'FocusFire',
        'DisperseFire',
        'Nearest',
        'Weakest',
        'BiggestThreat',
        'TargetSupport',
        'TargetAir',
        'SmartCounter',
      ],
      energy: ['Overdrive', 'Offense', 'Balanced', 'Adaptive', 'Defense', 'Fortify'],
      movement: ['Hold', 'Advance', 'FallBack', 'Kite', 'Reposition', 'Escort'],
    };
    for (const [dial, opts] of Object.entries(byDial)) {
      for (const opt of opts) {
        const ex = explainDial(dial as keyof BehaviorDials, opt, rs);
        expect(ex.blurb, `${dial}=${opt} needs a blurb`).not.toBe('');
      }
    }
  });
});

describe('build summary', () => {
  it('lists equipment by name and every dial', () => {
    const dials: BehaviorDials = {
      targetRow: 'FrontReachable',
      targetRule: 'FocusFire',
      energy: 'Balanced',
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
    expect(lines.filter((l) => DIAL_SECTIONS.some((d) => d.label === l.label))).toHaveLength(5);
  });

  it('falls back to the raw id for equipment missing from the ruleset', () => {
    const dials: BehaviorDials = {
      targetRow: 'FrontReachable',
      targetRule: 'FocusFire',
      energy: 'Balanced',
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
