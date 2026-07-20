---
description: "Task list for Feature 2 — Auto-balancer (Monte-Carlo)"
---

# Tasks: Auto-balancer (Monte-Carlo)

**Input**: Design documents from `specs/002-auto-balancer/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/balance-report.md](./contracts/balance-report.md)

**Tests**: **INCLUDED and non-optional.** The balancer's whole value is *provably correct*
fairness verification — its Success Criteria (SC-001…SC-007) are executable tests, and constitution
Principle VIII + P4 require them. The **planted-imbalance** and **invariant-violation** fixtures are
the balancer's own golden tests (they prove it catches what it must).

**Hard prerequisite**: the **Feature 1 engine** (`crates/engine`) must exist and be built — the
balancer links it as an `rlib` and calls its `resolve()`/`validate()`. This feature is *planned*
now but *implemented* after Feature 1 (the `crates/balancer` stub is reserved in Feature 1
[T001](../001-battle-sim-core/tasks.md)/[T051](../001-battle-sim-core/tasks.md)).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 (maps to spec.md user stories); Setup/Foundational/Polish carry no story label
- All paths are under `crates/balancer/` unless noted

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Build out the reserved `crates/balancer` stub into a real native binary crate.

- [ ] T001 Flesh out `crates/balancer/Cargo.toml`: a `[[bin]]` crate depending on `engine` (path dep, uses the `rlib`), `rayon`, `serde` (derive) + `serde_json`, and `clap` (derive). Confirm the root `Cargo.toml` `[workspace] members` already lists `crates/balancer` (Feature 1 T001) — **no new toolchain, no wasm target** (plan.md Technical Context).
- [ ] T002 [P] Scaffold `src/main.rs`: a `clap` CLI with subcommands `matchup` | `sweep` | `verify` and global flags `--seed`, `--samples`, `--threads`, `--ruleset <path>`, `--out <dir>` (FR-022). Subcommand bodies are stubs wired up per story.
- [ ] T003 [P] Add CI: a `cargo test -p balancer` job + `cargo clippy -p balancer -D warnings` / `cargo fmt --check`, and a (non-blocking) throughput-smoke job placeholder (native x86-64 + ARM, reusing Feature 1's matrix).
- [ ] T004 [P] Create `crates/balancer/fixtures/` and seed the **fair baseline Ruleset** from [reference/warformcommander-firstpass-stats.md](../../reference/warformcommander-firstpass-stats.md) (reuse Feature 1's `ruleset::seed()` where possible). Add empty placeholders for the planted-imbalance, skilled/sloppy, and per-invariant-violator fixtures (filled in by their stories).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The reproducible-batch primitive + the stats + the report types that **every** user
story composes. Nothing in Phase 3+ can begin until this is done.

**⚠️ CRITICAL**: This is the balancer's core — the deterministic batch runner and the honest
statistics. Get the seeding + integer reduction right here or every downstream number is suspect.

- [ ] T005 Implement `src/seed.rs`: deterministic per-**match** seed derivation `derive(base_seed, match_index) -> u64` (a value-stable integer mix, e.g. splitmix64), **not** per-thread (research A1). Unit test: `derive` is a pure function; index *i* always yields the same seed.
- [ ] T006 [P] Implement `src/stats.rs`: integer win-count aggregation + `win_rate` + the **Wilson 95% CI** (`wilson(wins, n) -> Interval`) + the `OutcomeBreakdown` reducer (Conquest/Time-tiebreak/2-0-vs-2-1/avg-duration). Floats only in the derived interval/means, rendered at fixed precision (research B1, plan Complexity Tracking). Unit-test the Wilson formula against known values.
- [ ] T007 [P] Implement `src/report/model.rs`: the `serde`-derived `BalanceReport`, `MatchupResult`, `WinRateEstimate`, `FlaggedCombo`, `InvariantCheck`, `Provenance`, `RunConfig`, `Coverage` structs (data-model.md + [contract](./contracts/balance-report.md)). Reuse `engine`'s `Army`/`Ruleset`/`MatchResult` — **do not redefine them**.
- [ ] T008 Implement `src/batch.rs`: `run_batch(matchup, ruleset, BatchConfig) -> WinRateEstimate` — `rayon` `into_par_iter()` over match indices, each calling `engine::resolve()` with its **per-match** seed, reducing into **integer counts** (associative → order-independent). Parallel **across matches only**, never inside `resolve()` (FR-001/002/004, research A1). Depends on T005, T006, T007.

**Checkpoint**: a reproducible, thread-count-independent batch runner + honest statistics exist;
user-story work can begin.

---

## Phase 3: User Story 1 — Estimate a matchup's win probability (P1) 🎯 MVP

**Goal**: `matchup` mode — resolve a fixed matchup N times, aggregate into a win rate + Wilson CI +
outcome breakdown, **reproducibly** and **thread-count-independently**.

**Independent Test**: run a fixed matchup + base seed 1-thread and N-thread → identical aggregate;
mirror matchup ≈ 50%; larger N → narrower CI.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T009 [P] [US1] `tests/reproducibility.rs`: same (matchup, ruleset, base seed) run single-threaded vs multi-threaded and twice over → **identical** win counts, win rate, breakdown (SC-001, FR-004).
- [ ] T010 [P] [US1] `tests/statistics.rs`: the reported Wilson half-width is ≤ the configured target at the default sample size; doubling N ≈ halves the half-width; re-estimating from a different base seed lands within the reported CI (SC-002).
- [ ] T011 [P] [US1] `tests/statistics.rs`: a **mirror matchup** (identical armies) estimates within tolerance of 50%, with the defender-tiebreak skew explained (spec edge case).

### Implementation for User Story 1

- [ ] T012 [US1] Implement the `matchup` subcommand in `src/main.rs`: parse the two armies + flags, call `run_batch`, produce a `WinRateEstimate`, and print/emit it. Wires T008 + T006.
- [ ] T013 [US1] Complete the `OutcomeBreakdown` capture in `src/batch.rs`/`src/stats.rs`: per-side Conquest vs Time-tiebreak counts, 2-0/2-1 split, and mean duration — reading them from each `MatchResult` (FR-003, data-model).

**Checkpoint**: a designer can get a reproducible, error-bounded win probability for any matchup —
the MVP fairness tool.

---

## Phase 4: User Story 2 — Sweep the space and flag dominant/degenerate combos (P2)

**Goal**: `sweep` mode — enumerate a bounded candidate set, evaluate each vs a reference field, and
**flag** the outliers (interval-gated), severity-sorted.

**Independent Test**: on a planted-imbalance fixture, the dominant combo is flagged and a fair combo
is not; an underpowered combo and a no-trade-off Plan-B combo are flagged; flags sort worst-first.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T014 [P] [US2] Author `fixtures/planted-imbalance.ruleset` (a deliberately dominant combo + a known-fair combo) and `tests/planted_imbalance.rs`: the sweep **flags the planted dominant combo** and **does not flag** the fair one (SC-003, the headline check).
- [ ] T015 [P] [US2] `tests/flagging.rs`: a deliberately **underpowered** combo is flagged (FR-009); a **no-trade-off Plan-B "free-turtle"** combo is flagged `Degenerate` (FR-008, §8.2).
- [ ] T016 [P] [US2] `tests/flagging.rs`: a combo whose interval **straddles** the band on a small sample is **not** flagged (interval-gating, no noise flags — FR-011); the flagged list is sorted by `severity` descending (FR-010).

### Implementation for User Story 2

- [ ] T017 [US2] Implement `src/sweep.rs`: enumerate the `SweepConfig` axes (Type/Variant/Loadout/Dials/Positioning) intersected with mount/zone legality, **bound/sample** to the `budget`, evaluate each candidate vs the reference field via `run_batch`, and record honest `Coverage` (FR-006/007, research A2). Skip engine-`validate()`-rejected candidates without crashing (FR-005).
- [ ] T018 [US2] Implement `src/flags.rs`: classify each combo `Dominant` / `Underpowered` (Wilson interval clears the `fairBand` ceiling/floor) / `Degenerate` (wins **all** its field matchups, or a Plan-B build with no offsetting trade-off), attach `reason`, compute `severity` = interval distance from the nearest band edge, and sort worst-first (FR-008/009/010/011, research C1).

**Checkpoint**: the sweep surfaces the field's worst offenders, statistically honestly — the
balancer's headline capability.

---

## Phase 5: User Story 3 — Verify the balance invariants numerically (P2)

**Goal**: `verify` mode — evaluate the four load-bearing balance claims against the Ruleset, each as
a numeric assertion reported with measured value + margin.

**Independent Test**: on the first-pass stat block, all four invariants are evaluated and reported;
on four fixtures that each deliberately violate one invariant, each violation is detected as a fail.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T019 [P] [US3] `tests/invariants.rs`: **native-family band** — passes on the baseline; a fixture with the family bonus set far out of band is reported a **fail** with its over-band margin (FR-012, SC-004).
- [ ] T020 [P] [US3] `tests/invariants.rs`: **power-gap cap** — max-gear vs equal-skill base-gear win rate within the moderate cap on baseline; a blown-out fixture fails (FR-013).
- [ ] T021 [P] [US3] `tests/invariants.rs`: **no-dominant-unit** — no type/variant sweeps a clean win across all its field matchups on baseline; a planted-dominant-unit fixture fails (FR-014).
- [ ] T022 [P] [US3] Author `fixtures/skilled-vs-sloppy.*` and `tests/invariants.rs`: **skill-beats-gear** — a well-composed base-gear army beats a sloppy max-gear army a majority; a fixture where gear overwhelms skill fails (FR-015).

### Implementation for User Story 3

- [ ] T023 [US3] Implement `src/invariants.rs`: the four checks, each resolving the relevant head-to-head matchups via `run_batch`, reading the measured number from the distributions, and returning `InvariantCheck { name, band, measured, margin, pass, evidence }` (FR-012–016, research C2). Bands are configurable with the design-doc defaults.
- [ ] T024 [US3] Implement the `verify` subcommand in `src/main.rs`: run all four checks against the loaded Ruleset and assemble the `invariants` section of the report.

**Checkpoint**: the four balance claims are verified numbers with margins, not assertions — P4 made
real.

---

## Phase 6: User Story 4 — Emit balance reports (P3)

**Goal**: emit the `BalanceReport` as canonical JSON + human-readable markdown, provenance-stamped,
without ever mutating the Ruleset.

**Independent Test**: the JSON validates against the contract + carries the provenance stamp; the
markdown renders flags + invariants; the input Ruleset is byte-identical after a run.

### Tests for User Story 4 ⚠️ (write first)

- [ ] T025 [P] [US4] `tests/report.rs`: the emitted JSON matches the [balance-report contract](./contracts/balance-report.md) shape and carries `rulesetHash` + engine/format versions (FR-019, SC-007); two runs over different Rulesets are distinguishable by provenance.
- [ ] T026 [P] [US4] `tests/report.rs`: the markdown rendering contains the matchup table, the severity-sorted flag list with reasons, and the four invariant pass/fails with margins (FR-021); and a **non-mutation** check — the input Ruleset file checksum is identical before and after a full run (SC-006, FR-018).

### Implementation for User Story 4

- [ ] T027 [US4] Implement `src/report/json.rs`: serialize the `BalanceReport` to canonical JSON; exclude `generatedAt` from the reproducibility-relevant body (SC-001) while keeping it in the artifact.
- [ ] T028 [P] [US4] Implement `src/report/markdown.rs`: render the same report as a committable markdown document (matchup table, flag list, invariant readout, coverage note).
- [ ] T029 [US4] Wire provenance + output: stamp `Provenance { rulesetHash, engineVersion, replayFormatVersion, generatedAt }` and `RunConfig`, and make every subcommand (`matchup`/`sweep`/`verify`) emit both artifacts to `--out` (default `balance-reports/`). Guarantee the Ruleset is opened **read-only** (FR-018).

**Checkpoint**: the balancer produces provenance-stamped, human- and machine-readable reports and
provably never changes balance.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Throughput: a `tests/throughput.rs` (or the CI smoke) resolving **≥10,000 Bo3 in minutes, not hours** natively and demonstrating **~linear scaling** with `--threads` (SC-005, ties to Feature 1 SC-006).
- [ ] T031 [P] Document the crate: rustdoc on `run_batch`/`sweep`/`verify`/the report types, and a short `crates/balancer/README.md` pointing at this spec + the report contract and stating the "one engine, advisory-only, offline" boundaries.
- [ ] T032 Update repo docs: `STATUS.md` (Feature 2 → built) and `CHANGELOG.md` (the balancer + report format), and note that the report JSON is the seam **Feature 12** (admin console) will later consume.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → depends on the **Feature 1 engine crate existing** (hard prerequisite).
- **Foundational (P2)** → depends on Setup; **blocks all user stories**.
- **US1 (P3)** → depends on Foundational; the MVP.
- **US2 (P4)** → depends on **US1** (needs `run_batch` + estimates to flag from).
- **US3 (P5)** → depends on **US1** (invariants are constructed matchups run through `run_batch`); largely parallel to US2.
- **US4 (P6)** → depends on US1–US3 producing the content the report serializes.
- **Polish (P7)** → depends on all desired stories.

### Within a story

Tests (reproducibility/fixture) first → primitives → subcommand wiring → report section. Commit
after each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T002–T004 in parallel.
- Foundational: T006/T007 in parallel after T005; T008 last (depends on all three).
- US1 tests T009–T011 in parallel; US2 tests T014–T016 in parallel; US3 tests T019–T022 in parallel.
- US2 and US3 implementation run largely in parallel once US1 is done (distinct files: `sweep.rs`/`flags.rs` vs `invariants.rs`).
- Report renderers T027/T028 in parallel.

---

## Implementation Strategy

### MVP first (US1)

1. Setup → 2. Foundational → 3. **US1** → **STOP & VALIDATE** (SC-001 reproducibility + SC-002
statistics green). A reproducible, error-bounded matchup estimator is already a complete, useful
fairness tool.

### Incremental delivery

US1 (matchup estimate) → US2 (sweep + flag degenerate combos) → US3 (verify the four invariants) →
US4 (emit reports). Each adds provable value; the feature is "done" when SC-001…SC-007 are green —
crucially the **planted-imbalance** (SC-003) and **invariant-violation** (SC-004) fixtures, which
prove the balancer catches what it exists to catch.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- **One engine, reused.** Every simulation call goes through `engine::resolve()` — the balancer adds
  no combat logic and holds no second copy of the rules (P6). If a task tempts you to re-implement
  engine behavior, stop: that would break determinism/fairness verification.
- **Reproducibility is the spine.** Seed per **match index** (never per thread) and reduce **integer
  counts** (never a running float) so thread count can't change a result (research A1).
- **Advisory only.** No task writes to the Ruleset or any game-data file; the balancer names what to
  tune, the human tunes it (P1). SC-006 is the guardrail.
