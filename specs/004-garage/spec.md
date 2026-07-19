# Feature Specification: Garage — Squad Builder + Loadout/Dial Editor

**Feature Branch**: `004-garage`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Garage (squad builder + loadout/dial editor) — the primary screen where a player expresses 'skill in the plan' (P2): assemble a 5-unit squad (type + variant), kit each machine (1 weapon / 1 defense / 3 utility, mount/family-gated), dial in its 4 behavior dials + ≤2 Plan-B triggers, and place it across the four zones — with a live effective-stat + power-rating preview and illegal builds rejected with reasons via the shared Feature-1 `validate()`. Presets (stock + custom) are the on-ramp; squads save to the 8 roster slots and ≤3 are designated as defense — via Feature 7. The densest UI in the game; the both-orientation challenge (P7) is real here."

## Overview

The Garage is **where the game is actually played before the battle is watched.** Warform
Commander's skill lives in the plan (constitution **P2**), and this screen is where the plan is
authored: a player builds a **5-unit squad**, chooses each machine's **type + chassis variant**,
kits its **loadout** (1 weapon + 1 defense + 3 utility, mount/family-gated), tunes its **four
behavior dials + up to two Plan-B triggers**, and **places** it across the four zones — all under
a **live effective-stat + power-rating preview** and a **hard validation gate** that rejects any
illegal build with a reason.

It is not a new source of truth. Every game concept it edits is a **Feature 1 type**
([`001-battle-sim-core/data-model.md`](../001-battle-sim-core/data-model.md)); it composes
**Feature 3 tokens and primitives**
([`003-app-shell/contracts/components.md`](../003-app-shell/contracts/components.md)); it saves
and designates through **Feature 7's service**
([`007-accounts-persistence/contracts/persistence-api.md`](../007-accounts-persistence/contracts/persistence-api.md));
and it rejects exactly the builds the engine would, by calling the **same shared `validate()`**
([`001-battle-sim-core/contracts/engine-api.md`](../001-battle-sim-core/contracts/engine-api.md),
constitution **P8**). The Garage is the composition layer that turns those into an editor.

Because a squad is **5 machines × ~12 decisions each** (§8), this is the **densest UI in the
game**, and it must be **co-equally first-class in mobile portrait and desktop landscape**
(constitution **P7**) — that is the hardest design problem here, not an afterthought. **Presets**
(stock + custom, per machine type, §8.4) are the **mandatory on-ramp** that keeps that density
approachable — a newcomer fields a coherent army in a few taps, an enthusiast cracks it open to
hand-tune (§8.3).

The value it delivers: **a player can turn intent into a legal, saved, battle-ready squad — and
never be allowed to save one that can't fight.** The desktop layout is drawn in the committed
Garage mockup ([`reference/Warform Commander Garage.dc.html`](../../reference/Warform%20Commander%20Garage.dc.html));
the portrait treatment is the co-equal target this feature originates (constitution **P7**).

## User Scenarios & Testing *(mandatory)*

The "user" is a **player** authoring a squad, across both orientations. Stories are prioritized so
US1 alone is a shippable MVP: a player can assemble, preview, validate, and save a legal squad.
Each later story deepens the editor without breaking the ones before it.

### User Story 1 - Build and save a legal 5-unit squad (Priority: P1)

A player opens the Garage, creates (or selects) a squad, fills its five machine slots — each by
choosing a **machine type + chassis variant** (which seeds a **default legal loadout** from the
stock catalog so the machine is immediately battle-legal) — **places** each machine across the
four zones within the caps, watches the **live effective-stat + power-rating preview** update as
they go, and **saves** the squad into one of their **8 roster slots**. The moment any choice makes
the squad illegal (wrong count, zone cap breached, off-home-zone placement), the preview surfaces
the reason and **save is blocked**.

**Why this priority**: This is the Garage's reason to exist and the minimum that delivers value —
without it, there is no squad to battle, snapshot, or ladder. It exercises the whole spine:
Feature 1 types, the shared `validate()` and effective-stat derivation, Feature 3 primitives, the
Feature 7 save path, and the P7 responsive shell. Even alone it is a complete, demonstrable squad
builder. Co-critical foundation for every later feature that consumes a squad.

**Independent Test**: On a stub roster, create a squad, fill five slots from the type/variant
picker (each seeded legal), place them within caps, and save; assert the squad persists via
Feature 7, the preview's derived stats + power rating match the engine's derivation, and that an
illegal arrangement (6th machine, 4 in a ground zone, 3 in Air, heli placed on the ground) blocks
save with a reason — verified at 360px portrait and 1440px landscape.

**Acceptance Scenarios**:

1. **Given** an empty squad, **When** the player assigns a type + variant to each of the five slots and places them within the caps, **Then** the squad shows as legal, the live preview reports each machine's effective stats and the aggregate power rating, and **Save** is enabled.
2. **Given** a legal squad, **When** the player saves it to a roster slot, **Then** it persists through Feature 7's `saveSquad`, whose **server-side `validate()`** is the authority, and it appears in the squad rail.
3. **Given** a squad with a machine in a ground zone that already holds three, **When** the player tries to add a fourth to that zone (or a third to Air), **Then** the UI prevents/flags it and **Save** is blocked with the zone-cap reason.
4. **Given** a helicopter, **When** the player attempts to place it in a ground zone, **Then** the placement is rejected (heli is Air-locked; home-zone eligibility) with a reason.
5. **Given** any in-progress squad, **When** rendered at 360px portrait and at 1440px landscape, **Then** the builder is fully usable in both — no horizontal page scroll, every action reachable — each orientation designed *for* (constitution **P7**).

---

### User Story 2 - Kit each machine: mount/family-gated loadout (Priority: P2)

A player opens a machine's **Customize** surface and edits its **loadout** — **1 weapon + 1
defense + 3 utility** — choosing only from equipment that **fits the machine's mount class**, with
**damage-family crossover** inside what fits (an off-native-family weapon works but forgoes the
native bonus — the trade-off is shown, never hidden), **no duplicate utility modules**, and the
correct slot count (**4 utility** on the *Sentinel* mech and *Command Post* support). Every edit
re-derives the preview; an illegal loadout is rejected with a reason.

**Why this priority**: The loadout is half of "depth from configuration" (**P3**) and the sharpest
expression of "sidegrades, not upgrades" (**P1**) — the trade-offs must be legible and the gating
must hold. P2 because US1's squad-level machinery (types, placement, save, preview) must exist to
edit a machine within it.

**Independent Test**: Open a machine's loadout editor; assert the weapon/defense lists show only
mount-legal options with family crossover, that assigning a mount-illegal weapon is rejected, that
a duplicate utility is rejected, that a 4-util variant offers a fourth utility slot (and a 3-util
variant does not), and that each change re-derives the effective-stat preview matching the engine.

**Acceptance Scenarios**:

1. **Given** a machine of a given mount class, **When** the weapon/defense pickers open, **Then** only equipment whose `mountClass` fits is selectable, across all three damage families that fit (crossover), and choosing an off-native-family weapon shows it forgoes the native-family bonus.
2. **Given** a weapon whose mount class does not fit the machine, **When** it is (somehow) applied, **Then** the build is flagged illegal with the mount reason and save is blocked (V4).
3. **Given** a machine's three utility slots, **When** the player picks a module already equipped, **Then** the duplicate is rejected with a reason (V5).
4. **Given** a *Sentinel* mech or *Command Post* support, **When** its loadout opens, **Then** it exposes a **fourth** utility slot; a 3-util variant exposes exactly three (V5).
5. **Given** any loadout change, **When** it is applied, **Then** the machine's effective-stat + power-rating preview re-derives and matches the engine's derivation of the same config.

---

### User Story 3 - Dial in behavior: 4 dials + ≤2 Plan-B triggers (Priority: P2)

A player sets a machine's **four behavior dials** — Target Priority (Target **Row** + Target
**Rule**), Energy Allocation, Position & Movement, Stance — where **advanced options are unlocked
only by the utility capabilities the machine actually carries** (§8.3), and configures **up to two
Plan-B triggers** (base 1 slot; the 2nd requires a Combat AI / Tactical Computer capability), each
a `when [condition] → set [dial] to [Plan-B value]`, with **Slot 1 outranking Slot 2**. Ungated or
excess selections are rejected with a reason.

**Why this priority**: The dials + Plan-B are the other half of configuration depth (**P3**) and
the "planning over twitch" core (**P2**) — this is where a build starts to *think*. P2 because it
edits a machine that US1 created and US2 kitted (the capabilities that gate dial options come from
US2's utilities).

**Independent Test**: Open a machine's behavior editor; assert advanced dial options are disabled
unless the required utility is equipped, that a machine without a Combat AI/Tactical Computer
capability offers only one Plan-B slot, that adding a second slot without the capability is
rejected, and that Plan-B slot precedence (Slot 1 > Slot 2 on the same dial) is presented.

**Acceptance Scenarios**:

1. **Given** a machine without the Targeting Computer capability, **When** the Target Rule dial opens, **Then** the Smart-Counter option is disabled/gated; equipping the capability enables it (§8.3, V7).
2. **Given** a machine without a Combat AI / Tactical Computer, **When** the Plan-B editor opens, **Then** exactly **one** trigger slot is available; a second is offered only once the capability is equipped (V6).
3. **Given** more than two Plan-B trigger slots are attempted, **When** applied, **Then** it is rejected with a reason (V6).
4. **Given** two Plan-B triggers assigned to the **same** dial, **When** shown, **Then** the editor makes clear **Slot 1 wins** (precedence is player-assigned; §8.2).
5. **Given** an immobile or Air-locked machine, **When** a movement order it cannot perform is chosen (e.g. Reposition on dug-in artillery), **Then** it is rejected with a reason (V8).

---

### User Story 4 - Presets as the on-ramp: apply stock, save/apply custom (Priority: P2)

A player fields a coherent machine in a few taps by **applying a stock preset** (game-authored,
per machine type — "Breacher", "AA Screen", "Siege", …), then optionally hand-tunes it. An
enthusiast **saves a custom preset** of a hand-built machine to their personal library and
**re-applies** it to other machines of the **same type** later. A preset bundles the machine's
**whole setup** — variant + loadout + all four dials + Plan-B (§8.4).

**Why this priority**: Presets are the **mandatory on-ramp** (§8.3, §7.4 Guardrail) that makes the
~12-decisions-per-unit density survivable for newcomers — high user value. P2 because it applies a
*bundle* onto the editor surfaces US1–US3 build; it needs them to exist to apply onto.

**Independent Test**: Apply a stock preset to a machine and assert the machine becomes a legal,
fully-configured build in a few interactions; hand-tune a machine and save it as a custom preset
via Feature 7's `savePreset`; re-apply that custom preset to another machine of the same type and
assert the setup transfers; assert presets are offered only for the **matching machine type**.

**Acceptance Scenarios**:

1. **Given** an empty or default machine, **When** a stock preset for its type is applied, **Then** its variant, loadout, dials, and Plan-B are set to the preset's bundle and the machine is legal.
2. **Given** a hand-tuned machine, **When** the player saves it as a custom preset, **Then** it persists via Feature 7's `savePreset` (validated per type) and appears in the player's preset library for that machine type.
3. **Given** a custom preset for machine type T, **When** the player edits a different machine of type T, **Then** that preset is offered and applies its bundle; a machine of a different type is **not** offered it (presets are per type; gear is mount-gated).
4. **Given** a stock preset built for a 3-util variant, **When** applied to the machine, **Then** the loadout respects that variant's slot layout (no illegal 4th utility).

---

### User Story 5 - Designate ≤3 squads as defense (snapshotted) (Priority: P3)

A player designates up to **three** of their saved squads as **base defense**. Designating a squad
**snapshots** it (an immutable frozen copy via Feature 7) and **removes it from the attack pool**
(defense and attack pools are mutually exclusive); the player must keep **at least one attackable
squad**. Editing a squad that is an active defense **does not change the live snapshot** — the
change goes live only on **re-designation**.

**Why this priority**: Designation is what turns a saved squad into the async-PvP content the
ladder serves (**P5**), but it rides entirely on US1 (a saved squad must exist) and on Feature 7's
snapshot transaction. P3 because the build-and-save loop (US1–US4) is the feature's core; defense
designation is the hand-off to the Arena.

**Independent Test**: With ≥2 saved squads, designate up to three as defense and assert each is
snapshotted and leaves the attack pool via Feature 7; assert a **fourth** designation is blocked
(≤3 cap); assert designating the player's last attackable squad is prevented (need ≥1 to attack);
edit a designated squad and assert its **active defense snapshot is unchanged** until re-designated.

**Acceptance Scenarios**:

1. **Given** a saved, attackable squad, **When** the player designates it to a defense slot, **Then** Feature 7 freezes an immutable snapshot, the squad leaves the attack pool, and the slot shows filled (≤3 total).
2. **Given** three squads already designated, **When** the player designates a fourth, **Then** it is blocked with the ≤3-cap reason.
3. **Given** a squad that is an active defense, **When** the player edits and saves the source squad, **Then** the live snapshot is **unaffected** (immutability, Feature 7 SC-004) and the UI offers **re-designate** to push the edit live.
4. **Given** a player whose only remaining attackable squad is the one being designated, **When** they attempt it, **Then** it is prevented so at least one squad stays attackable.
5. **Given** the designate/undesignate action, **When** it runs, **Then** it goes through Feature 7's transactional `designateDefense` / `undesignateDefense` — the Garage never mutates snapshot rows directly.

---

### Edge Cases

- **Illegal build rejected with reason** — every V1–V8 case (Feature 1 data-model) surfaces a human reason *before* save; save stays disabled while any reason stands.
- **Zone-cap breach** — a 4th machine in a ground zone or a 3rd in Air is prevented at placement and, if reached, blocks save (V2).
- **Mount-illegal weapon/defense** — never selectable for the machine; if present in an applied preset/imported config, flagged (V4).
- **Duplicate utility module** — the same module cannot occupy two utility slots on one machine (V5).
- **More than two Plan-B triggers**, or a 2nd slot without the unlocking capability — rejected (V6).
- **4-util variants (Sentinel / Command Post)** — expose a fourth utility slot; every other variant exactly three; a preset must not push a 4th onto a 3-slot machine (V5).
- **Off-home-zone placement** — heli only in Air; ground types only in ground zones; support in ground zones (home-zone eligibility, V3).
- **Ungated dial option** — an advanced Target/Energy/Movement/Stance option is disabled unless the machine carries the unlocking utility capability (V7); **immobile/Air-locked machine given a movement order** it cannot perform is rejected (V8).
- **Designate a squad already in the attack pool** — designation moves it *out* of the attack pool; a squad already designated is not re-offered for designation, only re-designate/undesignate.
- **Edit a squad that is an active defense** — the source squad edits freely; the active snapshot is immutable and unchanged until re-designation (Feature 7 SC-004).
- **Empty roster** — a first-time player with zero squads sees a clear "create your first squad" entry; the attack pool being empty is surfaced (Feature 7: a player needs ≥1 attackable squad).
- **Saving to an occupied roster slot / all 8 slots full** — overwrite is explicit; a full roster prompts choosing a slot to replace (8-slot baseline, §16.2).
- **Unsaved changes** — navigating away from a dirty editor warns; the draft is not silently lost or silently saved.
- **Both orientations** — the 3-column desktop rig (squad rail · formation · unit detail) and its Customize surface remain fully usable as stacked/tabbed panes in portrait (constitution **P7**).
- **Stale preview vs authority** — the client preview is convenience; if the server-side `validate()` rejects on save (e.g. a ruleset changed under the player), the returned reason is surfaced and nothing persists (Principle II).

## Requirements *(mandatory)*

### Functional Requirements

**Squad assembly, roster & placement (US1)**

- **FR-001**: The Garage MUST let a player compose a squad of **exactly five machines**, assigning each a **machine type** and a **chassis variant** from the Feature 1 catalog, and MUST reject saving a squad that is not exactly five (V1).
- **FR-002**: The Garage MUST let a player **place** each machine across the four zones (Air / Front / Middle / Rear) subject to the hard caps — **ground zones ≤ 3, Air ≤ 2** — and **home-zone eligibility** (heli Air-only, ground types in ground zones), preventing or flagging any breach (V2, V3).
- **FR-003**: The Garage MUST let a player save a squad into one of their **8 roster slots** and manage the roster (name, select, overwrite an occupied slot), via Feature 7's `saveSquad` / `updateSquad` / `listSquads` — the **8-slot baseline is a Feature 7 service rule**, surfaced here, not re-implemented.
- **FR-004**: Each newly-typed machine MUST be seeded with a **default legal loadout + dials** (from the stock catalog for its variant) so a freshly-assembled squad can be legal and saved without opening every deep editor (the on-ramp, §8.3).

**Loadout editor — mount/family gating (US2)**

- **FR-005**: The Garage MUST present a machine's loadout as **1 weapon + 1 defense + 3 utility** (4 utility for the **Sentinel** mech and **Command Post** support per the variant's slot layout), editing each slot against the Feature 1 equipment catalog.
- **FR-006**: The weapon and defense pickers MUST offer **only equipment whose mount/weight class fits** the machine, with **damage-family crossover** inside what fits, and MUST make the **native-family bonus trade-off** legible (an off-native weapon works but forgoes the ~12% bonus; the Mech is the family generalist) — enforcing V4 and expressing constitution **P1** (sidegrades, not upgrades).
- **FR-007**: The utility slots MUST reject **duplicate modules** on one machine and enforce the correct slot count for the variant (V5).

**Behavior dials & Plan-B (US3)**

- **FR-008**: The Garage MUST let a player set the **four behavior dials** — Target Priority (Target **Row** + Target **Rule**), Energy Allocation, Position & Movement, Stance — offering **starter options always** and **advanced options only when the machine carries the unlocking utility capability** (§8.3), rejecting ungated selections (V7).
- **FR-009**: The Garage MUST let a player configure **up to two Plan-B triggers** — base one slot; a second only when a Combat AI / Tactical Computer capability is equipped — each as `when [condition] → set [dial] to [Plan-B value]`, and MUST present **Slot 1 > Slot 2** precedence; it MUST reject a 3rd slot or an ungated 2nd (V6).
- **FR-010**: The Garage MUST prevent assigning a **movement order an immobile or Air-locked machine cannot perform** (V8).

**Presets (US4)**

- **FR-011**: The Garage MUST offer **stock presets** (game-authored **static data**, per machine type) that a player can **apply** to set a machine's whole setup (variant + loadout + dials + Plan-B) in a few interactions (§8.4).
- **FR-012**: The Garage MUST let a player **save a custom preset** of a machine's setup to their library (per machine type) via Feature 7's `savePreset`, and **re-apply** it to other machines of the **same type** (`listPresets`), never offering a preset to a machine of a different type.
- **FR-013**: Applying any preset MUST respect the target variant's **slot layout** (no 4th utility on a 3-slot machine) and MUST leave the machine in a legal state or surface the reason if the applied bundle is illegal for the target.

**Live preview & validation (all stories; the trust boundary — Principle II)**

- **FR-014**: The Garage MUST show a **live effective-stat + power-rating preview** for the selected machine and an aggregate **squad power rating**, computed from the **shared Feature 1 effective-stat derivation** (not a Garage-local reimplementation), and it MUST match the engine's derivation of the same config (**P8**).
- **FR-015**: The Garage MUST run the **shared Feature 1 `validate()`** client-side to give **instant** rejection reasons at edit time, and MUST treat this preview as **convenience only** — the **authority is the server-side `validate()` inside Feature 7's write path** (trust-boundary rule A4). Save MUST be blocked while any client reason stands, and any server-side rejection on save MUST be surfaced with its reason and persist nothing (constitution **Principle II**, **P6**).
- **FR-016**: Every rejection (client or server) MUST carry a **human-readable reason** tied to the specific V1–V8 rule, shown against the offending machine/slot/zone.

**Defense designation (US5)**

- **FR-017**: The Garage MUST let a player **designate up to three** saved squads as defense and **undesignate** them, exclusively through Feature 7's transactional `designateDefense` / `undesignateDefense` / `redesignateDefense` — it MUST NOT mutate snapshot rows directly, and it MUST surface the **≤3 cap**, the **attack/defense pool exclusivity**, and the **≥1-attackable-squad** rule.
- **FR-018**: The Garage MUST make clear that **editing a designated squad does not change its live defense snapshot** (immutability, Feature 7 SC-004) and MUST offer **re-designate** to push an edit live.

**Presentation, reuse & responsiveness**

- **FR-019**: The Garage MUST be **co-equally first-class in mobile portrait and desktop landscape** (constitution **P7**): the desktop 3-column rig (squad rail · formation · unit detail + Customize) and its editors MUST remain fully usable as stacked/tabbed panes in portrait, with **no horizontal page scroll** from 320px up.
- **FR-020**: The Garage MUST **compose Feature 3 primitives and tokens** (`AppShell`/`PrimaryNav`, `UnitIcon`, `StatBar`, `Stat`, `Panel`, `Chip`, `Button`, `SectionLabel`, faction/zone/family tokens) and MUST NOT introduce raw brand hex or bespoke chrome (Feature 3 SC-002/SC-010; constitution **Principle III**).
- **FR-021**: The Garage MUST reuse the **Feature 1 typed game model** (MachineType, ChassisVariant, EquipmentModule, BehaviorDials, PlanBTrigger, Preset, Loadout, MachineInstance, Squad) and Feature 7's tables/service **by reference** — it defines **no** game types or persistence schema of its own (constitution **P8**; only a client editor view-model is Garage-owned).

### Key Entities *(include if feature involves data)*

The Garage **defines no game types** — it edits **Feature 1 entities** and persists through
**Feature 7 tables**. Referenced (not redefined here — see
[`001-battle-sim-core/data-model.md`](../001-battle-sim-core/data-model.md) and
[`007-accounts-persistence/data-model.md`](../007-accounts-persistence/data-model.md)):

- **MachineType / ChassisVariant / EquipmentModule / BehaviorDials / PlanBTrigger / Preset /
  Loadout / MachineInstance / Squad** — the Feature 1 content model the editor mutates.
- **`validate()` (V1–V8) and effective-stat derivation** — the shared Feature 1 functions the
  Garage calls for its preview and its instant-rejection feedback.
- **`squads` / `presets` / `defense_snapshots` tables + the persistence service** — Feature 7's
  storage and the `saveSquad` / `updateSquad` / `designateDefense` / `savePreset` API the Garage
  drives.

The **only** Garage-owned data is the **client editor view-model** (the in-progress draft, the
selection/dirty/validation view state) — defined in [`data-model.md`](./data-model.md), never
persisted as a game type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Illegal builds are blocked with a reason** — 100% of the enumerated illegal cases (V1–V8: wrong squad size, zone-cap breach, off-home-zone placement, mount-illegal weapon/defense, duplicate utility, excess/ungated Plan-B, ungated dial option, impossible movement order) are surfaced with a human reason **before** save, and **no illegal squad is ever persisted** (the server-side `validate()` gate holds even if the client preview is stale).
- **SC-002**: **Preview matches the engine** — for a representative battery of builds, the Garage's client-computed effective stats and power rating **equal** the Feature 1 shared derivation of the same config (zero discrepancy) — verified by a parity test against the engine derivation.
- **SC-003**: **Both orientations first-class (P7)** — the full build-a-squad flow (assemble → kit → dial → place → save) is completable with **no horizontal page scroll** and every action reachable at **360×640 (portrait)** and **1440×900 (landscape)**, and at 320px min — verified by automated viewport tests.
- **SC-004**: **The on-ramp works** — starting from empty, a player fields a **legal 5-unit squad** by applying **stock presets** in a small, countable number of interactions (a few taps per machine), with no deep editor required — verified by an e2e "few-taps-to-legal-squad" test.
- **SC-005**: **Save is gated by `validate()`** — every persistence write (`saveSquad`/`updateSquad`) is preceded by the shared `validate()` and a rejected config writes nothing and returns its reason (Feature 7 A4) — verified by a unit/integration test that a known-illegal config cannot be saved.
- **SC-006**: **Defense designation is safe** — designation never exceeds **3**, always leaves the source out of the attack pool, never lets a player designate their last attackable squad, and editing a designated squad leaves its **active snapshot byte-unchanged** — verified against Feature 7's `designateDefense` transaction and immutability guarantee (SC-004).

## Assumptions

- **Feature 1, 3, and 7 exist and are stable** — the Garage is a composition layer over their
  types, primitives, and service. It is planned in the foundation-first pass but implemented after
  those foundations (dependency order per STATUS.md).
- **A shared client-usable `validate()` and `deriveEffectiveStats()` are available from Feature 1
  as a pure TypeScript surface** (the Feature 1 TS mirror, `src/sim/`), so the client preview and
  the server gate call the **same logic** (P8) with no WASM engine shipped to the browser (P6).
  Feature 1 currently commits a TS *validation* mirror; **that the mirror also exports the shared
  effective-stat derivation is a cross-feature dependency this feature records** (see
  [`plan.md`](./plan.md) Complexity Tracking). If unavailable, the Garage adds it *to Feature 1's
  shared surface* with an engine-parity test — never a Garage-local reimplementation (P8).
- **Stock presets are static game data**, authored as a typed catalog module keyed by machine type
  (not DB rows); **custom presets** are Feature 7 `presets` rows. Authoring the *full* stock-preset
  content set is a light data task here — enough presets to seed the on-ramp and the tests, not an
  exhaustive library (mirrors Feature 1's "representative subset" stance).
- **The Garage does not run battles, render playback, or perform matchmaking** — it hands a saved
  squad to the Arena (Feature 8) and a designated snapshot to Feature 7; running the sim (Feature
  1/8), playback (Feature 5), and summaries (Feature 6) are out of scope (constitution **Principle
  IV**).
- **Power rating is derived, matchmaking-only, never combat** (Feature 1 FR-006); the Garage shows
  it as a build-summary readout, and Feature 7 recomputes it authoritatively on write.
- **The desktop mockup is the source of truth for the landscape layout**; the portrait treatment is
  the co-equal design this feature originates (constitution **P7**; Feature 3 responsive strategy).
- **Auth-gating of the `(app)` route group is Feature 7's concern** — the Garage assumes an
  authenticated session (ownership enforced server-side, Feature 7 A1/A2); it re-checks nothing
  client-side for authorization.
