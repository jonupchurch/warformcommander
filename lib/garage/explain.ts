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

import type { BehaviorDials, TargetingChain } from '@/sim/model';
import type { MachineTypeId } from '@/sim/model';
import {
  DEFAULT_ABLATIVE_MODS,
  DEFAULT_MOUNT_SCALE,
  DEFAULT_REACTIVE_MODS,
  DEFAULT_STANCE_MODS,
  mountScaleFor,
} from '@/sim/ruleset';
import type {
  AuraEffect,
  AuraKind,
  AuraScope,
  Capability,
  DamageFamily,
  ReachTag,
  Ruleset,
  StatDeltas,
  SupportKind,
  SupportRange,
} from '@/sim/ruleset';

import { humanize, summarizeTargeting } from './display';
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
  push('Hull regen', d.hullRegen ?? 0, signedUnits);
  push('Shield capacity', d.shieldCap ?? 0, signedUnits);
  push('Shield regen', d.shieldRegen ?? 0, signedUnits);
  push('Projector power', d.supportPower ?? 0, signedUnits);
  push('Move speed', d.moveSpeed, (n) => `${n > 0 ? '+' : ''}${n}`);
  if (d.targetDraw !== 0) {
    out.push({
      label: 'Target draw',
      value: `${d.targetDraw > 0 ? '+' : ''}${d.targetDraw} (${d.targetDraw > 0 ? 'pulls fire' : 'sheds fire'})`,
    });
  }
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
/** Every ground+air mount that carries the shared per-mount defence families (id = `${Mount}<Family>`
 *  or `StandardHull${Mount}`). Camo and ECM exist only on the mounts listed at their call sites. */
const DEFENSE_MOUNTS = ['Heavy', 'Light', 'Mech', 'Heli', 'Artillery', 'RktArty', 'Support'] as const;

/** One description shared across a defence family's per-mount ids — so every chassis's variant of the
 *  same module (Armor Plating, Shield Array, …) carries identical copy without 7 hand-written dupes. */
function defenseFamily(
  id: (mount: string) => string,
  mounts: readonly string[],
  blurb: string,
): Record<string, string> {
  return Object.fromEntries(mounts.map((m) => [id(m), blurb]));
}

const EQUIPMENT_BLURB: Record<string, string> = {
  // Weapons
  HeavyCannon: 'The standard heavy mount — no tricks, and it keeps the native Kinetic bonus.',
  Railgun:
    'Trades rate of fire for reach and armour-piercing: the only direct-fire weapon that strikes past the enemy front screen, and the only one with meaningful penetration.',
  SiegeLaser:
    'Puts Energy damage on a durable chassis. Gives up the native Kinetic bonus in exchange for hitting armour far harder.',
  DemolitionGun:
    'A slow, heavy explosive gun — big splashing shells that punish a clustered front, trading rate of fire for shell size.',
  Autocannon: 'The light tank default — one shot every tick.',
  GaussRepeater: 'A slight downgrade on the Autocannon with no compensating benefit.',
  ArcRepeater:
    'A fast-firing energy repeater for light tanks — a stream of small hits that bite into armour. Rate of fire is its whole identity.',
  GrenadeLauncher:
    'A light tank\'s rapid explosive launcher — fast splashing shots, strong against a bunched-up light front.',
  SkirmishCannon:
    'The raider weapon. Its indirect reach ignores the enemy front screen entirely — pair it with the Last Reachable target row to strike artillery and medics directly.',
  AssaultCannon: 'The mech default. Kinetic, so it shreds shields and folds against armour.',
  PulseLaser:
    'Energy damage on a mech. Since mechs have no native family to lose, this is a free choice — and Energy hits armour hard.',
  MissileRack:
    'A mech\'s explosive missile pod — splash that leans on armour. Mechs have no native family to forfeit, so it is a free pick.',
  Howitzer: 'Indirect siege fire — reaches any enemy row from anywhere, with splash.',
  IonCannon:
    'Siege-cadence energy artillery — slow, heavy shells with indirect reach that melt armour from the safety of the backline.',
  RailHowitzer:
    'Kinetic siege artillery — indirect reach that shreds shields from the backline. The long-range answer to a shield-stacked enemy.',
  RocketPods: 'Helicopter ordnance — indirect reach, so it can strike any enemy row.',
  ChainGun:
    'A helicopter autocannon with indirect reach — rakes shields from any row, but folds against armour.',
  BeamProjector:
    'Helicopter energy fire with indirect reach — strikes any enemy row and bites hardest into armour.',
  SAMBattery:
    'A true anti-air launcher. It engages aircraft exclusively while any are alive, and bombards ground at a heavy penalty once the skies are clear.',
  RocketBarrage:
    'Gives up anti-air entirely to fire on ground with no penalty — a second artillery piece.',
  LaserBattery:
    'Rocket-artillery energy tubes — indirect reach and anti-armour bite, a second energy piece for the backline.',
  FlechetteBattery:
    'Rocket-artillery firing kinetic flechettes — indirect reach that shreds shields from anywhere on the field.',
  HealProjector: 'Projects hull repair across the whole army each tick — the Commander’s sustain answer.',
  ShieldProjector: 'Projects a shield top-up across the whole army each tick — the counter to burst.',
  AblationProjector:
    'Projects a one-time ablative buffer across the whole army — soaks the enemy’s opening alpha.',

  // Defenses — specific modules
  CompositeArmor: 'Maximum armour, paid for with mobility.',
  BlastPlating:
    'The dedicated counter to artillery and helicopters — it cuts incoming explosive splash, though not direct hits.',
  DeflectorShield:
    'Swaps the armour layer for a regenerating pool. Strong against Energy, a liability against Kinetic — armour never protects a shield.',
  FastCycleShield:
    'A small pool that recovers quickly between engagements rather than absorbing one big burst.',
  MechReactive:
    'Mech-only plating that opens Balanced, then biases its mitigation toward whichever damage family has hit it most — rewards a drawn-out fight, soft against burst before it adapts.',
  HeliChaff:
    'Helicopter chaff — a large evasion bonus specifically against anti-air fire, so flak and SAMs miss more often. It does nothing against ground weapons.',

  // Defenses — per-mount families (one description each, expanded across every chassis)
  ...defenseFamily(
    (m) => `StandardHull${m}`,
    DEFENSE_MOUNTS,
    'The balanced default — a little armour plus a small self-regenerating shield, and no mobility cost. The safe pick when you have no specific threat to build against.',
  ),
  ...defenseFamily(
    (m) => `${m}Armor`,
    DEFENSE_MOUNTS,
    'All-in on armour for one step of move speed — the most raw mitigation of any layer. Soaks Kinetic and Explosive, but Energy is built to pierce armour.',
  ),
  ...defenseFamily(
    (m) => `${m}Shield`,
    DEFENSE_MOUNTS,
    'Trades the armour layer for a large shield pool that regenerates between hits — strong against Energy, but Kinetic is built to shred shields, and it pauses briefly after taking damage before it refills.',
  ),
  ...defenseFamily(
    (m) => `${m}Ablative`,
    DEFENSE_MOUNTS,
    'A large one-time buffer that soaks the opening alpha, then is spent for good — it never regenerates. For a piece that only has to survive the first exchange.',
  ),
  ...defenseFamily(
    (m) => `${m}Camo`,
    ['Artillery', 'Light', 'RktArty'],
    'Camo netting — trades almost all mitigation for evasion, so shots miss outright instead of landing. Hides a fragile piece you would rather the enemy overlook.',
  ),
  ...defenseFamily(
    (m) => `${m}ECM`,
    ['Artillery', 'Heli', 'RktArty', 'Support'],
    'An ECM screen — this machine sheds incoming fire (the enemy targets it less), keeping a fragile support or artillery piece alive by drawing shots elsewhere.',
  ),

  // Utilities — common pool
  FireControl: 'Accuracy is checked against enemy evasion, so this matters most against light tanks and aircraft.',
  DriveServos: 'Faster repositioning — a machine steps one zone every (12 − speed) ticks.',
  ECMSuite: 'Raises the miss chance of everything shooting at this machine.',
  Autoloader:
    'Usually the strongest module available: shifting a tier up is a straight multiplier on everything this machine does.',
  CombatAI:
    'The only source of a second Plan-B slot, plus two gated dial options.',
  FlakBattery:
    'The practical answer to enemy aircraft — it lets a ground machine engage air at a real damage rate instead of plinking.',
  RocketPack:
    'A one-slot air answer for a ground unit — full-rate flak against aircraft near the front line, without giving up its own weapon. The cheap insurance against an air enemy.',
  SensorSuite:
    'Grants access to air targets but no damage bonus; a spotter rather than a killer.',
  Rangefinder: 'Intended to extend weapon reach by one step.',

  // Utilities — Heavy
  ExtraBatteries:
    'A bigger, faster-recharging shield pool for a heavy tank — deepens a shield build against sustained fire.',
  FieldRepair:
    'Passive hull repair every tick for a heavy tank — self-sustain that lets it outlast a grind without a Commander.',
  Decoy:
    'Pulls enemy fire toward this machine — but only enough to out-draw units firing with no priority; anything hunting a specific target ignores it.',
  SiegeMode:
    'A heavy tank that holds its position takes less fire — the reward for anchoring the line instead of advancing.',
  GuardianProtocol:
    'A heavy tank soaks a share of the direct fire aimed at allies in its zone — a bodyguard that redirects damage onto itself.',
  SmokeCanisters:
    'Lays smoke over its zone — allies beside it gain evasion, so incoming fire misses more often. A local screen.',
  LowHeatExhaust:
    'Cuts a heavy tank\'s heat signature for a large evasion bonus against anti-air and aircraft fire specifically — insurance against an air-heavy enemy.',

  // Utilities — Mech
  Overdrive:
    'Redlines a mech for a large damage boost, shedding armour to do it — glass-cannon output that trades survivability for kills.',
  BulwarkMode:
    'A mech that holds its ground takes less fire — the payoff for standing still instead of advancing.',
  ModularHardpoint:
    'A net extra utility slot for a mech — one more module than the chassis would normally allow.',
  AdaptiveMunitions:
    'Unlocks a Plan-B that switches a mech\'s outgoing damage type mid-battle — answer whatever defence you meet, at the cost of the native bonus (mechs have none to lose).',
  SuppressingFire:
    'On hit, cuts the target\'s own damage and accuracy — blunt an enemy\'s output instead of trying to out-damage it.',
  DuelistServos:
    'Consecutive hits on the same target ramp a mech\'s damage — a focus-fire crescendo that resets the moment it switches targets.',
  RepairNanites:
    'Passive hull repair every tick for a mech — quiet self-sustain that keeps it in a long fight.',
  JumpJets:
    'Periodically leaps a mech into the air for full air-to-air fire and whole-field reach, then lands and cools down — deadly, but an exposed AA target while airborne.',

  // Utilities — Light
  Spotter:
    'On hit, paints the target — a painted enemy takes extra damage from all further fire. Set up the kill for the rest of your army.',
  SnareShot:
    'On hit, cuts the target\'s move speed — pin an advancing or kiting enemy so your team can focus it down.',
  Ambush:
    'A light-tank alpha bonus — extra damage against a full-health target that fades once it is dented. Best on the opening strike.',
  FlankingPackage:
    'Extra damage against the enemy rear zone — send a light raider to punish the backline.',
  Jammer:
    'A light-tank jamming field — enemies in its zone shoot less accurately. A local version of the Commander\'s comms jammer.',
  TargetRadar:
    'Intended to extend a light tank\'s weapon reach by one step, to strike past the front screen.',

  // Utilities — Heli
  Flares:
    'Helicopter countermeasures — a cheap evasion bonus specifically against anti-air fire, so flak and SAMs miss more.',
  AirSuperiority:
    'Extra damage against air targets — kit a gunship out to win the dogfight lane against other aircraft.',
  AlphaStrike:
    'Front-loads a helicopter\'s damage — hits land harder against a full-health target, then fade as it is chipped down. Reward for opening on a fresh enemy.',
  CoordinatedStrike:
    'More accurate while a squadmate in its zone fires on the same enemy — rewards focus-firing with your air.',
  SEAD:
    'Extra damage against the enemy\'s anti-air carriers — send a gunship to hunt the flak and SAMs that would answer your air.',
  Napalm:
    'Incendiary cluster munitions for a helicopter — wider splash that spreads damage across a clustered ground target.',

  // Utilities — Artillery / Rocket-Artillery
  Entrench:
    'An artillery piece that holds its position takes less fire — cheap survivability for a backline that never wants to move anyway.',
  EMPAmmo:
    'On hit, shuts down the target\'s shield regen and blocks incoming heals — the dedicated answer to a shield- or heal-sustained enemy.',
  CounterBattery:
    'Extra damage against enemy artillery and rocket-artillery — dedicate a tube to winning the backline duel.',
  BunkerBuster:
    'Armour-piercing artillery shells — punch through a heavily-armoured front that would otherwise shrug off the splash.',
  Saturation:
    'Widens artillery splash — trade pinpoint fire for area coverage that punishes a clustered front.',
  FlakScreen:
    'Broadens a rocket-artillery piece\'s splash — each shell spreads its damage across clustered targets.',

  // Utilities — Support (Commander)
  Amplifier:
    'Boosts the Commander\'s projector output — more heal, shield, or ablation per tick to the army it supports.',
  CoordinationNet:
    'The Commander\'s accuracy aura — the whole army lands more of its shots. The offensive twin of the comms jammer.',
  CommsJammer:
    'The Commander\'s jamming aura — every enemy on the field shoots less accurately. An army-wide miss tax.',
  DamageBoost:
    'The Commander\'s offensive aura — every ally hits harder. Straight army-wide damage.',
  DamageReduction:
    'The Commander\'s defensive aura — the whole army takes less damage. Straight army-wide mitigation.',
  MultiTargeting:
    'The Commander\'s projector reaches a second ally each tick — spread its sustain across two units instead of stacking it on one.',
  BroadcastArray:
    'Widens the Commander\'s projector to reach the whole army instead of just its own zone — trade concentration for coverage.',
  Rally:
    'Each tick, the Commander cleanses EMP, Suppression, and Snare off allies — the dedicated answer to on-hit control riders.',
};

/** Equipment whose mechanic the engine does not currently read. */
const EQUIPMENT_CAVEAT: Record<string, string> = {
  Rangefinder:
    'No effect yet — the engine deepens Nearest to Front+Mid, but targeting treats those identically and no weapon starts at Front+Mid.',
  TargetRadar:
    'No effect yet — it grants Extend Reach, but the engine only deepens Nearest to Front+Mid, which targeting currently treats identically.',
  GaussRepeater: 'Strictly worse than the Autocannon — identical stats, less damage.',
};

/** What each capability actually grants. */
const CAPABILITY_COPY: Record<Capability, string> = {
  ExtraPlanBSlot: 'A second Plan-B trigger slot',
  ExtendReach: 'Extended weapon reach',
  TargetAir: 'Can target aircraft, and unlocks the Target-Air priority filter',
  AntiAir: 'Can target aircraft at the flak damage rate, with the anti-air accuracy bonus',
  RocketPack: 'Full-rate anti-air (flak damage), but only against aircraft close to the front line',
  OnHitPaint: 'Paints targets on hit — a painted enemy takes extra damage from all further fire',
  OnHitEmp: 'EMP on hit — stops the target’s shield regen and blocks incoming heals (anti-sustain)',
  OnHitSuppress: 'Suppresses on hit — cuts the target’s own outgoing damage and accuracy',
  OnHitSnare: 'Snares on hit — cuts the target’s move speed',
  JumpJets:
    'Periodically leaps into the air for full air-to-air fire and whole-battlefield reach, then lands and cools down — but is an exposed AA target while airborne',
  StationaryBrace: 'Takes less damage while it holds its position — the reward for staying put',
  Rally: 'Each tick, cleanses EMP / Suppress / Snare off allies — the answer to control riders',
  Ambush: 'Hits land harder against a full-health target — an alpha bonus that fades once it is dented',
  AdaptiveMunitions:
    'Unlocks a Plan-B that switches this machine’s outgoing damage type mid-battle (improvised ammo — no native bonus)',
  Duelist: 'Consecutive hits on the same target ramp its damage — a focus-fire crescendo that resets on a target switch',
  CoordinatedStrike: 'More accurate while a zone ally targets the same enemy — a focus-fire reward',
  Guardian: 'Soaks a share of the direct fire aimed at a zone ally — a damage-redirect bodyguard',
  AirSuperiority: 'Extra damage against air targets — own the dogfight lane',
  Flanking: 'Extra damage against the enemy rear zone — punish the backline',
  CounterBattery: 'Extra damage against indirect-fire units (enemy artillery / rocket-arty)',
  Sead: 'Extra damage against anti-air carriers — hunt the flak that answers your air',
  MultiTarget: 'The support projector reaches a second ally each tick — spreads sustain instead of stacking it',
  ExtraUtilitySlot: 'A net +1 utility slot — literal extra flexibility',
  Broadcast: 'The support projector reaches the whole army, not just its own zone',
};

// --- auras + projections ---------------------------------------------------

/** Who a passive aura reaches, as a phrase. */
const AURA_SCOPE_COPY: Record<AuraScope, string> = {
  ZoneAllies: 'zone allies',
  AllAllies: 'the whole army',
  ZoneEnemies: 'enemies in its zone',
  AllEnemies: 'every enemy',
};

/** What an aura kind modifies, as a stat noun. */
const AURA_KIND_NOUN: Record<AuraKind, string> = {
  DamageDealt: 'damage',
  CommandBoost: 'damage',
  StartShield: 'start shield',
  DamageTaken: 'damage taken',
  Accuracy: 'accuracy',
  Evasion: 'evasion',
};

/**
 * A passive aura (chassis- or utility-projected) as one effect line — e.g. "+10% accuracy to the whole
 * army", or an enemy-directed debuff "−8% accuracy to every enemy". Numbers come straight from the
 * ruleset magnitude, so a balance edit moves the copy.
 */
function auraLine(a: AuraEffect): EffectLine {
  const noun = AURA_KIND_NOUN[a.kind] ?? humanize(a.kind);
  const scope = AURA_SCOPE_COPY[a.scope] ?? humanize(a.scope);
  return { label: 'Aura', value: `${signedPct(a.magnitude)} ${noun} to ${scope}`, tone: 'gain' };
}

/** What a projector weapon projects onto its allies. */
const PROJECT_KIND_COPY: Record<SupportKind, string> = {
  Heal: 'Heals hull',
  ShieldBoost: 'Restores shield',
  Ablation: 'Grants an ablative buffer',
  Aura: 'Projects an aura',
};

/** How far a projector / support reaches. */
const SUPPORT_RANGE_COPY: Record<SupportRange, string> = {
  OwnZone: 'its own zone',
  OwnPlusAdjacent: 'its zone + adjacent zones',
  WholeArmy: 'the whole army',
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
  // A projector "weapon" (the Commander, US5) deals no damage — it projects support onto the army.
  // Describe THAT, and skip the damage-family / native-bonus lines, which are meaningless at zero
  // damage (this is why these used to render only a bare "Effect").
  if (weapon.support) {
    const s = weapon.support;
    return {
      title: weapon.name,
      blurb: EQUIPMENT_BLURB[weapon.id] ?? '',
      effects: [
        {
          label: 'Projects',
          value: `${PROJECT_KIND_COPY[s.kind] ?? humanize(s.kind)} — ${signedUnits(s.power)}/tick to ${
            SUPPORT_RANGE_COPY[s.range] ?? humanize(s.range)
          }`,
          tone: 'gain',
        },
      ],
      caveat: EQUIPMENT_CAVEAT[weapon.id],
    };
  }

  const effects: EffectLine[] = [];
  const fam = familyLine(weapon.family, ruleset);
  if (fam) effects.push(fam);

  // Energy weapons contest air at an improvised rate when the ruleset enables it (v2, US4) — a tier
  // between an incidental plink and a dedicated flak/AA counter, and only from the front line (FR-028).
  const energyAir = ruleset.airMods.energyAirDmgMult ?? 0;
  if (weapon.family === 'Energy' && energyAir > 0) {
    effects.push({
      label: 'Air',
      value: `Contests aircraft at ${mult(energyAir)} damage, from the front line only`,
      tone: 'gain',
    });
  }

  // The native-family bonus is a *damage* bonus, so it is meaningless on a Support-family weapon (the
  // medic's Repair Beam deals no damage) — skip it there rather than print a misleading "+X% damage".
  const native = ruleset.machineTypes[typeId]?.nativeFamily;
  if (weapon.family !== 'Support') {
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
  if (defense.reactive) {
    // Reactive plating opens as Balanced, then biases mitigation toward the family it has absorbed
    // most — a rate that lives in the ruleset (FR-033). Shown as the damage taken from that family.
    const rate = (ruleset.reactiveMods ?? DEFAULT_REACTIVE_MODS).rate;
    effects.push({
      label: 'Reactive',
      value: `damage from the most-absorbed family ${mult(rate)} once it adapts`,
      tone: 'gain',
    });
  }
  effects.push(...statDeltaLines(defense.tradeoff, ruleset));
  if (effects.length === 0) {
    effects.push({ label: 'Effect', value: 'None — this slot grants nothing', tone: 'none' });
  }
  // Two defences carry an inherent drawback that is not a stat line: ablative never regenerates, and
  // reactive plating is mediocre until it has taken enough fire to adapt (punished by burst).
  const caveat =
    EQUIPMENT_CAVEAT[defense.id] ??
    (defense.ablativeDelta
      ? 'The ablative pool never regenerates — once spent, it is gone.'
      : defense.reactive
        ? 'Reactive plating opens exactly as Balanced — it only pays off once a battle wears on.'
        : undefined);
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
  // Several utilities (Coordination Net, Damage Boost/Reduction, Smoke, Jammer/Comms Jammer) do their
  // whole job through a projected aura — describe it, so they no longer render a bare "Effect: None".
  if (utility.aura) effects.push(auraLine(utility.aura));
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

/** Per-stance prose (v3). Stance is a two-sided magnitude axis: output vs survivability. */
const STANCE_BLURB: Record<string, string> = {
  Aggressive:
    'All-out: more damage and accuracy, but it takes more fire in return. "Output" is weapon damage — or, for a Commander, its heal/shield projection.',
  Neutral: 'Balanced — the identity baseline, no trade either way.',
  Defensive:
    'Dug in: gives up a large slice of output for reduced incoming damage and extra evasion.',
};

/** Per-movement prose (v3) — four self-terminating modes. */
const MOVEMENT_BLURB: Record<string, string> = {
  Hold: 'Stays in its starting zone for the whole battle.',
  Advance:
    'Closes to contact one zone at a time, then idles once a target is in reach (re-closing if it is stranded).',
  FallBack: 'Ducks one zone back for a short spell when pressed, then returns to its home zone.',
  Kite: 'Oscillates — retreats while it can still shoot, re-closes when it cannot.',
};

/** Per-targeting-filter prose (v3, design §12.2). */
const FILTER_BLURB: Record<string, string> = {
  TargetAir: 'Hunts enemy aircraft first (inert if this machine has no air reach).',
  TargetArmor: 'Hunts high-armor enemies first — the partner for an energy weapon.',
  TargetSupport: 'Hunts enemy support machines first — kill the healer.',
  TargetIndirect: 'Hunts enemy artillery / rocket-artillery first — counter-battery.',
  Follow: 'Focus-fires on a zone ally’s independently-chosen target (non-chaining).',
};

/** Per-fallback-selector prose (v3, design §12.1). */
const SELECTOR_BLURB: Record<string, string> = {
  Closest: 'Sweeps from the contact line — air first, then front→rear.',
  Furthest: 'Sweeps from the enemy backline inward.',
};

/** Explain the targeting priority-score chain (v3 US2) as one block. */
export function explainTargeting(chain: TargetingChain): Explanation {
  const effects: EffectLine[] = [];
  const filters = [chain.priority1, chain.priority2].filter(Boolean) as string[];
  if (filters.length === 0) {
    effects.push({ label: 'Priority', value: 'None — pick purely by position', tone: 'none' });
  } else {
    filters.forEach((f, i) => {
      effects.push({ label: `Priority ${i + 1}`, value: humanize(f), tone: 'gain' });
    });
  }
  effects.push({ label: 'Fallback', value: humanize(chain.fallback) });
  const blurb = [
    ...filters.map((f) => FILTER_BLURB[f]).filter(Boolean),
    SELECTOR_BLURB[chain.fallback],
  ].join(' ');
  return {
    title: filters.length ? filters.map(humanize).join(' › ') : humanize(chain.fallback),
    blurb,
    effects,
  };
}

/** Explain a scalar dial value — Position (movement) or Stance. Numbers come from the ruleset. */
export function explainDial(
  dial: 'movement' | 'stance',
  value: string,
  ruleset: Ruleset,
): Explanation {
  const title = humanize(value);
  const effects: EffectLine[] = [];

  if (dial === 'stance') {
    const sm = ruleset.stanceMods ?? DEFAULT_STANCE_MODS;
    if (value === 'Aggressive') {
      effects.push({ label: 'Output', value: mult(sm.aggressiveOutput), tone: 'gain' });
      effects.push({ label: 'Accuracy', value: signedPct(sm.aggressiveAccuracy), tone: 'gain' });
      effects.push({ label: 'Damage taken', value: mult(sm.aggressiveTaken), tone: 'cost' });
    } else if (value === 'Defensive') {
      effects.push({ label: 'Output', value: mult(sm.defensiveOutput), tone: 'cost' });
      effects.push({ label: 'Damage taken', value: mult(sm.defensiveTaken), tone: 'gain' });
      effects.push({ label: 'Evasion', value: signedPct(sm.defensiveEvasion), tone: 'gain' });
    } else {
      effects.push({ label: 'Effect', value: 'Neutral — no trade', tone: 'none' });
    }
    return { title, blurb: STANCE_BLURB[value] ?? '', effects };
  }

  // movement
  return { title, blurb: MOVEMENT_BLURB[value] ?? '', effects };
}

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
  lines.push({ label: 'Targeting', value: summarizeTargeting(dials.targeting) });
  lines.push({ label: 'Position', value: humanize(dials.movement) });
  lines.push({ label: 'Stance', value: humanize(dials.stance) });
  return lines;
}
