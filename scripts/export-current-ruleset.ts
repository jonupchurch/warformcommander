/**
 * Ops helper: export the live current ruleset (fresh from Postgres) to a JSON file, for offline
 * balancer runs / inspection. Run: `dotenv -e .env.local -- tsx scripts/export-current-ruleset.ts <out.json>`
 */
import fs from "node:fs";

import { getCurrentRuleset } from "@/server/ruleset";

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("usage: export-current-ruleset.ts <out.json>");
  const cur = await getCurrentRuleset();
  fs.writeFileSync(out, JSON.stringify(cur.ruleset));
  console.log(`exported live ruleset hash ${cur.rulesetHash} -> ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
