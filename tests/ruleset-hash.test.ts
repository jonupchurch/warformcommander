/**
 * Feature 12 — `hashRuleset` is Feature 1's **canonical** hash reached over the wasm boundary
 * (FR-007). The load-bearing property: the hash the live-ruleset store records for a revision equals
 * the hash a match resolved against that revision stamps on its replay (provenance join, SC-002).
 * These pin exactly that, plus determinism and key-order insensitivity (proving canonicalization —
 * not a bespoke JS hash that could drift).
 */

import { describe, expect, it } from "vitest";

import { hashRuleset } from "@/sim/ruleset-hash";
import { loadDefaultRuleset } from "@/sim/validate";

import { loadBatteryReplay } from "./replay-fixtures";

describe("hashRuleset — Feature 1's canonical hash over the wasm boundary", () => {
  it("returns a stable BLAKE3 hex digest (64 lowercase hex chars)", () => {
    const h = hashRuleset(loadDefaultRuleset());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRuleset(loadDefaultRuleset())).toBe(h); // deterministic
  });

  it("equals the hash the engine stamped on a replay resolved against the same ruleset (provenance parity, FR-007)", () => {
    // The battery replay was emitted by the native engine against the default (seed) ruleset; its
    // stamped rulesetHash must equal hashRuleset(default) — the store's hash == the engine's stamp.
    expect(hashRuleset(loadDefaultRuleset())).toBe(loadBatteryReplay().meta.rulesetHash);
  });

  it("changes when any leaf changes", () => {
    const base = loadDefaultRuleset();
    const changed = structuredClone(base);
    changed.globals.nativeBonus = base.globals.nativeBonus + 1;
    expect(hashRuleset(changed)).not.toBe(hashRuleset(base));
  });

  it("is insensitive to JS key order (the engine re-serializes canonically)", () => {
    const base = loadDefaultRuleset();
    // Rebuild `globals` with its keys in reverse order — a bespoke JSON.stringify hash would change;
    // the canonical engine hash must not.
    const reordered = structuredClone(base);
    reordered.globals = Object.fromEntries(
      Object.entries(base.globals).reverse(),
    ) as typeof base.globals;
    expect(hashRuleset(reordered)).toBe(hashRuleset(base));
  });
});
