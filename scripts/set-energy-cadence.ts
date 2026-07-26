/**
 * Balance: end the ENERGY_LANCE wall by welding Energy to the **Medium** cadence tier instead of Fast.
 *
 *   dotenv -e .env.dev.local -- tsx scripts/set-energy-cadence.ts   # dev
 *   dotenv -e .env.local     -- tsx scripts/set-energy-cadence.ts   # PROD
 *
 * WHY (measured, not guessed — the damage matrix was never the driver):
 * A weapon module carries only `family`, `cadence` and `reach`; per-shot damage is a CHASSIS stat, and
 * `derive_effective_stats` **welds cadence to the damage TYPE** (`sim/derive.ts` / `model/army.rs`),
 * overriding the weapon's own tier. With `cadenceTicks` at fast:1 / medium:3 / slow:5, "Energy = Fast"
 * is a flat ~3× DPS multiplier over Kinetic on any chassis — and the design's intended offset ("Energy
 * fires Fast: slight DPS lead, LOW ALPHA") was never implemented, because nothing scales per-shot
 * damage by family. Energy got the fire rate with no drawback.
 *
 * Ablations vs the 33-army field (ENERGY_LANCE_01, both sides × 3 seeds, Bo3):
 *   baseline                                        100.0%
 *   energy vsArmor 1.25 → 1.00 / 0.90 / 0.60        100.0% / 100.0% / 97.0%
 *   energy given the FULL kinetic matrix            100.0%   ← damage is NOT the lever
 *   same guns relabelled family = Kinetic            53.0%   ← identical damage numbers, 47pt swing
 *   cadenceTicks fast 1→2                            99.0%   (heavies/artillery already fire a tier slower)
 *   cadenceTicks compressed 2/3/4/6                  92.9%
 *   **cadenceProfile.energy Fast → Medium            74.2%**
 *
 * Field-wide (12 archetypes, round robin), before → after:
 *   spread 100%–5% → 80%–23%; archetypes at ≥90% or ≤10%: **3/12 → 0/12** (no walls left).
 *   LIGHT_SWARM 5%→32% (the long-standing floor fixes itself — Light is the only chassis truly on Fast);
 *   SHIELD_WALL 91%→27% (the #2 wall collapses — watch it, may want a follow-up buff).
 *
 * Pure ruleset DATA. `CadenceProfile` is `#[serde(default)]` + camelCase on the Rust side, so the value
 * round-trips into wasm with **no engine rebuild**. NB the live row currently OMITS `cadenceProfile`
 * entirely (it has been running on the engine default), so this writes the field for the first time —
 * the ruleset hash changes even though only `energy` differs from the default.
 *
 * Idempotent: re-running once the profile is live diffs empty and `saveRuleset` no-ops.
 */
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { SessionUser } from "@/server/authz";
import { getRulesetForEdit, saveRuleset } from "@/server/ruleset";
import { diffRuleset } from "@/server/ruleset-diff";
import { validateRuleset } from "@/server/ruleset-validate";
import { hashRuleset } from "@/sim/ruleset-hash";
import { DEFAULT_CADENCE_PROFILE, type CadenceProfile } from "@/sim/ruleset";

/** Energy drops Fast → Medium (kinetic parity); everything else stays at the engine default. */
const TARGET_PROFILE: CadenceProfile = { ...DEFAULT_CADENCE_PROFILE, energy: "Medium" };

/** `--dry-run`: read + validate + diff + hash, and write nothing (safe to point at PROD). */
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const db = getDb();
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (!admin && !DRY_RUN) throw new Error("no admin user in this database — cannot attribute the ruleset save");
  const actor: SessionUser = admin
    ? { id: admin.id, role: "admin", email: admin.email, handle: admin.handle }
    : { id: "dry-run", role: "admin", email: null, handle: null };
  console.log(`attributing to admin: ${admin?.email ?? admin?.handle ?? admin?.id ?? "(dry run — no admin needed)"}`);

  const current = await getRulesetForEdit(actor);
  console.log(`current live ruleset hash: ${current.rulesetHash}  (version ${current.version})`);
  console.log(`current cadenceProfile   : ${JSON.stringify(current.data.cadenceProfile ?? "(omitted → engine default)")}`);
  console.log(`target  cadenceProfile   : ${JSON.stringify(TARGET_PROFILE)}`);

  const augmented = structuredClone(current.data);
  augmented.cadenceProfile = TARGET_PROFILE;

  // Same gate `saveRuleset` applies, run up-front so a bad patch fails before touching the DB.
  const validation = validateRuleset(augmented);
  if (!validation.ok) throw new Error(`ruleset rejected by validateRuleset: ${validation.reason}`);
  const diff = diffRuleset(current.data, augmented);
  console.log(`validates ✓   diff (${diff.length} entr${diff.length === 1 ? "y" : "ies"}):`);
  for (const d of diff) console.log(`  ${JSON.stringify(d)}`);
  console.log(`resulting hash: ${hashRuleset(augmented)}`);

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  const result = await saveRuleset(actor, {
    data: augmented,
    expectedVersion: current.version,
    note:
      "Energy cadence Fast → Medium (kinetic parity). The ENERGY_LANCE wall was never the damage " +
      "matrix — cadence is welded to the damage TYPE, so 'Energy = Fast' was a flat ~3× DPS bonus on " +
      "any chassis with no offsetting alpha penalty. Measured: EL 100% → 74% vs the field; field-wide " +
      "spread 100–5% → 80–23%, walls (≥90%/≤10%) 3/12 → 0/12. Side effects: LIGHT_SWARM 5% → 32%, " +
      "SHIELD_WALL 91% → 27%.",
  });
  console.log("saveRuleset result:", JSON.stringify(result));
  if ("error" in result) throw new Error(`save failed: ${result.error}`);
  if ("noop" in result && result.noop) {
    console.log("no-op — the profile is already live (nothing to change).");
  } else {
    console.log(`\n✅ live ruleset now hash ${result.rulesetHash} (version ${result.version}); balance post ${result.postId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
