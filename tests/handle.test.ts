/**
 * Feature 7 — commander handle rules (`lib/handle.ts`). Pure validation shared by the client form and
 * the authoritative server action: length bounds, the allowed alphabet, the at-least-one-letter rule,
 * reserved words, and the case-insensitive comparison key.
 */

import { describe, expect, it } from "vitest";

import { HANDLE_MAX, HANDLE_MIN, handleKey, normalizeHandle, validateHandle } from "@/lib/handle";

describe("validateHandle", () => {
  it("accepts a clean handle and returns the trimmed display value (case preserved)", () => {
    expect(validateHandle("  Ace_01 ")).toEqual({ ok: true, value: "Ace_01" });
  });

  it("enforces the length bounds", () => {
    expect(validateHandle("a".repeat(HANDLE_MIN - 1)).ok).toBe(false);
    expect(validateHandle("Ab" + "c".repeat(HANDLE_MIN - 2)).ok).toBe(true); // exactly MIN, has a letter
    expect(validateHandle("A" + "b".repeat(HANDLE_MAX - 1)).ok).toBe(true); // exactly MAX
    expect(validateHandle("A" + "b".repeat(HANDLE_MAX)).ok).toBe(false); // MAX + 1
  });

  it("rejects characters outside [A-Za-z0-9_]", () => {
    for (const bad of ["bad handle", "no-dash", "dot.name", "emoji😀x", "slash/x"]) {
      expect(validateHandle(bad).ok).toBe(false);
    }
  });

  it("requires at least one letter (never all-numeric or all-underscore)", () => {
    expect(validateHandle("12345").ok).toBe(false);
    expect(validateHandle("____").ok).toBe(false);
    expect(validateHandle("v2_5").ok).toBe(true);
  });

  it("rejects reserved words, case-insensitively", () => {
    expect(validateHandle("admin").ok).toBe(false);
    expect(validateHandle("ADMIN").ok).toBe(false);
    expect(validateHandle("Api").ok).toBe(false);
    expect(validateHandle("Warform").ok).toBe(false);
  });
});

describe("handleKey / normalizeHandle", () => {
  it("normalize trims; key trims and lowercases (the uniqueness key)", () => {
    expect(normalizeHandle("  Ace  ")).toBe("Ace");
    expect(handleKey("  Ace  ")).toBe("ace");
    expect(handleKey("ACE")).toBe(handleKey("ace"));
  });
});
