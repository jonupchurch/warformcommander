/**
 * `validateRuleset(data)` — the **Ruleset trust boundary** (Feature 12, FR-011). An admin's edited
 * balance table is untrusted input the engine will read on *every* match, so it is validated
 * server-side **before any persistence** (data-model B3): a structurally-incomplete or out-of-bounds
 * ruleset is rejected with a reason and the current pointer is never advanced to it (SC-006). This is
 * the `Ruleset` analog of Feature 1's army `validate()` (V1–V8): reject illegal input, never "fix" it.
 *
 * Pure — no DB, no wasm. `bp` fields are basis points (10000 = 100%); `Fixed` fields are milli units.
 */

import type { Ruleset } from "@/sim/ruleset";

export type RulesetValidation = { ok: true } | { ok: false; reason: string };

const BP_MAX = 10_000; // 100% in basis points — the ceiling for a fraction/probability
const SPLASH_CAP_MAX = 2_500; // 0.25 in bp — the derivation's splash clamp ceiling (data-model: splash ≤ 0.25)

/** The eight top-level groups a complete Ruleset must carry (Feature-1 Tier-2). */
const REQUIRED_GROUPS = [
  "machineTypes",
  "chassis",
  "variants",
  "equipment",
  "damageMatrix",
  "cadenceTicks",
  "airMods",
  "globals",
] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(reason: string): RulesetValidation {
  return { ok: false, reason };
}

/** A finite number in `[min, max]`. */
function inRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

/**
 * Validate an edited ruleset: structural completeness (all groups present, references resolvable) +
 * numeric bounds (fractions in `[0,1]` as bp, `splash ≤ 0.25`, ordered `hitClamp`, positive cadence
 * tiers, sane `nativeBonus`). Returns the first failure's reason, or `{ ok: true }`.
 */
export function validateRuleset(data: unknown): RulesetValidation {
  if (!isObject(data)) return fail("ruleset is not an object");

  // 1) Structural completeness — every required group present and an object.
  for (const group of REQUIRED_GROUPS) {
    if (!isObject(data[group])) return fail(`missing or malformed group: ${group}`);
  }

  const rs = data as unknown as Ruleset;
  const machineTypes = rs.machineTypes as Record<string, { id?: unknown }>;
  const chassis = rs.chassis as Record<string, { typeId?: unknown }>;
  const variants = rs.variants as unknown as Record<string, Record<string, unknown>>;

  if (Object.keys(machineTypes).length === 0) return fail("machineTypes is empty");
  if (Object.keys(chassis).length === 0) return fail("chassis is empty");
  if (Object.keys(variants).length === 0) return fail("variants is empty");

  // 2) Reference resolvability — every chassis names a real machine type and has base stats; every
  //    variant has a chassis identity (no dangling references the engine would choke on).
  for (const [id, ch] of Object.entries(chassis)) {
    if (typeof ch.typeId !== "string" || !(ch.typeId in machineTypes)) {
      return fail(`chassis '${id}' references unknown machine type '${String(ch.typeId)}'`);
    }
    if (!isObject(variants[id])) {
      return fail(`chassis '${id}' has no base-stats entry in variants`);
    }
  }
  for (const id of Object.keys(variants)) {
    if (!(id in chassis)) return fail(`variants entry '${id}' has no chassis identity`);
  }

  // 3) Global numeric bounds.
  const g = rs.globals;
  if (!inRange(g.tickRate, 1, Number.MAX_SAFE_INTEGER)) return fail("globals.tickRate must be ≥ 1");
  if (!inRange(g.tickCap, 1, Number.MAX_SAFE_INTEGER)) return fail("globals.tickCap must be ≥ 1");
  if (!inRange(g.splashCap, 0, SPLASH_CAP_MAX)) {
    return fail(`globals.splashCap must be within 0..${SPLASH_CAP_MAX} bp (≤ 0.25)`);
  }
  if (!inRange(g.hitClampMin, 0, BP_MAX)) return fail("globals.hitClampMin must be in 0..10000 bp");
  if (!inRange(g.hitClampMax, 0, BP_MAX)) return fail("globals.hitClampMax must be in 0..10000 bp");
  if (g.hitClampMin > g.hitClampMax) return fail("globals.hitClampMin must be ≤ hitClampMax");
  if (!inRange(g.critBaseChance, 0, BP_MAX)) return fail("globals.critBaseChance must be in 0..10000 bp");
  if (!inRange(g.damageVariance, 0, BP_MAX)) return fail("globals.damageVariance must be in 0..10000 bp");
  if (!inRange(g.nativeBonus, 0, BP_MAX)) return fail("globals.nativeBonus must be in 0..10000 bp");
  if (!inRange(g.minDamageFloor, 0, Number.MAX_SAFE_INTEGER)) return fail("globals.minDamageFloor must be ≥ 0");
  if (!inRange(g.critBaseMult, 0, Number.MAX_SAFE_INTEGER)) return fail("globals.critBaseMult must be ≥ 0");

  // 4) Cadence tiers present and positive.
  const c = rs.cadenceTicks;
  for (const tier of ["fast", "medium", "slow", "siege"] as const) {
    if (!inRange(c[tier], 1, Number.MAX_SAFE_INTEGER)) return fail(`cadenceTicks.${tier} must be ≥ 1`);
  }

  // 5) Damage matrix + air mods — multipliers non-negative (may exceed 1× for effective-vs-layer).
  const dm = rs.damageMatrix;
  for (const axis of ["kinetic", "energy", "explosive"] as const) {
    const layer = dm[axis];
    if (!inRange(layer?.vsShields, 0, Number.MAX_SAFE_INTEGER)) return fail(`damageMatrix.${axis}.vsShields must be ≥ 0`);
    if (!inRange(layer?.vsArmor, 0, Number.MAX_SAFE_INTEGER)) return fail(`damageMatrix.${axis}.vsArmor must be ≥ 0`);
  }
  // airMods are signed modifiers (e.g. `plinkAccPenalty` is a negative accuracy penalty) — require
  // present + finite, not a sign.
  const am = rs.airMods;
  for (const k of ["aaAccBonus", "aaDmgMult", "plinkAccPenalty", "plinkDmgMult"] as const) {
    if (typeof am[k] !== "number" || !Number.isFinite(am[k])) return fail(`airMods.${k} must be a finite number`);
  }

  // 6) Per-variant base stats — the bp fields are fractions/probabilities in [0,1] (0..10000 bp),
  //    hull positive, damage non-negative. Catches an out-of-[0,1] probability or a bad splash.
  const BP_FIELDS = ["armorPct", "accuracy", "critChance", "splash", "penetration", "evasion"] as const;
  for (const [id, v] of Object.entries(variants)) {
    if (!inRange(v.hull, 1, Number.MAX_SAFE_INTEGER)) return fail(`variants.${id}.hull must be ≥ 1`);
    if (!inRange(v.damage, 0, Number.MAX_SAFE_INTEGER)) return fail(`variants.${id}.damage must be ≥ 0`);
    for (const f of BP_FIELDS) {
      if (!inRange(v[f], 0, BP_MAX)) return fail(`variants.${id}.${f} must be in 0..10000 bp (a fraction in [0,1])`);
    }
  }

  return { ok: true };
}
