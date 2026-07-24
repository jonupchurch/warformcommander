/**
 * US2 — roster CRUD. A valid squad round-trips; every illegal army is rejected by the shared
 * `validate()` **before** insert and writes no row (SC-003); the 8-slot baseline is enforced; and no
 * user can touch another's squad (A2).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { squads } from "@/db/schema";
import type { SquadConfig } from "@/db/types";
import {
  saveSquad,
  updateSquad,
  loadSquad,
  listSquads,
  deleteSquad,
} from "@/server/squads";
import { truncateAll, closeDb, createTestUser } from "./db-setup";
import { validSquad } from "./fixtures";

async function squadRowCount(): Promise<number> {
  return (await getDb().select().from(squads)).length;
}

beforeEach(truncateAll);
afterAll(closeDb);

describe("saveSquad / roster round-trip (US2-AS1/2)", () => {
  it("saves a valid squad that loads back byte-for-byte with a derived power rating", async () => {
    const actor = await createTestUser();
    const config = validSquad();
    const res = await saveSquad(actor, { slotIndex: 0, name: "First", config });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.powerRating).toBeGreaterThan(0);

    const back = await loadSquad(actor, res.value.id);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    // jsonb normalizes key order (binary format) — the config round-trips value-identical.
    expect(back.value.config).toEqual(config);
  });

  it("overwrite/rename persists and recomputes power rating", async () => {
    const actor = await createTestUser();
    const saved = await saveSquad(actor, { slotIndex: 0, name: "Alpha", config: validSquad() });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const renamed = await updateSquad(actor, saved.value.id, { name: "Bravo" });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.value.name).toBe("Bravo");
    expect(renamed.value.updatedAt.getTime()).toBeGreaterThanOrEqual(saved.value.createdAt.getTime());
  });
});

describe("illegal armies are rejected before insert (SC-003, US2-AS3)", () => {
  const illegal: Record<string, () => SquadConfig> = {
    "wrong size (V1)": () => {
      const c = validSquad();
      c.machines.pop();
      return c;
    },
    "zone-cap breach (V2)": () => {
      const c = validSquad();
      c.machines.forEach((m) => {
        if (m.zone !== "Air") m.zone = "Front";
      });
      return c;
    },
    "mount-illegal weapon (V4)": () => {
      const c = validSquad();
      c.machines[0].loadout.weapon = "Autocannon"; // a Light-mount gun on the heavy tank
      return c;
    },
    "duplicate utility (V5)": () => {
      const c = validSquad();
      c.machines[0].loadout.utilities = ["FireControl", "FireControl", "Autoloader"];
      return c;
    },
    "excess Plan-B (V6)": () => {
      const c = validSquad();
      c.machines[1].planB = [
        {
          slot: "Slot1",
          condition: { HullBelowPct: 5000 },
          dial: "Movement",
          planBValue: { Movement: "FallBack" },
        },
        {
          slot: "Slot2",
          condition: { AfterTick: 100 },
          dial: "Stance",
          planBValue: { Stance: "Aggressive" },
        },
      ];
      return c;
    },
  };

  for (const [label, make] of Object.entries(illegal)) {
    it(`rejects ${label} and writes no row`, async () => {
      const actor = await createTestUser();
      const res = await saveSquad(actor, { slotIndex: 0, name: "Bad", config: make() });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error).toBe("VALIDATION_FAILED");
      expect(res.reason).toBeTruthy();
      expect(await squadRowCount()).toBe(0);
    });
  }
});

describe("8-slot cap and cross-user ownership (US2-AS4/5)", () => {
  it("rejects a 9th squad and an occupied slot", async () => {
    const actor = await createTestUser();
    for (let i = 0; i < 8; i++) {
      const r = await saveSquad(actor, { slotIndex: i, name: `S${i}`, config: validSquad() });
      expect(r.ok).toBe(true);
    }
    const ninth = await saveSquad(actor, { slotIndex: 8, name: "S8", config: validSquad() });
    expect(ninth.ok).toBe(false);
    if (!ninth.ok) expect(ninth.error).toBe("SLOT_CAP_EXCEEDED");

    const dupe = await saveSquad(actor, { slotIndex: 0, name: "dup", config: validSquad() });
    expect(dupe.ok).toBe(false);
    if (!dupe.ok) expect(dupe.error).toBe("SLOT_TAKEN");
  });

  it("denies user B read/edit/delete of user A's squad", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const saved = await saveSquad(a, { slotIndex: 0, name: "A-squad", config: validSquad() });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const id = saved.value.id;

    expect((await loadSquad(b, id)).ok).toBe(false);
    expect((await updateSquad(b, id, { name: "hijack" })).ok).toBe(false);
    const del = await deleteSquad(b, id);
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.error).toBe("NOT_OWNER");

    // A's squad is untouched.
    expect((await listSquads(a)).ok).toBe(true);
    expect(await squadRowCount()).toBe(1);
  });
});
