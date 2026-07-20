/**
 * Cold-start seed (T049 / P5) — seeding creates `isBot` accounts owning active defense snapshots so
 * the ladder is never empty, validating each army through the shared gate, and is idempotent.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users, defenseSnapshots } from "@/db/schema";
import { seedColdStartDefenders } from "@/db/seed";
import { truncateAll, closeDb } from "./db-setup";

beforeEach(truncateAll);
afterAll(closeDb);

describe("cold-start defender seed", () => {
  it("creates bot users with active snapshots and is idempotent", async () => {
    const created = await seedColdStartDefenders();
    expect(created).toBeGreaterThan(0);

    const bots = await getDb().select().from(users).where(eq(users.isBot, true));
    expect(bots.length).toBe(created);

    const active = await getDb()
      .select()
      .from(defenseSnapshots)
      .where(eq(defenseSnapshots.active, true));
    expect(active.length).toBe(created);
    expect(active.every((s) => s.powerRating > 0)).toBe(true);

    // Re-running seeds nothing new.
    const again = await seedColdStartDefenders();
    expect(again).toBe(0);
    expect((await getDb().select().from(users).where(eq(users.isBot, true))).length).toBe(created);
  });
});
