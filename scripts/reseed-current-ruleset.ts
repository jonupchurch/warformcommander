/**
 * Ops: re-seed the live `current_ruleset` to the engine's **current default** (the v2 ruleset).
 *
 *   dotenv -e .env.local     -- tsx scripts/reseed-current-ruleset.ts   # PROD
 *   dotenv -e .env.dev.local -- tsx scripts/reseed-current-ruleset.ts   # dev
 *
 * ⚠️ DEPLOY THE ENGINE FIRST. The v2 ruleset carries enum variants (`DamageLayer::Ablative`,
 * `SupportKind::Aura`, `Capability::RocketPack`) that a pre-v2 deployed engine cannot deserialize —
 * every live battle would fail until the new build is live. Verify the production deployment is READY
 * before running this against prod.
 *
 * Goes through the proper `saveRuleset` path: validate → append an immutable revision → swap the
 * `current_ruleset` pointer (optimistic-version guarded) → auto-publish one balance post. Idempotent:
 * a no-op if the live hash already equals the engine default.
 */
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { SessionUser } from "@/server/authz";
import { getRulesetForEdit, saveRuleset } from "@/server/ruleset";
import { hashRuleset } from "@/sim/ruleset-hash";
import { loadDefaultRuleset } from "@/sim/validate";

async function main() {
  const target = loadDefaultRuleset();
  const targetHash = hashRuleset(target);
  console.log(`engine default (target) ruleset hash: ${targetHash}`);

  // Attribute the revision + balance post to a real admin user (both are FKs into `user`).
  const [admin] = await getDb().select().from(users).where(eq(users.role, "admin")).limit(1);
  if (!admin) throw new Error("no admin user in this database — cannot attribute the re-seed");
  const actor: SessionUser = {
    id: admin.id,
    role: "admin",
    email: admin.email,
    handle: admin.handle,
  };
  console.log(`attributing to admin: ${admin.email ?? admin.handle ?? admin.id}`);

  const current = await getRulesetForEdit(actor);
  console.log(`current live ruleset hash: ${current.rulesetHash}  (version ${current.version})`);

  if (current.rulesetHash === targetHash) {
    console.log("live ruleset already equals the engine default — no-op.");
    return;
  }

  const result = await saveRuleset(actor, {
    data: target,
    expectedVersion: current.version,
    note: "v3 counter-web ruleset — sharpened ×1.6/×0.7 damage matrix, cadence welded to weapon type, targeting priority-score chain (2 filters + Closest/Furthest), 3 universal stances (two-sided magnitude), 4 self-terminating movement modes, Commander while-alive auras + Paint on-hit rider. Untuned start-values (tuning to follow via the balance editor).",
  });
  console.log("saveRuleset result:", JSON.stringify(result));
  if ("error" in result) throw new Error(`re-seed failed: ${result.error}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
