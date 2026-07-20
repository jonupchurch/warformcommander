/**
 * Server-side army validation (Feature 7, the trust boundary). Runs the engine's **V1–V8** legality
 * rules on a squad config before it is stored (FR-008 / A4 / SC-003) — the **same** `validate` the
 * engine runs before a battle, reached through the wasm boundary, so the DB rejects exactly the builds
 * the engine would (constitution P8). Never trust client state — every squad write passes through here.
 *
 * **Server only** (loads the wasm engine; see `sim/engine.ts`).
 */

import { loadEngine } from './engine';
import type { SquadConfig, Ruleset } from './model';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A single V1–V8 rejection (mirror of the engine `ValidationError`). `code` is a `ValidationCode`
 *  (e.g. `"SquadSize"`, `"ZoneCap"`, `"MountMismatch"`); `instanceId` is the offending machine, or
 *  `null` for army-level rules (V1/V2). */
export interface ValidationError {
  code: string;
  reason: string;
  instanceId: number | null;
}

export type ValidateResult =
  | { ok: true; powerRating: number }
  | { ok: false; errors: ValidationError[] };

/** Thrown when a squad fails validation and the caller wants an exception (e.g. a write path). */
export class SquadValidationError extends Error {
  constructor(public readonly errors: ValidationError[]) {
    super(`squad failed validation: ${errors.map((e) => `${e.code} (${e.reason})`).join('; ')}`);
    this.name = 'SquadValidationError';
  }
}

let cachedRuleset: Ruleset | null = null;

/**
 * The engine's canonical **default balance table** (cached). The ruleset a squad is validated and
 * simulated against until Feature 12 makes it DB-editable. Emitted by the engine so there is no
 * committed fixture to drift from the Rust content.
 */
export function loadDefaultRuleset(): Ruleset {
  if (!cachedRuleset) {
    const out = loadEngine().default_ruleset();
    cachedRuleset = JSON.parse(decoder.decode(out)) as Ruleset;
  }
  return cachedRuleset;
}

/**
 * Validate a squad config against a ruleset (default = the engine's canonical ruleset), returning
 * `{ ok: true }` or every violation. Throws only on a malformed marshal — an illegal-but-well-formed
 * army is a normal `{ ok: false }` result, not an exception.
 */
export function validateSquad(
  config: SquadConfig,
  ruleset: Ruleset = loadDefaultRuleset(),
): ValidateResult {
  const { validate } = loadEngine();
  const out = validate(encoder.encode(JSON.stringify({ army: config, ruleset })));
  const res = JSON.parse(decoder.decode(out)) as
    | { status: 'ok'; powerRating: number }
    | { status: 'invalid'; errors: ValidationError[] }
    | { status: 'parseError'; message?: string };
  if (res.status === 'ok') return { ok: true, powerRating: res.powerRating };
  if (res.status === 'invalid') return { ok: false, errors: res.errors };
  throw new Error(`validateSquad: malformed input — ${res.message ?? 'parseError'}`);
}

/**
 * Like {@link validateSquad} but throws {@link SquadValidationError} on any violation and returns the
 * derived matchmaking **power rating** on success — the one call a write path needs (validate + derive).
 */
export function assertValidSquad(config: SquadConfig, ruleset?: Ruleset): number {
  const result = ruleset ? validateSquad(config, ruleset) : validateSquad(config);
  if (!result.ok) throw new SquadValidationError(result.errors);
  return result.powerRating;
}
