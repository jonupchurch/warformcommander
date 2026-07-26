/**
 * Engine-valid army fixtures for the persistence tests — real armies emitted by the Rust engine's
 * golden battery (so they pass the shared `validate()` exactly as production would). Each getter
 * returns a fresh deep clone so a test can mutate it into an illegal variant without side effects.
 */

import type { SquadConfig, PresetConfig } from "@/db/types";
import type { WireReplay } from "@/sim/replay-reader";
import { resolveBattleRaw } from "@/sim";
import { loadDefaultRuleset } from "@/sim/validate";
import squadA from "./fixtures/valid-squad.json";
import squadB from "./fixtures/valid-squad-b.json";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A legal 5-unit army (battery attacker). */
export function validSquad(): SquadConfig {
  return clone(squadA) as SquadConfig;
}

/** A second, distinct legal army (battery defender) — for multi-squad / defense tests. Its original
 * heli was swapped for a second Light tank so the army also satisfies the construction-layer deck caps
 * (`sim/deck-rules.ts`: ≤1 backline-indirect weapon — the Longbow); it stays engine-valid and A still
 * beats it at seed 1 (the winner the standings/match tests assume). */
export function validSquadB(): SquadConfig {
  return clone(squadB) as SquadConfig;
}

/** A per-machine-type preset config (loadout + dials + planB), lifted from a real machine. */
export function validPreset(): PresetConfig {
  const m = validSquad().machines[0];
  return { loadout: m.loadout, dials: m.dials, planB: m.planB };
}

/**
 * A real engine-resolved wire replay (attacker = squad A, defender = squad B) — the authoritative
 * output `recordMatch` consumes. Seed 1 is the battery seed whose result winner is the attacker (A).
 */
export function battleReplay(seed = 1): Promise<WireReplay> {
  return resolveBattleRaw({
    armies: [validSquad(), validSquadB()],
    ruleset: loadDefaultRuleset(),
    seed,
    matchConfig: { adaptation: "Locked", defenderSide: "B", bestOf: 3 },
  });
}
