/**
 * The jsonb payload types the Drizzle schema binds to via `.$type<T>()` — re-exported from the
 * Feature-1 TS mirror (`sim/model.ts`) and the replay reader (`sim/replay-reader.ts`).
 *
 * **Types only.** Importing here never pulls the WASM engine into a bundle (constitution P6 — the
 * schema knows the *shape* of a squad/replay, never how to simulate one). The DB stores these as
 * typed `jsonb`; the runtime trust boundary is `sim/validate.ts` (P8).
 */

export type { SquadConfig, PresetConfig, Ruleset } from "../sim/model";

/** A stored replay is the Feature-1 compact wire replay (positional/columnar, random-access). */
export type { WireReplay as Replay } from "../sim/replay-reader";
