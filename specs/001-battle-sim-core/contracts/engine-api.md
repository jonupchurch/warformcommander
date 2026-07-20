# Contract: Sim-Core Engine API

**Feature**: `001-battle-sim-core` | **Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

The engine's public surface. It is a **single self-contained module** with **no
dependency on UI, rendering, storage, or network** (**FR-023**, constitution P6/P8),
so the *identical* core runs in three host contexts:

- **Server** (authoritative ranked resolution) — via **WASM** in a Next.js Node
  Route Handler on Vercel.
- **Balancer** (Feature 2) — the same crate compiled **natively** (`cargo`), run
  thousands of times.
- **Client** — **never runs the engine**; it only consumes the emitted **Replay**
  (Feature 5 playback).

## Core function

```
resolve(input: BattleInput) -> BattleOutput
```

Pure and total: same input → byte-identical output (**SC-001**), no wall-clock reads,
no ambient randomness, no I/O, no panics on validated input.

### `BattleInput`

| Field | Type | Notes |
|---|---|---|
| `armies` | `[Army, Army]` | Two fully-specified 5-unit squads with placements (data-model → Squad/Army). Index 0 = attacker, 1 = defender (defender = tie-break winner). |
| `ruleset` | `Ruleset` | The balance table (data input; engine bakes in nothing — FR-007). |
| `seed` | `u64` | Single seed driving all randomness (FR-011). |
| `matchConfig` | `MatchConfig` | `{ adaptation: Locked \| Free, defenderSide, bestOf: 3 }`. |

### `BattleOutput`

| Field | Type | Notes |
|---|---|---|
| `replay` | `Replay` | The random-access tick stream (see [replay-format.md](./replay-format.md)). |
| `result` | `MatchResult` | Summary, reconcilable from `replay` (SC-002). |

> `Replay` embeds `result` too (data-model), so persistence can store one artifact;
> the split return is an ergonomic convenience for callers that only want the summary.

## Validation entry point (trust boundary — FR-009, Principle II)

```
validate(army: Army, ruleset: Ruleset) -> Result<(), ValidationError[]>
```

- Called by the **server** on any submitted army **before** `resolve` (never trust
  client state — check server-side), and by the **Garage** UI to reject illegal
  builds at edit time (same function → same verdicts, P8).
- `resolve` **also** validates internally and returns a typed error rather than
  simulating an illegal battle; it never silently "fixes" input.
- `ValidationError` carries a machine-readable `code` (V1–V8, data-model) + a
  human reason.

## Determinism guarantees (P6, SC-001)

1. All randomness flows through `seed` → a single named PRNG (research.md).
2. All math is **integer/fixed-point** — no floats (research.md).
3. No `HashMap` iteration in resolution paths; ordered containers only.
4. No `std::time`, `Instant`, thread-rng, or parallelism *inside* a single
   `resolve` (the balancer parallelizes *across* matches, never within one).
5. Output is byte-identical across the **native** and **wasm32** targets — asserted
   in CI (see [quickstart.md](../quickstart.md)).

## Balancer hook (FR-024, SC-006)

The balancer needs only the public `resolve` — it runs a matchup N times with N
seeds and reads win rates from the returned `MatchResult`s. The engine itself does
**no** balancing (separation of concerns): it exposes outcome, not judgment.

```
// Balancer usage (Feature 2), native:
for seed in seeds { outcomes.push(resolve(BattleInput { armies, ruleset, seed, .. }).result) }
win_rate = outcomes.count(|r| r.winner == Side::A) / N
```

Throughput target: a full Bo3 resolves fast enough that ≥10,000 matchup resolutions
finish in **minutes, not hours** (SC-006).

## JS ↔ WASM boundary (server host)

The Next.js server calls the WASM build. Marshaling approach (thin boundary, compact
replay) is pinned in [research.md](./research.md). Sketch:

```
// server-side (Node runtime, Vercel Fluid Compute)
import { resolveBattle } from '@/sim';        // wraps the wasm-bindgen module
const output = await resolveBattle(battleInput); // input marshaled in; Replay bytes out
```

The client import path never pulls the WASM module — only the **Replay type** and a
pure TS playback reader (enforced so the engine can't leak to the client, P6).

## Non-goals of this contract

- Matchmaking, persistence, accounts, rendering — all downstream features; the engine
  takes armies as data and returns a replay as data, nothing more.
- Manual override (parked for v1) — the tick model must not *preclude* it, but no API
  surface for it now (spec Assumptions).
