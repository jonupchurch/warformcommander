# Contract: Garage Editor State + Boundaries

**Feature**: `004-garage` | **Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

The Garage's public boundaries — **what it imports** (Feature 1 shared functions), **what it
calls** (Feature 7 service), and **what it composes** (Feature 3 primitives) — plus the client
editor-state machine that ties them together. The Garage introduces **no game types and no
persistence**; this contract fixes how it *consumes* the ones that exist and the trust boundary
between them (constitution **Principle II**, **P6**, **P8**). Signatures are TypeScript-shaped
(illustrative, not implementation).

---

## 1. Consumed from Feature 1 — the shared pure surface (`src/sim/`)

The client imports these **type-only + pure-function** exports of the Feature 1 TS mirror. It
**never** imports the WASM engine (`resolve`) — that is server-only (**P6**).

```ts
// Validation — the same verdicts the engine and the server-side write path produce (P8).
function validate(army: Squad, ruleset: Ruleset): ValidationError[];   // [] = legal
interface ValidationError { code: "V1"|"V2"|"V3"|"V4"|"V5"|"V6"|"V7"|"V8"; reason: string; ref?: ValidationRef; }
type ValidationRef = { slot: 0|1|2|3|4 } | { zone: ZoneId } | { squad: true };

// Effective-stat + power derivation — MUST equal the engine's derivation of the same config (SC-002).
function deriveEffectiveStats(machine: MachineInstance, ruleset: Ruleset): EffectiveStats;
function derivePowerRating(squad: Squad, ruleset: Ruleset): Fixed;      // matchmaking-only, never combat

// Capability introspection — which advanced dial options / Plan-B slots the machine's utilities unlock (§8.3).
function unlockedCapabilities(machine: MachineInstance): Capability[]; // e.g. SmartCounter, AdaptiveEnergy, +1 PlanBSlot
```

- `MachineInstance`, `Squad`, `Ruleset`, `EffectiveStats`, `Capability`, `ZoneId`, `Fixed`,
  `ValidationError` are **Feature 1 types** ([../../001-battle-sim-core/data-model.md](../../001-battle-sim-core/data-model.md)),
  imported, never redefined.
- **Cross-feature dependency (tracked in [../plan.md](../plan.md))**: Feature 1 commits the
  `validate()` TS mirror (T033) but not explicitly `deriveEffectiveStats()`/`unlockedCapabilities()`
  to the shared surface. This contract requires all three on **Feature 1's** surface with an
  engine-parity test — not a Garage-local copy (**P8**).

## 2. Consumed from Feature 7 — the persistence service (`src/server/`)

The Garage calls these **Server Actions** ([../../007-accounts-persistence/contracts/persistence-api.md](../../007-accounts-persistence/contracts/persistence-api.md)).
It holds **no DB access**; every call is the trust boundary (auth/ownership/validation/snapshotting
enforced server-side, A1–A6).

```ts
saveSquad(ctx, { slotIndex, name, config }): Result<Squad>       // server-side validate() BEFORE write (A4) = the authority
updateSquad(ctx, id, { name?, config?, slotIndex? }): Result<Squad>
listSquads(ctx): Result<Squad[]>                                // the roster rail
deleteSquad(ctx, id): Result<void>
listAttackable(ctx): Result<Squad[]>                            // defenseSlot IS NULL (need ≥1 to attack)

designateDefense(ctx, { squadId, slot: 0|1|2 }): Result<DefenseSnapshot>   // transactional; ≤3 cap (A6)
undesignateDefense(ctx, squadId): Result<void>
redesignateDefense(ctx, squadId): Result<DefenseSnapshot>       // pushes an edited squad's changes live
listDefense(ctx): Result<DefenseSnapshot[]>                     // active snapshots (≤3)

savePreset(ctx, { name, machineTypeId, config }): Result<Preset>
listPresets(ctx, machineTypeId?): Result<Preset[]>
deletePreset(ctx, id): Result<void>
```

- **`powerRating` is set server-side** on write (Feature 7 derivation); the Garage sends only
  `config` and shows a client preview.
- Designation **immutability + the ≤3 cap + attack/defense exclusivity** are Feature 7's
  transaction and partial-unique indexes — the Garage cannot violate them even under a race (A6).
- Server Actions **revalidate** the roster view after a write ([../../stacks/nextjs.md](../../stacks/nextjs.md)).

## 3. The trust boundary (Principle II — the load-bearing rule)

| Concern | Client (Garage) | Server (Feature 7) |
|---|---|---|
| `validate()` | run at **edit time** for instant reasons; gates the Save **button** | run **before every write** (A4); the **sole authority** — a rejected config persists nothing |
| effective stats / power | **preview** (`deriveEffectiveStats`) | recomputed authoritatively on write |
| authorization | **none** (assumes an authenticated session) | ownership + session enforced (A1/A2) |
| designation invariants | surface ≤3 / exclusivity / ≥1-attackable in the UI | enforced by the DB transaction + constraints (A6) |

The client verdict is **convenience**; the server verdict is **truth**. A server rejection at save
is surfaced back into `ValidationView.errors` and blocks the write. This is exactly the
shared-validator, client-feedback-plus-server-authority pattern ([../research.md](../research.md) C1).

## 4. The client editor state machine (`src/lib/garage/`)

A scoped `"use client"` context: `useReducer` over `EditorSession` (+ Immer), with derived preview
and validation computed **during render** (memoized), never mirrored into state
([../research.md](../research.md) A1/A2; entities in [../data-model.md](../data-model.md)).

```ts
function garageReducer(session: EditorSession, action: EditorAction): EditorSession;  // pure; unit-tested

// A hook exposes the derived views (memoized, recomputed only when the affected config slice changes):
function useGarageEditor(): {
  session: EditorSession;
  dispatch: (a: EditorAction) => void;
  preview: StatPreview;        // derive(session.selected, ruleset)  — memoized
  validation: ValidationView;  // validate(toSquadConfig(draft), ruleset) — memoized; client-convenience
  isDirty: boolean;            // draft ≠ savedBaseline
  // async, non-reducer (call Feature 7):
  save(): Promise<Result<Squad>>;
  designate(slot: 0|1|2): Promise<Result<DefenseSnapshot>>;
  saveCurrentAsPreset(name: string): Promise<Result<Preset>>;
};
```

Guarantees: the reducer is **pure and serializable** (dirty-diff, potential undo); persistence is
**never** a reducer transition (async service calls only); `toSquadConfig(draft)` is the single
projection point to the Feature 1 `Squad` that both the preview/validation and the save consume
(no divergent shapes).

## 5. Composed Garage-local components (over Feature 3 primitives)

The Garage introduces **screen composites**, each built from Feature 3 primitives + tokens
([../../003-app-shell/contracts/components.md](../../003-app-shell/contracts/components.md)) — **no
raw hex, no bespoke chrome** (FR-020). Live under `src/components/garage/`.

| Component | Composes (Feature 3) | Role (mockup region) |
|---|---|---|
| `GarageLayout` | `AppShell`, container/`@container` | the 3-column landscape rig ↔ stacked/tabbed portrait (P7; [../research.md](../research.md) B2) |
| `SquadRail` | `Panel`, `Chip`, `Button`, zone-dot tokens | left rail: saved squads, PWR/W-L, `ACTIVE`, `+ NEW SQUAD` |
| `FormationBoard` | `Panel`, zone tokens, `UnitIcon` | center: four zone rows with caps; **tap-to-select-then-place** (B1) |
| `ZoneRow` | zone `--color-zone-*`, `Chip` | one zone: cap label, occupancy, disabled when full/off-home |
| `UnitDetailPanel` | `UnitIcon`, `StatBar`, `Stat`, `Chip` | right: selected machine — 7 stat bars, loadout rows, dial tiles, `Customize` CTA |
| `CustomizeSurface` | `Sheet` (portrait) / `Panel` side-panel (landscape) | the deep editor host: Loadout · Dials · Presets tabs |
| `LoadoutEditor` | `Menu`/`Dropdown`, `Chip`, `Button` | weapon/defense/utility pickers; mount/family-gated (US2) |
| `DialEditor` | `Menu`, `Chip` | 4 dials; advanced options gated by `unlockedCapabilities` (US3) |
| `PlanBEditor` | `Menu`, `Chip`, `Button` | ≤2 triggers; slot-2 gated; Slot 1 > Slot 2 precedence shown (US3) |
| `PresetPicker` | `Panel`, `Button`, `Menu` | apply stock/custom; save custom (US4) |
| `DefensePanel` | `Chip`, `Button`, `Dialog` | designate ≤3 / undesignate / re-designate via Feature 7 (US5) |
| `ValidationNotice` | `Chip`, tokens | renders a `ValidationError.reason` against its slot/zone (FR-016) |

Interactive components are small `"use client"` leaves; `GarageLayout`/read-only panes stay Server
Components where practical ([../../stacks/nextjs.md](../../stacks/nextjs.md); [../research.md](../research.md) B2).

## Non-goals of this contract

Running the sim (Feature 1/8), rendering battle playback (Feature 5), summaries (Feature 6),
matchmaking/serve (Feature 8), the persistence internals / snapshot transaction (Feature 7 — called,
not owned), and the Feature 3 primitive/token definitions (composed, not defined). This contract
covers only how the Garage consumes and composes them.
