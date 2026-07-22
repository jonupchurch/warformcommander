/**
 * Plain-language explanations of a machine's **current** choices, for the Customize surface's
 * breakdown panel. Turns an equipment module or a dial value into a short blurb plus a list of
 * concrete effect lines.
 *
 * Two rules this module follows, deliberately:
 *
 * 1. **Numbers are computed from the ruleset, never authored.** The ruleset is edited live (the
 *    Flak Battery and Skirmish Cannon were both added as data, not code), so a hand-written "+8%
 *    accuracy" would silently go stale the next time balance moves. Only the *prose* is authored,
 *    and a module with no authored copy still renders its computed effects.
 * 2. **Mechanics that do nothing say so.** Several dial options and one utility are present in the
 *    data model but not read by the engine. Inventing flavour for them would mislead; they carry an
 *    explicit `caveat` instead.
 *
 * Pure — no React, no state.
 */

import type { BehaviorDials } from '@/sim/model';
import type { MachineTypeId } from '@/sim/model';
import {
  DEFAULT_ABLATIVE_MODS,
  DEFAULT_ENERGY_MODES,
  DEFAULT_EXECUTE_MODS,
  DEFAULT_MOUNT_SCALE,
  DEFAULT_STANCE_AGGRO,
  mountScaleFor,
} from '@/sim/ruleset';
import type {
  Capability,
  DamageFamily,
  EnergyModes,
  EnergyProfile,
  ReachTag,
  Ruleset,
  StatDeltas,
} from '@/sim/ruleset';

import { humanize } from './display';
import type { DefenseModule, UtilityModule, WeaponModule } from './loadout-options';

/** One "what this does" line: a stat name and its formatted change. */
export interface EffectLine {
  label: string;
  value: string;
  /** `cost` marks a downside (rendered muted/warn), `none` an explicitly-nil effect. */
  tone?: 'gain' | 'cost' | 'none';
}

/** A rendered explanation of one selected choice. */
export interface Explanation {
  title: string;
  /** One or two sentences on what the choice is for. Empty when no copy is authored. */
  blurb: string;
  effects: EffectLine[];
  /** A correctness warning — e.g. the mechanic is not wired into the engine yet. */
  caveat?: string;
}

// --- formatting ------------------------------------------------------------

/** `Fixed` milli → whole-unit display, signed. */
function signedUnits(milli: number): string {
  const v = milli / 1000;
  return `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

/** `Bp` → signed percent. */
function signedPct(bp: number): string {
  const v = bp / 100;
  return `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

/** `Bp` → a ×multiplier. */
function mult(bp: number): string {
  return `×${(bp / 10000).toFixed(2)}`;
}

/** `Bp` → an unsigned percent (e.g. a probability). */
function pct(bp: number): string {
  const v = bp / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

/** Shots per second for a cadence tier, from the ruleset's tick table. */
function cadenceRate(tier: keyof Ruleset['cadenceTicks'] | string, ruleset: Ruleset): string {
  const key = String(tier).toLowerCase() as keyof Ruleset['cadenceTicks'];
  const ticks = ruleset.cadenceTicks[key];
  if (typeof ticks !== 'number' || ticks <= 0) return humanize(String(tier));
  const perSec = ruleset.globals.tickRate / ticks;
  return `${humanize(String(tier))} — 1 shot / ${ticks} tick${ticks === 1 ? '' : 's'} (${perSec.toFixed(1)}/s)`;
}

/** What a reach tag can actually hit. */
const REACH_COPY: Record<ReachTag, string> = {
  Nearest: 'Frontmost occupied enemy row only',
  FrontMid: 'Front + Middle — currently behaves the same as Nearest',
  AnyGround: 'Any enemy ground row, from any row',
  Air: 'Enemy aircraft exclusively; ground only once the skies are clear',
  Deep: 'Extended reach past the enemy front screen',
};

/** Every non-zero stat delta, as effect lines. Shared by weapons, defense tradeoffs, and utilities. */
function statDeltaLines(d: StatDeltas, ruleset: Ruleset): EffectLine[] {
  const out: EffectLine[] = [];
  const push = (label: string, raw: number, fmt: (n: number) => string) => {
    if (raw !== 0) out.push({ label, value: fmt(raw), tone: raw > 0 ? 'gain' : 'cost' });
  };
  push('Damage', d.damage, signedUnits);
  push('Accuracy', d.accuracy, signedPct);
  push('Splash', d.splash, signedPct);
  push('Penetration', d.penetration, signedPct);
  push('Crit chance', d.critChance, signedPct);
  push('Evasion', d.evasion, signedPct);
  push('Armor', d.armorPct, signedPct);
  push('Move speed', d.moveSpeed, (n) => `${n > 0 ? '+' : ''}${n}`);
  if (d.cadenceTier) out.push({ label: 'Fire rate', value: cadenceRate(d.cadenceTier, ruleset) });
  if (d.reach) {
    out.push({ label: 'Reach', value: `${humanize(d.reach)} — ${REACH_COPY[d.reach]}` });
  }
  return out;
}

// --- authored copy ---------------------------------------------------------

/**
 * Per-equipment prose, keyed by ruleset id. Absent ids fall back to computed effects only, so
 * equipment added to the ruleset later still renders correctly (just without a blurb).
 */
const EQUIPMENT_BLURB: Record<string, string> = {
  // Weapons
  HeavyCannon: 'The standard heavy mount — no tricks, and it keeps the native Kinetic bonus.',
  Railgun:
    'Trades rate of fire for reach and armour-piercing: the only direct-fire weapon that strikes past the enemy front screen, and the only one with meaningful penetration.',
  SiegeLaser:
    'Puts Energy damage on a durable chassis. Gives up the native Kinetic bonus in exchange for hitting armour far harder.',
  Autocannon: 'The light tank default — one shot every tick.',
  GaussRepeater: 'A slight downgrade on the Autocannon with no compensating benefit.',
  SkirmishCannon:
    'The raider weapon. Its indirect reach ignores the enemy front screen entirely — pair it with the Last Reachable target row to strike artillery and medics directly.',
  AssaultCannon: 'The mech default. Kinetic, so it shreds shields and folds against armour.',
  PulseLaser:
    'Energy damage on a mech. Since mechs have no native family to lose, this is a free choice — and Energy hits armour hard.',
  Howitzer: 'Indirect siege fire — reaches any enemy row from anywhere, with splash.',
  RocketPods: 'Helicopter ordnance — indirect reach, so it can strike any enemy row.',
  SAMBattery:
    'A true anti-air launcher. It engages aircraft exclusively while any are alive, and bombards ground at a heavy penalty once the skies are clear.',
  RocketBarrage:
    'Gives up anti-air entirely to fire on ground with no penalty — a second artillery piece.',
  RepairBeam: 'Nominal only. Support machines never fire; they repair instead.',

  // Defenses
  CompositeArmor: 'Maximum armour, paid for with mobility.',
  BlastPlating:
    'The dedicated counter to artillery and helicopters — it cuts incoming explosive splash, though not direct hits.',
  DeflectorShield:
    'Swaps the armour layer for a regenerating pool. Strong against Energy, a liability against Kinetic — armour never protects a shield.',
  FastCycleShield:
    'A small pool that recovers quickly between engagements rather than absorbing one big burst.',

  // Utilities
  FireControl: 'Accuracy is checked against enemy evasion, so this matters most against light tanks and aircraft.',
  DriveServos: 'Faster repositioning — a machine steps one zone every (12 − speed) ticks.',
  ECMSuite: 'Raises the miss chance of everything shooting at this machine.',
  Autoloader:
    'Usually the strongest module available: shifting a tier up is a straight multiplier on everything this machine does.',
  CombatAI:
    'The only source of a second Plan-B slot, plus two gated dial options.',
  FlakBattery:
    'The practical answer to enemy aircraft — it lets a ground machine engage air at a real damage rate instead of plinking.',
  SensorSuite:
    'Grants access to air targets but no damage bonus; a spotter rather than a killer.',
  Rangefinder: 'Intended to extend weapon reach by one step.',
};

/** Equipment whose mechanic the engine does not currently read. */
const EQUIPMENT_CAVEAT: Record<string, string> = {
  Rangefinder:
    'No effect yet — the engine deepens Nearest to Front+Mid, but targeting treats those identically and no weapon starts at Front+Mid.',
  GaussRepeater: 'Strictly worse than the Autocannon — identical stats, less damage.',
};

/** What each capability actually grants. */
const CAPABILITY_COPY: Record<Capability, string> = {
  ExtraPlanBSlot: 'A second Plan-B trigger slot',
  AdaptiveEnergy: 'The Adaptive energy mode',
  OpportunistStance: 'The Opportunist stance',
  ExtendReach: 'Extended weapon reach',
  TargetAir: 'Can target aircraft, and unlocks the Target Air rule',
  AntiAir: 'Can target aircraft at the flak damage rate, with the anti-air accuracy bonus',
};

// --- equipment -------------------------------------------------------------

/** How a damage family fares against each defensive layer, from the live matrix. */
function familyLine(family: DamageFamily, ruleset: Ruleset): EffectLine | null {
  if (family === 'Support') return null;
  const key = family.toLowerCase() as 'kinetic' | 'energy' | 'explosive';
  const m = ruleset.damageMatrix[key];
  if (!m) return null;
  return {
    label: 'Damage family',
    value: `${family} — ${mult(m.vsShields)} vs shields, ${mult(m.vsArmor)} vs armour`,
  };
}

/** Explain the equipped weapon, including whether it earns the native-family bonus. */
export function explainWeapon(
  weapon: WeaponModule,
  typeId: MachineTypeId,
  ruleset: Ruleset,
): Explanation {
  const effects: EffectLine[] = [];
  const fam = familyLine(weapon.family, ruleset);
  if (fam) effects.push(fam);

  const native = ruleset.machineTypes[typeId]?.nativeFamily;
  if (native === undefined) {
    effects.push({
      label: 'Native bonus',
      value: 'None — this class is a generalist and never earns it',
      tone: 'none',
    });
  } else if (native === weapon.family) {
    effects.push({
      label: 'Native bonus',
      value: `${signedPct(ruleset.globals.nativeBonus)} damage`,
      tone: 'gain',
    });
  } else {
    effects.push({
      label: 'Native bonus',
      value: `Forfeited — this class is native ${native}`,
      tone: 'cost',
    });
  }

  effects.push(...statDeltaLines(weapon.statDeltas, ruleset));
  return {
    title: weapon.name,
    blurb: EQUIPMENT_BLURB[weapon.id] ?? '',
    effects,
    caveat: EQUIPMENT_CAVEAT[weapon.id],
  };
}

/** Explain the equipped defense — its layer, any special mitigation, and its tradeoff. */
export function explainDefense(defense: DefenseModule, ruleset: Ruleset): Explanation {
  const effects: EffectLine[] = [];
  // Defensive magnitudes scale by mount class (v2), so show what THIS mount actually receives, not
  // the module's unscaled base — the fragile back-rank mounts get proportionally less (FR-033).
  const scale = mountScaleFor(ruleset.mountScale ?? DEFAULT_MOUNT_SCALE, defense.mountClass);
  const byScale = (v: number): number => Math.trunc((v * scale) / 10_000);
  if (defense.armorPctDelta !== 0) {
    effects.push({ label: 'Armor', value: signedPct(byScale(defense.armorPctDelta)), tone: 'gain' });
  }
  if (defense.shieldDelta) {
    const s = defense.shieldDelta;
    effects.push({
      label: 'Shield',
      value: `${signedUnits(byScale(s.cap))} pool · ${signedUnits(s.regen)} regen/tick · ${s.delay} tick delay`,
      tone: 'gain',
    });
  }
  if (defense.ablativeDelta) {
    const save = (ruleset.ablativeMods ?? DEFAULT_ABLATIVE_MODS).saveChance;
    effects.push({
      label: 'Ablative',
      value: `${signedUnits(byScale(defense.ablativeDelta.cap))} one-time pool · ${pct(save)} chance per hit not to deplete`,
      tone: 'gain',
    });
  }
  if (defense.specialMitigation) {
    const m = defense.specialMitigation;
    effects.push({
      label: 'Mitigation',
      value: `${m.against} splash taken ${mult(m.splashTakenMult)}`,
      tone: 'gain',
    });
  }
  effects.push(...statDeltaLines(defense.tradeoff, ruleset));
  if (effects.length === 0) {
    effects.push({ label: 'Effect', value: 'None — this slot grants nothing', tone: 'none' });
  }
  // The ablative pool's defining drawback is inherent, not a stat line: it never comes back.
  const caveat =
    EQUIPMENT_CAVEAT[defense.id] ??
    (defense.ablativeDelta ? 'The ablative pool never regenerates — once spent, it is gone.' : undefined);
  return {
    title: defense.name,
    blurb: EQUIPMENT_BLURB[defense.id] ?? '',
    effects,
    caveat,
  };
}

/** Explain a utility — its stat deltas, cadence shift, and any capabilities it unlocks. */
export function explainUtility(utility: UtilityModule, ruleset: Ruleset): Explanation {
  const effects: EffectLine[] = [];
  if (utility.statDeltas) effects.push(...statDeltaLines(utility.statDeltas, ruleset));
  if (utility.cadenceShift !== 0) {
    const faster = utility.cadenceShift > 0;
    const n = Math.abs(utility.cadenceShift);
    effects.push({
      label: 'Fire rate',
      value: `${n} tier${n === 1 ? '' : 's'} ${faster ? 'faster' : 'slower'}`,
      tone: faster ? 'gain' : 'cost',
    });
  }
  for (const cap of utility.unlocks) {
    effects.push({ label: 'Unlocks', value: CAPABILITY_COPY[cap] ?? humanize(cap), tone: 'gain' });
  }
  if (effects.length === 0) {
    effects.push({ label: 'Effect', value: 'None', tone: 'none' });
  }
  return {
    title: utility.name,
    blurb: EQUIPMENT_BLURB[utility.id] ?? '',
    effects,
    caveat: EQUIPMENT_CAVEAT[utility.id],
  };
}

// --- dials -----------------------------------------------------------------

/** The energy dial's table for a ruleset, falling back to the engine default when omitted. */
function energyProfile(value: string, ruleset: Ruleset): EnergyProfile | null {
  const table = ruleset.energyModes ?? DEFAULT_ENERGY_MODES;
  const key = value.toLowerCase() as keyof EnergyModes;
  return table[key] ?? null;
}

const DIAL_BLURB: Record<string, string> = {
  // Target row
  FrontReachable:
    'Shoots into the frontmost row this machine can reach. For a Nearest-reach weapon that is the only option anyway.',
  LastReachable:
    'Shoots into the deepest reachable row — the raider setting. Only does anything with indirect or deep reach.',
  FullestRow: 'Shoots into the most crowded reachable row. Pairs with splash weapons.',
  WeakestRow: 'Shoots into the reachable row with the least remaining hull.',
  // Target rule
  FocusFire:
    'Concentrates on the most wounded target in the row. Killing a machine outright removes its damage from the battle permanently.',
  DisperseFire: 'Spreads damage onto the freshest target instead of finishing wounded ones.',
  Nearest: 'Picks the closest target by zone, then by placement order.',
  Weakest: 'Picks the most wounded target — identical in effect to Focus Fire.',
  BiggestThreat:
    'Picks the highest-threat target. Will ignore a nearly-dead machine to keep hitting a healthy artillery piece.',
  TargetSupport: 'Hunts enemy support machines first, falling back to the most wounded target.',
  TargetAir: 'Hunts enemy aircraft first, falling back to the most wounded target.',
  SmartCounter:
    'Picks whichever target this machine’s damage family punishes most, falling back to the most wounded.',
  // Movement
  Hold: 'Stays in its starting zone for the whole battle.',
  Advance: 'Steps forward one zone at a time — Rear to Middle to Front.',
  FallBack: 'Steps back one zone at a time — Front to Middle to Rear.',
  Kite: 'Intended to withdraw while firing.',
  Reposition: 'Intended to move to a better firing position.',
  Escort: 'Intended to follow and screen an ally.',
};

const DIAL_CAVEAT: Record<string, string> = {
  Kite: 'No effect yet — this machine will hold position.',
  Reposition: 'No effect yet — this machine will hold position.',
  Escort: 'No effect yet — this machine will hold position.',
  Adaptive: 'Currently identical to Balanced.',
};

/** Energy-mode prose. Each mode is a two-sided trade; the numbers come from the ruleset. */
const ENERGY_BLURB: Record<string, string> = {
  Overdrive: 'All-out attack. Hits hardest in the game, and takes the most in return.',
  Offense: 'Leans into the attack, accepting a little more incoming damage.',
  Balanced: 'No trade either way — the neutral posture.',
  Adaptive: 'Intended to shift posture as the battle turns.',
  Defense: 'An even trade: gives up damage for the same measure of protection.',
  Fortify: 'The dug-in posture — gives up the most damage, and gains the most protection.',
};

/** Per-stance prose (v2). Stance is a fire-allocation axis: it decides which of your units gets shot. */
const STANCE_BLURB: Record<string, string> = {
  Aggressive: 'Draws enemy fire ahead of your other units in the same row — and its own targeting cannot be baited by an enemy taunt or hidden from by an enemy Defensive stance.',
  Neutral: 'No fire-priority change. The baseline every other stance is measured against.',
  Defensive: 'Targeted only when no other option remains in its row — hide a fragile, high-value unit behind its rowmates.',
  Protector: 'Draws fire ahead of your other units, and extends that cover to allies in the adjacent ground zones an attacker can already reach — a bodyguard for the line.',
  Opportunist: 'Deals bonus damage to any enemy already below the execute threshold — finishes off the wounded.',
  Triage: 'Support: commits its repair to whichever ally is closest to dying.',
  Sustain: 'Support: keeps still-effective allies topped up rather than chasing losses.',
  Empower: 'Support: forgoes repair to strengthen nearby allies instead.',
};

/** The stance keys that carry a fire-priority tier, with the sign of their effect. */
const STANCE_AGGRO_KEY: Record<string, keyof import('@/sim/ruleset').StanceAggro> = {
  Aggressive: 'aggressive',
  Neutral: 'neutral',
  Defensive: 'defensive',
  Protector: 'protector',
  Opportunist: 'opportunist',
  Triage: 'triage',
  Sustain: 'sustain',
  Empower: 'empower',
};

/** Explain one selected dial value. */
export function explainDial(
  dial: keyof BehaviorDials,
  value: string,
  ruleset: Ruleset,
): Explanation {
  const title = humanize(value);

  if (dial === 'stance') {
    const effects: EffectLine[] = [];
    const aggro = ruleset.stanceAggro ?? DEFAULT_STANCE_AGGRO;
    const key = STANCE_AGGRO_KEY[value];
    if (key) {
      const offset = aggro[key];
      // Lower offset = drawn first. Negative pulls fire in (a cost you take on), positive sheds it.
      const label = offset < 0 ? 'Draws fire' : offset > 0 ? 'Sheds fire' : 'Fire priority';
      const tone: EffectLine['tone'] = offset < 0 ? 'cost' : offset > 0 ? 'gain' : 'none';
      effects.push({ label, value: offset === 0 ? 'Neutral' : `tier ${offset > 0 ? '+' : ''}${offset}`, tone });
    }
    if (value === 'Opportunist') {
      const ex = ruleset.executeMods ?? DEFAULT_EXECUTE_MODS;
      effects.push({ label: 'Execute', value: `+${(ex.bonus / 100).toFixed(0)}% damage vs targets under ${(ex.threshold / 100).toFixed(0)}% hull`, tone: 'gain' });
    }
    return { title, blurb: STANCE_BLURB[value] ?? '', effects };
  }

  const effects: EffectLine[] = [];
  let blurb = DIAL_BLURB[value] ?? '';

  if (dial === 'energy') {
    blurb = ENERGY_BLURB[value] ?? blurb;
    const p = energyProfile(value, ruleset);
    if (p) {
      // Both halves, always — the point of the dial is that it is a trade, so showing only the
      // side that favours the player would misrepresent the choice.
      const tone = (bp: number, higherIsBetter: boolean): EffectLine['tone'] =>
        bp === 10000 ? 'none' : bp > 10000 === higherIsBetter ? 'gain' : 'cost';
      effects.push({
        label: 'Damage dealt',
        value: mult(p.damageDealt),
        tone: tone(p.damageDealt, true),
      });
      effects.push({
        label: 'Damage taken',
        value: mult(p.damageTaken),
        tone: tone(p.damageTaken, false),
      });
    }
  }

  return { title, blurb, effects, caveat: DIAL_CAVEAT[value] };
}

/** The five dials in display order, with the labels the Behavior tab uses. */
export const DIAL_SECTIONS: { dial: keyof BehaviorDials; label: string }[] = [
  { dial: 'targetRow', label: 'Target Row' },
  { dial: 'targetRule', label: 'Target Rule' },
  { dial: 'energy', label: 'Energy' },
  { dial: 'movement', label: 'Position' },
  { dial: 'stance', label: 'Stance' },
];

// --- whole-build summary ---------------------------------------------------

/** The equipment + dials a preset would capture, as one flat readout. */
export interface BuildLoadout {
  weapon: string;
  defense: string;
  utilities: string[];
}

/**
 * A compact "here is what is currently loaded" readout — the Presets tab's answer to "what am I
 * about to save, or about to overwrite?". Falls back to the raw id when an equipment entry is
 * missing so a stale preset still renders something legible.
 */
export function summarizeBuild(
  loadout: BuildLoadout,
  dials: BehaviorDials,
  ruleset: Ruleset,
): EffectLine[] {
  const name = (id: string) => ruleset.equipment[id]?.name ?? id;
  const lines: EffectLine[] = [
    { label: 'Weapon', value: name(loadout.weapon) },
    { label: 'Defense', value: name(loadout.defense) },
  ];
  loadout.utilities.forEach((id, i) => {
    lines.push({ label: `Slot ${i + 1}`, value: name(id) });
  });
  for (const { dial, label } of DIAL_SECTIONS) {
    lines.push({ label, value: humanize(dials[dial]) });
  }
  return lines;
}
