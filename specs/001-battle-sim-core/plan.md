# Implementation Plan: Battle Simulation Core + Game Data Model

**Branch**: `001-battle-sim-core` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-battle-sim-core/spec.md`

## Summary

Build the **deterministic, seeded, server-authoritative tick simulation** at the heart of
Warform Commander and the **typed game-data schema** it operates on — the foundation every
other feature imports (constitution P6, P8). The engine is a pure
`resolve(armies, ruleset, seed) → Replay` written in **Rust**, compiled **both** to
**WASM** (server-authoritative resolution inside a Next.js Node route on Vercel) and
**natively** (the offline Monte-Carlo balancer, Feature 2). The client **never** runs it —
it consumes the emitted **random-access JSON replay** for playback (Feature 5).

The two hard problems, both resolved in [research.md](./research.md): **(1) byte-identical
cross-platform determinism** — solved by integer/fixed-point math (no floats), a
version-pinned value-stable PRNG (`rand_pcg::Pcg64`), strict ordering rules, and a
committed golden-hash test run on native + wasm in CI; and **(2) a seekable replay** —
solved by full per-tick snapshots (not deltas) as tick-indexed positional-array JSON, stored
as Postgres `jsonb`, so the scrubber seeks any tick by O(1) indexing and never re-simulates
(the bug that broke the previous game's viewer).

## Technical Context

**Language/Version**: **Rust** (stable, latest; `wasm32-unknown-unknown` target) for the sim
core + balancer; **TypeScript** (Next.js 16 app) for the WASM host wrapper + the pure replay
reader. Core crate is `no_std`-friendly where practical.

**Primary Dependencies**: `serde` + `serde_json` (replay (de)serialization); `rand_pcg`
(pinned, value-stable PRNG); `wasm-bindgen` + `wasm-pack` (WASM build/glue). Dev/test:
`proptest` (property tests), `blake3` or `sha2` (golden-hash), `wasm-bindgen-test`
(wasm-side tests). **No float / no `HashMap`-in-core / no ambient-time deps.** Fixed-point is
a hand-rolled scaled-`i64` newtype (no external fixed-point crate needed; `fixed` is the
documented fallback).

**Storage**: N/A **to the engine itself** (FR-023 — zero storage/network/UI deps). The replay
it emits is stored downstream (Feature 7) as Postgres **`jsonb`** via Neon + Drizzle
(**postgres-js** driver) + scalar provenance columns. Contract captured in
[contracts/replay-format.md](./contracts/replay-format.md).

**Testing**: `cargo test` (native, x86-64 + ARM in CI) + `wasm-pack test --node` (wasm) for
the determinism golden-hash, counter-web, win-condition, and validation suites; `proptest`
for the run-twice invariant; a TS test for the replay reader (reconstructability, O(1) seek).

**Target Platform**: **Two host contexts** — Vercel Fluid Compute **Node.js** runtime (WASM,
authoritative) and **native** desktop/CI (balancer). **Never the browser** for the engine;
the browser gets only the replay + a pure TS reader.

**Project Type**: A **Rust simulation library** (+ a thin native balancer binary consumed by
Feature 2) living in a workspace **alongside** the existing Next.js app, with a generated,
committed WASM package the app imports. Not a standalone web service.

**Performance Goals**: A full Bo3 resolves fast enough that **≥10,000 matchup resolutions
finish in minutes, not hours** natively (SC-006) — the throughput the Monte-Carlo balancer
(P4) needs. Server-side single-match WASM resolution is well within a normal request budget
(battles are ≤1000 ticks × 10 units).

**Constraints**: **Determinism is absolute** (SC-001) — byte-identical output for fixed
seed+inputs, 1000× and across native/wasm. **No floats** in the core. **Single-threaded**
`resolve()` (balancer parallelizes across matches only). Replay must be **O(1)-seekable** from
TS with zero re-simulation (SC-002). Engine has **zero UI/storage/network dependencies**
(FR-023).

**Scale/Scope**: This feature = the engine + data model + the representative content subset
needed to exercise it and the counter-web tests (spec Assumptions). It is **not** exhaustive
data entry of all 21 variants / every module (a follow-on data task) and **not** numeric
balance tuning (the balancer's job, P4). 7 types × 3 variants schema; damage/reach/behavior
pipelines; Bo3 resolution; replay emission.

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 —
Product Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction** | ✅ | The data model makes every weapon/defense a mount-gated **trade-off** with deltas, never a strict upgrade (FR-003, data-model EquipmentModule). Power Rating is matchmaking-only, never combat (FR-006). This feature builds the *structure* that enforces P1; the caps/economy that also serve it are downstream. |
| **P2 Planning over twitch** | ✅ | The engine takes a fully pre-configured army and auto-resolves — **no real-time input** decides a battle. Skill lives in the pre-battle dials/loadout/placement the engine reads. |
| **P3 Depth from configuration** | ✅ | Depth = 7 types × 3 variants × equipment × 4 dials × ≤2 Plan-B × placement, all **orthogonal data axes** (data-model), not roster count. |
| **P4 Fairness is verified** | ✅ | The engine exposes outcome distributions via repeated seeded runs (FR-024) so the Monte-Carlo balancer (Feature 2) can *prove* fairness; the counter-web suite (SC-003) is the first verification. |
| **P5 Content from players/puzzles** | ✅ (enabling) | Deterministic resolution of arbitrary player armies is what makes defense-snapshot async PvP (the renewable content) possible downstream. |
| **P6 Deterministic, seeded, server-authoritative (NON-NEG)** | ✅ | **The core deliverable.** Seeded PRNG + fixed-point + fixed-tick + single-threaded → byte-identical (SC-001). WASM runs server-side authoritatively; the client only replays and **cannot fabricate outcomes** (engine never ships to the browser). |
| **P7 Both platforms first-class** | ✅ (N/A here) | The engine is headless; responsive UI is a downstream concern. The replay format carries no layout assumptions, so both orientations render the same stream. |
| **P8 Data-driven content** | ✅ | The **ruleset is a data input** (FR-007) — the engine hard-codes no numbers; sim, Garage, and balancer read one typed source (data-model Tier 1/2). |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Spec has acceptance scenarios + explicit non-goals; the deep-dive locked the ambiguous calls (Revision Notes). Zero open `NEEDS CLARIFICATION`. |
| **II Validated trust boundaries** | ✅ | `validate()` runs server-side before any `resolve()`; the server never trusts client-submitted armies (FR-009, contract). Same fn powers Garage-side rejection. |
| **III Match conventions** | ✅ | Greenfield core — conventions established deliberately (Rust workspace idioms; the existing Next.js app conventions for the TS host). Deviation from a pure-npm repo (adding Rust) is named + justified (Complexity Tracking). |
| **IV Scope discipline (NON-NEG)** | ✅ | Representative content subset only; balancer, persistence, rendering, matchmaking all explicitly out (spec Assumptions + contract non-goals). Manual override parked. |
| **V Verify before done** | ✅ | Seven SC checks are executable ([quickstart.md](./quickstart.md)); "done" = all green on both targets. |
| **VI Narrate** | ✅ | research.md records every decision with rationale + rejected alternatives. |
| **VII Plan whole set first** | ✅ | This planning marathon plans all 12 features before implementing any (foundation-first, with the full set following). |
| **VIII Test at right level** | ✅ | Unit (damage pipeline, validation, win conditions), property (determinism invariant), cross-target integration (golden hash), TS (replay reader). |
| **IX Commit atomically, branch per feature** | ✅ | On `001-battle-sim-core`; planning artifacts commit atomically; implementation follows on this branch. |

**Gate result: PASS.** One justified deviation (introducing Rust/WASM into an npm repo) is
tracked below. No P1/P6 concerns.

## Project Structure

### Documentation (this feature)

```text
specs/001-battle-sim-core/
├── plan.md              # this file
├── research.md          # Phase 0 — all unknowns resolved
├── data-model.md        # Phase 1 — the typed game-data schema
├── quickstart.md        # Phase 1 — build/run/validation guide (maps to SC-001..007)
├── contracts/
│   ├── engine-api.md    # resolve()/validate() public surface + determinism guarantees
│   └── replay-format.md # the serializable random-access replay wire schema
└── tasks.md             # Phase 2 — created by /speckit-tasks (next step)
```

### Source Code (repository root)

The existing Next.js app lives at the **repo root** (`app/`, `db/`, `next.config.ts`, …). This
feature adds a **Rust workspace alongside it** plus a generated, committed WASM package the app
imports — no restructuring of the existing app.

```text
d:/Codelib/warformcommander/
├── crates/                      # NEW — Rust workspace
│   ├── engine/                  # the pure sim core (the P6 deliverable)
│   │   ├── Cargo.toml           # [lib] crate-type = ["cdylib", "rlib"]
│   │   ├── src/
│   │   │   ├── lib.rs           # resolve() + validate() public API (wasm-bindgen exports)
│   │   │   ├── fixed.rs         # scaled-i64 newtype + mul_bp (basis-point) helpers
│   │   │   ├── rng.rs           # pinned Pcg64 wrapper + integer draws
│   │   │   ├── model/           # typed game-data schema (Tier 1/2 of data-model)
│   │   │   │   ├── types.rs     # MachineType, ChassisVariant, EquipmentModule, dials, Preset
│   │   │   │   ├── army.rs      # MachineInstance, Squad/Army, placement, effective-stat derivation
│   │   │   │   └── ruleset.rs   # Ruleset (balance table) + GlobalConstants + DamageMatrix
│   │   │   ├── validate.rs      # V1–V8 validation (trust boundary)
│   │   │   ├── sim/             # the tick loop
│   │   │   │   ├── tick.rs      # fixed-tick advance, cooldowns/cadence
│   │   │   │   ├── target.rs    # row-based reach + Target Row/Rule dial resolution
│   │   │   │   ├── damage.rs    # per-hit pipeline (acc→crit→shields→armor→splash)
│   │   │   │   ├── behavior.rs  # Energy/Movement/Stance + Plan-B latch/precedence
│   │   │   │   └── outcome.rs   # win conditions, Bo3, MatchResult
│   │   │   └── replay/          # Tier 3 output
│   │   │       ├── build.rs     # per-tick snapshot + event capture
│   │   │       └── format.rs    # JSON positional-array serialization + formatVersion
│   │   ├── examples/resolve_demo.rs
│   │   └── tests/               # determinism (golden hash), counter-web, win-cond, validation
│   └── balancer/                # NEW — native Monte-Carlo bin (Feature 2 owns logic; stub here)
│       └── Cargo.toml
├── packages/
│   └── engine-wasm/             # NEW — committed wasm-pack output (engine.js + engine_bg.wasm + package.json)
├── src/sim/                     # NEW (TS) — host wrapper + pure replay reader
│   ├── index.ts                 # resolveBattle() — marshals input, calls @wfc/engine-wasm
│   └── replay-reader.ts         # pure TS: parse + O(1) tick indexing (no engine, no re-sim)
├── app/api/resolve/route.ts     # NEW — Node-runtime handler that instantiates the WASM engine
├── Cargo.toml                   # NEW — [workspace] members = crates/*
├── next.config.ts               # EDIT — serverExternalPackages + outputFileTracingIncludes
└── (existing app: app/, db/, drizzle.config.ts, package.json, …)
```

**Structure Decision**: A **Cargo workspace under `crates/`** (engine + balancer) with a
**committed `packages/engine-wasm/`** artifact, plus a **TS host layer** under `src/sim/` and a
single Node **route handler**. The engine crate is the sole owner of the game-data types and the
`resolve`/`validate` surface; the balancer links it natively; the app imports only the WASM
package (server) and the pure reader (client). This keeps the P6 core one self-contained module
(FR-023) while fitting the existing repo-root Next.js app without restructuring it.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Introduce Rust + WASM into an otherwise all-TypeScript/npm repo** (a new toolchain, a Cargo workspace, a CI wasm-build step) | Cross-platform **byte-identical determinism** (P6, SC-001) and **balancer throughput** (SC-006) are the feature's reason to exist. Rust gives integer/fixed-point control and native speed; the *same* core compiles to WASM for authoritative server resolution and to native for the balancer — one engine, no reimplementation drift. | **A TypeScript engine** was rejected: JS `number` is IEEE-754 double (the exact float-determinism hazard research A1 rules out), there's no clean native+wasm dual target, and Monte-Carlo throughput would be far worse — it would put P6 and SC-006 at risk, which are non-negotiable. A **second, separately-written balancer** was rejected: two engines *will* drift and break determinism/fairness verification (P4/P6). |

*No other deviations. P1 and P6 (the never-waived invariants) are fully satisfied, not traded.*

## Post-Design Constitution Re-check

After Phase 1 (data-model, contracts, quickstart): **still PASS.**
- The data model keeps content/ruleset/runtime tiers separate → P8 holds and the ruleset stays
  a live-editable input (P1/P8, Feature 12-ready).
- The engine-api contract keeps the core dependency-free (FR-023) and server-authoritative;
  the replay-format contract keeps the client a pure player (P6) with O(1) seek (SC-002).
- No new complexity surfaced during design; the single tracked deviation is unchanged.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (all unknowns resolved)
- [x] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md),
  [contracts/](./contracts/), [quickstart.md](./quickstart.md)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
