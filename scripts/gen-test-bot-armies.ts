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
  // 1. TURTLE_SAM — the tournament-winning kinetic turtle. v01/v02 reproduce Bot3/Bot11 exactly.
  {
    tag: "TURTLE_SAM",
    blurb: "Armor-wall turtle — twin heavy tanks, a SAM screen, twin howitzers. The comp that swept offense.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "Railgun", "DeflectorShield", ["FireControl", "Autoloader", "Rangefinder"], "Defensive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Siege", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Marksman", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "Railgun", "DeflectorShield", ["FireControl", "Autoloader", "Rangefinder"], "Defensive", CLOSEST),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Longbow", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Siege", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("HeavyTank", "Bulwark", "Front", "Railgun", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", ARMOR),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Longbow", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Marksman", "Rear", "Howitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
    ],
  },

  // 2. AIR_WING — gunships aloft over a SAM screen and an armor anchor, a Commander mending the line.
  {
    tag: "AIR_WING",
    blurb: "Air wing — twin gunships strike from the sky above a SAM screen and an armor anchor.",
    variations: [
      army(
        m("AttackHeli", "Warhog", "Air", "RocketPods", "HeliArmor", ["FireControl", "Flares"], "Aggressive", FURTHEST),
        m("AttackHeli", "Gunship", "Air", "RocketPods", "HeliChaff", ["FireControl", "Flares"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("AttackHeli", "Warhog", "Air", "ChainGun", "HeliArmor", ["FireControl", "Flares"], "Aggressive", ARMOR),
        m("AttackHeli", "Gunship", "Air", "BeamProjector", "HeliShield", ["FireControl", "Flares"], "Aggressive", HUNT_SUPPORT),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "RktArtyECM", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("HeavyTank", "Grizzly", "Front", "Railgun", "DeflectorShield", ["FireControl", "Autoloader", "Rangefinder"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Neutral", CLOSEST),
      ),
      army(
        m("AttackHeli", "Gunship", "Air", "RocketPods", "HeliArmor", ["FireControl", "Flares"], "Neutral", FURTHEST),
        m("AttackHeli", "Interceptor", "Air", "RocketPods", "HeliChaff", ["FireControl", "Flares"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
    ],
  },

  // 3. LIGHT_SWARM — three fast light tanks rush the line under a SAM + a lone howitzer.
  {
    tag: "LIGHT_SWARM",
    blurb: "Light swarm — three fast light tanks flood the front, screened by a SAM and one howitzer.",
    variations: [
      army(
        m("LightTank", "Hunter", "Front", "Autocannon", "LightArmor", ["FireControl", "Spotter"], "Aggressive", CLOSEST, "Advance"),
        m("LightTank", "Outrider", "Front", "GaussRepeater", "FastCycleShield", ["FireControl", "Spotter"], "Aggressive", ARMOR, "Advance"),
        m("LightTank", "Scout", "Front", "Autocannon", "LightArmor", ["DriveServos", "Spotter"], "Aggressive", CLOSEST, "Kite"),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Longbow", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
      army(
        m("LightTank", "Hunter", "Front", "GaussRepeater", "LightShield", ["FireControl", "SnareShot"], "Aggressive", CLOSEST, "Advance"),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightArmor", ["DriveServos", "Spotter"], "Neutral", HUNT_SUPPORT, "Kite"),
        m("LightTank", "Scout", "Front", "GrenadeLauncher", "LightCamo", ["SnareShot", "SensorSuite"], "Aggressive", CLOSEST, "Advance"),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Marksman", "Rear", "RailHowitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("LightTank", "Scout", "Front", "Autocannon", "LightArmor", ["FireControl", "RocketPack"], "Aggressive", CLOSEST, "Advance"),
        m("LightTank", "Hunter", "Front", "Autocannon", "FastCycleShield", ["Spotter", "SensorSuite"], "Aggressive", ARMOR, "Advance"),
        m("LightTank", "Outrider", "Front", "GaussRepeater", "LightArmor", ["DriveServos", "SnareShot"], "Aggressive", CLOSEST, "Kite"),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Longbow", "Rear", "Howitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
      ),
    ],
  },

  // 4. ENERGY_LANCE — an all-Energy line that melts shields, with a Commander refreshing shields.
  {
    tag: "ENERGY_LANCE",
    blurb: "Energy lance — every barrel fires Energy to strip shields, a Commander refreshing its own.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "RocketPack"], "Neutral", ARMOR),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Neutral", HUNT_SUPPORT),
        m("RocketArtillery", "Deluge", "Middle", "LaserBattery", "RktArtyShield", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Longbow", "Rear", "IonCannon", "ArtilleryShield", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Neutral", CLOSEST),
      ),
      army(
        m("HeavyTank", "Grizzly", "Front", "SiegeLaser", "DeflectorShield", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("RocketArtillery", "Aegis", "Middle", "LaserBattery", "RktArtyShield", ["FireControl", "Autoloader"], "Neutral", INDIRECT),
        m("Artillery", "Siege", "Rear", "IonCannon", "ArtilleryShield", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("HeavyTank", "Cavalier", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechReactive", ["FireControl", "ModularHardpoint", "SuppressingFire"], "Aggressive", HUNT_SUPPORT),
        m("LightTank", "Outrider", "Front", "ArcRepeater", "LightShield", ["FireControl", "SensorSuite", "DriveServos"], "Aggressive", CLOSEST, "Advance"),
        m("Artillery", "Marksman", "Rear", "IonCannon", "ArtilleryShield", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Neutral", CLOSEST),
      ),
    ],
  },

  // 5. EXPLOSIVE_SATURATION — splash from every tube; overwhelm clustered fronts.
  {
    tag: "EXPLOSIVE_SATURATION",
    blurb: "Explosive saturation — demolition guns, rocket barrages and howitzers bury the front in splash.",
    variations: [
      army(
        m("HeavyTank", "Cavalier", "Front", "DemolitionGun", "BlastPlating", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "MissileRack", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["Autoloader", "Entrench"], "Aggressive", INDIRECT),
        m("Artillery", "Siege", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Marksman", "Rear", "Howitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "DemolitionGun", "BlastPlating", ["FireControl", "Autoloader", "Decoy"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "RocketBarrage", "RktArtyArmor", ["Autoloader", "Entrench"], "Aggressive", INDIRECT),
        m("RocketArtillery", "Deluge", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Siege", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Longbow", "Rear", "Howitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("Mech", "Vanguard", "Front", "MissileRack", "MechArmor", ["FireControl", "Autoloader", "SuppressingFire"], "Aggressive", CLOSEST),
        m("Mech", "Striker", "Front", "MissileRack", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "StandardHullRktArty", ["Autoloader", "Entrench"], "Aggressive", INDIRECT),
        m("Artillery", "Marksman", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "RocketPack"], "Aggressive", INDIRECT),
        m("Artillery", "Siege", "Rear", "Howitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
    ],
  },

  // 6. MECH_PHALANX — three mechs brawl up front behind reactive plating, mixed damage.
  {
    tag: "MECH_PHALANX",
    blurb: "Mech phalanx — three mechs brawl behind reactive plating, a SAM overhead, a Commander behind.",
    variations: [
      army(
        m("Mech", "Striker", "Front", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("Mech", "Vanguard", "Front", "MissileRack", "MechArmor", ["FireControl", "Autoloader", "SuppressingFire"], "Aggressive", ARMOR),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Neutral", HUNT_SUPPORT),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("Mech", "Striker", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST, "Advance"),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "BulwarkMode"], "Aggressive", ARMOR),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechShield", ["FireControl", "ModularHardpoint", "SuppressingFire"], "Neutral", HUNT_SUPPORT),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Neutral", CLOSEST),
      ),
      army(
        m("Mech", "Vanguard", "Front", "MissileRack", "MechArmor", ["FireControl", "Autoloader", "SuppressingFire"], "Aggressive", CLOSEST),
        m("Mech", "Sentinel", "Front", "AssaultCannon", "MechReactive", ["FireControl", "ModularHardpoint", "Overdrive"], "Aggressive", ARMOR),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
    ],
  },

  // 7. COMBINED_ARMS — one of each mount up front, a SAM, an air flank. Jack-of-all-trades.
  {
    tag: "COMBINED_ARMS",
    blurb: "Combined arms — heavy, mech and light share the front under a SAM, a gunship on the flank.",
    variations: [
      army(
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("LightTank", "Hunter", "Front", "Autocannon", "LightArmor", ["FireControl", "Spotter"], "Aggressive", CLOSEST, "Advance"),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("AttackHeli", "Warhog", "Air", "RocketPods", "HeliArmor", ["FireControl", "Flares"], "Aggressive", FURTHEST),
      ),
      army(
        m("HeavyTank", "Grizzly", "Front", "Railgun", "DeflectorShield", ["FireControl", "Autoloader", "Rangefinder"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "MissileRack", "MechArmor", ["FireControl", "Autoloader", "SuppressingFire"], "Aggressive", CLOSEST),
        m("LightTank", "Outrider", "Front", "GaussRepeater", "FastCycleShield", ["Spotter", "SensorSuite"], "Aggressive", ARMOR, "Advance"),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("AttackHeli", "Gunship", "Air", "RocketPods", "HeliChaff", ["FireControl", "Flares"], "Aggressive", HUNT_SUPPORT),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "SiegeLaser", "HeavyShield", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Front", "PulseLaser", "MechShield", ["FireControl", "Autoloader", "ModularHardpoint", "BulwarkMode"], "Neutral", HUNT_SUPPORT),
        m("LightTank", "Scout", "Front", "GrenadeLauncher", "LightCamo", ["SnareShot", "SensorSuite"], "Aggressive", CLOSEST, "Kite"),
        m("RocketArtillery", "Aegis", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("AttackHeli", "Interceptor", "Air", "BeamProjector", "HeliShield", ["FireControl", "Flares"], "Aggressive", ARMOR),
      ),
    ],
  },

  // 8. SHIELD_WALL — layered shields + a Commander topping them off; grind the clock.
  {
    tag: "SHIELD_WALL",
    blurb: "Shield wall — every hull runs a shield, a Commander topping them off. Grinds the clock down.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "HeavyShield", ["FireControl", "ExtraBatteries"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "Railgun", "DeflectorShield", ["FireControl", "Autoloader", "Rangefinder"], "Defensive", ARMOR),
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
        m("HeavyTank", "Grizzly", "Front", "Railgun", "HeavyShield", ["FireControl", "Autoloader", "Rangefinder"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Front", "AssaultCannon", "MechShield", ["FireControl", "Autoloader", "BulwarkMode"], "Defensive", ARMOR),
        m("LightTank", "Hunter", "Front", "GaussRepeater", "FastCycleShield", ["Spotter", "SensorSuite"], "Defensive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "RktArtyShield", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Commander", "CommandPost", "Rear", "ShieldProjector", "SupportShield", ["FireControl", "CoordinationNet"], "Defensive", CLOSEST),
      ),
    ],
  },

  // 9. FLANK_RAIDERS — fast light tanks + a lone interceptor knife the backline; a howitzer anchors.
  {
    tag: "FLANK_RAIDERS",
    blurb: "Flank raiders — fast light tanks and a lone interceptor knife past the line for the backfield.",
    variations: [
      army(
        m("LightTank", "Scout", "Front", "GaussRepeater", "LightCamo", ["DriveServos", "SnareShot"], "Aggressive", HUNT_SUPPORT, "Kite"),
        m("LightTank", "Outrider", "Front", "Autocannon", "LightArmor", ["Spotter", "SensorSuite"], "Aggressive", SUPPORT, "Advance"),
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("AttackHeli", "Interceptor", "Air", "RocketPods", "HeliChaff", ["FireControl", "Flares"], "Aggressive", FURTHEST),
        m("Artillery", "Marksman", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("LightTank", "Hunter", "Front", "Autocannon", "LightArmor", ["FireControl", "Spotter"], "Aggressive", HUNT_SUPPORT, "Advance"),
        m("LightTank", "Scout", "Front", "GrenadeLauncher", "LightCamo", ["SnareShot", "SensorSuite"], "Aggressive", SUPPORT, "Kite"),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("AttackHeli", "Interceptor", "Air", "BeamProjector", "HeliShield", ["FireControl", "Flares"], "Aggressive", FURTHEST),
        m("Artillery", "Longbow", "Rear", "RailHowitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("LightTank", "Outrider", "Front", "GaussRepeater", "FastCycleShield", ["FireControl", "Spotter"], "Aggressive", HUNT_SUPPORT, "Kite"),
        m("LightTank", "Hunter", "Front", "ArcRepeater", "LightArmor", ["SensorSuite", "Spotter"], "Aggressive", SUPPORT, "Advance"),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", ARMOR),
        m("AttackHeli", "Interceptor", "Air", "RocketPods", "HeliChaff", ["FireControl", "Flares"], "Aggressive", FURTHEST),
        m("Artillery", "Marksman", "Rear", "Howitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
    ],
  },

  // 10. INTERCEPTOR_SCREEN — fighters + ONE SAM over a rocket line (NOT double-AA: two dedicated AA
  // units over-invest in air defence and lose the ground fight — the second SAM bombards ground instead).
  {
    tag: "INTERCEPTOR_SCREEN",
    blurb: "Interceptor screen — two fighters and a single SAM screen a rocket line. Air-leaning, not all-in.",
    variations: [
      army(
        m("AttackHeli", "Interceptor", "Air", "BeamProjector", "HeliShield", ["FireControl", "Flares"], "Aggressive", CLOSEST),
        m("AttackHeli", "Gunship", "Air", "RocketPods", "HeliChaff", ["FireControl", "Flares"], "Aggressive", FURTHEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("RocketArtillery", "Aegis", "Middle", "RocketBarrage", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "ECMSuite"], "Defensive", CLOSEST),
      ),
      army(
        m("AttackHeli", "Interceptor", "Air", "ChainGun", "HeliShield", ["FireControl", "Flares"], "Aggressive", AIR),
        m("AttackHeli", "Warhog", "Air", "RocketPods", "HeliArmor", ["FireControl", "Flares"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("RocketArtillery", "Deluge", "Middle", "RocketBarrage", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Grizzly", "Front", "Railgun", "DeflectorShield", ["FireControl", "Autoloader", "Rangefinder"], "Defensive", CLOSEST),
      ),
      army(
        m("AttackHeli", "Interceptor", "Air", "BeamProjector", "HeliShield", ["FireControl", "Flares"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("RocketArtillery", "Aegis", "Middle", "RocketBarrage", "RktArtyECM", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "SiegeMode"], "Defensive", CLOSEST),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
    ],
  },

  // 11. RAILGUN_LINE — a three-wide kinetic-penetration front that shreds armor at range.
  {
    tag: "RAILGUN_LINE",
    blurb: "Railgun line — a three-wide kinetic front punches through armor, a flechette SAM overhead.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "Railgun", "CompositeArmor", ["FireControl", "Autoloader", "Rangefinder"], "Aggressive", ARMOR),
        m("HeavyTank", "Grizzly", "Front", "Railgun", "HeavyArmor", ["FireControl", "Autoloader", "Rangefinder"], "Aggressive", ARMOR),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Aegis", "Middle", "FlechetteBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Longbow", "Rear", "RailHowitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("HeavyTank", "Grizzly", "Front", "Railgun", "HeavyArmor", ["FireControl", "Autoloader", "Rangefinder"], "Aggressive", ARMOR),
        m("HeavyTank", "Cavalier", "Front", "Railgun", "CompositeArmor", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", ARMOR),
        m("Mech", "Striker", "Front", "AssaultCannon", "MechArmor", ["FireControl", "Autoloader", "Overdrive"], "Aggressive", CLOSEST),
        m("RocketArtillery", "Sentry", "Middle", "FlechetteBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Marksman", "Rear", "RailHowitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "Railgun", "CompositeArmor", ["FireControl", "Autoloader", "Rangefinder"], "Aggressive", ARMOR),
        m("HeavyTank", "Cavalier", "Front", "HeavyCannon", "HeavyArmor", ["FireControl", "Autoloader", "RocketPack"], "Aggressive", CLOSEST),
        m("LightTank", "Hunter", "Front", "GaussRepeater", "LightArmor", ["FireControl", "Spotter"], "Aggressive", ARMOR, "Advance"),
        m("RocketArtillery", "Aegis", "Middle", "FlechetteBattery", "RktArtyArmor", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Siege", "Rear", "RailHowitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
      ),
    ],
  },

  // 12. GUARDIAN_COLUMN — a Commander-anchored sustain column; outlasts burst.
  {
    tag: "GUARDIAN_COLUMN",
    blurb: "Guardian column — a healing Commander and a deep artillery backfield outlast burst damage.",
    variations: [
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "Autoloader", "Decoy"], "Defensive", CLOSEST),
        m("Mech", "Vanguard", "Middle", "AssaultCannon", "MechReactive", ["FireControl", "Autoloader", "SuppressingFire"], "Neutral", ARMOR),
        m("Artillery", "Longbow", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "RocketPack"], "Aggressive", INDIRECT),
        m("Artillery", "Siege", "Rear", "Howitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("HeavyTank", "Grizzly", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "FieldRepair"], "Defensive", CLOSEST),
        m("Mech", "Sentinel", "Middle", "PulseLaser", "MechShield", ["FireControl", "ModularHardpoint", "RepairNanites"], "Neutral", HUNT_SUPPORT),
        m("RocketArtillery", "Sentry", "Middle", "SAMBattery", "StandardHullRktArty", ["FireControl", "Autoloader"], "Neutral", AIR),
        m("Artillery", "Longbow", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Commander", "CommandPost", "Rear", "HealProjector", "SupportArmor", ["FireControl", "Amplifier"], "Neutral", CLOSEST),
      ),
      army(
        m("HeavyTank", "Bulwark", "Front", "HeavyCannon", "CompositeArmor", ["FireControl", "GuardianProtocol"], "Defensive", CLOSEST),
        m("HeavyTank", "Grizzly", "Front", "Railgun", "DeflectorShield", ["FireControl", "Autoloader", "RocketPack"], "Defensive", ARMOR),
        m("Artillery", "Siege", "Rear", "Howitzer", "StandardHullArtillery", ["FireControl", "Autoloader"], "Aggressive", INDIRECT),
        m("Artillery", "Marksman", "Rear", "Howitzer", "ArtilleryArmor", ["FireControl", "Autoloader"], "Aggressive", FURTHEST),
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
