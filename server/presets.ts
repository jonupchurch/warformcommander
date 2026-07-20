/**
 * Custom-preset library (Feature 7, provided for Feature 4). Persistence for a player's per-machine-
 * type builds (§8.4). Minimal here — the Garage (Feature 4) owns the editor, the stock presets (static
 * data, not rows), and edit-time validation UX. Ownership (A2) is enforced on every op.
 *
 * Server-only.
 */

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { presets } from "@/db/schema";
import type { PresetConfig } from "@/db/types";

import { type SessionUser } from "./authz";
import { err, ok, type Result } from "./result";

export type Preset = typeof presets.$inferSelect;

/** Save a custom preset (a per-machine-type loadout + dials + planB) to the actor's library. */
export async function savePreset(
  actor: SessionUser,
  input: { name: string; machineTypeId: string; config: PresetConfig },
): Promise<Result<Preset>> {
  const [row] = await getDb()
    .insert(presets)
    .values({
      userId: actor.id,
      name: input.name,
      machineTypeId: input.machineTypeId,
      config: input.config,
    })
    .returning();
  return ok(row);
}

/** The actor's presets, optionally filtered by machine type. */
export async function listPresets(
  actor: SessionUser,
  machineTypeId?: string,
): Promise<Result<Preset[]>> {
  const conds = [eq(presets.userId, actor.id)];
  if (machineTypeId) conds.push(eq(presets.machineTypeId, machineTypeId));
  const rows = await getDb()
    .select()
    .from(presets)
    .where(and(...conds))
    .orderBy(asc(presets.machineTypeId));
  return ok(rows);
}

/** Delete one of the actor's presets. */
export async function deletePreset(actor: SessionUser, id: string): Promise<Result<void>> {
  const db = getDb();
  const [row] = await db.select({ userId: presets.userId }).from(presets).where(eq(presets.id, id)).limit(1);
  if (!row) return err("NOT_FOUND");
  if (row.userId !== actor.id) return err("NOT_OWNER");
  await db.delete(presets).where(eq(presets.id, id));
  return ok(undefined);
}
