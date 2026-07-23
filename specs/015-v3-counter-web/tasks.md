---
description: "Task list for the v3 Counter-Web systems rewrite (spec 015)"
---

# Tasks: v3 Counter-Web — a ground-up systems rewrite

**Input**: Design documents from `/specs/015-v3-counter-web/` (plan.md, spec.md, research.md,
data-model.md, contracts/, quickstart.md) + authoritative design `../014-counter-web/weapons-design.md`.

**Tests**: **Included** — the engine carries unit tests, stat-block tests, and golden replays, and this
is a determinism-critical change (Constitution P6). Every slice's acceptance is a balancer field read.

**Organization**: by slice, in the plan's build order — Setup → Foundational (S0) → US1…US5 → Polish.
Slices are **sequential and measure-driven** (not parallel-team): each merges only on cargo tests +
native==wasm parity + a balancer field read. **All magnitudes are start-values to tune.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task → parallelizable *within its slice*.
- Engine paths are under `crates/engine/src/`; balancer under `crates/balancer/`.

---

## Phase 1: Setup (baseline)

**Purpose**: lock the before-picture so every slice can be measured against it.

- [ ] T001 Capture the v2 baseline field metrics — run `cargo run -p balancer --release -- verify --field all --seed 1 --samples 250` then `node scripts/field-metrics.js balance-reports/balance-report.json`, and record walls/contested/near-ties/monotone/spread + median duration into `specs/015-v3-counter-web/baseline.md` (the 93.9% / 491-tick before-picture).
- [ ] T002 Confirm the green starting state — `cargo test -p engine`, `cargo test -p balancer`, and `npm test` (derive-parity) all pass on `feat/014-counter-web` before any change.

---

## Phase 2: Foundational (Blocking Prerequisite) — S0

**Purpose**: make the balancer able to *gate* a counter-web. **⚠️ BLOCKS meaningful measurement of every user story** (a matrix change fails the current `SkillBeatsGear` by construction).

- [ ] T003 Re-fixture `SkillBeatsGear` in `crates/balancer/` so its "skilled" side is a **composition-quality** advantage (mixed counter-matched army vs a naive stack), NOT a single-damage-type edge (research D0 / FR-030). Keep the existing invariant name/plumbing.
- [ ] T004 Add a balancer self-test asserting the new `SkillBeatsGear` fixture does **not** move when only matrix multipliers change (proves it no longer fails structural matrix edits by construction) in `crates/balancer/`.
- [ ] T005 Verification gate (S0) — `cargo test -p balancer` green; run `verify --field all` and confirm `SkillBeatsGear` reads as a usable gate (informational until now). Record in baseline.md.

**Checkpoint**: measurement instrument trustworthy → user stories can begin.

---

## Phase 3: User Story 1 — Damage-type triangle decides matchups (Priority: P1) 🎯 MVP

**Goal**: sharpen the matrix and populate defenses so the right damage type overturns a rank gap.

**Independent Test**: a kinetic army beats a higher-power *shielded* army; an energy army beats a higher-power *armored* army; no single defense beats all three types. Contested ↑, monotone ↓ vs baseline.

### Tests for User Story 1 ⚠️ (write first, watch fail)

- [ ] T006 [P] [US1] Stat-block test: Kinetic strips a shield pool ~2× faster than Energy, and Energy kills an armored hull ~faster than Kinetic — at the v3 ×1.6/×0.7 values — in `crates/engine/src/sim/damage.rs` (extend the existing matrix stat-block tests).
- [ ] T007 [P] [US1] Test: no single defense family takes reduced damage from all three types (each defense loses to at least one type) in `crates/engine/src/model/ruleset.rs` or `content.rs` tests.

### Implementation for User Story 1

- [ ] T008 [US1] Tune `DamageMatrix` to Kinetic {vs_shields 1.6, vs_armor 0.7}, Energy {0.7, 1.6}, Explosive {1.0, 1.0} in `crates/engine/src/content.rs` (seed) / `model/ruleset.rs`; keep serde skip-at-default so untouched replays stay hash-stable (data-model TUNE, P8).
- [ ] T009 [P] [US1] Populate shield/armor **defense options across all 7 mounts** in `crates/engine/src/content.rs` so the field carries enough shields for Kinetic's ×1.6 to bite (data-model [CHANGE]); reuse existing family machinery.
- [ ] T010 [P] [US1] Weld cadence to damage type (Energy Fast / Kinetic Med / Explosive Slow / Artillery Siege) and make throughput non-flat (fast +DPS/low-alpha, slow −DPS/high-alpha) in `crates/engine/src/content.rs` (per-weapon `damage`/`cadence`).
- [ ] T011 [US1] Confirm the native **+12%** bonus is the native-type lever (RoleDamageBonus / native-family path) and apply it consistently in `crates/engine/src/content.rs` / `model/army.rs`; document which field carries it.
- [ ] T012 [US1] Apply the **Heavy + Mech** chassis modifier (+1 firing tick & +10% damage all types) on those chassis/variants in `crates/engine/src/content.rs`.
- [ ] T013 [US1] Regenerate the golden replays affected by the matrix/cadence value change (deliberately) and confirm the diffs are only the intended damage/timing shifts in `crates/engine/` golden fixtures.

### Verification gate (US1)

- [ ] T014 [US1] Gate — `cargo test -p engine` + `cargo test -p balancer` + `npm test` green; native==wasm parity green; run `verify --field all` + `field-metrics.js` and confirm **contested ↑ / monotone ↓** vs baseline and the acceptance scenarios (US1.1–1.3). Record the delta in baseline.md; re-tune start-values if it regressed.

**Checkpoint**: the triangle bites — the counter-web has a foundation.

---

## Phase 4: User Story 2 — Reach & positioning are a counter axis (Priority: P1)

**Goal**: priority-score targeting + four self-terminating movement modes so reach/kiting is a playable counter.

**Independent Test**: a kiter beats a higher-power brawler it can't out-damage; stranded units Advance and idle in reach; wounded units FallBack and return; Target Air self-reacts.

### Tests for User Story 2 ⚠️

- [ ] T015 [P] [US2] Test the priority-score selection: base 1–5 by rank + Decoy +2 / ECM −2, highest wins, ties → Closest/Furthest, recomputed per shot, in `crates/engine/src/sim/target.rs` tests.
- [ ] T016 [P] [US2] Test Follow is non-chaining focus-fire (a zone of Followers converges on the lead independent's target; no cycle) in `crates/engine/src/sim/target.rs` tests.
- [ ] T017 [P] [US2] Movement behavior tests: Advance idles once in reach and re-closes if re-stranded; FallBack ducks then returns to home zone when a slot frees; Kite oscillates forward→shoot→back, in `crates/engine/src/sim/behavior.rs` tests.

### Implementation for User Story 2

- [ ] T018 [US2] Rebuild `sim/target.rs` as the priority-score chain (2 filter slots + Closest/Furthest fallback, per-shot recompute, Decoy/ECM offsets); keep reach gating first (data-model [CHANGE]).
- [ ] T019 [US2] In `model/types.rs`: replace `TargetRow`/`TargetRule` with the priority-chain fields on `BehaviorDials`; **remove all smart selectors** (Most/Least HP, *Threat, SmartCounter); keep declarative filters (TargetAir/TargetArmor-by-armor_pct/TargetSupport/TargetIndirect/Follow). Camo=+evasion stays a hit-time dodge in `sim/damage.rs`.
- [ ] T020 [US2] Rebuild `MovementMode` in `model/types.rs` to `Hold`/`Advance`/`Kite`/`FallBack`; **remove `Reposition`/`Escort`** and the Kite/Reposition/Escort capability gates.
- [ ] T021 [US2] Add `home_zone` (from assigned placement) + FallBack-return / Kite-phase counters to `Combatant` in `model/army.rs`.
- [ ] T022 [US2] Implement the self-terminating movement in `sim/behavior.rs`: Advance closes-then-idles, Kite oscillation, FallBack 10-tick duck + home-zone return respecting the 3/2 zone cap (data-model [CHANGE]).
- [ ] T023 [US2] Update `validate.rs` for the new movement enum + targeting fields; keep zone-cap validation (3 ground / 2 air) intact.

### Verification gate (US2)

- [ ] T024 [US2] Gate — cargo/npm tests green; native==wasm parity green; `verify --field all` + `field-metrics.js` show a reach/kite counter appearing (US2.1–2.4). Record delta; re-tune if regressed.

**Checkpoint**: reach + positioning is a real, playable counter.

---

## Phase 5: User Story 3 — Graded, accessible equipment counters (Priority: P2)

**Goal**: the unified equipment model — per-chassis budgets, Self/Enemy/Ally domains, riders + auras + capability unlocks — every item a trade-off (P1).

**Independent Test**: fitting AA *bends* the air matchup without new dominance; ECM/Decoy redistribute targeting; fresh-vs-max power gap ≤ ~25%.

### Tests for User Story 3 ⚠️

- [ ] T025 [P] [US3] Loadout validation tests: utility budgets (Commander 5 · Mech 4 · Heavy/Light 3 · Heli/Arty/RktArty 2), no-duplicate utilities, cost-tier totals in `crates/engine/src/validate.rs` tests.
- [ ] T026 [P] [US3] On-hit rider tests: EMP suppresses heal/shield-regen for N ticks; Suppress/Snare/Paint apply their effects deterministically in `crates/engine/src/sim/damage.rs` tests.
- [ ] T027 [P] [US3] Power-cap test: no equipment choice is a straight upgrade; assemble a fresh vs fully-kitted army and assert the effective-power gap ≤ ~25% (SC-007) in balancer or engine tests.

### Implementation for User Story 3

- [ ] T028 [US3] Set per-chassis utility slot budgets + cost tiers (1/2/3; Jump Jets=3) in `content.rs` / `model/army.rs` `SlotLayout`.
- [ ] T029 [P] [US3] Common single-stat booster pool (one per stat, 1 slot each) in `content.rs` equipment catalog.
- [ ] T030 [P] [US3] Enemy on-hit riders (EMP/Suppress/Snare/Paint) — catalog entries + resolution hooks in `sim/damage.rs` (`EquipmentId` [NEW] in `model/types.rs`).
- [ ] T031 [P] [US3] Ally auras + capability unlocks (AA, ECM, Decoy, Jump Jets) as class-specific kit in `content.rs`; wire ECM(−2)/Decoy(+2) into the targeting score (from US2 chain).
- [ ] T032 [US3] Assemble the 7 locked chassis kits (weapons-design §14.1–14.6) in `content.rs`, incl. innate Spotter Network (Light) and Coordinated Strike (Heli).
- [ ] T033 [US3] Validation + serde-default hash-stability for all new equipment in `validate.rs` / `content.rs`.

### Verification gate (US3)

- [ ] T034 [US3] Gate — tests green; native==wasm parity; `verify --field all` shows a target matchup (e.g. air) **bends** without new dominance and power stays lateral (US3.1–3.3, SC-007). Record delta; re-tune.

**Checkpoint**: graded soft counters tilt the now-contestable matchups.

---

## Phase 6: User Story 4 — Reactive behavior rewards planning (Priority: P2)

**Goal**: 3 universal stances + narrowed Plan-B; energy dial cut.

**Independent Test**: a `HullBelowPct→FallBack/Defensive` army outlasts the same army without it; Defensive costs the Commander projection too; watch Defensive-vs-Defensive duration.

### Tests for User Story 4 ⚠️

- [ ] T035 [P] [US4] Stance tests: Aggressive +5%dmg/+5%acc/+10%taken; Defensive −5%taken/+5%evasion/+5%armor/+5%shield/−20% output; "output" applies to weapon damage AND Commander projection, in `crates/engine/src/sim/damage.rs` tests.
- [ ] T036 [P] [US4] Plan-B tests: `NoTargetsReachable→Advance` fires when stranded; latch fires once; Slot-1 > Slot-2 precedence holds regardless of fire order, in `crates/engine/src/sim/behavior.rs` tests.

### Implementation for User Story 4

- [ ] T037 [US4] Collapse `Stance` to `Aggressive`/`Neutral`/`Defensive` in `model/types.rs`; **remove Protector/Opportunist/Triage/Sustain/Empower**, `Stance::{COMBAT,SUPPORT,is_support,fits_role}`, and the `OpportunistStance` unlock; update all match sites.
- [ ] T038 [US4] Apply stance as a two-sided **output** multiplier in `sim/damage.rs` (weapon damage; and Commander projection once US5 lands).
- [ ] T039 [US4] **Remove the Energy dial**: delete `EnergyMode`, `EnergyModes`/`EnergyProfile`, `energy_damage_mult`/`_taken_mult`, `BehaviorDials.energy`; strip energy from `damage.rs`/`target.rs`/`army.rs`/`validate.rs`. **Keep** the Energy damage type + `air_mods.energy_air_dmg_mult`.
- [ ] T040 [US4] Plan-B trigger changes in `model/types.rs` + `sim/behavior.rs`: add `TriggerCondition::NoTargetsReachable`; remove `AirEnemyExists`/`EnemyInZone`; restrict `DialKey`/`DialValue` to Movement/Stance (drop Energy + Targeting).
- [ ] T041 [US4] Update `validate.rs` for the new stance/trigger/dial sets; keep 1 Plan-B slot (+1 via Combat AI `ExtraPlanBSlot`).

### Verification gate (US4)

- [ ] T042 [US4] Gate — tests green; native==wasm parity; `verify --field all` shows reactive value and **median duration within ~10% of 491** (SC-005 — the Defensive-stall watch). Record delta; re-tune the −20% if duration drifts.

**Checkpoint**: planning-as-reaction adds depth without breaking duration.

---

## Phase 7: User Story 5 — The Commander is a strategic keystone (Priority: P3)

**Goal**: Command (army buff while alive) + Heal/Shield/Ablation projector → protect-vs-assassinate cycle.

**Independent Test**: an assassin build (Target Support + deep reach) counters the Commander build; the Commander build beats no-backline-reach armies.

### Tests for User Story 5 ⚠️

- [ ] T043 [P] [US5] Command tests: while the Commander lives, army `plan_b_slots` +1 and advanced behaviors unlock; on its death both revoke army-wide mid-battle, in `crates/engine/src/model/army.rs` / `sim/behavior.rs` tests.
- [ ] T044 [P] [US5] Projector tests: Heal/Shield/Ablation output scales with stance (Defensive −20%) and the DamageTaken aura reduces incoming, in `crates/engine/src/sim/damage.rs` tests.

### Implementation for User Story 5

- [ ] T045 [US5] Add `AuraKind::DamageTaken` variant in `model/types.rs` and consume it in `sim/damage.rs` (data-model [NEW]).
- [ ] T046 [US5] Implement **Command** as the army-wide while-alive buff (+1 Plan-B slot + advanced-behavior unlock) in `model/army.rs` / `sim/behavior.rs`.
- [ ] T047 [US5] Implement the Commander Heal/Shield/Ablation **projector** weapon (0 direct damage; output scaled by stance) in `content.rs` / `sim/damage.rs`.
- [ ] T048 [US5] Wire the Commander equipment kit (Amplifier/Coordination/Recon/Broadcast/Multi-Targeting/Boost/Reduction/Rally/Comms-Jammer, §14.6) in `content.rs`; confirm assassination is expressible via Target Support + deep reach (no new mechanic).

### Verification gate (US5)

- [ ] T049 [US5] Gate — tests green; native==wasm parity; `verify --field all` shows the assassinate-vs-protect cycle (US5.1–2). Record delta.

**Checkpoint**: the capstone counter-cycle exists.

---

## Phase 8: Polish & Cross-Cutting

**Purpose**: parity, propagation, and the whole-feature acceptance.

- [ ] T050 [P] Update the TS derive mirror (`lib/*`, `types.ts` `SupportRange` etc.) and **regenerate `derive-battery.json` deliberately** for the changed enum/stat shapes; confirm `derive-parity.test.ts` green (never a side effect — [[derive-battery-fixture-stale]]).
- [ ] T051 Document + follow the **propagation order** in `contracts/ruleset-schema.md`: new enum variants (AuraKind::DamageTaken, NoTargetsReachable, new EquipmentIds) ⇒ **deploy wasm FIRST**, then `tsx scripts/reseed-current-ruleset.ts`, then verify on the arena path.
- [ ] T052 [P] Reconcile any drift between the shipped numbers and `../014-counter-web/weapons-design.md` (the design is source of truth) — update the doc's start-values to the tuned values.
- [ ] T053 **Whole-feature acceptance** — run `verify --field all` and confirm SC-001…008 hold **together** (no dominant build; ≥2 non-trap counters/top build; monotone → ~70%; cycles present; duration within ~10% of 491; native==wasm; power ≤25%; no coin-flips). Judge by contested/cycle count, not spread. Record final field in baseline.md.

---

## Dependencies & Execution Order

- **Setup (P1: T001–T002)** → no deps.
- **Foundational S0 (P2: T003–T005)** → after Setup; **BLOCKS trustworthy measurement of every US**.
- **US1 (P3)** → after S0. The MVP counter — everything else builds on the triangle biting.
- **US2 (P4)** → after S0; independently testable, but most valuable once US1 gives it a field to bite in.
- **US3 (P5)** → after S0; ECM/Decoy wiring depends on the US2 targeting chain (T031↔T018).
- **US4 (P6)** → after S0; energy-removal + stance touch `damage.rs`/`behavior.rs` shared with US2 (sequential, same files — not parallel across slices).
- **US5 (P7)** → after US4 (stance-scaled projection) and US3 (aura/equipment machinery).
- **Polish (P8)** → after all desired stories.

**Slices are sequential and measure-driven** — do not start the next slice until the current one's gate is green (or its start-values re-tuned). `crates/engine/src/model/types.rs`, `sim/damage.rs`, and `sim/behavior.rs` are touched by multiple slices, so cross-slice tasks on them are **not** `[P]`.

## Parallel Opportunities (within a slice)

- US1: T006/T007 (tests) ∥; T009/T010 (defenses ∥ cadence, different data regions).
- US2: T015/T016/T017 (tests) ∥.
- US3: T029/T030/T031 (catalog additions in different areas) ∥; T025/T026/T027 (tests) ∥.
- US4: T035/T036 (tests) ∥.
- US5: T043/T044 (tests) ∥.

## Implementation Strategy

- **MVP = Setup + S0 + US1.** The triangle biting is the first shippable counter-web increment — STOP and measure before US2.
- **Incremental**: each slice ships behind its gate; a slice that regresses the counter-web metric is re-tuned (start-values) before the next. New enum variants ship to prod only via the propagation order (T051).
- **Determinism is the through-line**: no task merges without `cargo test -p engine` (golden replays) + native==wasm parity green.

## Notes

- All magnitudes (matrix, stance %s, cadence, slot costs, budgets, +12%) are **start-values** — success is the field metrics (SC-001…008), not any specific number.
- Commit after each task or coherent group; keep the ruleset **hash-stable at defaults** (serde skip-at-default) so untouched replays don't churn.
- `weapons-design.md` §11 registry is the design source of truth; this task list is its execution.
