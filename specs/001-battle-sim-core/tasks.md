---
description: "Task list for Feature 1 — Battle Simulation Core + Game Data Model"
---

# Tasks: Battle Simulation Core + Game Data Model

**Input**: Design documents from `specs/001-battle-sim-core/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **INCLUDED and non-optional.** This feature's entire value is a *provably*
deterministic, correct engine — its Success Criteria (SC-001…SC-007) are executable tests,
and constitution Principle VIII + P6 require them. Determinism/golden-hash tasks are written
**before** the code they pin, TDD-style.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md user stories); Setup/Foundational/Polish carry no story label
- All Rust paths are under `crates/engine/` unless noted; TS under `src/sim/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the Rust workspace, the WASM build, and the TS host scaffolding.

- [ ] T001 Create the Cargo workspace: root `Cargo.toml` (`[workspace] members = ["crates/engine", "crates/balancer"]`), `crates/engine/Cargo.toml` with `[lib] crate-type = ["cdylib", "rlib"]`, and a `crates/balancer/` stub bin that depends on `engine` (rlib). Per plan.md Project Structure.
- [ ] T002 Pin dependencies in `crates/engine/Cargo.toml`: `serde` (derive), `serde_json`, `rand_pcg = "=<exact>"` (value-stable, version-pinned per research A3), `wasm-bindgen`; dev-deps `proptest`, `blake3`, `wasm-bindgen-test`. **No float / no HashMap-in-core deps.**
- [ ] T003 [P] Configure `rustfmt.toml` + `clippy` (deny `float_arithmetic` in the core via lint where practical) and add `cargo fmt --check` / `cargo clippy -D warnings` to the workflow.
- [ ] T004 [P] Add the `wasm-pack build` invocation (`--target nodejs --out-dir packages/engine-wasm --release`) as an npm script and document the **prebuild-and-commit** flow (research B3); create `packages/engine-wasm/.gitkeep` + a `package.json` name `@wfc/engine-wasm`.
- [ ] T005 [P] Edit `next.config.ts`: add `serverExternalPackages: ['@wfc/engine-wasm']` and `outputFileTracingIncludes: { '/api/resolve': ['./node_modules/@wfc/engine-wasm/**/*.wasm'] }` (research B2).
- [ ] T006 [P] Add a CI matrix (GitHub Actions): native jobs on `ubuntu-latest` (x86-64) + `macos-latest` (ARM64) running `cargo test`, a `wasm-pack test --node` job, and a prebuild step that builds + commits `packages/engine-wasm/` (research B3, A5).
- [ ] T007 Scaffold the TS host: `src/sim/index.ts` (`resolveBattle()` stub) and `app/api/resolve/route.ts` (`runtime = 'nodejs'`) that will import `@wfc/engine-wasm`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The determinism primitives + the typed game-data schema that **every** user story
imports. Nothing in Phase 3+ can begin until this is done.

**⚠️ CRITICAL**: This is the shared model (data-model Tiers 1–3) and the P6 primitives.

- [ ] T008 Implement `src/fixed.rs`: the scaled-`i64` milli-unit newtype (`Fixed`) + `mul_bp(value, bp) -> i64` basis-point multiplier over an `i128` intermediate, with **one documented rounding rule**; `checked/saturating` helpers so debug==release (research A2).
- [ ] T009 [P] Implement `src/rng.rs`: a `Pcg64` wrapper seeded via `seed_from_u64`, exposing **integer-only** draws (`next_u32() % n`, `roll_bp() -> [0,10_000)`); forbid `usize` sampling and float distributions (research A3).
- [ ] T010 [P] Implement `src/model/types.rs`: `MachineType`, `ChassisVariant`, `EquipmentModule` (Weapon/Defense/Utility union), `BehaviorDials`, `PlanBTrigger`, `Preset`, and the `DamageType`/`DamageFamily`/`ZoneId`/`MountClass`/`ReachTag`/`CadenceTier` enums (data-model Tier 1). All `serde`-derived, integer/enum only.
- [ ] T011 [P] Implement `src/model/ruleset.rs`: `Ruleset` (the balance table — `variants`, `equipment`, `damageMatrix`, `cadenceTicks`, `airMods`, `globals`) + `rulesetHash` (data-model Tier 2, FR-007). Ordered maps (`BTreeMap`), never `HashMap` (research A4).
- [ ] T012 Implement `src/model/army.rs`: `MachineInstance`, `Squad`/`Army`, placement, and the **effective-stat derivation** `baseStats ⊕ equipment ⊕ capability unlocks` as a pure shared function (FR-007). Depends on T008, T010, T011.
- [ ] T013 Implement `src/replay/mod.rs` in-memory types: `Replay`, `GameReplay`, `Tick`, `MachineSnapshot`, `TickEvent` enum, `MatchResult` (data-model Tier 3). Integer-only so the replay is trivially hashable. (Serialization format is finalized in US5.)
- [ ] T014 Seed the **representative content subset** as `Ruleset` fixtures from [reference/warformcommander-firstpass-stats.md](../../reference/warformcommander-firstpass-stats.md) (7 types × 3 variants + the representative equipment) — enough to exercise the engine + counter-web (spec Assumptions). In `crates/engine/tests/fixtures/` or a `ruleset::seed()` fn.
- [ ] T015 Implement the golden-hash test harness `crates/engine/tests/determinism.rs` scaffolding: serialize a `Replay` deterministically, `blake3`-hash it, and an assertion helper `assert_golden(case, hash)` reading committed hashes (research A5). (Committed hashes land as the engine is built.)

**Checkpoint**: determinism primitives + typed schema exist; user-story work can begin.

---

## Phase 3: User Story 1 — Resolve a battle deterministically from a seed (P1) 🎯 MVP

**Goal**: `resolve(armies, ruleset, seed) → (Replay, MatchResult)` — a full single-game tick
simulation that terminates and returns a tick stream + result, **byte-identically** every run
and across native/wasm.

**Independent Test**: feed two fixed squads + a fixed seed 1,000×; assert every serialized
replay hashes identically; assert native hash == wasm hash; flip one input → hash changes.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T016 [P] [US1] `tests/determinism.rs`: 1,000× same-input runs all hash-equal (SC-001 intra-run).
- [ ] T017 [P] [US1] `tests/determinism.rs`: **cross-target** — the wasm golden hash (via `wasm-pack test --node`) equals the native golden hash for the fixed battery (SC-001 native==wasm).
- [ ] T018 [P] [US1] `tests/determinism.rs`: sensitivity — flipping a dial / placement / seed changes the output hash (spec AS3).
- [ ] T019 [P] [US1] `tests/determinism.rs`: `proptest` run-twice invariant `resolve(x) == resolve(x)` over random `(seed, inputs)`.

### Implementation for User Story 1

- [ ] T020 [US1] Implement `src/sim/tick.rs`: the fixed-tick loop (10 t/s, hard cap 1000), per-machine cooldowns from cadence tiers (Fast1/Med3/Slow5/Siege10), single-threaded, deterministic actor ordering by `(zone, instanceId)` (research A4).
- [ ] T021 [US1] Implement `src/sim/target.rs`: **row-based reach** (Front→nearest occupied; Middle→enemy Front+Middle then Rear; Rear→artillery-only=any; Air via air-capable weapons) + the Target Row / Target Rule dial sub-picks with deterministic tie-breaks (FR-014, §4/§8.1).
- [ ] T022 [US1] Implement `src/sim/damage.rs`: the per-hit pipeline — `acc−evasion` clamp → seeded hit roll → `D0 × nativeBonus × crit` → **shields (×shieldMult, penetration)** → **hull (×armorMult × (1−armorPct), min-floor)** → **splash ≤25% in-row** — all via `fixed`/`mul_bp` (FR-012/013, §9.2). Includes the damage-type×defense matrix + air modifiers.
- [ ] T023 [US1] Implement `src/sim/behavior.rs`: per-tick Energy / Movement (discrete zone transitions, bounded by move speed; air-locked/immobile inert) / Stance resolution + **Plan-B latch** (fire once) with **Slot-1 > Slot-2** precedence, order-independent given the fired set (FR-015/016, §8.2).
- [ ] T024 [US1] Implement minimal `src/sim/outcome.rs`: single-game termination by **Conquest** (a side wiped) or **hard tick-cap**, producing a `MatchResult` with a winner (full win-condition correctness + Bo3 come in US4).
- [ ] T025 [US1] Wire `resolve()` in `src/lib.rs`: validate → run the tick loop → build the in-memory `Replay` (snapshot + events per tick) → assemble result. Add the `#[wasm_bindgen]` export `resolve(input: &[u8]) -> Vec<u8>` (JSON bytes in/out, Rust-owned; research C1).
- [ ] T026 [US1] Implement `crates/engine/examples/resolve_demo.rs` (the golden-path runner from quickstart) and commit the initial golden hashes for the fixed battery.
- [ ] T027 [US1] Implement `src/sim/index.ts` `resolveBattle()`: marshal `BattleInput` → bytes, call `@wfc/engine-wasm`, return the replay bytes; and `app/api/resolve/route.ts` returning the replay. Server smoke test per quickstart.

**Checkpoint**: a battle resolves deterministically on both targets — the MVP engine.

---

## Phase 4: User Story 2 — Configure armies as typed data (P1)

**Goal**: express a squad entirely as typed data with derived effective stats, and **reject
illegal configurations before any battle runs** (the trust boundary), via the same schema the
Garage + balancer will import.

**Independent Test**: construct squads as data (no engine run); assert the type system +
`validate()` accept a legal squad and reject each illegal class (V1–V8) with a reason.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T028 [P] [US2] `tests/validation.rs`: assert each of V1–V8 rejects with a reason — squad size ≠ 5, zone-cap breach, off-home-zone placement, mount-illegal weapon/defense, duplicate/wrong-count utility, excess/ungated Plan-B, ungated dial option, impossible movement order (SC-005, data-model).
- [ ] T029 [P] [US2] `tests/validation.rs`: assert effective stats derive correctly from type + variant + equipment for representative builds (spec AS1).

### Implementation for User Story 2

- [ ] T030 [US2] Implement `src/validate.rs`: the V1–V8 rules returning typed `ValidationError { code, reason }`; a pure `validate(army, ruleset)` (FR-009, Principle II). Ordered iteration only.
- [ ] T031 [US2] Harden the effective-stat derivation in `src/model/army.rs` for all equipment/capability interactions (cadence shifts, reach extensions, slot-count overrides) surfaced by T029.
- [ ] T032 [US2] Add the `#[wasm_bindgen]` export `validate(input: &[u8]) -> Vec<u8>` and call it **server-side before `resolve`** in `app/api/resolve/route.ts` (never trust client state); `resolve` also validates internally and errors rather than simulating illegal input.
- [ ] T033 [P] [US2] Create the **TypeScript mirror** of the data-model types + a shared validation surface in `src/sim/` (or generate from the Rust types) so the Garage rejects the same builds the engine would (P8). Add to `contracts/` as the shared types reference.

**Checkpoint**: armies are typed data; illegal builds are rejected identically by engine + UI layer.

---

## Phase 5: User Story 3 — The counter-web resolves as designed (P2)

**Goal**: prove the intended rock-paper-scissors emerges from the engine — the damage-type ×
defense matrix, reach/air rules, and shield timing — with no single machine dominating.

**Independent Test**: run curated matchups (stat block §5) over N seeds; assert each designed
counter wins a strong majority and no unit wins across all its matchups.

### Tests for User Story 3 ⚠️

- [ ] T034 [P] [US3] `tests/counterweb.rs`: Kinetic→Shields folds shields ~2× faster than armor (AS1, stat block G).
- [ ] T035 [P] [US3] `tests/counterweb.rs`: Energy→Armor kills a heavy target ~30% faster than Kinetic (stat block B vs C).
- [ ] T036 [P] [US3] `tests/counterweb.rs`: rocket-artillery→all-air hard-counter; and adding AA flips an all-air-favored board (AS2, stat block E).
- [ ] T037 [P] [US3] `tests/counterweb.rs`: indirect artillery **never** targets/damages Air (AS3); artillery splash punishes a stacked backline (AS4).
- [ ] T038 [P] [US3] `tests/counterweb.rs`: **no single type/variant/loadout wins across all matchups it is tested in** (SC-003).

### Implementation for User Story 3

- [ ] T039 [US3] Verify/refine the air-modifier + splash + shield-recharge-timing paths in `sim/damage.rs`/`sim/target.rs` so the T034–T038 majorities hold (correctness only — numeric *tuning* is the balancer's job, P4). Record any first-pass rough edges for Feature 2.

**Checkpoint**: the designed counters demonstrably emerge from the engine.

---

## Phase 6: User Story 4 — Win conditions and best-of-3 resolve correctly (P2)

**Goal**: full win-condition correctness (Conquest / Time-by-damage / exact-tie→defender) and
the best-of-three match wrapper with the locked/free adaptation policy.

**Independent Test**: drive games to each ending + a constructed exact tie; assert winner +
reward tier; run a Bo3 and assert first-to-two; assert locked vs free adaptation.

### Tests for User Story 4 ⚠️

- [ ] T040 [P] [US4] `tests/winconditions.rs`: Conquest→full reward; Time→most-damage wins at lesser reward; exact damage tie→defender (SC-004, AS1–3).
- [ ] T041 [P] [US4] `tests/winconditions.rs`: Bo3 winner is first to two games (AS4).
- [ ] T042 [P] [US4] `tests/match_modes.rs`: **Locked** mode — army + placement provably identical across all three games; **Free** mode — per-game changes honored (SC-007).

### Implementation for User Story 4

- [ ] T043 [US4] Extend `src/sim/outcome.rs`: the **Time** win condition (cumulative-damage-dealt tiebreak), **exact-tie → defender**, and reward tiers (Full/Lesser) (FR-019, §9.3).
- [ ] T044 [US4] Implement the **Bo3 match loop** in `src/lib.rs`/`sim/outcome.rs`: first-to-two, with `MatchConfig.adaptation` = `Locked` (same army+placement all games) vs `Free` (inputs may vary) (FR-020, SC-007).
- [ ] T045 [US4] Assemble the full `MatchResult` (per-machine fates, per-side damage totals, survivor counts, duration) and assert it reconciles from tick-stream events (FR-022).

**Checkpoint**: matches resolve to the exact specified winner + reward tier.

---

## Phase 7: User Story 5 — Emit a serializable tick stream for replay & analysis (P3)

**Goal**: finalize the **random-access JSON replay** (positional-array, tick-indexed, versioned)
and a **pure TS reader** so a scrubber seeks any tick by O(1) indexing and never re-simulates.

**Independent Test**: resolve → serialize → deserialize in TS → reconstruct every unit's
hull/shield/zone at every tick equals the engine's computed state; `Σ events == result totals`;
`snapshots[tick]` is O(1).

### Tests for User Story 5 ⚠️

- [ ] T046 [P] [US5] `tests/replay.rs`: reconstruct per-tick state from the serialized replay equals engine-computed state; damage-event sums equal result totals (SC-002).
- [ ] T047 [P] [US5] `src/sim/replay-reader.test.ts`: TS reader parses a real replay, seeks `snapshots[tick]` in O(1) without touching prior ticks, and rejects an unsupported `formatVersion`.

### Implementation for User Story 5

- [ ] T048 [US5] Finalize `src/replay/format.rs`: the **positional/columnar** JSON layout (`unitOrder` dictionary, `snapshots[tick]`/`events[tick]` arrays, `[hull,shield,zoneIdx,alive]` rows) + `formatVersion` stamp + `meta` (seed, rulesetHash, matchConfig, armies) (research C2, contract).
- [ ] T049 [US5] Implement `src/replay/build.rs`: capture the full per-tick snapshot + compact events during the tick loop (wire into `sim/tick.rs`).
- [ ] T050 [P] [US5] Implement `src/sim/replay-reader.ts`: the pure TS reader — `ReplaySchema` validation, supported-`formatVersion` gate, O(1) tick indexing; **no engine import, no re-sim** (contract).

**Checkpoint**: the replay is seekable, reconstructable, and versioned — the scrubber's foundation.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T051 [P] Expose the balancer hook: confirm `resolve` alone suffices for repeated seeded runs (FR-024) and flesh out the `crates/balancer/` stub enough to run the SC-006 throughput smoke (≥10,000 Bo3 in minutes) — full balancer logic is Feature 2.
- [ ] T052 [P] Run the full `quickstart.md` validation suite (SC-001…SC-007) green on **both** native and wasm; wire it as the CI gate.
- [ ] T053 [P] Document the engine crate (rustdoc on `resolve`/`validate`/`Ruleset`) and add a short `crates/engine/README.md` pointing at the contracts.
- [ ] T054 Update repo docs: `STATUS.md` (Feature 1 → built), `CHANGELOG.md` (engine + replay format), and fix the stale DB-driver line (`neon-http` → `postgres-js`) surfaced in research C3.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **blocks all user stories**.
- **US1 (P3)** → depends on Foundational; the MVP.
- **US2 (P4)** → depends on Foundational; largely parallel to US1 (validation + types).
- **US3 (P5)** → depends on **US1** (needs the resolving engine to assert outcomes).
- **US4 (P6)** → depends on **US1** (extends `outcome.rs` + adds the match loop).
- **US5 (P7)** → depends on **US1** (serializes the replay US1 produces).
- **Polish (P8)** → depends on all desired stories.

### Within a story

Tests (determinism/contract) first → models → sim modules → wiring → host/TS. Commit after
each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T003–T006 in parallel.
- Foundational: T009/T010/T011 in parallel (distinct files) after T008.
- US1 tests T016–T019 in parallel; then the sim modules are mostly sequential (shared tick loop).
- US2 runs alongside US1 once Foundational is done (different files: `validate.rs`, TS mirror).
- US3 and US4 test suites (T034–T038, T040–T042) are all `[P]`.

---

## Implementation Strategy

### MVP first (US1)

1. Setup → 2. Foundational → 3. **US1** → **STOP & VALIDATE** (SC-001 determinism green on both
targets). That alone is a complete, demonstrable deterministic combat engine.

### Incremental delivery

US1 (deterministic resolution) → US2 (typed data + validation) → US3 (counter-web verified) →
US4 (win conditions + Bo3) → US5 (seekable replay + TS reader). Each adds provable value without
breaking prior stories; the whole feature is "done" when quickstart's SC-001…SC-007 are green on
native **and** wasm.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- Determinism is the spine: any task that touches the sim must preserve the research-A4 rules
  (no floats, no HashMap iteration, single-threaded, total-order sorts, fixed pipeline order).
- The golden hashes committed in T026 are the real determinism contract — regenerate them only
  on an *intended* logic change, never to make a red test pass.
