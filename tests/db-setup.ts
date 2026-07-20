/**
 * Shared test-DB helpers (Feature 7). All DB tests run against the **local dev Postgres**
 * (`DATABASE_URL` from `.env.dev.local`, injected by the `test` script). Never the prod branch.
 */

import { sql } from "drizzle-orm";

import { getDb } from "@/db";

/** Every table, child-first, for a clean slate between tests. */
const TABLES = [
  "replays",
  "matches",
  "defense_snapshots",
  "ladder_standings",
  "presets",
  "posts",
  "squads",
  "session",
  "account",
  '"verificationToken"',
  '"user"',
];

/** Truncate all tables (cascade) — call in `beforeEach` for isolation. */
export async function truncateAll(): Promise<void> {
  const db = getDb();
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
}

/** A stable, unique-ish id generator for fixtures (no ambient randomness needed). */
let counter = 0;
export function testId(prefix = "t"): string {
  counter += 1;
  return `${prefix}-${counter.toString().padStart(6, "0")}`;
}

/** Close the pooled connection so vitest exits cleanly. Call in `afterAll`. */
export async function closeDb(): Promise<void> {
  await getDb().$client.end();
}
