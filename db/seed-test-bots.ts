/**
 * Test-data seed — 10 dummy bot players (Bot1..Bot10), each with 3 active defense snapshots, so the
 * arena has plenty of defenders to attack while testing battles. Mirrors the cold-start seed
 * (`db/seed.ts`): each config is passed through the shared engine `validateSquad()` before it is
 * written (the same gate a human squad passes) and its power rating derived from that call. Configs are
 * drawn from the canonical `seed-armies.json` and cycled across the three defense slots.
 *
 * Idempotent + refresh-aware: a Bot{n} that already exists is reused, and each defense slot is
 * filled on first run, **upgraded in place** when its seed army has improved (via
 * `upsertActiveDefense`), and left untouched otherwise — re-running never duplicates.
 *
 * Run:  npx dotenv -e .env.local -- tsx db/seed-test-bots.ts        (prod)
 *       npx dotenv -e .env.dev.local -- tsx db/seed-test-bots.ts    (local dev)
 */

import { eq } from "drizzle-orm";

import { validateSquad } from "../sim/validate";
import type { SquadConfig } from "./types";
import { getDb } from "./index";
import { users } from "./schema";
import { upsertActiveDefense } from "./seed-helpers";
import seedArmies from "./seed-armies.json";

interface SeedArmy {
  name: string;
  config: SquadConfig;
}

const BOT_COUNT = 10;
const SLOTS = [0, 1, 2] as const;

async function seedTestBots(): Promise<{ bots: number; defenses: number }> {
  const db = getDb();

  // Validate the source configs once, up front — fail fast if a canonical army is bad.
  const armies = (seedArmies as SeedArmy[]).map((a) => {
    const v = validateSquad(a.config);
    if (!v.ok) throw new Error(`seed army '${a.name}' is invalid: ${v.errors.map((e) => e.code).join(", ")}`);
    return { name: a.name, config: a.config, powerRating: v.powerRating };
  });
  if (armies.length === 0) throw new Error("no seed armies to draw from");

  let bots = 0;
  let defenses = 0;

  for (let n = 1; n <= BOT_COUNT; n++) {
    const handle = `Bot${n}`;
    const email = `bot${n}@warform.local`;

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    let userId: string;
    if (existing.length > 0) {
      userId = existing[0].id;
    } else {
      userId = crypto.randomUUID();
      await db.insert(users).values({ id: userId, email, handle, isBot: true });
      bots += 1;
    }

    for (const slot of SLOTS) {
      // Three distinct armies per bot (6 armies, offset by slot) — fill on first run, upgrade in place
      // when a seed army improves, idempotent otherwise.
      const src = armies[(n + slot) % armies.length];
      const r = await upsertActiveDefense(db, {
        userId,
        slot,
        name: `${handle} — ${src.name}`,
        config: src.config,
        powerRating: src.powerRating,
      });
      if (r !== "kept") defenses += 1;
    }
  }

  return { bots, defenses };
}

seedTestBots()
  .then(({ bots, defenses }) => {
    console.log(`test-bot seed complete: ${bots} new bot(s), ${defenses} new defense(s).`);
    return getDb().$client.end();
  })
  .catch((e) => {
    console.error("test-bot seed failed:", e);
    process.exit(1);
  });
