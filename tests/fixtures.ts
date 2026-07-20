/**
 * Engine-valid army fixtures for the persistence tests — real armies emitted by the Rust engine's
 * golden battery (so they pass the shared `validate()` exactly as production would). Each getter
 * returns a fresh deep clone so a test can mutate it into an illegal variant without side effects.
 */

import type { SquadConfig } from "@/db/types";
import squadA from "./fixtures/valid-squad.json";
import squadB from "./fixtures/valid-squad-b.json";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A legal 5-unit army (battery attacker). */
export function validSquad(): SquadConfig {
  return clone(squadA) as SquadConfig;
}

/** A second, distinct legal army (battery defender) — for multi-squad / defense tests. */
export function validSquadB(): SquadConfig {
  return clone(squadB) as SquadConfig;
}
