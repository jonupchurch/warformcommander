/**
 * Cold-start defender seed (Feature 7, T049 / P5). Creates `isBot` accounts that own active defense
 * snapshots, so the ladder is never empty at launch and matchmaking (Feature 8) has real defenders to
 * serve. Each seed army is validated by the shared engine `validate()` before it is written (the same
 * gate a human squad passes) and its power rating derived from that call.
 *
 * Run against a target DB with:  `npm run db:seed:dev`  (local) or `npm run db:seed` (prod env).
 * Idempotent by bot email — re-running does not duplicate the bot accounts.
 */

import { eq } from "drizzle-orm";

import { validateSquad } from "../sim/validate";
import type { SquadConfig } from "./types";
import { getDb } from "./index";
import { users, defenseSnapshots } from "./schema";
import seedArmies from "./seed-armies.json";

interface SeedArmy {
  name: string;
  config: SquadConfig;
}

/** Seed (or top up) the cold-start bot defenders. Returns how many bots were created. */
export async function seedColdStartDefenders(): Promise<number> {
  const db = getDb();
  let created = 0;

  for (let i = 0; i < (seedArmies as SeedArmy[]).length; i++) {
    const army = (seedArmies as SeedArmy[])[i];
    const email = `bot-${i}@warform.local`;

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) continue; // already seeded — idempotent

    const v = validateSquad(army.config);
    if (!v.ok) {
      throw new Error(`seed army '${army.name}' is invalid: ${v.errors.map((e) => e.code).join(", ")}`);
    }

    const userId = crypto.randomUUID();
    await db.insert(users).values({ id: userId, email, handle: army.name, isBot: true });
    await db.insert(defenseSnapshots).values({
      userId,
      name: army.name,
      config: army.config,
      powerRating: v.powerRating,
      defenseSlot: 0,
      active: true,
    });
    created += 1;
  }
  return created;
}

// Runnable entrypoint (via tsx). Guarded so importing the module never seeds.
if (import.meta.url.endsWith("seed.ts") && process.argv[1]?.endsWith("seed.ts")) {
  seedColdStartDefenders()
    .then((n) => {
      console.log(`cold-start seed complete: ${n} bot defender(s) created.`);
      return getDb().$client.end();
    })
    .catch((e) => {
      console.error("seed failed:", e);
      process.exit(1);
    });
}
