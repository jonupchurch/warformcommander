// Native == WASM parity check (T017, P6/SC-001).
//
// Feeds the golden-battery inputs emitted by `cargo run -p engine --example emit_battery -- <dir>`
// through the compiled wasm build and asserts the wasm `resolve` output is **byte-identical** to the
// native `resolve_bytes` output. Byte-equality is the strongest form of the determinism contract.
//
// Usage: node scripts/wasm-parity.mjs <battery-dir>

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/wasm-parity.mjs <battery-dir>');
  process.exit(2);
}

// The wasm-pack nodejs package is CommonJS.
const require = createRequire(import.meta.url);
const engine = require('../packages/engine-wasm/engine.js');

const inputs = readdirSync(dir).filter((f) => f.startsWith('in_') && f.endsWith('.json'));
if (inputs.length === 0) {
  console.error(`no in_*.json fixtures in ${dir} — run the emit_battery example first`);
  process.exit(2);
}

let failures = 0;
for (const inName of inputs.sort()) {
  const seed = inName.slice('in_'.length, -'.json'.length);
  const inBytes = readFileSync(join(dir, inName));
  const nativeOut = readFileSync(join(dir, `native_${seed}.json`));

  const wasmOut = Buffer.from(engine.resolve(new Uint8Array(inBytes)));

  if (Buffer.compare(nativeOut, wasmOut) === 0) {
    console.log(`  seed ${seed}: OK (${wasmOut.length} bytes, byte-identical)`);
  } else {
    failures++;
    console.error(
      `  seed ${seed}: MISMATCH — native ${nativeOut.length}B vs wasm ${wasmOut.length}B`,
    );
    // Surface the first differing byte to aid debugging.
    const n = Math.min(nativeOut.length, wasmOut.length);
    for (let i = 0; i < n; i++) {
      if (nativeOut[i] !== wasmOut[i]) {
        console.error(`    first diff at byte ${i}: native=${nativeOut[i]} wasm=${wasmOut[i]}`);
        break;
      }
    }
  }
}

if (failures > 0) {
  console.error(`\nnative != wasm: ${failures} mismatch(es) — the P6 determinism contract is broken`);
  process.exit(1);
}
console.log(`\nnative == wasm: all ${inputs.length} battery outputs are byte-identical (P6/SC-001).`);
