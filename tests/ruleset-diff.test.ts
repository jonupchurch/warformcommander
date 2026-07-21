/**
 * Feature 12 — `diffRuleset` + renderers (FR-016). The diff basis for the auto-published balance
 * post: exact changed-leaf paths (old → new + % delta), an empty diff for a no-op save (the
 * short-circuit `saveRuleset` uses), and legible markdown/one-line renders.
 */

import { describe, expect, it } from "vitest";

import { loadDefaultRuleset } from "@/sim/validate";
import { diffRuleset, renderDiffOneLiner, renderDiffSummary } from "@/server/ruleset-diff";
import type { Ruleset } from "@/sim/ruleset";

function base(): Ruleset {
  return structuredClone(loadDefaultRuleset());
}

describe("diffRuleset", () => {
  it("returns an empty diff for identical rulesets (the no-op short-circuit)", () => {
    expect(diffRuleset(loadDefaultRuleset(), loadDefaultRuleset())).toEqual([]);
  });

  it("records a single changed leaf with its path, old→new, and percent delta", () => {
    const prev = base();
    const next = base();
    const old = prev.globals.nativeBonus;
    next.globals.nativeBonus = old + Math.round(old * 0.1); // +10%

    const diff = diffRuleset(prev, next);
    expect(diff).toHaveLength(1);
    expect(diff[0].path).toBe("globals.nativeBonus");
    expect(diff[0].oldValue).toBe(old);
    expect(diff[0].newValue).toBe(next.globals.nativeBonus);
    expect(diff[0].percentDelta).toBeCloseTo(0.1, 2);
  });

  it("records every changed leaf across groups", () => {
    const prev = base();
    const next = base();
    const vId = Object.keys(next.variants)[0];
    next.globals.tickCap = prev.globals.tickCap + 100;
    next.variants[vId].hull = prev.variants[vId].hull - 500;
    next.cadenceTicks.fast = prev.cadenceTicks.fast + 1;

    const diff = diffRuleset(prev, next);
    const paths = diff.map((e) => e.path).sort();
    expect(paths).toEqual(["cadenceTicks.fast", "globals.tickCap", `variants.${vId}.hull`].sort());
  });

  it("renders a markdown summary and a one-line excerpt", () => {
    const prev = base();
    const next = base();
    next.globals.nativeBonus = prev.globals.nativeBonus + 200;

    const diff = diffRuleset(prev, next);
    const summary = renderDiffSummary(diff);
    expect(summary).toContain("`globals.nativeBonus`");
    expect(summary).toContain("→");

    const oneLiner = renderDiffOneLiner(diff);
    expect(oneLiner).toContain("globals.nativeBonus");

    expect(renderDiffSummary([])).toBe("_No changes._");
    expect(renderDiffOneLiner([])).toBe("No changes");
  });

  it("elides a long change list in the one-liner", () => {
    const prev = base();
    const next = base();
    next.globals.tickCap += 1;
    next.globals.tickRate += 1;
    next.globals.nativeBonus += 1;
    next.globals.minDamageFloor += 1;
    const oneLiner = renderDiffOneLiner(diffRuleset(prev, next), 2);
    expect(oneLiner).toMatch(/\+2 more$/);
  });
});
