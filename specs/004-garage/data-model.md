# Data Model: Garage — the client editor view-model

**Feature**: `004-garage` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

The Garage **defines no game types and no persistence schema.** Everything it edits is a **Feature
1 type** ([`001-battle-sim-core/data-model.md`](../001-battle-sim-core/data-model.md)); everything
it saves is a **Feature 7 row** ([`007-accounts-persistence/data-model.md`](../007-accounts-persistence/data-model.md)).
The only data this feature owns is the **client editor view-model** — the ephemeral,
**never-persisted** shape that holds the in-progress squad and the selection/dirty/validation view
state while a player builds. It exists purely to drive the reducer ([research A1](./research.md))
and the render; on save it is **projected to a Feature 1 `Squad` (`SquadConfig`)** and handed to
Feature 7 (constitution **P8** — one source of truth, no duplication).

Types below are **TypeScript-shaped view-model contracts** (illustrative), living under
`src/lib/garage/`. Where a field's type is a Feature 1 type, it is **imported**, not redefined.

## Layering — what is reused vs what is Garage-owned

| Tier | Owner | Examples |
|---|---|---|
| **Game content model** | **Feature 1** (reused by reference) | `MachineType`, `ChassisVariant`, `EquipmentModule`, `BehaviorDials`, `PlanBTrigger`, `Preset`, `Loadout`, `MachineInstance`, `Squad`/`Army` |
| **Shared pure functions** | **Feature 1** (called, not reimplemented) | `validate(army, ruleset) → ValidationError[]`, `deriveEffectiveStats(machine, ruleset) → EffectiveStats`, `derivePowerRating(...)` |
| **Persistence** | **Feature 7** (called, not redefined) | `squads`, `presets`, `defense_snapshots` tables; the `saveSquad`/`designateDefense`/`savePreset` service |
| **Client editor view-model** | **Feature 4 (this file)** | `DraftSquad`, `DraftMachine`, `EditorSelection`, `EditorSession`, `ValidationView`, `StatPreview`, `PresetCatalog` |

---

## Tier — Client editor view-model (Feature 4-owned, never persisted)

### `EditorSession`

The top-level `"use client"` state the Garage reducer owns (one per open Garage screen).

| Field | Type | Notes |
|---|---|---|
| `draft` | `DraftSquad` | the in-progress squad being edited |
| `savedBaseline` | `DraftSquad?` | the last-saved projection, for **dirty** diffing (`isDirty = draft ≠ savedBaseline`) |
| `selection` | `EditorSelection` | which machine/slot/zone/editor-pane is focused |
| `rosterSlotIndex` | `number?` | 0–7 target roster slot (Feature 7 `squads.slotIndex`); `null` until chosen |
| `defenseSlot` | `0 \| 1 \| 2 \| null` | mirror of the saved squad's Feature 7 `defenseSlot` (read-only view; designation goes through Feature 7) |
| `status` | `Editing \| Saving \| Saved \| Error` | drives Save button + toasts |

### `DraftSquad`

The editable projection of a Feature 1 `Squad`. **Normalized** (machines keyed by slot index) for
cheap deep updates ([research A1](./research.md)).

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | squad name (Feature 7 `squads.name`) |
| `machines` | `Record<0..4, DraftMachine \| Empty>` | exactly five slots; a slot may be **empty** during construction (an empty slot ⇒ squad not yet legal, V1) |

> **Projection to Feature 1**: `toSquadConfig(draft) → Squad` fills `MachineInstance[]` (length 5)
> with each machine's `typeId/variantId/loadout/dials/planB/zone`; it is the exact `SquadConfig`
> Feature 7 stores and Feature 1 validates. The Garage never stores anything but this projection.

### `DraftMachine`

The editable projection of a Feature 1 `MachineInstance`. Every field maps 1:1 to a Feature 1
field; the Garage adds only transient edit affordances.

| Field | Type | Maps to (Feature 1) |
|---|---|---|
| `typeId` | `MachineTypeId` | `MachineInstance.typeId` |
| `variantId` | `VariantId` | `MachineInstance.variantId` |
| `loadout` | `Loadout` (`weapon`, `defense`, `utilities[3\|4]`) | `MachineInstance.loadout` |
| `dials` | `BehaviorDials` | `MachineInstance.dials` |
| `planB` | `PlanBTrigger[]` (0–2) | `MachineInstance.planB` |
| `zone` | `ZoneId` | `MachineInstance.zone` |
| `sourcePresetId` | `PresetId?` | *(view-only)* which preset last seeded/edited this machine, for the "modified since preset" hint — not persisted on the instance |

### `EditorSelection`

| Field | Type | Notes |
|---|---|---|
| `selectedSlot` | `0..4 \| null` | the machine under edit (drives the unit-detail pane + Customize surface) |
| `placingSlot` | `0..4 \| null` | a machine picked up for **tap-to-place** (research B1); the next zone tap assigns it |
| `activePane` | `Formation \| Loadout \| Dials \| Presets` | which Customize tab/section is open (portrait tabs / landscape panels) |

### `ValidationView` — the client rendering of `validate()`

**Derived**, never stored. A view over the shared Feature 1 `validate()` result, indexed so a
reason can be shown against the offending element (constitution **Principle II**; spec FR-016).

| Field | Type | Notes |
|---|---|---|
| `isLegal` | `bool` | `errors.length === 0`; gates the **Save** button (client-side convenience) |
| `errors` | `ValidationError[]` | the shared `{ code: V1..V8, reason }[]` from Feature 1 |
| `bySlot` | `Record<0..4, ValidationError[]>` | errors attributed to a machine (mount/dup/dial/Plan-B/movement) |
| `byZone` | `Record<ZoneId, ValidationError[]>` | zone-cap / home-zone errors (V2/V3) |
| `squadLevel` | `ValidationError[]` | squad-size (V1) and other whole-squad reasons |

> **Authority note**: `isLegal` here is **convenience only**. Persistence is gated by the
> **server-side** `validate()` inside Feature 7's `saveSquad`/`updateSquad` (A4) — the sole
> authority ([research C1](./research.md)). A server rejection at save is surfaced back into
> `errors` and blocks the write.

### `StatPreview` — the live derived readout

**Derived** (memoized, [research A2](./research.md)) from the selected machine and the squad; never
stored. Every number comes from Feature 1's shared derivation, so it **equals** the engine's
derivation of the same config (spec SC-002).

| Field | Type | Source |
|---|---|---|
| `effective` | `EffectiveStats` | `deriveEffectiveStats(machine, ruleset)` (Feature 1) — Hull/Armor/Shield/Damage/FireRate/Speed/Evasion, etc. (the mockup's 7 stat bars) |
| `machinePower` | `Fixed` | Feature 1 derived power rating for the machine (matchmaking-only, never combat) |
| `squadPower` | `Fixed` | aggregate over the five machines (mirrors Feature 7 `squads.powerRating`, recomputed server-side on save) |
| `nativeBonusApplies` | `bool` | whether the equipped weapon's family matches the type's native family (surfaces the **sidegrade** trade-off, constitution **P1**; spec FR-006) |
| `summaryTags` | `Chip[]` | squad readouts from the mockup (damage-family tags, `AA READY`/`NO AA` from presence of Rocket Artillery) |

### `PresetCatalog` — stock (static) + custom (Feature 7)

| Field | Type | Notes |
|---|---|---|
| `stock` | `Record<MachineTypeId, Preset[]>` | **static typed game data** ([research B3](./research.md)); each `Preset.origin = Stock`; per machine type (§8.4) |
| `custom` | `Preset[]` | the player's library for the current machine type, from Feature 7 `listPresets(machineTypeId)`; `origin = Custom` |
| `defaultFor(variantId)` | `→ Preset` | the canonical legal build a newly-typed machine seeds from (spec FR-004) |

Applying a preset (`applyPreset(slot, preset)`) sets the draft machine's `variantId/loadout/dials/
planB` from the preset's bundle, then re-runs derivation + `validate()`; it respects the target
variant's slot layout (no 4th utility on a 3-slot variant, V5; spec FR-013).

---

## Reducer action surface (the editor verbs)

Pure transitions over `EditorSession` ([research A1](./research.md)); each is independently
unit-testable (constitution **Principle VIII**). Not exhaustive:

```
createSquad() · selectSquad(id) · renameSquad(name) · setRosterSlot(0..7)
setType(slot, typeId) · setVariant(slot, variantId) · clearSlot(slot)
selectMachine(slot) · pickUpForPlacement(slot) · placeInZone(slot, zone)
setWeapon(slot, id) · setDefense(slot, id) · setUtility(slot, uIdx, id) · clearUtility(slot, uIdx)
setDial(slot, dialKey, value) · addPlanB(slot, trigger) · setPlanB(slot, planBSlot, trigger) · removePlanB(slot, planBSlot)
applyPreset(slot, preset) · markPresetSaved(slot, presetId)
setActivePane(pane)
```

Every mutating action re-runs, during render: `deriveEffectiveStats` → `StatPreview` and
`validate` → `ValidationView` (memoized). **No action touches persistence** — save/designate are
async calls to Feature 7's service, dispatched from the UI, not reducer transitions
([research C2](./research.md)).

---

## Save & designate flows (call Feature 7; own nothing persistent)

| Flow | Garage does | Feature 7 does (authority) |
|---|---|---|
| **Save squad** | project `draft → SquadConfig`; call `saveSquad`/`updateSquad(ctx, {slotIndex, name, config})` | `validate(config)` **before** write (A4); derive `powerRating`; enforce 8-slot baseline; persist `squads` row |
| **Designate defense** | call `designateDefense(ctx, {squadId, slot})` | freeze immutable snapshot + deactivate prior + mark squad out of attack pool, in one tx; ≤3 cap via partial-unique (A6) |
| **Undesignate / re-designate** | call `undesignateDefense` / `redesignateDefense(ctx, squadId)` | squad → attack pool / new snapshot of current config; old snapshot immutable, retained if referenced |
| **Save custom preset** | project the machine → `PresetConfig`; call `savePreset(ctx, {name, machineTypeId, config})` | validate per type; persist `presets` row |

The **editing of a designated squad** is an ordinary `updateSquad` on the source `squads` row; it
**does not touch** the active `defense_snapshots` row (Feature 7 SC-004) — the Garage surfaces a
"re-designate to push live" affordance (spec FR-018).

---

## Entity relationship summary

```
EditorSession { draft: DraftSquad, selection, rosterSlotIndex, ... }   (client-only, never persisted)
DraftSquad 1──5 DraftMachine            (normalized by slot 0..4; a slot may be Empty mid-build)
DraftMachine ──projects-to──> Feature1.MachineInstance   (toSquadConfig)
DraftSquad   ──projects-to──> Feature1.Squad / SquadConfig ──saveSquad()──> Feature7.squads

deriveEffectiveStats(DraftMachine, Ruleset) ──> StatPreview     (Feature 1 shared fn; == engine, SC-002)
validate(toSquadConfig(draft), Ruleset)     ──> ValidationView  (Feature 1 shared fn; client = convenience)
                                                 └─ server re-validate in saveSquad() = authority (A4, Principle II)

PresetCatalog.stock  : static typed game data (per MachineType)      (research B3)
PresetCatalog.custom : Feature7.presets rows (listPresets/savePreset)
```

## Consumers

Nothing consumes the Garage view-model — it is terminal, client-only editor state. The Garage's
**outputs** are Feature 1 `SquadConfig`/`PresetConfig` values handed to **Feature 7**, which the
**Arena (Feature 8)** later reads as the attack pool + served defense snapshots.
