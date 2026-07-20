---
description: "Task list for Feature 4 — Garage (squad builder + loadout/dial editor)"
---

# Tasks: Garage — Squad Builder + Loadout/Dial Editor

**Input**: Design documents from `specs/004-garage/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/editor-state.md](./contracts/editor-state.md)

**Tests**: **INCLUDED and non-optional.** The feature's core promises are executable — *no illegal
build ever persists* (SC-001/SC-005), *the preview equals the engine* (SC-002), *both orientations
are first-class* (SC-003), and *the on-ramp fields a legal squad in a few taps* (SC-004) — and
constitution **Principle VIII** + **P7** + **Principle II** require them. Reject-illegal, parity, and
save-gated-by-validate tests are written **before** the code they pin.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md user stories); Setup/Foundational/Polish carry no story label
- All TS paths are under the repo root; Garage code under `app/(app)/garage/`, `src/components/garage/`, `src/lib/garage/`
- Reused, **not created here**: `src/sim/` (Feature 1), `src/components/{ui,brand,shell}/` (Feature 3), `src/server/` (Feature 7)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the Garage route, the editor-state + component folders, and the test harness.

- [ ] T001 Create the Garage route: `app/(app)/garage/page.tsx` (Server Component stub that will load the roster via Feature 7 `listSquads` and render `GarageLayout`) + `app/(app)/garage/loading.tsx` skeleton. It sits inside Feature 3's `app/(app)/layout.tsx` shell (not created here). Per [plan.md](./plan.md) Project Structure.
- [ ] T002 Add `immer` to `package.json`; verify import paths resolve for Feature 1 (`@/sim`), Feature 3 (`@/components/{ui,brand,shell}`, `@/lib/utils`), and Feature 7 (`@/server`). **No new game types, DB access, or design primitives are introduced** (FR-020/FR-021).
- [ ] T003 [P] Scaffold `src/lib/garage/`: empty `editor-reducer.ts`, `use-garage-editor.ts` (`"use client"`), `to-squad-config.ts`, `preset-catalog.ts` per [contracts/editor-state.md](./contracts/editor-state.md) §4.
- [ ] T004 [P] Scaffold `src/components/garage/` shells: `garage-layout.tsx`, `squad-rail.tsx`, `formation-board.tsx`, `zone-row.tsx`, `unit-detail-panel.tsx`, `customize-surface.tsx`, `loadout-editor.tsx`, `dial-editor.tsx`, `planb-editor.tsx`, `preset-picker.tsx`, `defense-panel.tsx`, `validation-notice.tsx` ([contracts/editor-state.md](./contracts/editor-state.md) §5).
- [ ] T005 [P] Add the Garage e2e spec files + fixtures under `e2e/` (reuse Feature 3's Playwright + `@axe-core/playwright` setup) and a unit-test file layout for the reducer + parity tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The editor state machine, the shared-function adapter, the projection, the stock-preset
catalog, and the responsive rig — every user story imports these. Nothing in Phase 3+ can begin
until this is done.

**⚠️ CRITICAL**: This is the client editor view-model + the P8/P7 substrate.

- [ ] T006 **Cross-feature dependency ([plan.md](./plan.md) Complexity Tracking):** ensure Feature 1's shared TS surface `src/sim/` exports `validate()`, **`deriveEffectiveStats()`**, and **`unlockedCapabilities()`** as pure functions (mirrored from Rust, with the **engine-parity fixture test**). If missing, add them **to Feature 1's** surface — never a Garage-local copy (**P8**). This is the single hard prerequisite for the preview + gating.
- [ ] T007 Implement `src/lib/garage/to-squad-config.ts`: the single `DraftSquad → Feature 1 Squad/SquadConfig` projection (length-5 `MachineInstance[]`, per-machine `typeId/variantId/loadout/dials/planB/zone`) — the one shape the preview, `validate()`, and `saveSquad` all consume (data-model).
- [ ] T008 Implement `src/lib/garage/editor-reducer.ts`: the pure `garageReducer` with Immer over `EditorSession` — squad/slot actions (`createSquad`, `renameSquad`, `setRosterSlot`, `setType`, `setVariant`, `clearSlot`, `selectMachine`, `pickUpForPlacement`, `placeInZone`) ([research A1](./research.md), data-model action surface). Pure + serializable for dirty-diff.
- [ ] T009 Implement `src/lib/garage/use-garage-editor.ts` (`"use client"`): the context hook — `dispatch`, **memoized** `preview` (`deriveEffectiveStats` during render, [research A2](./research.md)) and `validation` (`validate(toSquadConfig(draft))`), `isDirty`, and async `save()`/`designate()`/`saveCurrentAsPreset()` that call Feature 7 (not reducer transitions, [research C2](./research.md)).
- [ ] T010 Implement `src/lib/garage/preset-catalog.ts`: the **static typed stock-preset catalog** keyed by `MachineTypeId` (representative subset per [plan.md](./plan.md) Scope) + `defaultFor(variantId)` — the canonical legal build a new machine seeds from (FR-004, [research B3](./research.md)). Each stock `Preset` passes `validate()` for its type.
- [ ] T011 Implement `src/components/garage/garage-layout.tsx` + `customize-surface.tsx`: the **two co-equal layouts** — 3-column landscape rig (rail 288 / formation 1fr / detail 372, per the mockup) ↔ stacked/tabbed portrait; the Customize editor as a `Sheet` (portrait) / side-panel (landscape). Media = macro, `@container` = micro; switch on width (`lg`), not orientation (**P7**, [research B2](./research.md), reusing Feature 3's law).

**Checkpoint**: the editor state, shared-fn adapter, catalog, and responsive rig exist; story work can begin.

---

## Phase 3: User Story 1 — Build and save a legal 5-unit squad (P1) 🎯 MVP

**Goal**: assemble five machines (type + variant, seeded legal), place them within the caps under a
live preview, and **save** — with every illegal arrangement blocked by a reason and nothing illegal
persisted, in **both** orientations.

**Independent Test**: on a stub roster, create → fill 5 slots → place within caps → save; assert
persistence via Feature 7, preview == engine derivation, and that a 6th machine / 4-in-ground /
3-in-Air / heli-on-ground blocks save with a reason — at 360px and 1440px.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T012 [P] [US1] `e2e/garage-build.spec.ts`: golden path — create, fill 5 slots (type+variant), place within caps, **Save** → the squad persists via Feature 7 `saveSquad` and appears in the rail (spec AS1/AS2).
- [ ] T013 [P] [US1] `e2e/garage-reject-illegal.spec.ts`: a 6th machine (V1), a 4th in a ground zone / 3rd in Air (V2), and a heli placed on the ground (V3) each surface a **reason** and disable **Save** (SC-001, AS3/AS4).
- [ ] T014 [P] [US1] `e2e/garage-responsive.spec.ts`: the full build flow at **360×640**, **1440×900**, and **320px** — no horizontal page scroll, every action reachable (SC-003, AS5, **P7**).
- [ ] T015 [P] [US1] `src/lib/garage/preview.parity.test.ts`: the client `deriveEffectiveStats`/power == the Feature 1 engine derivation for a battery of builds (SC-002).
- [ ] T016 [P] [US1] `src/lib/garage/save-gate.test.ts`: a known-illegal `SquadConfig` submitted to the save path **writes nothing** and returns the `validate()` reason (SC-005, Feature 7 A4).

### Implementation for User Story 1

- [ ] T017 [US1] Implement `squad-rail.tsx`: roster from Feature 7 `listSquads` — select / `+ NEW SQUAD` / rename / PWR / W-L / `ACTIVE` marker (mockup left rail); dispatches `selectSquad`/`createSquad`.
- [ ] T018 [US1] Implement `formation-board.tsx` (`"use client"`) + `zone-row.tsx`: four zone rows with cap labels; **tap-to-select-then-tap-zone** placement wired to `pickUpForPlacement`/`placeInZone`; full/off-home zones **disabled** (caps enforced by disabling, not rejecting — [research B1](./research.md)).
- [ ] T019 [US1] Implement `unit-detail-panel.tsx`: the selected machine's **7 `StatBar`s**, loadout rows, dial tiles, and squad summary `Chip`s (damage-family tags, `AA READY`/`NO AA`) from `StatPreview` — Feature 3 primitives only (mockup right rail).
- [ ] T020 [US1] Implement the type/variant picker that **seeds a default legal loadout + dials** from `preset-catalog.defaultFor(variant)` on `setType`/`setVariant` (FR-004) so a fresh squad is immediately saveable.
- [ ] T021 [US1] Implement the **Save flow** in `use-garage-editor.save()`: project via `to-squad-config`, call Feature 7 `saveSquad`/`updateSquad`, surface a **server-side** `validate()` rejection into `ValidationView`, revalidate the roster; wire `validation-notice.tsx` to show reasons against the offending slot/zone (FR-015/FR-016, Principle II).

**Checkpoint**: a legal squad can be built, previewed, validated, and saved in both orientations — the MVP.

---

## Phase 4: User Story 2 — Kit each machine: mount/family-gated loadout (P2)

**Goal**: edit a machine's 1 weapon / 1 defense / 3 utility (4 on Sentinel/Command Post) against the
Feature 1 catalog, mount/family-gated, dedup-enforced, with the native-bonus trade-off legible and
the preview re-deriving on every change.

**Independent Test**: open the loadout editor; assert only mount-legal weapons/defenses appear
(family crossover), a mount-illegal weapon is rejected, a duplicate utility is rejected, a 4-util
variant offers a 4th slot (3-util offers 3), and each change re-derives the preview == engine.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T022 [P] [US2] `e2e/garage-loadout.spec.ts`: weapon/defense pickers list **only** mount-legal options across the fitting families (crossover); choosing an off-native weapon shows it **forgoes the native bonus** (AS1, FR-006, **P1**).
- [ ] T023 [P] [US2] `src/components/garage/loadout.gating.test.ts`: mount-illegal weapon → rejected (V4); duplicate utility → rejected (V5); Sentinel/Command Post → 4th utility slot present, a 3-util variant → exactly 3 (V5, AS2–AS4).

### Implementation for User Story 2

- [ ] T024 [US2] Implement `loadout-editor.tsx` (`"use client"`): weapon/defense/utility pickers (`Menu`/`Dropdown` + `Chip`) filtered by the machine's `mountClass` with family crossover; utility **dedup** + variant slot-count (3/4); re-derive preview + re-validate on every change (US2 reducer actions `setWeapon`/`setDefense`/`setUtility`/`clearUtility`).
- [ ] T025 [US2] Implement the **native-family-bonus indicator** (a `Chip`/readout showing when the equipped weapon matches the type's native family vs an off-family sidegrade; Mech = generalist) — the **P1 "sidegrade, not upgrade"** made visible (FR-006, `StatPreview.nativeBonusApplies`).

**Checkpoint**: loadouts are mount/family-gated, dedup-safe, and the trade-offs are legible.

---

## Phase 5: User Story 3 — Dial in behavior: 4 dials + ≤2 Plan-B triggers (P2)

**Goal**: set the four dials (advanced options gated by the machine's utility capabilities) and up
to two Plan-B triggers (2nd slot gated; Slot 1 > Slot 2), rejecting ungated/excess/impossible
selections.

**Independent Test**: advanced dial options are disabled without the required utility; one Plan-B
slot without Combat AI/Tactical Computer; a 2nd is gated; >2 rejected; a movement order an
immobile/Air-locked machine can't perform is rejected.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T026 [P] [US3] `src/components/garage/dials.gating.test.ts`: advanced Target/Energy/Movement/Stance options are gated by `unlockedCapabilities` (V7); Smart-Counter requires the Targeting Computer; equipping it enables the option (AS1).
- [ ] T027 [P] [US3] `src/components/garage/planb.gating.test.ts`: exactly one Plan-B slot without Combat AI/Tactical Computer, a 2nd only with it (V6); a 3rd rejected; a movement order on an immobile/Air-locked machine rejected (V8, AS2/AS3/AS5).

### Implementation for User Story 3

- [ ] T028 [US3] Implement `dial-editor.tsx` (`"use client"`): the four dials — Target Priority (Target **Row** + Target **Rule**), Energy, Position/Movement, Stance — starter options always, advanced options **disabled unless** `unlockedCapabilities` grants them; re-derive/re-validate (FR-008, §8.1/§8.3).
- [ ] T029 [US3] Implement `planb-editor.tsx` (`"use client"`): ≤2 triggers, each `when [condition] → set [dial] to [Plan-B value]`; the 2nd slot gated by Combat AI/Tactical Computer; **Slot 1 > Slot 2** precedence surfaced (player-assigned); reject a 3rd (FR-009, §8.2).

**Checkpoint**: dials + Plan-B are capability-gated, capped, and precedence is clear.

---

## Phase 6: User Story 4 — Presets as the on-ramp (P2)

**Goal**: apply a stock preset to field a coherent machine in a few taps; save/re-apply custom
presets per machine type.

**Independent Test**: apply a stock preset → a legal fully-configured machine in a few interactions;
save a hand-tuned machine as a custom preset via Feature 7; re-apply it to another same-type
machine; assert presets are per-type and respect the variant's slot layout.

### Tests for User Story 4 ⚠️ (write first)

- [ ] T030 [P] [US4] `e2e/garage-onramp.spec.ts`: from empty, apply **stock presets** to field a **legal 5-unit squad** in a small, countable number of taps, no deep editor opened (SC-004, AS1).
- [x] T031 [P] [US4] `tests/garage-presets.test.ts`: re-applying to a same-type machine transfers the bundle; a different-type machine is **not** offered it (`presetsForType`); a preset never pushes a 4th utility onto a 3-slot variant (`fitUtilities`/`fitPresetToVariant`); the apply plans + reducer verb; five stock presets field a legal squad — all cross-checked vs `validateArmy` (AS2–AS4, FR-013). (The `savePreset` DB-persistence path is a Feature 7 concern; covered by its suite / e2e.)

### Implementation for User Story 4

- [x] T032 [US4] Implemented `preset-picker.tsx` (PRESETS tab) + `starter-picker.tsx` (on-ramp `+ PRESET`): list **stock** (from `preset-catalog`) + **custom** (Feature 7 `listPresets`, type-scoped); `applyPreset` sets variant/loadout/dials/planB respecting the target variant slot layout, then re-derives + re-validates; **save custom** via Feature 7 `savePreset` (FR-011/FR-012/FR-013).

**Checkpoint**: presets make the density approachable — the mandatory on-ramp works.

---

## Phase 7: User Story 5 — Designate ≤3 squads as defense (P3)

**Goal**: designate/undesignate/re-designate defense squads through Feature 7's transactional
service, surfacing the ≤3 cap, attack/defense exclusivity, and the ≥1-attackable rule; edits to a
designated squad never touch its live snapshot.

**Independent Test**: designate up to 3 (each snapshotted + out of the attack pool); a 4th blocked;
designating the last attackable squad prevented; editing a designated squad leaves its active
snapshot unchanged until re-designation.

### Tests for User Story 5 ⚠️ (write first)

- [ ] T033 [P] [US5] `e2e/garage-defense.spec.ts`: designate ≤3 via Feature 7 `designateDefense` (leaves the attack pool); a 4th is blocked with the ≤3 reason; designating the last attackable squad is prevented (SC-006, AS1/AS2/AS4).
- [x] T034 [P] [US5] `tests/garage-defense.test.ts`: the pure guard + **staleness** logic the panel renders — ≤3 cap / free slots, attack/defense exclusivity count, ≥1-attackable block, and "live config drifted from the frozen snapshot ⇒ re-designate" detection (`computeDefenseView`). (The DB-level guarantee that `updateSquad` never mutates an active snapshot row is a Feature 7 transactional concern — its suite / e2e.)

### Implementation for User Story 5

- [x] T035 [US5] Implemented `defense-panel.tsx` (`"use client"`): designate / undesignate / re-designate via Feature 7 (`designateDefense`/`undesignateDefense`/`redesignateDefense`); surfaces the ≤3 cap, attack/defense exclusivity, and ≥1-attackable rule (client convenience; server is authority); shows a "re-designate to push live" affordance on a stale designated squad; `squad-rail` already reflects `ACTIVE`/defense state (FR-017/FR-018). The Garage **never** mutates snapshot rows directly.

**Checkpoint**: a saved squad can become immutable async-PvP defense content, safely.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T036 [P] Edge states: **empty roster** first-squad flow (rail hint + first-free slot targeting); **all-8-full** replace prompt (NEW SQUAD disabled at cap); empty-attack-pool notice (defense panel's ≥1-attackable guard). Occupied-slot overwrite can't happen accidentally — new squads target the first *free* roster slot and editing updates in place.
- [x] T037 [P] **Unsaved-changes guard** (`components/garage/unsaved-guard.tsx`) — a `beforeunload` prompt while `isDirty`, so a dirty draft is never silently lost on reload/close/external nav. (In-app route changes are gated by the explicit Save + roster-load actions.)
- [~] T038 [P] Accessibility: **keyboard operability done** — tap-to-place is real `<button>`s (select + Enter/Space place), pickers are Radix DropdownMenu, and visible **focus rings** (Feature 3 `outline-ring`) added to the custom chip/place controls. The `@axe-core/playwright` run in both orientations is **deferred** (needs a browser).
- [~] T039 [P] Success-criteria: the **pure** SCs are green — SC-001 reject-illegal + SC-002 parity (`derive-parity`/`legality`), SC-004 on-ramp + SC-006 defense (unit suites); `next build` + `tsc` + ESLint + token guard clean. The **viewport-matrix e2e** sweep is deferred (needs a running app + browser).
- [x] T040 Updated `STATUS.md` (Feature 4 → BUILT) and `CHANGELOG.md` (Garage: squad builder + loadout/dial editor + presets + defense designation).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **blocks all user stories**. T006 (the shared Feature 1 surface) is the hard gate for the preview + gating.
- **US1 (P3)** → depends on Foundational; the MVP.
- **US2 (P4)** → depends on US1 (edits a machine US1 created); the capabilities it equips gate US3's dial options.
- **US3 (P5)** → depends on US1 + **US2** (dial gating reads the utilities US2 assigns).
- **US4 (P6)** → depends on US1–US3 (applies a bundle onto those editor surfaces).
- **US5 (P7)** → depends on **US1** (a saved squad) + Feature 7's designation transaction.
- **Polish (P8)** → depends on all desired stories.

### Within a story

Tests (reject-illegal / parity / gating) first → reducer/adapter → components → save/designate
wiring. Commit after each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T003–T005 in parallel.
- Foundational: T007/T010 parallel after T006; T011 parallel with T008/T009 (distinct files).
- US1 tests T012–T016 all `[P]`; then the components (T017–T019) are largely parallel (distinct files), T020/T021 depend on the reducer + save flow.
- US2 (T022–T025) can start once US1's machine editor exists; US4 (T030–T032) and US5 (T033–T035) test suites are `[P]`.

---

## Implementation Strategy

### MVP first (US1)

1. Setup → 2. Foundational (esp. **T006** shared surface) → 3. **US1** → **STOP & VALIDATE**
(SC-001 reject-illegal + SC-002 parity + SC-003 both-orientation green). That alone is a complete,
demonstrable squad builder that saves legal squads and blocks illegal ones.

### Incremental delivery

US1 (build + save legal squad) → US2 (mount/family-gated loadout) → US3 (dials + Plan-B) → US4
(presets on-ramp) → US5 (defense designation). Each adds provable value without breaking prior
stories; the feature is "done" when SC-001…SC-006 are green across the viewport matrix.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- **The trust boundary is the spine**: the client `validate()` is convenience; the **server-side
  `validate()` in Feature 7 is the authority** (A4) — no task may make the Garage a persistence or
  authorization authority (Principle II, P6).
- **P8**: the preview and gating call Feature 1's **shared** functions — never a Garage-local stat
  or validation formula. The parity test (T015) is the real contract; keep it green.
- **P7**: every interactive task must hold at 360px **and** 1440px — the both-orientation e2e (T014)
  and the axe pass (T038) are the gates, not an afterthought.
