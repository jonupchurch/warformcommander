/**
 * Ops: hot-add the missing v3 primary weapons so **every combat chassis can field one weapon of each
 * damage type** (design D1 / §9.1 — the counter-web's damage-type counter-pick). The engine default
 * (`content.rs`) still ships only v2's "representative" 12-weapon catalog, which leaves 4 chassis
 * (Heli / Rocket-Arty / Artillery / Light) locked to a single damage family. This fills the ~10 empty
 * chassis×damage-type cells.
 *
 *   dotenv -e .env.local     -- tsx scripts/add-v3-weapons.ts   # PROD
 *   dotenv -e .env.dev.local -- tsx scripts/add-v3-weapons.ts   # dev
 *
 * Pure ruleset DATA (existing enums only — DamageFamily/MountClass/CadenceTier/ReachTag) → NO new enum
 * variant → **no wasm redeploy needed**. Goes through the proper `saveRuleset` path (validate → append
 * revision → optimistic pointer swap → auto-published balance post). Idempotent: re-running is a no-op
 * once the weapons are live (diff is empty). The garage picks them up automatically (`weaponOptions`
 * filters the ruleset's equipment by mount).
 *
 * START VALUES (measure-driven, to tune): each new weapon matches its chassis's stock cadence + reach
 * and carries `damage: 0` — a pure damage-TYPE sidegrade. The trade is real via the ×1.6/×0.7 matrix
 * and the native-family bonus (an off-family weapon forgoes the +native%, but can hit the matrix the
 * right way). Bake into `content.rs` once the numbers settle.
 */
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { SessionUser } from "@/server/authz";
import { getRulesetForEdit, saveRuleset } from "@/server/ruleset";
import type { CadenceTier, DamageFamily, EquipmentModule, MountClass, ReachTag } from "@/sim/ruleset";
import type { SquadConfig } from "@/sim/model";
import { validateSquad } from "@/sim/validate";
import seedArmies from "../db/seed-armies.json";

function weapon(
  id: string,
  name: string,
  mountClass: MountClass,
  family: DamageFamily,
  cadenceTier: CadenceTier,
  reach: ReachTag,
): EquipmentModule {
  return {
    kind: "Weapon",
    id,
    name,
    mountClass,
    family,
    statDeltas: {
      damage: 0,
      accuracy: 0,
      splash: 0,
      penetration: 0,
      evasion: 0,
      armorPct: 0,
      critChance: 0,
      moveSpeed: 0,
      targetDraw: 0,
      cadenceTier,
      reach,
    },
  };
}

// One weapon per empty chassis×damage-type cell. Cadence + reach mirror each chassis's stock gun so a
// swap changes only the damage TYPE (and thus the matrix interaction / native-bonus), not the rhythm.
const NEW_WEAPONS: EquipmentModule[] = [
  // Heavy (native Kinetic; had Kinetic + Energy) → + Explosive
  weapon("DemolitionGun", "Demolition Gun", "Heavy", "Explosive", "Slow", "Nearest"),
  // Light (native Kinetic; had Kinetic only) → + Energy, + Explosive
  weapon("ArcRepeater", "Arc Repeater", "Light", "Energy", "Fast", "Nearest"),
  weapon("GrenadeLauncher", "Grenade Launcher", "Light", "Explosive", "Fast", "Nearest"),
  // Mech (generalist, no native; had Kinetic + Energy) → + Explosive
  weapon("MissileRack", "Missile Rack", "Mech", "Explosive", "Medium", "Nearest"),
  // Attack Heli (native Explosive; had Explosive only) → + Kinetic, + Energy
  weapon("ChainGun", "Chain Gun", "Heli", "Kinetic", "Medium", "AnyGround"),
  weapon("BeamProjector", "Beam Projector", "Heli", "Energy", "Medium", "AnyGround"),
  // Rocket Artillery (native Explosive; had Explosive only) → + Kinetic, + Energy (ground bombardment)
  weapon("FlechetteBattery", "Flechette Battery", "RktArty", "Kinetic", "Slow", "AnyGround"),
  weapon("LaserBattery", "Laser Battery", "RktArty", "Energy", "Slow", "AnyGround"),
  // Artillery (native Explosive; had Explosive only) → + Kinetic, + Energy
  weapon("RailHowitzer", "Rail Howitzer", "Artillery", "Kinetic", "Siege", "AnyGround"),
  weapon("IonCannon", "Ion Cannon", "Artillery", "Energy", "Siege", "AnyGround"),
];

// A known-valid seed army that contains a machine of each mount, and which machine index carries it —
// used to build a real 5-unit army that mounts each new weapon and prove it validates (V1–V8).
const PROBE: Record<MountClass, { armyIdx: number; mIdx: number } | undefined> = {
  Heavy: { armyIdx: 0, mIdx: 0 }, // IRONCLAD m0 HeavyTank
  Mech: { armyIdx: 1, mIdx: 1 }, // SENTINEL m1 Mech
  RktArty: { armyIdx: 0, mIdx: 2 }, // IRONCLAD m2 RocketArtillery
  Artillery: { armyIdx: 0, mIdx: 3 }, // IRONCLAD m3 Artillery
  Heli: { armyIdx: 2, mIdx: 0 }, // SKYHAMMER m0 AttackHeli
  Light: { armyIdx: 4, mIdx: 2 }, // VANGUARD m2 LightTank
  Support: undefined,
};

async function main() {
  const db = getDb();
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (!admin) throw new Error("no admin user in this database — cannot attribute the ruleset save");
  const actor: SessionUser = { id: admin.id, role: "admin", email: admin.email, handle: admin.handle };
  console.log(`attributing to admin: ${admin.email ?? admin.handle ?? admin.id}`);

  const current = await getRulesetForEdit(actor);
  console.log(`current live ruleset hash: ${current.rulesetHash}  (version ${current.version})`);

  const augmented = structuredClone(current.data);
  const armies = seedArmies as { name: string; config: SquadConfig }[];

  for (const w of NEW_WEAPONS) {
    augmented.equipment[w.id] = w;

    // Prove the engine accepts a real army mounting this weapon (V4 mount-gate + full derive), against
    // the AUGMENTED ruleset (which now carries it). Fail fast before touching prod.
    const spec = w.kind === "Weapon" ? w : null;
    const probe = spec ? PROBE[spec.mountClass] : undefined;
    if (!probe) throw new Error(`no probe army for mount ${spec?.mountClass} (weapon ${w.id})`);
    const testArmy = structuredClone(armies[probe.armyIdx].config);
    testArmy.machines[probe.mIdx].loadout.weapon = w.id;
    const v = validateSquad(testArmy, augmented);
    if (!v.ok) {
      throw new Error(`weapon ${w.id} rejected: ${v.errors.map((e) => `${e.code}(${e.reason})`).join("; ")}`);
    }
    console.log(`  ✓ ${w.id.padEnd(18)} ${spec!.family.padEnd(9)} @${spec!.mountClass.padEnd(9)} validates (power ${v.powerRating})`);
  }

  const result = await saveRuleset(actor, {
    data: augmented,
    expectedVersion: current.version,
    note:
      "v3 primary-weapon roster fill (design D1/§9.1): +10 weapons so every combat chassis can field " +
      "kinetic/energy/explosive — DemolitionGun (Heavy·Explosive); ArcRepeater/GrenadeLauncher " +
      "(Light·Energy/Explosive); MissileRack (Mech·Explosive); ChainGun/BeamProjector (Heli·Kinetic/" +
      "Energy); FlechetteBattery/LaserBattery (RktArty·Kinetic/Energy); RailHowitzer/IonCannon " +
      "(Artillery·Kinetic/Energy). Start-values: chassis-matched cadence/reach, damage 0 (pure " +
      "damage-type sidegrade via the ×1.6/×0.7 matrix). Untuned — to measure + tune.",
  });
  console.log("saveRuleset result:", JSON.stringify(result));
  if ("error" in result) throw new Error(`save failed: ${result.error}`);
  if ("noop" in result && result.noop) {
    console.log("no-op — the weapons are already live (nothing to change).");
  } else if (!("error" in result)) {
    console.log(`\n✅ live ruleset now hash ${result.rulesetHash} (version ${result.version}); balance post ${result.postId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
