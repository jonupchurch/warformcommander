/**
 * Feature 12 — `validateRuleset` is the Ruleset trust boundary (FR-011, SC-006): every enumerated
 * invalid class is rejected with a reason **before** any persistence, so the current pointer is never
 * advanced to a ruleset the engine would choke on. The default (seed) ruleset must pass.
 */

import { describe, expect, it } from "vitest";

import { loadDefaultRuleset } from "@/sim/validate";
import { validateRuleset } from "@/server/ruleset-validate";
import type { Ruleset } from "@/sim/ruleset";

/** A deep clone of the engine's valid default ruleset — the base every negative case mutates. */
function baseRuleset(): Ruleset {
  return structuredClone(loadDefaultRuleset());
}

/** The first variant id in the default ruleset (for targeted field mutations). */
function firstVariantId(rs: Ruleset): string {
  return Object.keys(rs.variants)[0];
}

describe("validateRuleset", () => {
  it("accepts the engine's canonical default ruleset", () => {
    expect(validateRuleset(loadDefaultRuleset())).toEqual({ ok: true });
  });

  it("rejects a non-object", () => {
    expect(validateRuleset(null).ok).toBe(false);
    expect(validateRuleset("nope").ok).toBe(false);
  });

  it("rejects a missing required group", () => {
    const rs = baseRuleset() as Partial<Ruleset>;
    delete rs.globals;
    const res = validateRuleset(rs);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/globals/);
  });

  it("rejects a dangling chassis → machine-type reference", () => {
    const rs = baseRuleset();
    const chassisId = Object.keys(rs.chassis)[0];
    rs.chassis[chassisId].typeId = "NoSuchType" as never;
    const res = validateRuleset(rs);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/unknown machine type/);
  });

  it("rejects splashCap above 0.25 (2500 bp)", () => {
    const rs = baseRuleset();
    rs.globals.splashCap = 3000;
    expect(validateRuleset(rs).ok).toBe(false);
  });

  it("rejects an out-of-[0,1] probability (bp > 10000)", () => {
    const rs = baseRuleset();
    rs.globals.hitClampMax = 15_000;
    expect(validateRuleset(rs).ok).toBe(false);
  });

  it("rejects a negative variant probability field", () => {
    const rs = baseRuleset();
    rs.variants[firstVariantId(rs)].accuracy = -100;
    expect(validateRuleset(rs).ok).toBe(false);
  });

  it("rejects hitClampMin greater than hitClampMax", () => {
    const rs = baseRuleset();
    rs.globals.hitClampMin = 9000;
    rs.globals.hitClampMax = 5000;
    const res = validateRuleset(rs);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/hitClamp/);
  });

  it("rejects a non-positive hull", () => {
    const rs = baseRuleset();
    rs.variants[firstVariantId(rs)].hull = 0;
    expect(validateRuleset(rs).ok).toBe(false);
  });
});
