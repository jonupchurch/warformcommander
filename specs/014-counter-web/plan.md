# Implementation Plan: Counter-Web — a contested battle field

**Branch**: `feat/014-counter-web` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-counter-web/spec.md`; measured evidence from
[diagnosis.md](./diagnosis.md).

## Summary

The field is a 93.9% total power order (diagnosis). Break it into a contested counter-web in two
sequenced axes, each built as an independent, balancer-measured ruleset slice:

- **Axis A (flatten):** add a **coordination** lever — diminishing returns on stacking identical units
  — so composition power stops being super-linear and matchups land near parity. The direct kill for
  the "2nd copy crosses a rank boundary" cliff. A small derive-time engine addition reading a typed
  ruleset table (the shape of the existing `mount_scale`), so tuning stays data-driven (P8).
- **Axis B (counter):** amplify the **existing** counter axes (damage-family matrix, role bonuses,
  reach/defense-family effectiveness) so a countering composition *tilts* a near-parity matchup into
  55–70% — graded, lateral, no new unit types (P3). Only meaningful once Axis A has flattened the
  ladder.
- **Axis C (guard):** keep the intended hard capability counters (anti-air → air) ≥80% and verify the
  field retains a spectrum, not uniform coin-flips.

Every slice follows the v2 methodology: change ruleset data (+ minimal engine plumbing for Axis A) →
`cargo test -p engine` → clippy/fmt → re-bless goldens only if the catalog changed → `wasm-pack build`
→ derive/replay parity → `verify --field all` before/after → keep only if it moves the target metrics
without breaking an invariant.

## Technical Context

**Language/Version**: Rust (engine + balancer, edition 2021) · TypeScript (web mirror) · the engine
compiles to native and `wasm32` from one source.

**Primary Dependencies**: `crates/engine` (deterministic sim + ruleset model), `crates/balancer`
(Monte-Carlo field measurement — the instrument, P4), `packages/engine-wasm` (wasm build), the Next.js
web app's `sim/` TS mirror (Garage/Customize surfaces).

**Storage**: Ruleset content is typed data (`content.rs` seed table → `Ruleset` model). Live balance is
a DB row (`current_ruleset`); **not** re-seeded during development (assumption in spec).

**Testing**: `cargo test -p engine` (unit + golden replays), `cargo test -p balancer`, Vitest for the
TS mirror + derive/replay parity fixtures, `wasm-parity.mjs` (native==wasm), the balancer `verify`
report for field-level acceptance.

**Target Platform**: native (arena server + balancer) and `wasm32` (client) from the same engine.

**Project Type**: game engine + offline balancer + web app (existing; unchanged shape).

**Performance Goals**: determinism is the hard constraint, not throughput. Derive-time coordination
scaling is O(squad size²) at most (10 machines) — negligible.

**Constraints**: **deterministic, seeded, integer/fixed-point** (P6) — native==wasm byte-identical;
field-only ruleset changes must not re-bless goldens; catalog additions re-bless but keep tick streams
identical. Power stays within the P1 ~25% cap.

**Scale/Scope**: ruleset content + one small engine table/hook for Axis A + TS mirror + Customize
explain text. No new unit types, no ladder/player-data changes, no new screens.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 (below).*

| Invariant | Verdict | Notes |
|---|---|---|
| **P1 Non-P2W / ≤25% power cap** | ✅ **reinforced** | Axis A *caps* composition power variance — it enforces P1 at the composition level. Axis B counters MUST be lateral (FR-007); the `power-gap-cap` + `skill-beats-gear` invariants gate every slice (SC-008). |
| **P2 Planning over stats** | ✅ **central** | The feature's entire purpose: make counter-matching (a pre-battle decision) decide battles instead of raw power. |
| **P3 Depth from configuration, not roster** | ✅ pass | Axis B adds *options/tables* within existing axes; **no new unit types** (FR-006). Axis A rewards using the configuration space (diverse armies). |
| **P4 Fairness verified** | ✅ **central** | The balancer measures every slice before/after; acceptance is numeric (SC-001…009), not asserted. |
| **P5 Content from players** | ➖ N/A | No ladder/player-content change. |
| **P6 Deterministic, seeded, server-authoritative** | ✅ pass (gated) | Axis A scaling is deterministic fixed-point at derive time; SC-007 + `wasm-parity` gate every slice. New enum/table variants (if any) follow the v2 deploy-before-reseed rule at eventual ship time. |
| **P7 Both platforms first-class** | ✅ pass | Only surface touched is the Customize "why" text (like v2's `explain.ts`); responsive text, no new layout. |
| **P8 Data-driven content** | ✅ pass (1 note) | All tuning is ruleset data. Axis A needs a *small engine hook* to read a per-duplicate curve at derive time — see Complexity Tracking. |

**Gate result: PASS.** One justified complexity (the Axis A derive-time hook) tracked below. No
invariant is violated; two (P1, P2) are actively reinforced.

## Project Structure

### Documentation (this feature)

```text
specs/014-counter-web/
├── spec.md              # the specification (done)
├── diagnosis.md         # measured root-cause evidence (done)
├── plan.md              # this file
├── research.md          # Phase 0 — the Axis A mechanism decision + Axis B lever survey
├── data-model.md        # Phase 1 — ruleset schema additions (coordination table, counter magnitudes)
├── quickstart.md        # Phase 1 — how to measure a slice (the acceptance loop)
├── contracts/
│   └── ruleset-schema.md # Phase 1 — the new/changed ruleset tables + balancer measurement contract
└── tasks.md             # /speckit-tasks output (NOT this command)
```

### Source Code (repository root)

```text
crates/engine/src/
├── model/
│   ├── ruleset.rs        # + Coordination table (per-duplicate returns curve); Axis B magnitudes live in existing tables
│   └── army.rs           # derive: apply the coordination scale by duplicate-rank (the one engine hook)
├── content.rs            # seed the coordination curve; tune matrix/role/reach magnitudes (Axis B)
└── tests/                # coordination + counter unit tests; goldens re-blessed only on catalog change

crates/balancer/src/
└── archetypes.rs         # (only if coverage gaps surface) — the measurement field, otherwise untouched

packages/engine-wasm/     # rebuilt each slice; parity verified

sim/ (web app)
├── ruleset.ts, derive.ts # TS mirror of the coordination table + application
└── lib/garage/explain.ts # Customize "why" text for the coordination effect (P7)

tests/fixtures/           # derive-battery / replay-battery regenerated on catalog change
```

**Structure Decision**: Existing engine + balancer + web-mirror layout (unchanged from v1/v2). The one
new concept — the coordination table — lands beside `mount_scale` in `ruleset.rs` and is applied in
`army.rs` derive, exactly mirroring how `mount_scale` already scales defensive magnitude per mount.

## Slice order (build + measure loop)

1. **A1 — coordination (flatten).** Add the coordination table + derive hook; tune the curve on the
   field. Target: near-ties 0 → >0, monotone < 94%, the 1-vs-2 specialist cliff becomes a gradient
   (US1 tests). Ship only if `NoDominantUnit`/`power-gap-cap`/`skill-beats-gear` stay green.
2. **B1 — matrix + role counters (tilt).** In the flattened field, raise counter magnitudes until a
   countering equal-power comp wins 55–70% (US2 tests). Measure contested count climbing toward ≥26.
3. **B2 — reach / defense-family counters (tilt).** Second counter lever if B1 alone undershoots SC-001.
4. **C1 — guardrail pass.** Confirm hard counters (AA→air ≥80%) survive and the field is a spectrum
   (US3, SC-006). Adjust if over-flattened.
5. **Polish.** Customize explain text (P7), wiki/docs, final full-field measurement vs all SCs.

Each slice is independently valuable and reversible; A1 is the MVP (breaks the total order on its own).

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Axis A needs a small engine hook** (derive-time per-duplicate scaling) rather than pure ruleset data | No existing ruleset table expresses "the Nth identical unit is worth X" — super-linearity is a property of *how stats combine across a squad*, which only the derive step sees. The hook reads a typed curve from the ruleset, so **tuning stays data (P8)**; only the *application* is code. | Pure-data alternatives can't reach it: per-unit stat edits (tried 11× — can't create diminishing returns), and the matrix/mount_scale tables scale per-unit, not per-duplicate-rank. The hook is minimal and mirrors the existing `mount_scale` derive scaling exactly. |
