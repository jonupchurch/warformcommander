# Implementation Plan: Auto-balancer (Monte-Carlo)

**Branch**: `002-auto-balancer` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-auto-balancer/spec.md`

## Summary

Build the **offline Monte-Carlo auto-balancer** — the tool that makes constitution **P4
(Fairness Is Verified, Not Hoped)** real. It is the native `crates/balancer` binary (the stub
already reserved in [Feature 1's plan](../001-battle-sim-core/plan.md#project-structure) and
[tasks T051](../001-battle-sim-core/tasks.md)) that reuses the **same Feature 1 engine crate**
(`crates/engine`, linked as an `rlib`) — **never a second engine** — and runs its deterministic
`resolve()` thousands of times to read **win-probability distributions**, **flag dominant/
degenerate/underpowered combos**, and **verify the four balance invariants** (family-family band,
~25% power-gap cap, no-dominant-unit, skill-beats-gear). Its output is **balance reports** (JSON +
markdown) the human reads to tune the Ruleset; it **never changes balance itself** (the human
locks the shape) and it **never touches the server, the client, or the database** (the live
Ruleset editor and news pipeline are Feature 12).

The hard problems here are the **sweep/reporting layer**, not the engine — Feature 1 already
solved cross-platform determinism, fixed-point math, and the throughput target. The two decisions
that carry this feature, both in [research.md](./research.md): **(1) reproducible parallelism** —
`rayon` **across independent matches only** (never inside a `resolve()`), with each match seeded
from `base_seed + match_index` (per-work-unit, not per-thread) and results reduced as **integer
counts**, so the aggregate is identical regardless of thread count (SC-001); and **(2) statistically
honest estimates** — a **Wilson score confidence interval** on each binomial win count, with combos
flagged only when the **interval clears the fair band** (never on point-estimate noise), sized to
~1500–2000 samples/matchup for a ≤±2.5% half-width (SC-002).

## Technical Context

**Language/Version**: **Rust** (stable, latest) — a **native binary crate**. There is **no wasm
target** for the balancer (unlike the engine): it runs on a dev machine / CI, native, for speed
(SC-005). It links the Feature 1 `engine` crate as an `rlib`.

**Primary Dependencies**: `engine` (Feature 1, path dependency, `rlib` — the sole engine, reused as
is); `rayon` (across-match data parallelism); `serde` + `serde_json` (report (de)serialization);
`clap` (CLI arg parsing). The Wilson-interval + seed-derivation math is a small hand-rolled module
(no stats-crate dependency needed). Dev/test: the engine's existing fixtures + new fixture Rulesets
(planted-imbalance, skilled/sloppy, fair baseline).

**Storage**: **N/A** — the balancer reads a `Ruleset` from a file/fixture and writes **report
files** (JSON + markdown) to a configurable output path. **No database, no network, no server
route.** (Report storage in Postgres and a live admin view are **Feature 12**, out of scope.)

**Testing**: `cargo test -p balancer` — reproducibility (1-thread == N-thread, repeated-run
identity), the **planted-imbalance fixture** (SC-003), the four **invariant fixtures** (SC-004),
statistical calibration (Wilson half-width + coverage, SC-002), non-mutation checksum (SC-006), and
a throughput smoke (≥10,000 Bo3 in minutes, SC-005). Reuses Feature 1's engine + Ruleset fixtures.

**Target Platform**: **Native desktop / CI only** (x86-64 + ARM). Never the browser, never a Vercel
function, never the client. It is an offline command-line tool.

**Project Type**: A **native Rust binary** in the existing Cargo workspace (`crates/balancer`),
depending on the `crates/engine` library. No new toolchain beyond what Feature 1 introduced (Rust +
Cargo); no wasm build for this crate.

**Performance Goals**: A representative sweep of **≥10,000 Bo3 resolutions finishes in minutes, not
hours** ([Feature 1 SC-006](../001-battle-sim-core/spec.md#success-criteria) / SC-005 here), scaling
**roughly linearly with core count** via `rayon`. A single-matchup batch (~1500–2000 Bo3) is
seconds.

**Constraints**: **Reuse the one engine** (P6 — a second engine is forbidden). **Parallelize across
matches only**, never within a `resolve()` (Feature 1 research A4 rule 3). **Reproducible** — same
(Ruleset, sweep config, base seed) → identical counts/flags/verdicts regardless of thread count
(SC-001). **Never mutate the Ruleset** — advisory reports only (P1, SC-006). Decision-bearing
aggregates are **integer** (deterministic); floats are confined to presentation statistics.

**Scale/Scope**: This feature = the batch runner + the sweep/flagging + the four invariant checks +
the report emitter. It is **not** the engine (Feature 1), **not** the admin console / live Ruleset
editor / news pipeline (Feature 12), and **not** an automatic re-balancer (the human locks the
shape). The sweep is **bounded/sampled**, not an exhaustive enumeration of the full space.

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after design. Constitution v3.0.0 — Product
Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction** | ✅ | The balancer is P1's **verification instrument**: it checks the ~25% power-gap cap (FR-013) and flags no-trade-off "free-turtle"/dominant combos (FR-008, §8.2 trade-off law). It is **advisory only** — it never changes balance (FR-018, SC-006), so the human's non-P2W shape is never overwritten by a machine. |
| **P2 Planning over twitch** | ✅ | It **numerically verifies** the §10 governing law — a well-composed base-gear army beats a sloppy max-gear army (FR-015). "Skill" is modeled as *plan quality* (composition/loadout/dials/positioning), exactly P2's definition; there is no runtime input to the sim to twitch. |
| **P3 Depth from configuration** | ✅ | The sweep varies the **configuration axes** (type × variant × loadout × dials × positioning, FR-006) and proves that depth stays *fair*, not degenerate — protecting the pillar that makes a small roster deep. |
| **P4 Fairness is verified** | ✅ | **This feature *is* P4.** The Monte-Carlo balancer reading win-probability distributions and flagging degenerate combos before players find them is the literal text of P4 / §14. The four invariant checks (FR-012–015) validate the balance claims "numerically, not asserted." |
| **P5 Content from players/puzzles** | ✅ (enabling) | A verified-fair matchup space is what keeps player-defense async PvP (the renewable content) worth playing; the balancer keeps the pool from degenerating. Indirect but real. |
| **P6 Deterministic, seeded, server-authoritative (NON-NEG)** | ✅ | **The load-bearing invariant here.** The balancer reuses the **one** engine crate natively (no second engine → no drift, FR-001); parallelism is **across independently-seeded matches only** (FR-004, Feature 1 research A4), so batches are reproducible (SC-001). It is offline — it never resolves an authoritative ranked result, so server-authority is untouched. |
| **P7 Both platforms first-class** | ✅ (N/A) | Headless dev tool, no UI — no platform surface. (The future admin view that *renders* reports is Feature 12, where P7 applies.) |
| **P8 Data-driven content** | ✅ | Reads the **Ruleset as a data input** (FR-017, Feature 1 Tier 2), never hard-coding balance numbers; emits reports **as data** (JSON, FR-020). The band thresholds are configurable data, not baked constants. |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Spec has prioritized user stories, acceptance scenarios, and explicit non-goals (no auto-rebalance, no admin UI, no second engine); judgment calls (band configurability, "skill" = plan quality, bounded sweep) are recorded as Assumptions. Zero open `NEEDS CLARIFICATION`. |
| **II Validated trust boundaries** | ✅ (N/A-ish) | No untrusted input surface (offline dev tool). Candidate armies the sweep generates are gated by the engine's `validate()` and skipped-not-crashed if illegal (FR-005) — the same trust-boundary function Feature 1 built. |
| **III Match conventions** | ✅ | Reuses Feature 1's Rust workspace idioms and the engine's public `resolve`/`validate`/`Ruleset` surface ([engine-api](../001-battle-sim-core/contracts/engine-api.md)); report JSON follows Feature 1's data-as-JSON precedent. |
| **IV Scope discipline (NON-NEG)** | ✅ | Sweep + flag + verify + report **only**. Explicit non-goals: automatic re-balancing, the admin console / live editor / news pipeline (Feature 12), a second engine, DB/server surfaces. Sweep is bounded, not exhaustive. |
| **V Verify before done** | ✅ | Seven SC checks are executable ([quickstart-style validation in tasks.md](./tasks.md)); "done" = reproducibility + planted-imbalance + invariants + throughput all green. |
| **VI Narrate** | ✅ | research.md records each decision (parallelism, Wilson interval, flag rule, delivery) with rationale + rejected alternatives. |
| **VII Plan whole set first** | ✅ | This is Feature 2 of the foundation-first planning pass; it is planned before implementation and its one cross-feature dependency (the Feature 1 engine) is surfaced explicitly. |
| **VIII Test at right level** | ✅ | Unit (seed derivation, Wilson CI, flag-band gating), integration (planted-imbalance fixture, four invariant fixtures, mirror-matchup calibration), throughput smoke. |
| **IX Commit atomically, branch per feature** | ✅ | On `002-auto-balancer`; planning artifacts commit atomically; implementation follows on this branch once Feature 1's engine exists. |

**Gate result: PASS.** One justified deviation (floats in the reporting/statistics layer — see
Complexity Tracking). No P1/P6 concerns: the one engine is reused (not re-implemented), and the tool
is advisory (never mutates balance).

## Project Structure

### Documentation (this feature)

```text
specs/002-auto-balancer/
├── plan.md              # this file
├── research.md          # Phase 0 — parallelism, statistics, flagging/delivery decisions
├── data-model.md        # Phase 1 — balancer-specific types (reuses Feature 1's engine model)
├── contracts/
│   └── balance-report.md # the BalanceReport wire schema (JSON) + the Feature 12 seam
└── tasks.md             # Phase 2 — the task checklist
```

### Source Code (repository root)

The balancer is a **new native binary crate in the existing Cargo workspace** Feature 1 created. It
adds no toolchain and does **not** restructure the app. The `crates/balancer/` stub reserved in
Feature 1 (root `Cargo.toml` `[workspace] members` + a stub bin depending on `engine`) is built out
here.

```text
d:/Codelib/warformcommander/
├── crates/
│   ├── engine/                   # Feature 1 — the ONE sim core (reused as-is, rlib). NOT modified here.
│   └── balancer/                 # THIS FEATURE — native Monte-Carlo binary
│       ├── Cargo.toml            # [[bin]]; deps: engine (path, rlib) + rayon + serde/serde_json + clap
│       ├── src/
│       │   ├── main.rs           # clap CLI: `matchup` | `sweep` | `verify` subcommands + global flags
│       │   ├── seed.rs           # deterministic per-match seed derivation (base ⊕ index) — research A1
│       │   ├── batch.rs          # run resolve() N× over a matchup, parallel ACROSS matches (rayon), integer-count reduce
│       │   ├── stats.rs          # win-rate aggregation + Wilson 95% CI + outcome/duration breakdown — research B1
│       │   ├── sweep.rs          # enumerate/bound the parameter space from SweepConfig; evaluate vs the reference field — research A2
│       │   ├── flags.rs          # dominant / degenerate / underpowered detection, interval-gated + severity — research C1
│       │   ├── invariants.rs     # the four balance-invariant checks (family band / power-gap / no-dominant-unit / skill>gear) — research C2
│       │   └── report/
│       │       ├── model.rs      # BalanceReport / MatchupResult / FlaggedCombo / InvariantCheck (serde) — data-model + contract
│       │       ├── json.rs       # machine-readable report
│       │       └── markdown.rs   # human-readable report
│       ├── fixtures/             # seeded Rulesets: fair baseline · planted-imbalance · skilled/sloppy · per-invariant violators
│       └── tests/                # reproducibility · planted-imbalance · invariants · calibration · non-mutation · throughput
├── balance-reports/             # NEW (committed) — default output dir for emitted reports (configurable via --out)
├── Cargo.toml                   # EDIT — engine's workspace already lists crates/balancer (Feature 1 T001); no structural change
└── (existing app + crates/engine unchanged)
```

**Structure Decision**: The balancer is a **single native binary crate** (`crates/balancer`) in the
Feature 1 Cargo workspace, depending on `crates/engine` as an `rlib`. It owns the sweep/stats/flag/
invariant/report logic and **nothing of the engine** — it imports the engine's public
`resolve`/`validate`/`Ruleset` surface unchanged. Reports land in a committed `balance-reports/` dir
by default (overridable with `--out`). This keeps the "one engine, two host contexts" architecture
intact (server=wasm, balancer=native) with **zero engine duplication** (P6), and adds no toolchain
or app restructuring beyond what Feature 1 already introduced.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Floats in the balancer's statistics/reporting layer** (Wilson CI bounds, mean duration) — a deliberate exception to the engine's absolute no-float rule (Feature 1 research A1) | The output is an **advisory report a human reads**, not a replay that must be byte-identical across native+wasm. Confidence intervals and means are inherently real-valued, and computing them in fixed-point would be needless friction for a number rendered to 1–2 decimals. | Keeping the engine's no-float rule *everywhere* was rejected as over-applied: the constraint exists for **cross-platform replay determinism**, which the balancer's report is not. The risk (irreproducible reports) is neutralised by keeping all **decision-bearing** values integer — win/loss **counts**, flags, and invariant verdicts come from the deterministic engine and integer reduction; floats are derived **once** at the end and **rendered at fixed precision**, so report bytes stay stable and no float ever swings a flag except through a fixed-precision interval comparison. |
| **Add `rayon` + `clap` to the workspace** (two dev-facing crates the engine didn't need) | `rayon` is the standard, well-audited data-parallel library and is the exact tool for "across independent matches" batching (research A1); `clap` is the standard CLI parser for an offline dev tool with configurable seed/samples/scope. | A **hand-rolled thread pool** reinvents rayon for no benefit and more determinism risk; **hand-rolled arg parsing** is error-prone boilerplate. Both are dev-tool-only (never shipped to the server/client/wasm), so they add no runtime/bundle surface to the game. |

*No other deviations. P1 and P6 (the never-waived invariants) are fully satisfied — the single
engine is reused (not re-implemented), and the tool is advisory (never mutates balance).*

## Post-Design Constitution Re-check

After Phase 1 (data-model, contracts): **still PASS.**
- The data-model **reuses** Feature 1's engine types (Army, Ruleset, MatchResult) and adds only
  balancer-side aggregation types (WinRateEstimate, FlaggedCombo, InvariantCheck, BalanceReport) →
  no engine duplication (P6), no second source of truth (P8).
- The balance-report contract keeps the report a **pure data artifact** (JSON) with a
  `rulesetHash`+version stamp (SC-007) — a clean seam a future admin view (Feature 12) consumes
  without coupling now (Principle IV).
- No new complexity surfaced during design; the two tracked deviations are unchanged.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (parallelism, statistics, flagging/delivery resolved)
- [x] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md), [contracts/balance-report.md](./contracts/balance-report.md)
- [ ] **Phase 2 — Tasks** → [tasks.md](./tasks.md) via `/speckit-tasks` (next)
