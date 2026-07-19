# Quickstart & Validation: Battle Sim Core

**Feature**: `001-battle-sim-core` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

How to build, run, and **prove** the sim core does what the spec's Success Criteria
require. This is a validation/run guide — the concrete task list is
[tasks.md](./tasks.md) (created by `/speckit-tasks`); implementation detail lives in
the code.

## Prerequisites

- **Rust** stable toolchain (`rustup`) + the `wasm32-unknown-unknown` target:
  `rustup target add wasm32-unknown-unknown`
- **wasm-pack**: `cargo install wasm-pack`
- **Node** (repo's version) + npm — already set up for the Next.js app.

## Build

```bash
# Native build — the balancer + the fast test/determinism path
cargo build --release -p engine
cargo build --release -p balancer

# WASM build — the server-side artifact the Next.js app consumes
wasm-pack build crates/engine --target nodejs --out-dir packages/engine-wasm --release
```

> **Vercel CI note (research.md):** Vercel's build image has no guaranteed Rust
> toolchain, so the `packages/engine-wasm/` artifact is **prebuilt in our own CI and
> committed** — Vercel runs only `next build`. This also pins a byte-identical wasm
> across deploys (P6).

## Run the golden path

```bash
# Resolve one Bo3 from two fixed squads + a seed, print the MatchResult
cargo run --release -p engine --example resolve_demo -- --seed 42
```

Expected: a winner, a win condition (Conquest well under the 1000-tick cap), per-machine
fates, and a serialized replay written to `target/replay.json` that the TS reader can load.

## The validation suite (maps 1:1 to Success Criteria)

Each Success Criterion is an executable check. "Done" = all green.

### SC-001 — Determinism (NON-NEGOTIABLE, P6)

```bash
cargo test -p engine determinism::
```

- **Same seed → identical output, 1,000×**: resolve a fixed matchup 1,000 times; assert
  every serialized replay hashes identically.
- **Cross-target parity**: resolve the same fixed matchup under **native** and under
  **wasm32** (via `wasm-pack test --node`); assert the two replay hashes match. This is
  the load-bearing test that the server (wasm) and balancer (native) never diverge.
- **Sensitivity**: flip one input (a dial, a placement, the seed) → assert the output
  hash changes.

### SC-002 — Reconstructability

```bash
npm run test -- replay-reader        # TS side
cargo test -p engine replay::reconstruct
```

- Serialize a replay, deserialize in a separate context (TS reader), assert the
  reconstructed per-tick `{hull, shield, zone, alive}` for every unit at every tick
  equals the engine's computed state.
- Assert `Σ per-hit damage events == result damage totals` per side.
- Assert **O(1) seek**: `snapshots[tick]` returns the frame without touching prior ticks.

### SC-003 — Counter-web integrity

```bash
cargo test -p engine counterweb::
```

Curated matchups from [../../reference/warformcommander-firstpass-stats.md](../../reference/warformcommander-firstpass-stats.md)
§5, each asserting the designed counter wins a **strong majority** over N seeds:
- Kinetic → Shields (folds shields ~2× faster than armor).
- Energy → Armor (~30% faster kill than Kinetic vs the same heavy target).
- Rocket-artillery → all-air (AA hard-counter); adding AA flips an all-air-favored board.
- Artillery → stacked backline (splash on clusters).
- Explosive splash → clustered zone (correlated damage).
- **No single type/variant/loadout wins across all matchups it's tested in.**

### SC-004 — Win-condition correctness

```bash
cargo test -p engine winconditions::
```

Drive games to each ending and assert winner + reward tier: a wipe (**Conquest**, full),
a timeout with a clear damage lead (**Time**, lesser), a constructed **exact-damage tie →
defender wins**, and a **Bo3** (first to two games).

### SC-005 — Validation coverage (trust boundary, Principle II)

```bash
cargo test -p engine validation::
```

Assert every enumerated illegal config (V1–V8 in [data-model.md](./data-model.md)) is
rejected **with a reason before any simulation**: bad squad size, zone-cap breach,
mount-illegal weapon/defense, duplicate utility, excess/ungated Plan-B, ungated dial
option, impossible movement order.

### SC-006 — Balancer throughput

```bash
cargo run --release -p balancer -- --matchup demo --runs 10000
```

Assert ≥10,000 Bo3 resolutions complete in **minutes, not hours** (native, single-thread
per match; the balancer may parallelize *across* matches — never within one).

### SC-007 — Adaptation-lock enforcement

```bash
cargo test -p engine match_modes::
```

- **Locked (ranked)**: army + placement provably identical across all three games.
- **Free (practice/balancer)**: per-game input changes are honored.

## Server smoke test (WASM in Next.js on Vercel Node)

```bash
# Local: hit the route that instantiates the wasm engine and returns a replay
npm run dev
curl -X POST localhost:3000/api/resolve --data-binary @fixtures/battle-input.json
```

Assert the Node route (`runtime = 'nodejs'`, **not** edge) loads the committed
`engine_bg.wasm` (via `serverExternalPackages` + `outputFileTracingIncludes`, research.md)
and returns the same replay the native build produces for that input (ties back to SC-001
cross-target parity).

## What "done" looks like for this feature

All seven SC checks green on **both** native and wasm targets in CI; the engine crate has
zero UI/storage/network dependencies (FR-023); the TS replay reader plays back and scrubs a
real replay with O(1) seek; and the shared data-model types (Rust + TS mirror) are the single
source the Garage and balancer will import.
