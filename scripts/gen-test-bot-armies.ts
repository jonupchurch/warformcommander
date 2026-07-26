/**
 * Build script: generate `db/seed-test-bot-armies.json` — 36 unique, engine-valid v3 armies for the
 * test-bot roster (12 bots × 3 defense slots). Unlike the old recombinator (which only reshuffled the
 * ~12 variants that happened to appear in the 6 canonical armies, so every army was a near-identical
 * armor-wall + SAM + artillery turtle), this authors **12 mechanically-distinct archetypes** — air
 * wings, light-tank swarms, all-Energy lances, Explosive saturation, Mech phalanxes, shield walls,
 * flank raiders, anti-air screens, kinetic-penetration lines, Commander-sustain columns — spanning the
 * FULL content palette (all 19 chassis variants, every weapon damage family, movement + stance + the
 * targeting chain). Each archetype yields 3 variations ⇒ 36 armies.
 *
 * The winning tournament comp (the 2×HeavyTank + SAM + 2×Artillery kinetic turtle that swept offense)
 * is deliberately kept as archetype #1, its first two variations reproducing the exact Bot3/Bot11
 * loadouts — so a couple of defenders still field "the squad that wins", per request.
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
  // Deckbuilding caps (sim/deck-rules.ts) now bound EVERY squad: ≤2 of any unit type, and ≤1
  // "backline-indirect" weapon (reach AnyGround or Deep — artillery, rocket-artillery guns, Railgun,
  // and heli RocketPods). So the old multi-sniper walls are illegal by construction: each archetype
  // below fields AT MOST ONE rank-screen-bypassing weapon and wins (or loses) on a direct-fire body.
  // NB: an AttackHeli's only gun (RocketPods) is AnyGround, so a heli IS a squad's one indirect — you
  // cannot pair two helis, or a heli with artillery. A RocketArtillery carrying SAMBattery (Air reach)
  // is NOT indirect, so it is the "free" backline slot for air defence.

  // 1. TURTLE_SAM — kinetic armor wall + a lone howitzer + a SAM screen. The old twin-howitzer turtle
  //    is now illegal (2 indirect); this is its single-sniper heir.
  {
    tag: "TURTLE_SAM",
    blurb: "Armor turtle — twin heavy tanks and a brawling mech behind a lone howitzer and a SAM screen.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Siege", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "BulwarkMode"], "Aggressive", ARMOR),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Longbow", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
      army(
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", ARMOR),
        m("LightTank", "Hunter", "Front", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Marksman", "Rear", "Howitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
    ],
  },

  // 2. AIR_WING — ONE gunship strikes from the sky (its RocketPods are the squad's single indirect); a
  //    heavy anchor, a mech and a SAM carry the ground fight. Two helis is now illegal (2 indirect).
  {
    tag: "AIR_WING",
    blurb: "Air wing — a lone gunship strikes from the sky while a heavy anchor, a mech and a SAM hold the ground.",
    variations: [
      army(
        m("AttackHeli", "Warhog", "Air", "RocketPods", "HeliArmor", ["FireControl", "Flares"], "Aggressive", FURTHEST),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("LightTank", "Hunter", "Front", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
      ),
      army(
        m("AttackHeli", "Gunship", "Air", "RocketPods", "HeliArmor", ["FireControl", "Flares"], "Aggressive", FURTHEST),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("LightTank", "Scout", "Front", "Autocannon", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
      ),
      army(
        m("AttackHeli", "Interceptor", "Air", "RocketPods", "HeliChaff", ["FireControl", "Flares"], "Aggressive", FURTHEST),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
      ),
    ],
  },

  // 3. LIGHT_SWARM — two fast light raiders + a mech knife the front behind a heavy anchor, with a
  //    single rail-artillery as the lone sniper. Kite in, trade fast.
  {
    tag: "LIGHT_SWARM",
    blurb: "Light swarm — two fast light raiders and a mech kite ahead of a heavy anchor and a lone rail gun.",
    variations: [
      army(
        m("LightTank", "Hunter", "Front", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("LightTank", "Outrider", "Front", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Middle", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Artillery", "Marksman", "Rear", "RailHowitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("LightTank", "Scout", "Front", "Autocannon", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("LightTank", "Hunter", "Front", "GaussRepeater", "LightArmor", ["FireControl", "SensorSuite"], "Aggressive", ARMOR, "Kite"),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Middle", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Artillery", "Siege", "Rear", "RailHowitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("LightTank", "Outrider", "Front", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("LightTank", "Scout", "Front", "Autocannon", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Middle", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Artillery", "Longbow", "Rear", "RailHowitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
    ],
  },

  // 4. ENERGY_LANCE — an all-Energy line (Siege/Pulse/Arc lasers) to strip shields, with ONE Ion
  //    artillery as the sniper and a Commander refreshing shields. Direct-fire energy body, single tube.
  {
    tag: "ENERGY_LANCE",
    blurb: "Energy lance — Siege, Pulse and Arc lasers strip shields, a lone Ion tube reaches back, a Commander refreshes.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "RocketPack"], "Neutral", ARMOR),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Neutral", HUNT_SUPPORT),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightShield", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Advance"),
        m("Artillery", "Longbow", "Rear", "IonCannon", "ArtilleryShield", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Neutral", CLOSEST),
      ),
      army(
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "DeflectorShield", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightShield", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST),
        m("Artillery", "Siege", "Rear", "IonCannon", "ArtilleryShield", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Aggressive", HUNT_SUPPORT),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightShield", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Advance"),
        m("Artillery", "Marksman", "Rear", "IonCannon", "ArtilleryShield", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Neutral", CLOSEST),
      ),
    ],
  },

  // 5. EXPLOSIVE_SATURATION — explosive brawl (demolition guns, missile racks, grenade launchers) with
  //    ONE rocket barrage as the lone indirect. Splash the clustered front, not the backline.
  {
    tag: "EXPLOSIVE_SATURATION",
    blurb: "Explosive saturation — demolition guns, missile racks and grenade launchers bury the front in splash.",
    variations: [
      army(
        m("HeavyTank", "Cavalier", "Front", "DemolitionGun", "BlastPlating", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "MissileRack", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("Mech", "Vanguard", "Front", "MissileRack", "MechArmor", ["FireControl", "Autoloader", "BulwarkMode"], "Aggressive", CLOSEST),
        m("LightTank", "Hunter", "Middle", "GrenadeLauncher", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "DemolitionGun", "BlastPlating", ["FireControl", "Autoloader", "Decoy"], "Aggressive", CLOSEST),
        m("Mech", "Vanguard", "Front", "MissileRack", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "MissileRack", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Aggressive", ARMOR),
        m("LightTank", "Outrider", "Middle", "GrenadeLauncher", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
      army(
        m("HeavyTank", "Cavalier", "Front", "DemolitionGun", "BlastPlating", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "MissileRack", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("LightTank", "Hunter", "Front", "GrenadeLauncher", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
      ),
    ],
  },

  // 6. MECH_PHALANX — two mechs brawl behind reactive plating, a heavy anchor, ONE rocket barrage, and a
  //    healing Commander. (Three mechs is now illegal: ≤2 of any type.)
  {
    tag: "MECH_PHALANX",
    blurb: "Mech phalanx — two mechs brawl behind reactive plating, a heavy anchor, a rocket barrage and a healing Commander.",
    variations: [
      army(
        m("Mech", "Striker", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Aggressive", ARMOR),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Neutral", HUNT_SUPPORT),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("RocketArtillery", "Aegis", "Middle", "RocketBarrage", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("Mech", "Striker", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "BulwarkMode"], "Aggressive", ARMOR),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Neutral", CLOSEST),
      ),
    ],
  },

  // 7. COMBINED_ARMS — one of each with MIXED damage: a kinetic heavy anchor, an energy mech, an
  //    explosive light, a SAM for air, and ONE indirect tube (howitzer). Genuinely no repeats.
  {
    tag: "COMBINED_ARMS",
    blurb: "Combined arms — a kinetic heavy, an energy mech, an explosive light, a SAM, and a single howitzer.",
    variations: [
      army(
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("LightTank", "Hunter", "Front", "GrenadeLauncher", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Longbow", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Rangefinder"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("LightTank", "Scout", "Front", "GrenadeLauncher", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Marksman", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Neutral", HUNT_SUPPORT),
        m("AttackHeli", "Gunship", "Air", "RocketPods", "HeliChaff", ["FireControl", "Flares"], "Aggressive", FURTHEST),
        m("LightTank", "Scout", "Front", "Autocannon", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
      ),
    ],
  },

  // 8. SHIELD_WALL — a ZERO-sniper grind wall: layered shields, direct-fire only, a Commander topping
  //    them off, a SAM for air. Outlasts everything; can't reach the backline (that's the trade).
  {
    tag: "SHIELD_WALL",
    blurb: "Shield wall — every hull runs a shield, a Commander tops them off; a pure direct-fire grind, no sniper.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "HeavyShield", ["FireControl", "ExtraBatteries"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "DeflectorShield", ["FireControl", "Autoloader", "RocketPack"], "Defensive", ARMOR),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Defensive", HUNT_SUPPORT),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "RktArtyShield", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
      army(
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "DeflectorShield", ["FireControl", "ExtraBatteries"], "Defensive", ARMOR),
        m("Mech", "Sentinel", "Middle", "AssaultCannon", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Defensive", CLOSEST),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "RktArtyShield", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "Amplifier"], "Defensive", CLOSEST),
      ),
      army(
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "HeavyShield", ["FireControl", "Autoloader", "RocketPack"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechShield", ["FireControl", "Autoloader", "BulwarkMode"], "Defensive", ARMOR),
        m("LightTank", "Hunter", "Front", "GaussRepeater", "FastCycleShield", ["FireControl", "SensorSuite"], "Defensive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "RktArtyShield", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // 9. FLANK_RAIDERS — a light raider + a mech striker knife the front behind a heavy anchor; a single
  //    rocket barrage is the lone indirect. Fast, aggressive, one tube.
  {
    tag: "FLANK_RAIDERS",
    blurb: "Flank raiders — a light raider and a mech striker knife the front behind a heavy anchor and a lone barrage.",
    variations: [
      army(
        m("LightTank", "Outrider", "Front", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("LightTank", "Scout", "Middle", "Autocannon", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
      army(
        m("LightTank", "Hunter", "Front", "Autocannon", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Middle", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Aegis", "Middle", "RocketBarrage", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
      army(
        m("LightTank", "Scout", "Front", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR, "Kite"),
        m("Mech", "Striker", "Front", "PulseLaser", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("LightTank", "Outrider", "Middle", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", CLOSEST, "Kite"),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
    ],
  },

  // 10. INTERCEPTOR_SCREEN — air-defence leaning: ONE fighter (its RocketPods are the lone indirect) over
  //     a double-SAM screen and a ground anchor. Beats air, thin vs a pure ground rush.
  {
    tag: "INTERCEPTOR_SCREEN",
    blurb: "Interceptor screen — a lone fighter over a double-SAM screen and a heavy anchor. Built to deny the sky.",
    variations: [
      army(
        m("AttackHeli", "Interceptor", "Air", "RocketPods", "HeliShield", ["FireControl", "Flares"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
      ),
      army(
        m("AttackHeli", "Warhog", "Air", "RocketPods", "HeliArmor", ["FireControl", "Flares"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("RocketArtillery", "Deluge", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "DeflectorShield", ["FireControl", "Autoloader", "Rangefinder"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
      ),
      army(
        m("AttackHeli", "Interceptor", "Air", "RocketPods", "HeliChaff", ["FireControl", "Flares"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Front", "PulseLaser", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
    ],
  },

  // 11. RAILGUN_LINE — kinetic penetration: ONE Railgun heavy (its Deep reach is the lone indirect) leads
  //     a direct-fire kinetic front. Three Railguns is now illegal (3 indirect + 3-of-a-type).
  {
    tag: "RAILGUN_LINE",
    blurb: "Railgun line — a single deep-reach Railgun heads a direct-fire kinetic front, a SAM overhead.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "Railgun", "CompositeArmor", ["FireControl", "Autoloader", "Rangefinder"], "Aggressive", ARMOR),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("LightTank", "Hunter", "Middle", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
      ),
      army(
        m("HeavyTank", "Grizzly", "Front", "Railgun", "HeavyArmor", ["FireControl", "Autoloader", "Rangefinder"], "Aggressive", ARMOR),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("LightTank", "Outrider", "Middle", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "Railgun", "CompositeArmor", ["FireControl", "Autoloader", "Rangefinder"], "Aggressive", ARMOR),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("LightTank", "Hunter", "Middle", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Aggressive", ARMOR, "Advance"),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
    ],
  },

  // 12. GUARDIAN_COLUMN — a Commander-anchored sustain column: a healing Commander behind a durable body
  //     and ONE howitzer. Outlasts burst. (The old twin-howitzer backfield is now illegal.)
  {
    tag: "GUARDIAN_COLUMN",
    blurb: "Guardian column — a healing Commander behind a durable body and a lone howitzer outlasts burst damage.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Middle", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Neutral", ARMOR),
        m("LightTank", "Hunter", "Front", "GaussRepeater", "LightArmor", ["FireControl", "DriveServos"], "Defensive", CLOSEST),
        m("Artillery", "Longbow", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Neutral", HUNT_SUPPORT),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Longbow", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "DeflectorShield", ["FireControl", "Autoloader", "RocketPack"], "Defensive", ARMOR),
        m("Mech", "Vanguard", "Middle", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Neutral", CLOSEST),
        m("Artillery", "Siege", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "CoordinationNet"], "Neutral", CLOSEST),
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
