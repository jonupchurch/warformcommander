---
description: "Task list for the Counter-Web feature (spec 014)"
---

# Tasks: Counter-Web — a contested battle field

**Input**: Design documents from `/specs/014-counter-web/` (plan.md, spec.md, research.md,
data-model.md, contracts/ruleset-schema.md, quickstart.md, diagnosis.md).

**Tests**: Included — the engine carries unit tests + golden replays, and this feature's acceptance is
a **field measurement**; both are real signal (Constitution VIII / P4).

**Organization**: by user story, but note the **hard sequencing** from research D3 — US1 (flatten) is a
falsifiable go/no-go **gate** that must show near-ties before US2 (counters) is worth building. Stories
are not independent here; that is a deliberate, recorded property of this feature.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3
- Every task names exact file paths.

---

## Phase 1: Setup & Measurement instrument (shared)

**Purpose**: the balancer is the arbiter (P4); promote the diagnosis probes to committed tooling and
lock the baseline every slice is compared against.

- [ ] T001 [P] Promote the diagnosis probes to a committed metric: `scripts/field-metrics.js` — reads a
  `balance-report.json` and prints walls / contested / near-ties (40–60%) / monotone rate, per the
  contract in `specs/014-counter-web/contracts/ruleset-schema.md`.
- [ ] T002 Capture the baseline to `specs/014-counter-web/baseline/` — run
  `cargo run -q -p balancer --release -- verify --field all --seed 1 --samples 2000 --out specs/014-counter-web/baseline`,
  then `field-metrics.js` on it; record walls/contested/near-ties/monotone/spread/median in
  `specs/014-counter-web/baseline/outcome.md` (the irrecoverable-once-catalog-changes comparison point).

**Checkpoint**: measurement is reproducible and the baseline is frozen.

---

## Phase 2: User Story 1 — coordination / flatten stacking returns (Priority: P1) 🎯 MVP · the gate

**Goal**: the Nth identical unit gives diminishing value, so composition power stops being
super-linear and matchups begin to land near parity.

**Independent Test**: `verify --field all` → **near-ties rise above 0** and monotone drops below 94%;
a controlled add-the-Nth-copy sweep shows the 0→100 cliff become a gradient. **If near-ties stay 0,
STOP** — the mechanism is wrong; revisit research D1 (squad-budget fallback) before any US2 work.

### Tests for User Story 1

- [ ] T003 [P] [US1] `crates/engine/tests/coordination.rs` — the Nth duplicate's effective damage is
  scaled by the curve (1st full, 2nd < 1st, …); a mono squad's total output is sub-linear in count.
- [ ] T004 [P] [US1] `crates/engine/tests/coordination.rs` — the **default (identity) curve changes
  nothing**: a stock battle's tick stream + `ruleset_hash` are byte-identical to pre-feature (proves
  hash-stability / no golden re-bless until the seed opts in).
- [ ] T005 [P] [US1] `crates/engine/tests/coordination.rs` — determinism: two runs of a coordinated
  battle at the same seed are identical (native path); duplicate-rank is computed in instance order.

### Implementation for User Story 1

- [ ] T006 [US1] Add the `Coordination` table to `crates/engine/src/model/ruleset.rs` (`returns: Vec<Bp>`
  or `[Bp; N]`, `grain: {Type|TypeVariant}`, `scales: {Offense|OffenseAndSurvivability}`), with
  `Default` = identity, `is_default`, and `Ruleset.coordination` field with
  `#[serde(default, skip_serializing_if = "Coordination::is_default")]`. Mirror `MountScale`.
- [ ] T007 [US1] Apply coordination at derive time in `crates/engine/src/model/army.rs`: compute each
  unit's duplicate rank under `grain` (instance order), scale derived `damage` (+ `hull`/`shield_cap`
  if `scales == OffenseAndSurvivability`) by `returns[min(rank, len-1)]` via `mul_bp`, exactly as
  `mount_scale` scales defensive magnitude.
- [ ] T008 [US1] Seed an initial coordination curve in `crates/engine/src/content.rs` (a starting
  falloff, e.g. `[10000, 8500, 7500, 7000, 7000]`, grain `Type`, scales `Offense`) — the value tuned
  in T012.
- [ ] T009 [US1] TS mirror: add `Coordination` to `sim/ruleset.ts`, apply it in `sim/derive.ts`, and
  accept it in `server/ruleset-validate.ts` (`returns[0]==10000`, each `∈[0,10000]`).
- [ ] T010 [US1] Run the **engine cascade** (quickstart §2): `cargo test -p engine` → clippy → fmt →
  re-bless goldens (BLESS_GOLDEN=1, catalog changed) → `wasm-pack build` → restore wasm gitignore/pkg
  → emit_battery + `wasm-parity.mjs` → regenerate derive/replay fixtures → `npx tsc --noEmit` →
  `npm test` (AFTER the wasm rebuild) → `npm run build`.
- [ ] T011 [US1] Customize "why" text for coordination in `lib/garage/explain.ts` (+ mirror test) —
  e.g. "3rd Heavy Tank · coordination ×0.75" (P7 text, no new layout).
- [ ] T012 [US1] **Tune on the field (the gate)**: `verify --field all` before/after via
  `field-metrics.js`; iterate the T008 curve until **near-ties > 0** and **monotone < 94%** while
  `NoDominantUnit` / `power-gap-cap` / `skill-beats-gear` stay green and median duration is ±10%.
  Record the result in `specs/014-counter-web/us1-result.md`. **Go/no-go decision documented here.**

**Checkpoint**: US1 is the MVP — if the gate passes, the total order is measurably broken; commit and
proceed. If it fails, pivot to the squad-budget fallback (do not start US2).

---

## Phase 3: User Story 2 — graded soft counters (Priority: P2) · depends on US1 passing the gate

**Goal**: in the flattened field, a countering equal-power composition tilts a matchup to 55–70% —
graded, lateral, from existing config axes only (no new units).

**Independent Test**: two equal-power comps, one countering the other → 55–70%; the mirror (counter
removed) → 45–55%; across the field, contested climbs toward ≥26/132 with winners counter-explainable.

### Tests for User Story 2

- [ ] T013 [P] [US2] `crates/engine/tests/counters.rs` — a matrix/role counter is a **tilt not a
  switch**: a countering attacker vs an equal-power target lands in a graded band, not 100/0
  (a per-battle assertion the field sweep can't isolate).

### Implementation for User Story 2

- [ ] T014 [US2] B1 — amplify the damage-family matrix magnitudes in `crates/engine/src/content.rs`
  (widen the swing from ~±40% toward a stronger sub-lethal tilt, keeping it symmetric/lateral);
  mirror in `sim/ruleset.ts`. Measure contested climbing.
- [ ] T015 [US2] B1 cont — strengthen/add graded `role_damage_bonuses` (lateral, situational) in
  `content.rs` + TS mirror.
- [ ] T016 [US2] B2 (only if B1 undershoots SC-001) — reach/defense-family counter lever; optionally
  enable a **graded** energy-air contest (`air_mods.energy_air_dmg_mult`) keeping
  `plink < energy_air < flak`.
- [ ] T017 [US2] Cascade (as T010) + tune on the field until contested → ≥26/132 and near-ties ≥20,
  invariants green; record in `specs/014-counter-web/us2-result.md`.

**Checkpoint**: US1 + US2 together produce a contested field decided by counter-matching.

---

## Phase 4: User Story 3 — preserve hard-counter texture (Priority: P3) · guardrail

**Goal**: the intended hard capability counters survive; the field is a spectrum, not coin-flips.

**Independent Test**: dedicated anti-air vs all-air still ≥80% for AA after both axes; remaining 0/100
sweeps are few and attributable to intended hard counters.

### Tests for User Story 3

- [ ] T018 [P] [US3] `crates/engine/tests/counters.rs` — AA→air resolves ≥80% for the anti-air side
  under the tuned ruleset (the preserved hard counter).

### Implementation for User Story 3

- [ ] T019 [US3] Guardrail pass: from the tuned field, confirm AA→air ≥80% (SC-006) and the
  decisiveness spectrum (few hard, many graded); if over-flattened, walk back the T008 curve or a
  counter magnitude. Record in `specs/014-counter-web/us3-result.md`.

**Checkpoint**: all three stories hold together — contested, counter-decided, with hard-counter
landmarks intact.

---

## Phase 5: Polish & Cross-Cutting

- [ ] T020 [P] Decide field-metrics home: fold walls/contested/near-ties/monotone into the balancer's
  own report (`crates/balancer/src/report/`) or keep `scripts/field-metrics.js` as the committed
  sidecar; document the choice.
- [ ] T021 [P] Update the wiki (`warformcommander.wiki/Balance-State.md` et al.) and `CHANGELOG.md` /
  `STATUS.md` for the counter-web pass.
- [ ] T022 Final full-field measurement vs **all** success criteria; write the honest scorecard to
  `specs/014-counter-web/outcome.md` (the v2 outcome.md shape) — SC-001…009.
- [ ] T023 Update persistent memory (`live-ruleset-is-a-db-row.md`) with the coordination mechanism and
  the new field metrics, once measured.
- [ ] T024 **(gated, separate — NOT part of build)** Production re-seed per the v2 deploy-before-reseed
  procedure, only after sign-off on the balance diff. `Coordination` is a field (not an enum variant),
  so it carries **no** deploy-before-reseed hazard on its own; any Axis B catalog additions do.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** — no deps; do first (the instrument + baseline).
- **US1 (Phase 2)** — after Setup. **The gate.** Its result decides whether US2/US3 proceed at all.
- **US2 (Phase 3)** — **depends on US1 passing** (soft counters are invisible on a steep ladder). Not
  independent — this is the deliberate sequencing from research D3.
- **US3 (Phase 4)** — after US2 (it measures the combined field).
- **Polish (Phase 5)** — after US1–US3.

### Within a story

- Tests before implementation (verify they fail first — T003–T005 fail until T006–T007 land).
- Model (T006) before derive (T007) before seed/tune (T008/T012).
- Cascade (T010/T017) before any field measurement claim (npm test only AFTER the wasm rebuild — the
  v2 lesson).

### Parallel opportunities

- T001 ∥ (T002 waits on the balancer build).
- Within US1: T003/T004/T005 (all in coordination.rs — actually same file, so sequential edits; the
  [P] is nominal) can be authored together; T006 and T009 (engine vs TS mirror) are genuinely parallel.
- Polish T020/T021 are parallel.

---

## Implementation Strategy

**MVP = US1 alone.** It is the falsifiable gate: build the coordination table + derive hook, tune the
curve, and check near-ties. If it works, the total order is broken and the field is measurably better
even before counters. If it doesn't, we've spent one slice to learn the mechanism is wrong and we
pivot — cheaply — to the squad-budget fallback, exactly as intended.

**Then US2 → US3**, each measured, each reversible, none re-seeded to production until T024 sign-off.

## Notes

- Every slice is a **measured** slice — "done" is a metric moving, not code compiling (the v2 lesson:
  the aggregate spread can improve while the field stays walls; near-ties + monotone are the real
  signal).
- Commit after each accepted slice (US1, US2, US3) with its `*-result.md`.
- The curve values and counter magnitudes in T008/T014/T015 are **starting points**; T012/T017 tune
  them empirically. Do not treat the seeded numbers as final.
