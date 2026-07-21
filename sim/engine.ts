/**
 * The server-only WASM engine loader (Feature 1). Shared by the resolve host (`index.ts`) and the
 * army validator (`validate.ts`).
 *
 * **Server only.** The wasm module is `serverExternalPackages` in `next.config.ts`; the client never
 * imports it — it only consumes the emitted replay via {@link ReplayReader}.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';

/** The engine's JSON byte-boundary exports (each takes/returns UTF-8 JSON bytes). */
export interface WasmEngine {
  /** Resolve a `BattleInput` → wire replay (or an error response). */
  resolve: (input: Uint8Array) => Uint8Array;
  /** Run V1–V8 legality on `{ army, ruleset }` → an `ok` / `invalid` / `parseError` response. */
  validate: (input: Uint8Array) => Uint8Array;
  /** The engine's canonical default balance table as JSON. */
  default_ruleset: () => Uint8Array;
  /** The canonical hash of a JSON `Ruleset` — the exact hash the engine stamps on a replay (empty on parse error). */
  hash_ruleset: (input: Uint8Array) => Uint8Array;
}

let engine: WasmEngine | null = null;

/**
 * Load the wasm module lazily via a genuine Node `require` (cached). We go through `createRequire`
 * with a *computed, absolute* path so the bundler (Turbopack) can't statically bundle the wasm-pack
 * glue — if it does, it rewrites the glue's `__dirname` and the runtime `readFileSync` of
 * `engine_bg.wasm` resolves to a bogus path.
 *
 * We require the **real `packages/engine-wasm` directory** (not the `@wfc/engine-wasm` node_modules
 * name, a workspace symlink to an absolute local path that doesn't exist on Vercel). The real dir is
 * traced into the function bundle via `outputFileTracingIncludes` (see `next.config.ts`), landing at
 * `<cwd>/packages/engine-wasm/` where the glue's `__dirname` and its sibling `.wasm` line up.
 */
export function loadEngine(): WasmEngine {
  if (!engine) {
    const nodeRequire = createRequire(join(process.cwd(), 'noop.cjs'));
    const enginePath = join(process.cwd(), 'packages', 'engine-wasm', 'engine.js');
    engine = nodeRequire(enginePath) as WasmEngine;
  }
  return engine;
}
