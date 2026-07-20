/**
 * Shared persistence — the custom-preset library (for Feature 4). Presets round-trip, list by machine
 * type, and are owned: no user can delete another's (A2).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { savePreset, listPresets, deletePreset } from "@/server/presets";
import { truncateAll, closeDb, createTestUser } from "./db-setup";
import { validPreset } from "./fixtures";

beforeEach(truncateAll);
afterAll(closeDb);

describe("preset library (Feature 4 support)", () => {
  it("saves, lists by machine type, and round-trips the config", async () => {
    const actor = await createTestUser();
    const saved = await savePreset(actor, {
      name: "Breacher",
      machineTypeId: "HeavyTank",
      config: validPreset(),
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.config).toEqual(validPreset());

    await savePreset(actor, { name: "Scout kit", machineTypeId: "LightTank", config: validPreset() });

    const heavy = await listPresets(actor, "HeavyTank");
    expect(heavy.ok && heavy.value).toHaveLength(1);
    const all = await listPresets(actor);
    expect(all.ok && all.value).toHaveLength(2);
  });

  it("denies deleting another user's preset", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const saved = await savePreset(a, { name: "P", machineTypeId: "Mech", config: validPreset() });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const del = await deletePreset(b, saved.value.id);
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.error).toBe("NOT_OWNER");
    // A can delete their own.
    expect((await deletePreset(a, saved.value.id)).ok).toBe(true);
  });
});
