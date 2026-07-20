# `engine` — Warform Commander deterministic battle-simulation core

One Rust crate, compiled two ways: **WASM** (server-authoritative match resolution on
Vercel) and **native** (the offline Monte-Carlo balancer + tests). The client never
runs it — it only replays the emitted tick stream.

```
resolve(BattleInput) -> BattleOutput      // pure, total, byte-identical (SC-001)
validate(Army, Ruleset) -> Result<(), Vec<ValidationError>>   // the V1–V8 trust boundary
resolve_bytes(&[u8]) -> Vec<u8>            // the JSON JS↔WASM boundary → compact wire replay
```

## Determinism contract (constitution P6)

Output is **byte-identical across native and wasm32**. The rules the whole crate holds to:

- **No floats anywhere.** Quantities are `Fixed` milli-units; fractions are basis points
  (`Bp`). See [`fixed`](src/fixed.rs).
- **One value-stable PRNG** (`rand_pcg::Pcg64`, version-pinned), seeded from the match
  seed; integer-only draws. See [`rng`](src/rng.rs).
- **Ordered iteration only** (`BTreeMap`/`Vec`, never `HashMap`), single-threaded resolve,
  a fixed actor order, a fixed per-shot RNG draw order, and a fixed damage-pipeline order.

The contract is enforced by the **golden-hash** suite: a fixed battery of battles is
pinned to exact BLAKE3 digests in [`tests/golden/manifest.json`](tests/golden/manifest.json).
A mismatch means the output shifted — investigate; re-bless (`BLESS_GOLDEN=1`) only for an
intended change.

## Layout

| Module | Role |
|---|---|
| `fixed`, `rng` | the P6 primitives (fixed-point, seeded PRNG) |
| `model::types` | Tier 1 content (machine types, variants, equipment, dials, Plan-B) |
| `model::ruleset` | Tier 2 the balance table (every tunable number; admin-editable) |
| `model::army` | configured instances + the shared effective-stat derivation |
| `validate` | the V1–V8 trust boundary |
| `sim` | the tick loop → targeting → damage → behavior → outcome |
| `replay` | the in-memory tick stream + the compact `format::WireReplay` |
| `content` | `seed_ruleset()` + `stock_instance()` first-pass fixtures |

Design + task order live in [`specs/001-battle-sim-core/`](../../specs/001-battle-sim-core/)
(plan, data-model, contracts, tasks). The wire contract is
[`contracts/replay-format.md`](../../specs/001-battle-sim-core/contracts/replay-format.md);
the pure TS reader that consumes it is [`sim/replay-reader.ts`](../../sim/replay-reader.ts).

## Commands

```bash
cargo test -p engine                 # unit + integration + golden suites
cargo clippy --all-targets -- -D warnings
cargo fmt --check
cargo run -p engine --example resolve_demo    # the quickstart golden-path runner
cargo run -p balancer --release -- 10000      # SC-006 throughput smoke
```
