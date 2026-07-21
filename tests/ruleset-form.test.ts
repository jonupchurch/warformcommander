/**
 * Feature 12 — the admin editor's pure form helpers (US1). Flattening the ruleset to numeric leaves,
 * grouping them for the table, and applying edits back onto a full ruleset for the Server Action —
 * all pure, no wasm/DB. These pin the edit round-trip the editor depends on.
 */

import { describe, expect, it } from "vitest";

import {
  applyEdits,
  changedCount,
  collectNumericLeaves,
  groupEditableLeaves,
  leafLabel,
  setByPath,
} from "@/lib/admin/ruleset-form";
import { loadDefaultRuleset } from "@/sim/validate";

describe("ruleset-form helpers", () => {
  it("collects only finite numeric leaves as dotted paths", () => {
    const leaves = collectNumericLeaves({ a: 1, b: { c: 2, d: "x" }, e: [1, 2], f: null });
    const paths = leaves.map((l) => l.path).sort();
    expect(paths).toEqual(["a", "b.c"]); // arrays + strings + null are not numeric leaves
    expect(leaves.find((l) => l.path === "b.c")?.value).toBe(2);
  });

  it("groups editable sections, splitting variants by id", () => {
    const groups = groupEditableLeaves(loadDefaultRuleset());
    const sections = new Set(groups.map((g) => g.section));
    expect(sections.has("globals")).toBe(true);
    expect(sections.has("variants")).toBe(true);
    // globals is a flat group (no subsection); variants are split per id
    expect(groups.find((g) => g.section === "globals")?.subsection).toBeNull();
    expect(groups.filter((g) => g.section === "variants").every((g) => g.subsection !== null)).toBe(true);
  });

  it("setByPath immutably sets a leaf without mutating the base", () => {
    const base = loadDefaultRuleset();
    const before = base.globals.nativeBonus;
    const next = setByPath(base, "globals.nativeBonus", before + 500);
    expect(next.globals.nativeBonus).toBe(before + 500);
    expect(base.globals.nativeBonus).toBe(before); // base untouched
  });

  it("applyEdits produces a fully edited ruleset from a path→value map", () => {
    const base = loadDefaultRuleset();
    const vId = Object.keys(base.variants)[0];
    const edited = applyEdits(base, {
      "globals.nativeBonus": base.globals.nativeBonus + 100,
      [`variants.${vId}.hull`]: base.variants[vId].hull - 250,
    });
    expect(edited.globals.nativeBonus).toBe(base.globals.nativeBonus + 100);
    expect(edited.variants[vId].hull).toBe(base.variants[vId].hull - 250);
  });

  it("changedCount ignores edits equal to the base value", () => {
    const base = loadDefaultRuleset();
    expect(changedCount(base, { "globals.nativeBonus": base.globals.nativeBonus })).toBe(0);
    expect(changedCount(base, { "globals.nativeBonus": base.globals.nativeBonus + 1 })).toBe(1);
  });

  it("leafLabel strips the section/subsection prefix", () => {
    expect(leafLabel("variants.Grizzly.hull", "variants", "Grizzly")).toBe("hull");
    expect(leafLabel("globals.nativeBonus", "globals", null)).toBe("nativeBonus");
  });
});
