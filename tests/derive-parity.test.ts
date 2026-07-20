/**
 * Engine-parity for the pure client mirror (Feature 4 T006 — the linchpin, SC-002/SC-001/SC-005).
 *
 * The Garage cannot run the wasm engine (P6), so its live preview + edit-time gating use the pure TS
 * `deriveEffectiveStats` / `validateArmy` (`sim/derive.ts`, `sim/legality.ts`). This test pins them to
 * the **engine's own verdicts** over a representative battery, emitted by
 * `cargo run -p engine --example emit_derive_battery -- tests/fixtures/derive-battery.json`. Native ==
 * wasm is already byte-identical (P6, `scripts/wasm-parity.mjs`), so the native fixture is exactly
 * what the server (wasm) computes — the client preview equals the engine, field for field (P8).
 *
 * Pure (no DB / no wasm). Regenerate the fixture whenever the Rust derivation/validation changes.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { armyPowerRating, deriveEffectiveStats, type DeriveResult } from '@/sim/derive';
import { validateArmy, type ValidationError } from '@/sim/legality';
import type { Army, MachineInstance } from '@/sim/model';
import type { Ruleset } from '@/sim/ruleset';

interface DeriveCase {
  label: string;
  instance: MachineInstance;
  expected: DeriveResult;
}
type ValidateExpectation =
  | { status: 'ok'; powerRating: number }
  | { status: 'invalid'; errors: ValidationError[] };
interface ValidateCase {
  label: string;
  army: Army;
  expected: ValidateExpectation;
}
interface Fixture {
  ruleset: Ruleset;
  deriveCases: DeriveCase[];
  validateCases: ValidateCase[];
}

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'derive-battery.json'), 'utf8'),
) as Fixture;
const ruleset = fixture.ruleset;

describe('deriveEffectiveStats == engine (SC-002)', () => {
  it('covers a broad battery (all 21 variants + weapon/defense/utility variety + error branches)', () => {
    expect(fixture.deriveCases.length).toBeGreaterThanOrEqual(30);
  });

  for (const c of fixture.deriveCases) {
    it(`derive ${c.label}`, () => {
      expect(deriveEffectiveStats(c.instance, ruleset)).toEqual(c.expected);
    });
  }
});

describe('validateArmy == engine (V1–V8, SC-001/SC-005)', () => {
  for (const c of fixture.validateCases) {
    it(`validate ${c.label}`, () => {
      const errors = validateArmy(c.army, ruleset);
      if (c.expected.status === 'ok') {
        expect(errors).toEqual([]);
        // The engine returns the same army-level matchmaking power rating (whole units).
        expect(armyPowerRating(c.army, ruleset)).toBe(c.expected.powerRating);
      } else {
        // Every violation, in the engine's exact push order, with identical reason strings.
        expect(errors).toEqual(c.expected.errors);
      }
    });
  }
});
