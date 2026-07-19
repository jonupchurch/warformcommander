# Research: Garage — Squad Builder + Loadout/Dial Editor

**Feature**: `004-garage` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

Resolves the genuine unknowns behind the spec: how to manage a **deeply nested config editor**
(a squad = 5 machines × ~12 decisions) in React 19 / Next 16; how to do a **placement UX** across
four capped zones that is **co-equally first-class in portrait and landscape** (constitution
**P7**); and how the **shared `validate()`** runs client-side for instant feedback versus the
server-side gate — the trust boundary (**Principle II**: client preview is *convenience*, server
validate is *authority*). Format per decision: **Decision / Rationale / Alternatives considered**,
sources cited inline. Everything defers to the committed Garage mockup
([`reference/Warform Commander Garage.dc.html`](../../reference/Warform%20Commander%20Garage.dc.html))
and the established Feature 3 responsive strategy
([`003-app-shell/research.md`](../003-app-shell/research.md) Workstream C).

The unknowns cluster into three workstreams — **(A) nested editor state + live derived preview**,
**(B) placement & the both-orientation dense UI**, and **(C) the client/server validation trust
boundary**.

---

## Workstream A — Nested editor state & the live derived preview

### A1. Draft state → **`useReducer` (+ Immer) over a normalized draft-squad tree, not a global store**

- **Decision**: Model the in-progress squad as a **single client draft view-model** driven by a
  **`useReducer`** whose actions are the editor's verbs (`setType`, `setVariant`, `setSlot`,
  `place`, `setDial`, `addPlanB`, `applyPreset`, …). Keep the tree **normalized** (machines keyed
  by slot index 0–4; the selected machine/slot/zone held as ids, not nested object references) and
  apply immutable updates with **Immer** so a deep edit (e.g. one utility slot on machine 3) is a
  one-line producer, not hand-written spread surgery. State lives in a small `"use client"`
  Garage editor context provider; it is **not** a global app store.
- **Rationale**: `useReducer` "shines if you need to handle multiple state transitions in one
  place — forms, wizards, or juggling related flags — with easier testing of state transitions via
  pure reducer functions," and is the recommended shape for "complex forms, arrays of objects, or
  nested states." Pure reducers make each editor verb **unit-testable in isolation** (Principle
  VIII) and the whole draft **snapshot-serializable** for dirty-tracking/undo. Immer is the
  standard remedy for deeply-nested immutable updates. A global store (Zustand/Jotai) is
  unnecessary: "most of the time … you don't need a state management library at all — break your
  state into different concerns." The draft is one concern, scoped to the Garage subtree.
- **Alternatives considered**: *Zustand/Jotai global store* — rejected: the draft is local to the
  Garage editor, not app-wide shared state; a store adds a dependency and a lifecycle for no
  cross-screen benefit. *`react-hook-form`* — rejected: it's tuned for flat/field-array HTML forms
  with input registration, not a game-config tree whose "fields" are menu-picks with cross-field
  gating (a utility unlocks a dial option) and a derived preview; the reducer models the
  cross-field rules directly. *`XState`* — reasonable for the wizard-y flow but heavier than the
  screen needs; the reducer's action union already encodes the transitions.
- Sources: [React 19 useReducer deep dive (dev.to)](https://dev.to/a1guy/react-19-usereducer-deep-dive-from-basics-to-complex-state-patterns-3fpi),
  [React state management in 2025 (developerway)](https://www.developerway.com/posts/react-state-management-2025),
  [State management trends 2025 (Makers' Den)](https://makersden.io/blog/react-state-management-in-2025).

### A2. Live preview → **derive during render (memoized), never `useEffect`-into-state**

- **Decision**: Compute the effective-stat preview, the aggregate power rating, and the validation
  view **during render** from the draft (a pure `derive(draft, ruleset)` call), memoized with
  **`useMemo`** keyed on the affected machine's config slice. **No** `useState`+`useEffect` mirror
  of derived values. Heavy re-derivation is scoped to the machine that changed, and marked with
  `useTransition` if a full-squad re-derive ever proves janky.
- **Rationale**: "If you can calculate something during render, you don't need an Effect" —
  deriving state via `useEffect` "creates unnecessary re-renders and bugs" (a first render, then
  the effect, then a second render), and risks single-source-of-truth drift between the draft and
  the mirrored preview. `useMemo` caches the *expensive* derivation (the effective-stat pipeline
  over a machine) and only recomputes when its config slice changes — the correct tool for a live
  preview that must stay exactly in sync with the edited config. This keeps the preview a pure
  function of the draft, which is also what makes the **engine-parity test (SC-002)** meaningful.
- **Alternatives considered**: *`useEffect` to recompute preview into state* — rejected as the
  documented anti-pattern (extra renders, drift). *Recompute unconditionally every render with no
  memo* — acceptable for small squads, but the effective-stat derivation over 5 machines every
  keystroke is worth memoizing; "first write clear derived logic, then add `useMemo` where it
  provides real value" — the preview qualifies.
- Sources: [You Might Not Need an Effect — react.dev](https://react.dev/learn/you-might-not-need-an-effect),
  [Don't use useEffect for derived state (julvo.com)](https://julvo.com/posts/react/derived-state/),
  [Derived-state anti-pattern (FrontendAtlas)](https://frontendatlas.com/react/trivia/react-derived-state-anti-pattern).

### A3. The shared derivation source → **call Feature 1's TS surface; never reimplement (P8)**

- **Decision**: The client preview calls the **Feature 1 shared TypeScript surface** (`src/sim/`)
  for both `validate()` and `deriveEffectiveStats()` — the same logic mirrored from the Rust
  engine — rather than a Garage-local stat formula. A **parity fixture test** asserts the client
  derivation equals the engine's derivation for a battery of builds (SC-002).
- **Rationale**: Constitution **P8** requires the sim, UI, and balancer to read **one source of
  truth**; a second stat formula in the Garage *is* the drift P8 forbids. Feature 1's data-model
  already names effective-stat derivation "a shared function the engine, Garage, and balancer all
  call." The client cannot run the WASM **engine** (`resolve`) — that stays server-only (**P6**) —
  but `validate()`/`derive()` are **pure, non-simulating** functions safe to expose as TS.
- **Cross-feature note (recorded for the whole-set plan, Principle VII)**: Feature 1 task T033
  commits a TS **validation** mirror; it does **not** explicitly commit the **derivation** to that
  same surface. This feature depends on the shared surface exporting **both**. The resolution is to
  add `deriveEffectiveStats()` to **Feature 1's** shared TS module (with the engine-parity test),
  not to grow a Garage copy — carried into [plan.md](./plan.md) Complexity Tracking as the single
  tracked cross-feature dependency.
- Sources: [`001-battle-sim-core/data-model.md`](../001-battle-sim-core/data-model.md) (effective-stat derivation),
  [`001-battle-sim-core/tasks.md`](../001-battle-sim-core/tasks.md) (T031/T033, the TS mirror).

---

## Workstream B — Placement & the both-orientation dense UI (P7)

### B1. Placement interaction → **tap-to-select-then-tap-zone primary; drag as a progressive enhancement**

- **Decision**: The primary placement model is **select-then-assign**: tap a machine (or an empty
  slot), then tap a target zone — caps enforced by **disabling full zones** (a ground zone at 3, Air
  at 2) and off-home zones (heli → only Air). This is the single model that works identically with
  touch, mouse, and keyboard, in **both** orientations. **Drag-and-drop** (via `@dnd-kit`, which
  supports Pointer/Touch/Keyboard sensors) is an **optional enhancement** layered on the same
  reducer actions — never the *only* way to place a unit.
- **Rationale**: The Garage is the densest screen and must be **co-equally usable in portrait and
  landscape** (P7); a drag-only board fails thumb ergonomics on a phone and keyboard/AT users.
  `@dnd-kit` is the modern accessible toolkit (Pointer/Touch/Keyboard sensors, live-region
  announcements) — but even its own guidance shows drag needs `touch-action: none` and careful
  scroll handling on mobile, and keyboard drag is a modal pick-up/move/drop flow. Tap-to-place is
  strictly simpler, always accessible, and cap-safe by construction (disable, don't reject). Using
  dnd-kit as an *enhancement* over the same actions keeps one code path authoritative and one set
  of validation rules. The mockup itself renders the formation as **tappable zone rows with tap-to-
  select units** (`onClick` selection, no drag) — the interaction the design already implies.
- **Alternatives considered**: *Drag-and-drop as the sole placement UX* — rejected: fails P7
  (touch/keyboard/AT), and caps/home-zone rules are clumsier to express as drop-rejections than as
  disabled targets. *HTML5 native DnD* — rejected: no touch support, poor a11y. *No drag at all* —
  acceptable and is the guaranteed baseline; drag is added only if it measurably helps landscape.
- Sources: [dnd-kit accessibility guide](https://docs.dndkit.com/guides/accessibility),
  [dnd-kit touch sensor / mobile](https://app.studyraid.com/en/read/12149/389960/touch-sensor-implementation-for-mobile-devices),
  [dnd-kit overview](https://dndkit.com/),
  [`reference/Warform Commander Garage.dc.html`](../../reference/Warform%20Commander%20Garage.dc.html) (tap-selected formation rows).

### B2. Responsive rig → **one screen, two co-equal layouts; macro = media query, micro = container query**

- **Decision**: Reuse Feature 3's responsive law
  ([`003-app-shell/research.md`](../003-app-shell/research.md) C1/C2): the desktop **3-column rig**
  (squad rail 288px · formation 1fr · unit detail 372px, per the mockup grid) is a **landscape-only
  macro layout** toggled by a **width breakpoint (`lg`)**; in portrait the same three regions become
  **stacked/tabbed panes** (squad rail → a top selector/sheet; formation → the main scroll; unit
  detail + Customize → a bottom sheet / full-screen editor). Inner panels re-flow with **container
  queries (`@container`)** independent of the viewport. Switch on **width, not `orientation`** (a
  phone in landscape still gets the compact panes).
- **Rationale**: This is the exact "new responsive" split Feature 3 already adopted and the
  primitives are built for — media queries "adjust the global/macro styles," container queries
  "adjust the container's children." Authoring both layouts (not degrading one) is the literal P7
  requirement, and reusing Feature 3's decision keeps the Garage consistent with the shell it lives
  in (Principle III). The Customize editor as a **Sheet** on portrait / side-panel on landscape maps
  onto Feature 3's `Sheet`/`Dialog` primitives.
- **Alternatives considered**: *One fluid layout that morphs* — rejected: compromises both form
  factors on the densest screen; P7 treats them as co-equal. *`orientation` media feature* —
  rejected for the same reason Feature 3 rejected it (a landscape phone is still "mobile"). *A
  separate mobile route/app* — rejected: duplicates logic; one screen, two CSS-toggled layouts.
- Sources: [`003-app-shell/research.md`](../003-app-shell/research.md) C1–C4,
  [web.dev — the new responsive](https://web.dev/articles/new-responsive),
  [Tailwind v4 responsive design](https://tailwindcss.com/docs/responsive-design).

### B3. Presets as the density on-ramp → **static typed catalog per machine type; custom via Feature 7**

- **Decision**: **Stock presets** are a **static, typed catalog module** keyed by `MachineTypeId`
  (a `Preset[]` per type, `origin: Stock`) — game data, not DB rows — imported directly by the
  preset picker. **Custom presets** are Feature 7 `presets` rows (`origin: Custom`), read/written
  via `listPresets` / `savePreset` / `deletePreset`. Each machine seeds from its variant's **default
  stock build** (FR-004) so a squad is legal before any deep editing.
- **Rationale**: §8.4 states stock presets are game-authored and custom presets are the personal
  library; Feature 7's data-model explicitly says "stock presets are static data, not rows" and
  provides the `presets` table only for custom builds. Presets are the **mandatory on-ramp** for the
  ~12-decisions density (§8.3, §7.4 Guardrail) — SC-004 measures exactly this. A typed catalog keeps
  stock presets validated by the Feature 1 types (a `Preset` must itself pass `validate()` for its
  type) with zero persistence cost.
- **Alternatives considered**: *Stock presets in the DB* — rejected: they're immutable game content
  that ships with the app; a table adds seeding/migration for no benefit (Feature 7 already ruled
  this out). *No default build on new machines* — rejected: would make a fresh squad illegal until
  every slot is hand-filled, defeating the on-ramp.
- Sources: [design doc §8.3–8.4](../../reference/warformcommandergamedesigndoc.md),
  [`007-accounts-persistence/data-model.md`](../007-accounts-persistence/data-model.md) (`presets` table; "stock presets are static data"),
  [`007-accounts-persistence/contracts/persistence-api.md`](../007-accounts-persistence/contracts/persistence-api.md) (`savePreset`/`listPresets`).

---

## Workstream C — The client/server validation trust boundary (Principle II)

### C1. Two-tier validation → **shared logic, client for feedback, server for authority**

- **Decision**: Run the **same** `validate()` in two places from **one** shared module: **client-
  side** at edit time for **instant** rejection reasons (disable Save, annotate the offending
  slot/zone), and **server-side** inside Feature 7's `saveSquad`/`updateSquad` as the **sole
  authority** (trust-boundary rule **A4**) that gates persistence. The client result is
  **convenience**; a config only ever persists if the **server** `validate()` passes. On a
  server-side rejection at save (e.g. the live ruleset changed under the player), surface the
  returned reason and persist nothing.
- **Rationale**: This is the canonical shared-schema pattern: "define a single [validator] as the
  single source of truth … used on the client for instant validation and on the server for security
  and data integrity" — "client-side validation improves UX with instant feedback, while
  server-side validation is the security layer that can't be bypassed." It is also a **hard security
  boundary**: a Next.js **Server Action is a public HTTP POST endpoint** — "your TypeScript types,
  client-side validation, and React component boundaries don't apply … not [to] an attacker hitting
  the endpoint with curl." So the Garage **never** trusts its own preview for persistence; Feature 7
  re-validates every write. This is constitution **Principle II** ("never trust client-side state …
  check it server-side") and dovetails with **P6** (the server is authoritative). The shared
  `validate()` also guarantees the Garage rejects exactly the builds the **engine** would (**P8**).
- **Alternatives considered**: *Client-only validation* — rejected: bypassable; violates Principle
  II / A4 and could persist an illegal squad. *Server-only validation* — rejected: loses the
  instant edit-time feedback the densest screen most needs (the player would only learn of an
  illegal build on Save). *Two separate validators (client heuristic + server real)* — rejected: two
  implementations drift; one shared function is the P8 point.
- Sources: [Sharing a validation schema between server and client (Next.js discussion #52652)](https://github.com/vercel/next.js/discussions/52652),
  [Next.js Server Actions security](https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions),
  [Next.js client+server validation with a shared schema (dev.to)](https://dev.to/bookercodes/nextjs-form-validation-on-the-client-and-server-with-zod-lbc),
  [`001-battle-sim-core/contracts/engine-api.md`](../001-battle-sim-core/contracts/engine-api.md) (`validate()` called by both Garage and server),
  [`007-accounts-persistence/data-model.md`](../007-accounts-persistence/data-model.md) (trust-boundary rule A4).

### C2. Save & designate as mutations → **Feature 7 Server Actions; Garage never touches the DB**

- **Decision**: All persistence — `saveSquad`, `updateSquad`, `deleteSquad`, `designateDefense`,
  `undesignateDefense`, `redesignateDefense`, `savePreset` — is invoked through **Feature 7's
  server-side service** (Next.js Server Actions under `src/server/`), matching
  [`stacks/nextjs.md`](../../stacks/nextjs.md) ("mutations go through Server Actions"). The Garage
  imports the service functions; it holds **no DB access** and **no snapshot logic** (designation
  immutability + the ≤3 cap are Feature 7's transaction + partial-unique indexes, A6).
- **Rationale**: Keeps the trust boundary and the snapshot invariants **entirely** in Feature 7
  (ownership A2, validation A4, transactional designation A6). The Garage is a caller; it cannot
  create a 4th active defense or a duplicate slot even under a race because the DB constraints are
  the final guard. Server Actions revalidate the roster view after a write
  ([`stacks/nextjs.md`](../../stacks/nextjs.md): "revalidate after a mutation").
- **Alternatives considered**: *Garage-owned route handlers hitting the DB* — rejected: duplicates
  Feature 7's guarded surface and its trust checks; the persistence-api is the contract to build on.
  *Optimistic local mutation without server confirmation* — rejected on writes that must be
  server-authoritative (a squad only exists once Feature 7 confirms); optimistic UI is acceptable
  only for non-authoritative view state.
- Sources: [`007-accounts-persistence/contracts/persistence-api.md`](../007-accounts-persistence/contracts/persistence-api.md),
  [`stacks/nextjs.md`](../../stacks/nextjs.md) (Server Actions, revalidate).

---

## Cross-cutting decisions (summary for plan.md Technical Context)

| Area | Decision |
|---|---|
| **Editor state** | `useReducer` (+ Immer) over a normalized draft-squad tree, in a scoped `"use client"` Garage context — no global store |
| **Live preview** | Derive during render, memoized with `useMemo`; **no** `useEffect`-into-state; `useTransition` if a full-squad re-derive janks |
| **Derivation/validation source** | Feature 1's **shared TS surface** (`validate()` + `deriveEffectiveStats()`); engine-parity test; **no Garage reimplementation** (P8) |
| **Placement UX** | **Tap-to-select-then-tap-zone** primary (touch/mouse/keyboard, both orientations); caps enforced by **disabling** full/off-home zones; `@dnd-kit` drag as optional enhancement over the same actions |
| **Responsive rig** | One screen, **two co-equal layouts** — 3-column landscape / stacked-tabbed portrait; **media = macro, `@container` = micro**; switch on **width (`lg`)**, not orientation; Customize editor = `Sheet` (portrait) / side-panel (landscape) |
| **Presets** | **Stock = static typed catalog** per machine type; **custom = Feature 7 `presets` rows**; each new machine seeds a default legal stock build |
| **Validation boundary** | **Shared `validate()`**: client = instant feedback (convenience), **server-side in Feature 7 = authority** (A4, Principle II); Save blocked while any reason stands |
| **Persistence** | All writes via **Feature 7 Server Actions**; Garage holds **no** DB access / snapshot logic; designation invariants are Feature 7's DB transaction (A6) |

All spec unknowns (nested editor state, live derived preview, placement UX in both orientations,
the client/server validation trust boundary) are resolved. No unresolved unknowns remain for
Phase 1.
