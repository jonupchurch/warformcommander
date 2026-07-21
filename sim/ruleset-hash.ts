/**
 * `hashRuleset(ruleset)` — Feature 1's **canonical** ruleset hash, reached through the wasm boundary
 * (Feature 12, FR-007). It is the *exact* function the engine stamps on every replay
 * (`Ruleset::hash()` = BLAKE3 over the engine's canonical serialization), so the hash the live-ruleset
 * store records for a saved revision equals the hash a match resolved against that revision stamps —
 * making `matches`/`replays.rulesetHash` joinable back to the `rulesets` row that produced it.
 *
 * The engine re-serializes canonically internally (id-keyed maps become Rust `BTreeMap`s → sorted
 * keys; struct fields emit in declaration order), so the JS key order of the input object is
 * irrelevant — never a bespoke JS hash that could silently drift from the engine's bytes.
 *
 * **Server only** (loads the wasm engine; see `sim/engine.ts`).
 */

import { loadEngine } from "./engine";
import type { Ruleset } from "./ruleset";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The canonical `rulesetHash` for a ruleset. Throws if the engine cannot parse it (a structurally
 * broken ruleset should be rejected by {@link validateRuleset} before ever reaching here).
 */
export function hashRuleset(ruleset: Ruleset): string {
  const out = loadEngine().hash_ruleset(encoder.encode(JSON.stringify(ruleset)));
  const hex = decoder.decode(out);
  if (!hex) {
    throw new Error("hashRuleset: the engine could not parse the ruleset (validate it first)");
  }
  return hex;
}
