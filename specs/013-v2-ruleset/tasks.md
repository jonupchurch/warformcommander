---

description: "Task list for v2 Ruleset — second-generation content"
---

# Tasks: v2 Ruleset — Second-Generation Content

**Input**: Design documents from `/specs/013-v2-ruleset/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included. Constitution VIII ("Test at the Right Level") and P4 ("Fairness Is Verified, Not
Hoped") make tests mandatory here, not optional — every mechanic in this feature is branching logic
where unit tests carry real signal, and every success criterion is a balancer measurement.

**Organization**: Grouped by user story so each ships as its own ruleset version and can be reverted
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Every task names its exact file path

## Path Conventions

Rust engine at `crates/engine/`, balancer at `crates/balancer/`, TypeScript mirrors at `sim/`, server
validation at `server/`, UI at `components/garage/` and `lib/garage/`.

---

## Phase 1: Setup

**Purpose**: Establish a clean, attributable starting point.

- [X] T001 Confirm the pre-change cascade is green on `main` — run `cargo test`, `cargo clippy --all-targets -- -D warnings`, `npx tsc --noEmit`, and `npm test`, recording results in `specs/013-v2-ruleset/baseline/pre-change-cascade.md` so any later failure is attributable to this feature
- [X] T002 [P] Record the live ruleset identity (currently v11 `0062f62e`) and its provenance in `specs/013-v2-ruleset/baseline/live-ruleset.md`, including the exact re-seed command needed to publish a successor
- [X] T003 [P] Export the current seed ruleset to `specs/013-v2-ruleset/baseline/ruleset-v11.json` via `scripts/export-current-ruleset.ts` so post-change diffs are reviewable as data

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Capture the measurement baseline. **This is irrecoverable** — SC-005 and SC-008 are
comparisons against pre-change behaviour, and the comparison point is destroyed the moment the
catalog changes.

**⚠️ CRITICAL**: No user story work can begin until T004–T006 are complete.

- [X] T004 Capture the v11 balancer baseline to `specs/013-v2-ruleset/baseline/` via `cargo run -q -p balancer --release -- verify --field all --out specs/013-v2-ruleset/baseline`
- [X] T005 Extract the specific comparison points from the baseline report into `specs/013-v2-ruleset/baseline/comparison-points.md` — per-archetype win rates, median battle duration (SC-005), contested-matchup count (SC-001), and shielded share of effective HP (SC-003)
- [X] T006 Measure and record focused-fire survival ticks for Heli, Artillery, and RocketArtillery chassis in `specs/013-v2-ruleset/baseline/squishy-survival.md` — the SC-008 comparison point, which the aggregate report does not break out

**Checkpoint**: Baseline locked. User stories may begin.

---

## Phase 3: User Story 1 — Every machine has a real defensive decision (Priority: P1) 🎯 MVP

**Goal**: Four genuinely different defensive options on all seven mount classes, with the chassis
rebased so this redistributes survivability rather than inflating it.

**Independent Test**: Every mount class offers four non-no-op options; a shielded machine survives
penetrating fire worse and sustained fire better than an armoured one; median battle duration stays
within 10% of baseline; Heli/Arty/RktArty die no slower than on v11.

**Ships as**: ruleset v12. **Golden re-bless: required.** **Engine deploys before re-seed** (adds
`DamageLayer::Ablative`, an enum variant — R7).

### Tests for User Story 1

> Write these first and confirm they fail before implementing.

- [ ] T007 [P] [US1] Create `crates/engine/tests/defenses.rs` asserting each mount class offers four distinct, non-empty defensive options
- [ ] T008 [P] [US1] Add ablative depletion tests to `crates/engine/tests/defenses.rs` — pool absorbs `min(incoming, remaining)`, overflow carries to hull, pool never regenerates, and depletion is terminal
- [ ] T009 [P] [US1] Add ablative save tests to `crates/engine/tests/defenses.rs` — a save preserves capacity without increasing absorption, and a save on a pool-emptying hit leaves the pool intact and non-negative
- [ ] T010 [P] [US1] Extend `crates/engine/tests/counterweb.rs` to assert the three layers fail to different threats: penetration defeats shields but not ablative, Energy punishes armour, attrition defeats ablative

### Implementation for User Story 1

- [ ] T011 [P] [US1] Add `AblativeDelta { cap }` and the optional `ablative_delta` field on `DefenseSpec` in `crates/engine/src/model/types.rs`, following the existing `Option` + `skip_serializing_if` convention
- [ ] T012 [P] [US1] Add `AblativeMods { save_chance }` and `MountScale` tables to `crates/engine/src/model/ruleset.rs`, both `#[serde(default, skip_serializing_if = "…is_default")]` per [contracts/ruleset-additions.md](./contracts/ruleset-additions.md)
- [ ] T013 [US1] Add `DamageLayer::Ablative` to `crates/engine/src/replay/mod.rs` and the additive `ablative: Fixed` field on `MachineSnapshot`
- [ ] T014 [US1] Add `ablative_cap` to `EffectiveStats` and derive it in `derive_effective_stats` in `crates/engine/src/model/army.rs` (depends on T011)
- [ ] T015 [US1] Add the `ablative: Fixed` field to `Combatant` in `crates/engine/src/sim/mod.rs`, initialised from `stats.ablative_cap` at battle setup (depends on T014)
- [ ] T016 [US1] Insert the ablative layer between shields and hull in `mitigate` in `crates/engine/src/sim/damage.rs`, taking a pre-rolled `save: bool` parameter so the function stays pure (R3); penetration must NOT bypass it (R2)
- [ ] T017 [US1] Roll the ablative save in `apply_damage` in `crates/engine/src/sim/damage.rs`, drawing only when the target has a non-empty pool, and emit `DamageLayer::Ablative` hits (depends on T016)
- [ ] T018 [US1] Generate the 28 defense modules (4 families × 7 mount classes) via a scale-table loop in `crates/engine/src/content.rs`, mirroring the existing base-hull loop (depends on T012)
- [ ] T019 [US1] Give each family its distinct drawback in `crates/engine/src/content.rs` — Armor costs movement, Shield is penetration-vulnerable, Ablative never regenerates, Balanced has none (FR-008)
- [ ] T020 [US1] Delete the seven `StandardHull*` entries and repoint `base_defense_id` at the Balanced module per mount class in `crates/engine/src/content.rs` (R10 — this updates every stock loadout, archetype, and fixture at once)
- [ ] T021 [US1] Rebase the ~21 chassis base stats in `crates/engine/src/content.rs` so aggregate survivability does not rise (FR-010). Artillery and RktArty land below their v11 durability; the **Helicopter lands level, not below** — it already dies at tick 48 with 0% survival and has no headroom (FR-011, see `baseline/squishy-survival.md`)
- [ ] T022 [P] [US1] Mirror `ablativeDelta`, `ablativeMods`, and `mountScale` in `sim/ruleset.ts` with exported defaults, following the `DEFAULT_ENERGY_MODES` pattern
- [ ] T023 [P] [US1] Add trust-boundary validation for the new fields in `server/ruleset-validate.ts` per the contract's validation column — reject out-of-range values, never coerce
- [ ] T024 [US1] Explain all four defensive families from live ruleset values in `lib/garage/explain.ts`, including ablative's pool, save chance, and non-regeneration (FR-033)
- [ ] T025 [US1] Add coverage for the new defensive copy to `tests/garage-explain.test.ts`, asserting numbers follow a mutated ruleset rather than authored text

### Verification for User Story 1

- [ ] T026 [US1] Run `cargo test`, `cargo clippy --all-targets -- -D warnings`, and `cargo fmt`; re-bless the goldens and review the diff as a genuine balance change, not a rubber stamp (R10)
- [ ] T027 [US1] Rebuild wasm and restore generated files — `wasm-pack build crates/engine --target nodejs --out-dir ../../packages/engine-wasm --release` then `git checkout -- packages/engine-wasm/.gitignore packages/engine-wasm/package.json`
- [ ] T028 [US1] Verify native/wasm byte-identity on all four seeds via `cargo run -q -p engine --example emit_battery` and `node scripts/wasm-parity.mjs` (P6, non-negotiable)
- [ ] T029 [US1] Run `npx tsc --noEmit`, `npm test`, and `npm run build`
- [ ] T030 [US1] Run the balancer and compare against `specs/013-v2-ruleset/baseline/comparison-points.md`, recording results — SC-003 (≥25% shielded/ablative EHP), SC-004 (zero single-option mount classes), SC-005 (duration within 10%), SC-008 (squishy chassis no tankier)

**Checkpoint**: US1 fully functional. Ship as v12 — **engine deploys before re-seed**.

---

## Phase 4: User Story 2 — Stance decides who absorbs incoming fire (Priority: P2)

**Goal**: Aggro tiers narrow the candidate row before the Target Rule picks, making all eight target
rules stance-aware. Zero-sum within an army.

**Independent Test**: Armies differing only in stance produce different casualty orders; a
uniform-stance army resolves identically to all-Neutral; an Aggressive attacker ignores an enemy
Protector.

**Ships as**: ruleset v13. **Golden re-bless: none expected** — a hash change here is a tripwire that
something was made hash-visible by mistake (R6).

### Prerequisite for User Story 2

> **⚠️ Without this the balancer reports stance as inert no matter how well it works** — every
> archetype uses `stock_dials()` (stance `Neutral`), and a uniform-stance army is by design identical
> to all-Neutral. This is the P4 gate condition (R8).

- [ ] T031 [US2] Add stance-varying archetype fixtures to `crates/balancer/src/archetypes.rs` — variants of the existing archetypes that assign Protector/Aggressive/Defensive by role rather than leaving every machine Neutral
- [ ] T032 [US2] Extend `field_by_name` in `crates/balancer/src/archetypes.rs` with a stance-diagnostic field selector, and cover the new fixtures in the existing legality test

### Tests for User Story 2

- [ ] T033 [P] [US2] Create `crates/engine/tests/stance.rs` asserting tier narrowing — an Aggressive rowmate is targeted ahead of a Neutral one, and a Defensive one only when nothing else is eligible
- [ ] T034 [P] [US2] Add the zero-sum guarantee test to `crates/engine/tests/stance.rs` — a uniform-stance army produces a byte-identical replay to the same army all-Neutral (FR-017)
- [ ] T035 [P] [US2] Add a lone-unit test to `crates/engine/tests/stance.rs` — a solitary Defensive machine in a row is targeted normally, since shedding requires an absorber
- [ ] T036 [P] [US2] Add an Aggressive-bypass test to `crates/engine/tests/stance.rs` — an Aggressive attacker selects its preferred target despite an enemy Protector (FR-014)
- [ ] T037 [P] [US2] Add a Protector cross-zone test to `crates/engine/tests/stance.rs` — a Protector draws fire aimed at an adjacent-zone ally the attacker can already reach (FR-016)
- [ ] T038 [P] [US2] Add execute-threshold tests to `crates/engine/tests/stance.rs` — Opportunist deals bonus damage below the threshold and none above it, and a zero bonus disables the mechanic (FR-018)
- [ ] T039 [P] [US2] Add rule-agnosticism coverage to `crates/engine/tests/stance.rs` — narrowing applies under all eight target rules (FR-013)

### Implementation for User Story 2

- [ ] T040 [US2] Add the `StanceAggro` and `ExecuteMods` tables to `crates/engine/src/model/ruleset.rs`, skip-serialized at their defaults per the contract
- [ ] T041 [US2] Thread `&Ruleset` into `select_target` in `crates/engine/src/sim/target.rs` and update both call sites in `crates/engine/src/sim/mod.rs` — the stalemate probe and the main attack loop (R5)
- [ ] T042 [US2] Implement tier narrowing between `pick_row` and `pick_unit` in `crates/engine/src/sim/target.rs`, keeping only minimum-tier candidates, with the Aggressive bypass and the Protector cross-zone join (depends on T040, T041)
- [ ] T043 [US2] Apply the Opportunist execute bonus in `crates/engine/src/sim/damage.rs`, reading threshold and bonus from `ExecuteMods` (depends on T040)
- [ ] T044 [P] [US2] Mirror `stanceAggro` and `executeMods` in `sim/ruleset.ts` with exported defaults, and add role-partition types to `sim/model.ts`
- [ ] T045 [P] [US2] Validate the new tables in `server/ruleset-validate.ts` — all-present-or-all-absent, integer tiers in range, threshold in basis points
- [ ] T046 [US2] Replace the "no effect yet" stance caveat in `lib/garage/explain.ts` with live per-stance explanations, and update the now-failing stance assertions in `tests/garage-explain.test.ts`

### Verification for User Story 2

- [ ] T047 [US2] Run the full cascade per [quickstart.md](./quickstart.md) and confirm the goldens did **not** re-bless; investigate rather than re-blessing if they did
- [ ] T048 [US2] Run the balancer against the stance-diagnostic field and record SC-006 (every stance changes an outcome) and SC-007 (≥80% of matchups show a different casualty order)

**Checkpoint**: US2 functional and measurable. Ship as v13.

---

## Phase 5: User Story 3 — The Mech adapts mid-battle (Priority: P3)

**Goal**: Mech-exclusive reactive plating, native behavioural flexibility, and an optional Rocket Pack.

**Independent Test**: Mitigation shifts measurably toward the absorbed family; the Mech underperforms a
specialist in short battles and outperforms in long ones; reactive plating is offered nowhere else.

**Ships as**: ruleset v15. **Depends on US1** — adaptive mitigation is meaningless until defensive
layers are widespread enough for the matrix to discriminate. **Engine deploys before re-seed** (new
`Capability` variant).

### Tests for User Story 3

- [ ] T049 [P] [US3] Create Mech reactive-mitigation tests in `crates/engine/tests/defenses.rs` — repeated exposure to one family measurably reduces later damage from it
- [ ] T050 [P] [US3] Add a neutral-baseline test in `crates/engine/tests/defenses.rs` — an untouched Mech mitigates exactly as its Balanced equivalent, so reactive is never worse at battle start
- [ ] T051 [P] [US3] Add a tie-determinism test in `crates/engine/tests/defenses.rs` — equal absorption across families resolves to the lowest-ordered family and reproduces on replay (R9)
- [ ] T052 [P] [US3] Add an exclusivity test in `crates/engine/tests/defenses.rs` — reactive plating is rejected on every non-Mech mount class (FR-023)

### Implementation for User Story 3

- [ ] T053 [US3] Add `absorbed: [Fixed; 3]` and `reactive: bool` to `Combatant` and `EffectiveStats` in `crates/engine/src/sim/mod.rs` and `crates/engine/src/model/army.rs`
- [ ] T054 [US3] Accumulate absorbed damage per family in `crates/engine/src/sim/damage.rs` and apply the reactive mitigation bias when `stats.reactive` (depends on T053)
- [ ] T055 [US3] Add the Mech-exclusive reactive plating module to `crates/engine/src/content.rs`, gated on `mount_class == Mech`
- [ ] T056 [US3] Add the Rocket Pack module and its anti-air capability to `crates/engine/src/content.rs`, differentiated from dedicated anti-air by reach rather than damage rate
- [ ] T057 [US3] Grant the Mech its native behavioural flexibility in `crates/engine/src/content.rs` — the extra Plan-B slot other chassis buy with a utility slot (FR-025)
- [ ] T058 [P] [US3] Mirror the new capability and module in `sim/ruleset.ts` and `sim/legality.ts`, and gate the option in `components/garage/loadout-editor.tsx`
- [ ] T059 [US3] Explain reactive plating and the Rocket Pack from live values in `lib/garage/explain.ts`, with coverage in `tests/garage-explain.test.ts`

### Verification for User Story 3

- [ ] T060 [US3] Run the full cascade per [quickstart.md](./quickstart.md), including the golden re-bless for the new modules
- [ ] T061 [US3] Run the balancer and confirm the Mech's profile shifts from flat-efficient toward duration-dependent, recording the result

**Checkpoint**: US3 functional. Ship as v15.

---

## Phase 6: User Story 4 — Aircraft contestable without a dedicated counter (Priority: P4)

**Goal**: Energy weapons engage air at an intermediate rate; dedicated anti-air keeps a reach advantage.

**Independent Test**: An energy-armed ground machine engages air between the incidental and dedicated
rates; dedicated anti-air alone reaches distant aircraft; aircraft stay viable after *each* stage.

**Ships as**: ruleset v16–v19, **one change per version**.

> **⚠️ Do not batch these.** Four changes all pushing the same direction on an archetype at 60% is how
> air gets deleted with no way to tell which change did it (FR-030, SC-010).

### Tests for User Story 4

- [ ] T062 [P] [US4] Add air-rate ordering tests to `crates/engine/tests/counterweb.rs` — `plink < energy < flak` holds, and validation rejects a ruleset that violates it
- [ ] T063 [P] [US4] Add a reach-differentiation test to `crates/engine/tests/counterweb.rs` — only dedicated anti-air engages distant aircraft (FR-029)

### Implementation for User Story 4

- [ ] T064 [US4] Add `energy_air_dmg_mult` to `AirModifiers` in `crates/engine/src/model/ruleset.rs`, skip-serialized at its default
- [ ] T065 [US4] Apply the energy air rate in the domain-multiplier branch of `resolve_attack` in `crates/engine/src/sim/damage.rs` (depends on T064)
- [ ] T066 [US4] Allow energy weapons to reach air in `reach_zones` in `crates/engine/src/sim/target.rs`, without granting the dedicated anti-air reach advantage
- [ ] T067 [P] [US4] Mirror `energyAirDmgMult` in `sim/ruleset.ts` and enforce the `plink < energy < flak` ordering invariant in `server/ruleset-validate.ts`
- [ ] T068 [US4] Explain the three air-engagement tiers in `lib/garage/explain.ts`, with coverage in `tests/garage-explain.test.ts`

### Staged rollout for User Story 4

- [ ] T069 [US4] Stage 5a — ship the Heli rebase alone (already in US1), measure the field, and record aircraft viability in `specs/013-v2-ruleset/baseline/air-staging.md`
- [ ] T070 [US4] Stage 5b — ship laser air-engagement alone, re-measure, and append to `specs/013-v2-ruleset/baseline/air-staging.md`
- [ ] T071 [US4] Stage 5c — ship the Rocket Pack alone (from US3), re-measure, and append
- [ ] T072 [US4] Stage 5d — evaluate whether `aaFocusPerAir` still needs adjusting given the first three stages, and only then change it; record the decision either way
- [ ] T073 [US4] Confirm SC-009 (dedicated anti-air no longer last) and SC-010 (aircraft inside the viability band at *every* stage) from `specs/013-v2-ruleset/baseline/air-staging.md`

**Checkpoint**: US4 complete across four versions. Any single stage is independently revertible.

---

## Phase 7: User Story 5 — Support machines choose how they support (Priority: P5)

**Goal**: Triage, Sustain, and Empower as real support behaviours, with the role split enforced.

**Independent Test**: Each support stance produces a different repair-target sequence from the same
state; Empower strengthens instead of repairing; role filtering hides out-of-role options.

**Ships as**: ruleset v14. **Depends on US2** for the role split. **Engine deploys before re-seed**
(`SupportKind::Aura` becomes emitted for the first time).

### Tests for User Story 5

- [ ] T074 [P] [US5] Create support-stance tests in `crates/engine/tests/stance.rs` — Triage and Sustain select different targets from identical battle state
- [ ] T075 [P] [US5] Add an Empower test to `crates/engine/tests/stance.rs` — allies in range are strengthened and no repair occurs
- [ ] T076 [P] [US5] Add a role-partition test to `crates/engine/tests/stance.rs` — combat machines reject support stances and vice versa (FR-019)
- [ ] T077 [P] [US5] Add a backward-compatibility test to `crates/engine/tests/stance.rs` — an army holding an out-of-role stance still loads and degrades to neutral behaviour (FR-022)
- [ ] T078 [P] [US5] Add an empty-range test to `crates/engine/tests/stance.rs` — Empower with no allies in range is well-defined and does not error

### Implementation for User Story 5

- [ ] T079 [US5] Re-rank the support-target selector in `resolve_support` in `crates/engine/src/sim/mod.rs` by active stance — Triage by most-damaged, Sustain by effectiveness retention
- [ ] T080 [US5] Implement the Empower strengthening mechanic in `crates/engine/src/sim/mod.rs`, emitting `SupportKind::Aura` (depends on T079)
- [ ] T081 [US5] Enforce the stance role partition in `crates/engine/src/model/army.rs` validation, degrading rather than rejecting out-of-role values (FR-022)
- [ ] T082 [P] [US5] Mirror the role partition in `sim/legality.ts` and filter stance options by role in `components/garage/dial-editor.tsx`
- [ ] T083 [US5] Explain the three support stances from live values in `lib/garage/explain.ts`, with coverage in `tests/garage-explain.test.ts`

### Verification for User Story 5

- [ ] T084 [US5] Run the full cascade per [quickstart.md](./quickstart.md) and confirm no unexpected golden re-bless
- [ ] T085 [US5] Verify saved armies from before the role split still load correctly against the deployed engine

**Checkpoint**: All five stories functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T086 [P] Update the wiki — `Defenses.md`, `Behavior-Dials.md`, `Machine-Types.md`, `Air-Combat.md`, and `Combat-Mechanics.md` in `d:/Codelib/warformcommander.wiki/` for every shipped mechanic
- [ ] T087 [P] Update `Balance-State.md` and `Design-Notes.md` in the wiki to retire the resolved items and record the new measured field state
- [ ] T088 Record the final measured outcome for all twelve success criteria in `specs/013-v2-ruleset/baseline/outcome.md`, including any criterion that was not met and why
- [ ] T089 [P] Verify the Customize screen reads correctly in both mobile portrait and desktop landscape (P7)
- [ ] T090 Run the full [quickstart.md](./quickstart.md) final gate for the last shipped slice, including the production differential with its deploy-lag re-poll

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: blocks everything — the baseline is irrecoverable once content changes
- **US1 (Phase 3)**: after Foundational. Blocks US3 and US4
- **US2 (Phase 4)**: after Foundational. Independent of US1 — may run concurrently
- **US3 (Phase 5)**: after **US1**
- **US4 (Phase 6)**: after **US1**; its stages are strictly sequential
- **US5 (Phase 7)**: after **US2** (needs the role split)
- **Polish (Phase 8)**: after all shipped stories

### Story Dependency Graph

```text
Foundational
   ├──▶ US1 (defenses) ──┬──▶ US3 (Mech)
   │                     └──▶ US4 (air, staged 5a→5b→5c→5d)
   └──▶ US2 (stance) ────────▶ US5 (support stances)
```

### Parallel Opportunities

- T002, T003 in Setup
- **US1 and US2 are fully independent** — the largest parallelisation win, touching the damage
  pipeline and targeting respectively
- All test tasks within a story (marked [P]) — they are separate assertions in files created once
- TypeScript mirror tasks (T022, T023, T044, T045, T058, T067, T082) run parallel to their Rust
  counterparts

### Sequential Constraints That Must Not Be Parallelised

- **T069 → T070 → T071 → T072** — the air staging. The entire point is isolating which change moves
  the field.
- **T016 → T017** — the pure mitigation function must exist before the roll that feeds it.
- **T020 → T021** — repoint the default defense before rebasing chassis, or the rebase targets the
  wrong survivability curve.

---

## Parallel Example: User Story 1

```bash
# All US1 tests together (they fail until implementation lands):
Task: "Mount-class option coverage in crates/engine/tests/defenses.rs"
Task: "Ablative depletion in crates/engine/tests/defenses.rs"
Task: "Ablative save semantics in crates/engine/tests/defenses.rs"
Task: "Three-layer counter-web in crates/engine/tests/counterweb.rs"

# Independent model changes together:
Task: "AblativeDelta + DefenseSpec field in crates/engine/src/model/types.rs"
Task: "AblativeMods + MountScale in crates/engine/src/model/ruleset.rs"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (**do not skip — the baseline is irrecoverable**)
2. Phase 3 US1
3. **STOP and VALIDATE** against `comparison-points.md`, especially SC-005: if duration rose more
   than 10%, the rebase inflated survivability and must be corrected before anything else ships
4. Publish v12 — engine first, then re-seed

### Incremental Delivery

Each story ships as its own ruleset version so a regression traces to one change and reverts
independently. Recommended order: **US1 → US2 → US5 → US3 → US4**, which front-loads the two
independent stories and leaves the highest-risk work (air) until the field is understood.

### Notes

- [P] = different files, no dependencies
- Commit after each task or logical group; branch per slice (constitution IX)
- Verify tests fail before implementing
- Slices US2 and US5 expect **zero** golden re-bless — an unexpected hash change is a signal, not a
  chore
- Every new balance magnitude belongs in the ruleset, never as a literal in engine code (P8)
