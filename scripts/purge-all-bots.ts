/**
 * Ops: purge ALL bot accounts (`isBot = true`) and everything they own.
 *
 *   dotenv -e .env.local     -- tsx scripts/purge-all-bots.ts   # PROD
 *   dotenv -e .env.dev.local -- tsx scripts/purge-all-bots.ts   # dev
 *
 * Deleting the `user` rows cascades to their squads, defense snapshots, presets, and ladder standings
 * (all FK `onDelete: cascade`). Historical `matches` are NOT deleted — their `attacker/defender` user
 * and `defenderSnapshot` FKs are `onDelete: set null`, so past battles survive with de-linked refs.
 *
 * Intended to be followed by a fresh `npm run db:seed:testbots` to regenerate the bot roster.
 */
import { count, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { defenseSnapshots, users } from "@/db/schema";

async function main() {
  const db = getDb();

  const bots = await db
    .select({ id: users.id, email: users.email, handle: users.handle })
    .from(users)
    .where(eq(users.isBot, true));

  if (bots.length === 0) {
    console.log("no bot accounts found — nothing to purge.");
    return;
  }

  console.log(`purging ${bots.length} bot account(s):`);
  for (const b of bots) console.log(`  - ${b.handle ?? "(no handle)"} <${b.email ?? "no-email"}>`);

  const deleted = await db.delete(users).where(eq(users.isBot, true)).returning({ id: users.id });

  // Confirm the cascade cleared their defenders (only human-owned active snapshots should remain).
  const [{ c: remainingActive }] = await db
    .select({ c: count() })
    .from(defenseSnapshots)
    .where(eq(defenseSnapshots.active, true));

  console.log(`\ndeleted ${deleted.length} bot user(s) — squads/snapshots/presets/standings cascaded.`);
  console.log(`active defense snapshots still in DB (should be human-only now): ${remainingActive}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("purge failed:", e);
    process.exit(1);
  },
);
