/**
 * Build script: generate `db/seed-test-bot-armies.json` — 36 unique, engine-valid v3 armies for the
 * test-bot roster (12 bots × 3 defense slots) — **12 mechanically-distinct archetypes × 3 variations**.
 *
 * The roster is deliberately split in half:
 *   • **SIX "meta" archetypes** (#1–#6) — measured-strong under the LIVE v23 ruleset, so an attacker
 *     meets real opposition and can learn what a good squad looks like by fighting one.
 *   • **SIX "synergy" archetypes** (#7–#12) — built around one coherent idea (swarm, shields, EMP
 *     anti-sustain, reactive plating, decoy bait, sensors) that reads clearly and is beatable.
 *
 * Measured on the live ruleset (`f283b19f`, one squad per archetype, round robin, both sides × 3
 * seeds): **spread 85%–21%, ZERO archetypes at ≥90% or ≤10%**, and the top archetype (ROCKET_LANCE)
 * loses outright to SKY_LANCE — the meta has a live counter sitting in the field beside it.
 *
 * Three archetypes were rebuilt after measuring at/near 0%, and each failure taught the same lesson —
 * **cadence dominates everything** (see balance.md):
 *   1. A pure-EXPLOSIVE squad could not be saved and was CUT. Explosive is welded to the Slow tier
 *      (10 ticks on a heavy platform, 5 elsewhere) and its ×1.45-vs-armour edge does not cover the
 *      gap — while SPLASH, its supposed compensation, is a CHASSIS stat that an energy gun on the
 *      same hull receives anyway. It is replaced by EMP_DISRUPTOR.
 *   2. SKY_LANCE measured harmless until its heli hunted `TargetIndirect` FIRST; hunting Support
 *      first killed the Commander while the enemy's rocket artillery kept firing.
 *   3. EMP_DISRUPTOR measured 0% with `EMPAmmo` on its Rocket Artillery: at cost 2 on a 2-point
 *      budget it crowds out both FireControl AND Autoloader, and Autoloader is a *cadence shift*.
 *      EMP belongs on the 4-point Mechs.
 *
 * Output ordering is **round-robin across archetypes** (army[i] = archetype[i % 12], variation
 * ⌊i / 12⌋). The seeder assigns army[(bot-1)*3 + slot] bijectively, so each bot's three defense slots
 * draw three *different* archetypes — an attacker sees a genuinely varied ladder, not the same wall.
 *
 * EACH army is gated through the real engine `validateSquad()` before it is written (V1–V8) — nothing
 * the engine would reject is ever emitted. Deterministic: no randomness ⇒ re-running reproduces the
 * file byte-for-byte.
 *
 *   tsx scripts/gen-test-bot-armies.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { configSignature } from "@/db/seed-helpers";
import { validateDeckRules } from "@/sim/deck-rules";
import type {
  MachineInstance,
  MachineTypeId,
  MovementMode,
  SquadConfig,
  Stance,
  TargetingChain,
  ZoneId,
} from "@/sim/model";
import type { EquipmentId, VariantId } from "@/sim/model";
import { loadDefaultRuleset, validateSquad } from "@/sim/validate";

// --- block + army builders ----------------------------------------------------------------------
type Block = Omit<MachineInstance, "instanceId">;

function m(
  typeId: MachineTypeId,
  variantId: VariantId,
  zone: ZoneId,
  weapon: EquipmentId,
  defense: EquipmentId,
  utilities: EquipmentId[],
  stance: Stance,
  targeting: TargetingChain,
  movement: MovementMode = "Hold",
): Block {
  return {
    typeId,
    variantId,
    zone,
    loadout: { weapon, defense, utilities },
    dials: { targeting, movement, stance },
    planB: [],
  };
}
function army(...blocks: Block[]): SquadConfig {
  return { machines: blocks.map((b, i) => ({ instanceId: i, ...b })) };
}

// Targeting-chain shorthands (all dial options are ungated; V7 only gates a DamageType Plan-B).
const CLOSEST: TargetingChain = { fallback: "Closest" };
const FURTHEST: TargetingChain = { fallback: "Furthest" };
const AIR: TargetingChain = { priority1: "TargetAir", fallback: "Closest" };
const ARMOR: TargetingChain = { priority1: "TargetArmor", fallback: "Closest" };
const INDIRECT: TargetingChain = { priority1: "TargetIndirect", fallback: "Furthest" };
const SUPPORT: TargetingChain = { priority1: "TargetSupport", fallback: "Furthest" };
const HUNT_SUPPORT: TargetingChain = { priority1: "TargetSupport", priority2: "TargetIndirect", fallback: "Furthest" };
// Backline-killer: indirect FIRST. Order matters — hunting Support first kills the Commander while the
// enemy's rocket artillery keeps firing, which is exactly how SKY_LANCE failed its first measurement.
const HUNT_INDIRECT: TargetingChain = { priority1: "TargetIndirect", priority2: "TargetSupport", fallback: "Closest" };

// --- 12 archetypes, 3 variations each ------------------------------------------------------------
// Every loadout below respects the catalog: weapon/defense mount class matches the chassis, utilities
// stay within the 3-point budget (Sentinel: 4) and their chassis gate, movement only on mobile ground
// units (helis + Commander stay Hold). The validate() gate at the bottom is the real proof.
interface Archetype {
  tag: string;
  blurb: string;
  variations: SquadConfig[];
}

const ARCHETYPES: Archetype[] = [
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // The field is deliberately split: SIX "meta" archetypes (#1–#6) that are measured-strong under the
  // LIVE v23 ruleset, and SIX "synergistic" ones (#7–#12) built around a coherent idea that is fun to
  // play against but does not top the ladder. An attacker should meet real opposition half the time
  // and a readable, beatable theme the rest.
  //
  // WHAT CHANGED THE META (v23, `cadenceProfile.energy` Fast→Medium — see balance.md):
  // cadence is welded to the damage TYPE, and heavy platforms (Heavy Tank, Mech) + Artillery fire one
  // tier SLOWER. Post-fix ticks: Energy/Kinetic = 3 (5 on a slow platform), Explosive = 5 (10 on a
  // slow platform). Per-tick, against the armour the field is mostly made of:
  //     Energy 1.25/3 = .417   Kinetic 0.90/3 = .300   Explosive 1.45/5 = .290
  // So **Energy is the best anti-armour family, Kinetic is the shield-shredder (1.60), and Explosive
  // is dominated on both axes** — a Howitzer on Artillery is a 10-tick cycle where an Ion Cannon is 5.
  // Measured: Howitzer artillery 66.7% vs the field where the same squad with an Ion Cannon is 72.9%.
  //
  // ROCKET ARTILLERY IS THE STANDOUT: it is the only chassis pairing `AnyGround` reach with a
  // NON-slow platform, so Energy fires at 3 ticks there (not 5) off 638 hull / 10% armour — far
  // sturdier than Artillery's 442–527 / 6%. Measured **100% vs the whole field** (48/48). It is
  // included anyway, with its counter (#2) in the field beside it: a backline-hunting heli beats it
  // 83.3%. A meta with a live counter is a ladder; a meta without one is a wall.
  //
  // Caps (sim/deck-rules.ts) bind every squad: ≤2 of any unit type, and ≤1 weapon with AnyGround/Deep
  // reach. A heli's guns are all AnyGround, so a heli IS the squad's one indirect. `SAMBattery` is
  // `Air` reach and does NOT count — it is the free backline slot for air defence.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════

  // ─── META 1/6 ────────────────────────────────────────────────────────────────────────────────
  // 1. ROCKET_LANCE — the current best build. Energy rocket artillery firing at 3 ticks from Middle,
  //    behind two energy heavies. This is what "good" looks like right now.
  {
    tag: "ROCKET_LANCE",
    blurb: "Energy rocket artillery hammers the backline at close cadence while twin laser heavies hold the line.",
    variations: [
      army(
        m("RocketArtillery", "Aegis", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("RocketArtillery", "Deluge", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", HUNT_SUPPORT),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "HeavyArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", ARMOR),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("RocketArtillery", "Sentry", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Aggressive", ARMOR),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── META 2/6 ────────────────────────────────────────────────────────────────────────────────
  // 2. SKY_LANCE — the answer to #1, and the reason #1 is safe to field. An energy gunship ignores the
  //    ground screen entirely and hunts the enemy's one backline piece; measured 83.3% into ROCKET_LANCE.
  {
    tag: "SKY_LANCE",
    blurb: "An energy gunship skips the front line entirely and hunts whatever is shooting from the enemy backfield.",
    variations: [
      army(
        m("AttackHeli", "Warhog", "Air", "BeamProjector", "HeliArmor", ["FireControl", "Flares"], "Aggressive", HUNT_INDIRECT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("AttackHeli", "Gunship", "Air", "BeamProjector", "HeliChaff", ["FireControl", "Flares"], "Aggressive", HUNT_INDIRECT),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Aggressive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("AttackHeli", "Interceptor", "Air", "BeamProjector", "HeliArmor", ["FireControl", "Flares"], "Aggressive", HUNT_INDIRECT),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("LightTank", "Hunter", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── META 3/6 ────────────────────────────────────────────────────────────────────────────────
  // 3. SIEGE_LANCE — the classic energy line, corrected for v23: an Ion Cannon where the old field
  //    fielded a Howitzer. Same shape, 2× the backline cadence.
  {
    tag: "SIEGE_LANCE",
    blurb: "A siege gun throwing energy instead of shells — twice the cadence of the howitzer it replaced.",
    variations: [
      army(
        m("Artillery", "Siege", "Rear", "IonCannon", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Longbow", "Rear", "IonCannon", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", HUNT_SUPPORT),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Mech", "Striker", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Marksman", "Rear", "IonCannon", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "HeavyArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", ARMOR),
        m("LightTank", "Outrider", "Middle", "ArcRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── META 4/6 ────────────────────────────────────────────────────────────────────────────────
  // 4. AA_BASTION — the anti-air answer that is not dead weight. `SAMBattery` is `Air` reach, so it
  //    does NOT spend the squad's one indirect slot: a SAM and an Ion Cannon coexist legally. Measured
  //    87.5% vs the field — the strongest non-rocket build, and the natural check on SKY_LANCE.
  {
    tag: "AA_BASTION",
    blurb: "A SAM screen that costs nothing — anti-air is `Air` reach, so it rides free alongside a full siege gun.",
    variations: [
      army(
        m("Artillery", "Siege", "Rear", "IonCannon", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
      ),
      army(
        m("Artillery", "Longbow", "Rear", "IonCannon", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Siege", "Rear", "IonCannon", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", HUNT_SUPPORT),
        m("RocketArtillery", "Deluge", "Middle", "SAMBattery", "RktArtyShield", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "RocketPack"], "Defensive", CLOSEST),
        m("LightTank", "Hunter", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── META 5/6 ────────────────────────────────────────────────────────────────────────────────
  // 5. SUSTAIN_COLUMN — the same energy core, but the Commander heals instead of shielding. Measured
  //    81.3%: sustain out-values a shield refresh once the incoming damage is spread across a line.
  {
    tag: "SUSTAIN_COLUMN",
    blurb: "A healing Commander behind an energy line — out-lasts the trade rather than winning the opening.",
    variations: [
      army(
        m("Artillery", "Siege", "Rear", "IonCannon", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("LightTank", "Hunter", "Front", "ArcRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Longbow", "Rear", "IonCannon", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", HUNT_SUPPORT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "ExtraBatteries"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Defensive", ARMOR),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("RocketArtillery", "Aegis", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("LightTank", "Scout", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SensorSuite"], "Aggressive", ARMOR, "Kite"),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── META 6/6 ────────────────────────────────────────────────────────────────────────────────
  // 6. KINETIC_BREAKER — the anti-shield specialist, and the reason shields are not a free answer to
  //    the energy meta. Kinetic is ×1.60 into shields where Energy is ×0.70; on a non-slow rocket
  //    platform it fires at 3 ticks. Measured 75% vs the field.
  {
    tag: "KINETIC_BREAKER",
    blurb: "Built to punish shields — kinetic hits them at ×1.60 where the energy meta only manages ×0.70.",
    variations: [
      army(
        m("RocketArtillery", "Aegis", "Middle", "FlechetteBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Aggressive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Siege", "Rear", "RailHowitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", HUNT_SUPPORT),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Aggressive", CLOSEST),
        m("LightTank", "Hunter", "Front", "Autocannon", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("RocketArtillery", "Deluge", "Middle", "FlechetteBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── SYNERGY 1/6 ─────────────────────────────────────────────────────────────────────────────
  // 7. LIGHT_SWARM — no backline at all. Three cheap fast bodies kiting, a SAM for insurance. Trades
  //    reach for numbers; loses the opening exchange but is hard to finish.
  {
    tag: "LIGHT_SWARM",
    blurb: "No siege gun at all — a kiting screen of light tanks that trades reach for bodies and refuses to die.",
    variations: [
      army(
        m("LightTank", "Hunter", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("Mech", "Striker", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST, "Advance"),
        m("RocketArtillery", "Sentry", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("LightTank", "Scout", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("LightTank", "Hunter", "Front", "ArcRepeater", "FastCycleShield", ["FireControl", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST, "Advance"),
        m("RocketArtillery", "Aegis", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", HUNT_INDIRECT),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightShield", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("LightTank", "Scout", "Middle", "Autocannon", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("Mech", "Striker", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST, "Advance"),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Aggressive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── SYNERGY 2/6 ─────────────────────────────────────────────────────────────────────────────
  // 8. SHIELD_WALL — every slot shielded, refreshed by a Commander. Coherent and genuinely awkward for
  //    the energy meta (×0.70 into shields) — but it hands KINETIC_BREAKER (×1.60) a free win.
  {
    tag: "SHIELD_WALL",
    blurb: "Shielded top to bottom and refreshed by its Commander — energy struggles into it, kinetic feasts.",
    variations: [
      army(
        m("Artillery", "Marksman", "Rear", "IonCannon", "ArtilleryShield", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "DeflectorShield", ["FireControl", "ExtraBatteries"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Defensive", ARMOR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("RocketArtillery", "Sentry", "Middle", "LaserBattery", "RktArtyShield", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "ExtraBatteries"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "BulwarkMode"], "Defensive", ARMOR),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightShield", ["FireControl", "DriveServos"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Longbow", "Rear", "IonCannon", "ArtilleryShield", ["FireControl", "Autoloader"], "Aggressive", HUNT_SUPPORT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "DeflectorShield", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "Decoy"], "Defensive", ARMOR),
        m("LightTank", "Hunter", "Middle", "ArcRepeater", "FastCycleShield", ["FireControl", "DriveServos"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── SYNERGY 3/6 ─────────────────────────────────────────────────────────────────────────────
  // 9. EMP_DISRUPTOR — anti-sustain. EMP Ammo suppresses shield regen AND healing on what it hits, so
  //    this squad is built to switch off the two archetypes that win by out-lasting you (SHIELD_WALL,
  //    SUSTAIN_COLUMN) rather than to out-damage anything.
  //    NB this slot used to be EXPLOSIVE_SATURATION. It was cut after measuring 0% in three different
  //    configurations: Explosive is welded to Slow (10 ticks on a heavy platform, 5 elsewhere) and its
  //    ×1.45-vs-armour edge does not cover the cadence gap — while SPLASH, its supposed compensation,
  //    is a CHASSIS stat (Siege 25%, Deluge 24%, …) that an energy gun on the same hull gets anyway.
  //    Explosive currently has no compensating advantage; see balance.md.
  {
    tag: "EMP_DISRUPTOR",
    blurb: "Built to switch off sustain — EMP ammo halts shield regeneration and healing instead of racing the damage.",
    variations: [
      army(
        m("RocketArtillery", "Aegis", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", HUNT_INDIRECT),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "EMPAmmo"], "Aggressive", ARMOR),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Aggressive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Siege", "Rear", "IonCannon", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", HUNT_SUPPORT),
        m("Mech", "Striker", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "EMPAmmo"], "Aggressive", ARMOR),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "EMPAmmo"], "Aggressive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Aggressive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("RocketArtillery", "Deluge", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", HUNT_INDIRECT),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "EMPAmmo"], "Aggressive", ARMOR),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("LightTank", "Hunter", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SnareShot"], "Aggressive", CLOSEST, "Kite"),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CommsJammer"], "Defensive", CLOSEST),
      ),
    ],
  },


  // ─── SYNERGY 4/6 ─────────────────────────────────────────────────────────────────────────────
  // 10. MECH_PHALANX — two mechs in Bulwark stance behind reactive plating, which adapts toward the
  //     family hitting it hardest. A slow, stubborn body that wants the fight to go long.
  {
    tag: "MECH_PHALANX",
    blurb: "Reactive plating that learns what is shooting it, on two mechs braced in Bulwark stance.",
    variations: [
      army(
        m("Artillery", "Longbow", "Rear", "IonCannon", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Defensive", ARMOR),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Defensive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("RocketArtillery", "Aegis", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", HUNT_SUPPORT),
        m("Mech", "Striker", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Defensive", ARMOR),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Defensive", CLOSEST),
        m("LightTank", "Hunter", "Front", "ArcRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Marksman", "Rear", "IonCannon", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Defensive", ARMOR),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── SYNERGY 5/6 ─────────────────────────────────────────────────────────────────────────────
  // 11. DECOY_VANGUARD — a Decoy tank soaks the opening volley (targetDraw only out-pulls UNRANKED
  //     fire, so this works exactly against squads that leave their targeting on Closest) while the
  //     rest advance. A real read on the opponent's dials rather than a stat check.
  {
    tag: "DECOY_VANGUARD",
    blurb: "A decoy tank eats the opening volley from anyone who left their targeting on Closest; the rest walk in behind it.",
    variations: [
      army(
        m("Artillery", "Siege", "Rear", "IonCannon", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", HUNT_SUPPORT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Aggressive", ARMOR),
        m("Mech", "Striker", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR, "Advance"),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("RocketArtillery", "Deluge", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR, "Advance"),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Advance"),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Longbow", "Rear", "IonCannon", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Aggressive", ARMOR),
        m("LightTank", "Scout", "Front", "ArcRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Advance"),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
    ],
  },

  // ─── SYNERGY 6/6 ─────────────────────────────────────────────────────────────────────────────
  // 12. RECON_SKIRMISH — Sensor Suites and Coordination feeding accuracy into a kiting line, with a
  //     Rocket Pack for air insurance instead of a dedicated SAM. Wants to out-shoot rather than
  //     out-trade, and is the squad most punished by a Decoy.
  {
    tag: "RECON_SKIRMISH",
    blurb: "Sensors and coordination feeding a kiting line — out-shoots rather than out-trades, and a Rocket Pack covers the sky.",
    variations: [
      army(
        m("Artillery", "Siege", "Rear", "IonCannon", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", HUNT_INDIRECT),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Aggressive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("LightTank", "Hunter", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("RocketArtillery", "Sentry", "Middle", "LaserBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightArmor", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("Mech", "Striker", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST, "Kite"),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("Artillery", "Siege", "Rear", "IonCannon", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Aggressive", CLOSEST),
        m("LightTank", "Scout", "Front", "ArcRepeater", "LightShield", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("Mech", "Vanguard", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR, "Kite"),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },
];

// --- validate + round-robin emit -----------------------------------------------------------------
const VARIATIONS = 3;
const TARGET = ARCHETYPES.length * VARIATIONS; // 36

interface OutArmy {
  name: string;
  blurb: string;
  config: SquadConfig;
}

// ⚠️ CRITICAL: validate against the LIVE utility costs, not content.rs defaults. The frozen live
// ruleset row (v18/v19 slot-economy passes) raised five utilities to cost 2 that content.rs still
// prices at 1 — so an army valid under `loadDefaultRuleset()` can exceed the LIVE budget and then
// fail every real battle (validate runs inside resolve). We mirror those overrides here so the
// generator's gate matches what battles actually enforce. The seed script (`db/seed-test-bots.ts`)
// re-validates against the REAL live row as the ultimate authority — keep these in sync with it.
const LIVE_UTILITY_COST_OVERRIDES: Record<string, number> = {
  Spotter: 2,
  SnareShot: 2,
  SuppressingFire: 2,
  CoordinationNet: 2,
  EMPAmmo: 2,
};
const liveCostRuleset = loadDefaultRuleset();
for (const [id, cost] of Object.entries(LIVE_UTILITY_COST_OVERRIDES)) {
  const mod = liveCostRuleset.equipment[id];
  if (mod && mod.kind === "Utility") mod.cost = cost;
}
// Mirror the LIVE ruleset's broadened Rocket Pack gate (2026-07-25: Mech → Mech/Heavy/Light/Artillery,
// live rev f0ca9c7d) so a ground chassis carrying a Rocket Pack — its optional 1-slot air answer —
// validates here exactly as it does live. content.rs still gates it Mech-only (deferred bake), so
// without this the generator would wrongly reject these builds.
{
  const rp = liveCostRuleset.equipment.RocketPack;
  if (rp && rp.kind === "Utility") rp.mountClasses = ["Mech", "Heavy", "Light", "Artillery"];
}

const out: OutArmy[] = [];
const seen = new Set<string>();
const failures: string[] = [];

// Round-robin: variation v of every archetype, then v+1, … ⇒ army[i]=archetype[i % 12]. Each bot's
// three consecutive slots therefore draw three different archetypes.
for (let v = 0; v < VARIATIONS; v++) {
  for (const arch of ARCHETYPES) {
    const config = arch.variations[v];
    const name = `${arch.tag}_${String(v + 1).padStart(2, "0")}`;
    const result = validateSquad(config, liveCostRuleset);
    if (!result.ok) {
      failures.push(`${name}: ${result.errors.map((e) => `[${e.code}#${e.instanceId ?? "army"}] ${e.reason}`).join("; ")}`);
      continue;
    }
    // Construction-layer deckbuilding caps (sim/deck-rules.ts): ≤2 of any type, ≤1 backline-indirect
    // weapon — the same caps the Garage + server write path now enforce. A bot squad that a player
    // could not build is not a fair ladder opponent, so gate the field on them too.
    const deck = validateDeckRules(config, liveCostRuleset);
    if (deck.length) {
      failures.push(`${name}: ${deck.map((e) => `[${e.code}] ${e.reason}`).join("; ")}`);
      continue;
    }
    const sig = configSignature(config);
    if (seen.has(sig)) {
      failures.push(`${name}: duplicate of an already-emitted army (signature clash)`);
      continue;
    }
    seen.add(sig);
    out.push({ name, blurb: arch.blurb, config });
  }
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} army/armies rejected:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
if (out.length !== TARGET) {
  console.error(`✗ emitted ${out.length}/${TARGET} armies`);
  process.exit(1);
}

const outPath = join(process.cwd(), "db", "seed-test-bot-armies.json");
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.length} unique armies → ${outPath}`);
console.log(`archetypes: ${ARCHETYPES.map((a) => a.tag).join(", ")}`);
process.exit(0);
