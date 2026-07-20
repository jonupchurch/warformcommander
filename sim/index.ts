/**
 * Server-side sim host (Feature 1, T027). Marshals a `BattleInput` to bytes, calls the WASM engine
 * (`@wfc/engine-wasm`, the authoritative deterministic core — constitution P6), and returns a
 * {@link ReplayReader} over the compact wire replay.
 *
 * **Server only.** The wasm module is `serverExternalPackages` in `next.config.ts`; the client never
 * imports it — it only consumes the emitted replay via {@link ReplayReader} (see `replay-reader.ts`).
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';

import { parseReplay, ReplayReader, type WireReplay } from './replay-reader';

/**
 * The wasm module is loaded **lazily via a genuine Node `require`** (cached). We go through
 * `createRequire` with a *computed, absolute* path so the bundler (Turbopack) can't statically
 * bundle the wasm-pack glue — if it does, it rewrites the glue's `__dirname` and the runtime
 * `readFileSync` of `engine_bg.wasm` resolves to a bogus path.
 *
 * We require the **real `packages/engine-wasm` directory** (not the `@wfc/engine-wasm` node_modules
 * name) because that name is a workspace *symlink* to an absolute local path — it doesn't exist on
 * Vercel, so a bare `require('@wfc/engine-wasm')` there fails with MODULE_NOT_FOUND. The real dir is
 * traced into the function bundle via `outputFileTracingIncludes` (see `next.config.ts`), landing at
 * `<cwd>/packages/engine-wasm/` where the glue's `__dirname` and its sibling `.wasm` line up.
 *
 * Lazy so importing this module (e.g. Next collecting route metadata at build time) never triggers
 * the wasm's eager load.
 */
type WasmEngine = { resolve: (input: Uint8Array) => Uint8Array };
let engine: WasmEngine | null = null;
function loadEngine(): WasmEngine {
  if (!engine) {
    // Resolve against the process CWD (the deployment root = /var/task on Vercel, the repo root
    // locally). Computed absolute path → opaque to the bundler, real runtime require either way.
    const nodeRequire = createRequire(join(process.cwd(), 'noop.cjs'));
    const enginePath = join(process.cwd(), 'packages', 'engine-wasm', 'engine.js');
    engine = nodeRequire(enginePath) as WasmEngine;
  }
  return engine;
}

/**
 * The engine input (mirror of the Rust `BattleInput`). `armies`/`ruleset` are the large typed
 * structures the Garage (Feature 4) owns; they are opaque here (the engine validates them, and
 * re-validates server-side before simulating — never trust client state). `seed` is a JS-safe
 * integer (≤ 2^53; the server mints it).
 */
export interface BattleInput {
  armies: [unknown, unknown];
  ruleset: unknown;
  seed: number;
  matchConfig: {
    adaptation: 'Locked' | 'Free';
    defenderSide: 'A' | 'B';
    bestOf: number;
  };
}

/** The engine refused to resolve (validation failure or a structural/parse error). */
export class EngineError extends Error {
  constructor(
    public readonly status: string,
    public readonly response: unknown,
  ) {
    super(`engine resolve failed: ${status}`);
    this.name = 'EngineError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Resolve a battle server-side and return a seekable {@link ReplayReader}. Throws {@link EngineError}
 * if the engine rejected the input (`error` = validation/derivation, `parseError` = malformed input).
 */
export async function resolveBattle(input: BattleInput): Promise<ReplayReader> {
  const { resolve } = loadEngine();
  const out = resolve(encoder.encode(JSON.stringify(input)));
  const response = JSON.parse(decoder.decode(out)) as { status?: string } & WireReplay;
  if (response.status !== 'ok') {
    throw new EngineError(response.status ?? 'unknown', response);
  }
  // The "ok" response IS a WireReplay (with an extra `status` field the reader ignores).
  return parseReplay(response);
}

/** Resolve and return the raw wire replay object (for persistence to the `replays` jsonb column). */
export async function resolveBattleRaw(input: BattleInput): Promise<WireReplay> {
  return (await resolveBattle(input)).replay;
}

export { ReplayReader, parseReplay } from './replay-reader';
export type { WireReplay } from './replay-reader';
