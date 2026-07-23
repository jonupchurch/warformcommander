# Implementation Plan: v3 Counter-Web — a ground-up systems rewrite

**Branch**: `feat/014-counter-web` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-v3-counter-web/spec.md`. Authoritative technical
design: [`../014-counter-web/weapons-design.md`](../014-counter-web/weapons-design.md) (§11 registry
P1–P27). Measured problem: [`../014-counter-web/diagnosis.md`](../014-counter-web/diagnosis.md).

## Summary

Rebuild the combat *content vocabulary* so an intransitive counter-web can form: sharpen the damage
triangle and populate defenses so type-vs-layer bites (US1); make reach/positioning a playable counter
via a priority-score targeting chain and four self-terminating movement modes (US2); add graded
equipment counters within a per-chassis slot budget (US3); collapse behaviors to three stances + a
narrowed reactive Plan-B (US4); and make the Commander a protect-vs-assassinate keystone (US5). Every
magnitude is a **start value**; the field is re-measured with the balancer after each slice
(Constitution P4). The engine is correct — this is a **data-driven ruleset + engine-behavior change**
(P8) that must preserve **native==wasm determinism** (P6, never waived) and keep every choice a
**lateral trade-off** (P1).

## Technical Context

**Language/Version**: Rust 2021 (engine + balancer); TypeScript 5 / Next.js (App Router) frontend.

**Primary Dependencies**: `crates/engine` (deterministic fixed-tick sim, compiled **native** for tests
and **wasm** for the browser); `crates/balancer` (Monte-Carlo verifier); fixed-point arithmetic
(`Fixed`/`Bp`) + seeded PRNG in-engine; Next.js/React + Drizzle (frontend, only touched for the
ruleset/loadout data surface — no gameplay UI in this feature).

**Storage**: Game content is a **ruleset** — the seed lives in `crates/engine/src/content.rs`; the
**live** ruleset is a frozen `current_ruleset` DB row the arena reads (per [[live-ruleset-is-a-db-row]]:
engine/content changes reach real battles only after a re-seed via `scripts/reseed-current-ruleset.ts`,
and new enum variants require the wasm deploy **before** the re-seed).

**Testing**: `cargo test -p engine` (unit + stat-block tests + golden replays), `cargo test -p
balancer`; determinism/parity via the native↔wasm golden replays and the **TS derive-parity** mirror
(`derive-parity.test.ts` / `derive-battery.json`); `npm test` (vitest) for the TS data surface;
balancer field measurement (`cargo run -p balancer --release -- verify --field all`) +
`scripts/field-metrics.js`.

**Target Platform**: Browser (wasm sim) + Node/native (balancer, tests). Server-authoritative results
(P6).

**Project Type**: Deterministic game simulation engine + data ruleset (+ thin TS data surface).

**Performance Goals**: Balancer must run `--field all` at 250 samples/matchup in a practical loop for
per-slice measurement; median battle duration stays within ~10% of the 491-tick baseline (SC-005).

**Constraints**: **Native==wasm bit-for-bit determinism (P6, NON-NEGOTIABLE)** across every change;
fixed-point only (no float nondeterminism); ruleset stays hash-stable at defaults (serde
skip-at-default) so existing replays don't churn; equipment/stances remain trade-offs within the ~25%
power cap (P1). New enum variants ⇒ deploy wasm **before** re-seeding the live ruleset.

**Scale/Scope**: 7 machine types × 3 variants; 132 matchups measured per field run; a systems rewrite
touching the damage matrix, defense families, targeting, equipment, and all behavior dials — delivered
as 5 independently-measurable slices + 1 foundational tooling slice.

## Constitution Check

*GATE: passes before Phase 0; re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **P1 Non-P2W (NON-NEG)** | ✅ Every weapon/defense/equipment/stance is a two-sided trade (matrix gives+takes, stances +offense/−defense, cost-tiered slots, Ablative retired). SC-007 measures the ~25% lateral-power cap holds. |
| **P2 Planning over stats** | ✅ The whole feature *is* P2 — composition/counter-matching decides fights (SC-002/003/004). |
| **P3 Depth from configuration** | ✅ Adds configuration axes (equipment domains, priority chain, dials), reuses the 7×3 roster; no roster growth. |
| **P4 Fairness verified** | ✅ Balancer gates every slice (FR-029). **Prerequisite:** re-fixture `SkillBeatsGear` (FR-030) so a matrix change doesn't fail it by construction — foundational slice S0. |
| **P6 Determinism (NON-NEG)** | ⚠️→✅ The central risk. Every engine-behavior change (targeting recompute, movement, Plan-B, riders) must stay fixed-point + seeded and **native==wasm**. Guarded by golden replays + derive-parity every slice; no change merges without parity green. |
| **P8 Data-driven content** | ✅ Magnitudes (matrix, cadence, %s, slot costs, budgets) live in the ruleset as typed data read by sim+UI+balancer; only *mechanics* (how Kite oscillates, how the chain scores) are engine code — matching the existing code/data split. |
| **Eng I / IV / VII / VIII / IX** | ✅ Design decided (I); sliced to smallest complete increments (IV); whole set planned here (VII); tested via cargo unit/stat/golden + balancer field (VIII); atomic commits on `feat/014-counter-web` (IX). |

**No unjustified violations.** The one standing risk (P6 determinism through behavior changes) is
mitigated by the per-slice parity gate, not waived. See Complexity Tracking for the scope note.

## Project Structure

### Documentation (this feature)

```text
specs/015-v3-counter-web/
├── spec.md              # /speckit-specify output
├── plan.md              # this file
├── research.md          # Phase 0 — technical decisions per system
├── data-model.md        # Phase 1 — entities + Rust type changes
├── quickstart.md        # Phase 1 — per-slice validation guide
├── contracts/           # Phase 1 — ruleset data contract + balancer verify contract
└── tasks.md             # /speckit-tasks output (later)
```

### Source Code (repository root)

```text
crates/engine/src/
├── content.rs              # ruleset SEED: damage matrix, cadence, energy_modes(→remove), mount defenses,
│                           #   equipment catalog, role bonuses — the data most tuning touches (P8)
├── model/
│   ├── types.rs            # enums: BehaviorDials, Stance, MovementMode, TriggerCondition, DialKey/Value,
│   │                       #   AuraKind, ReachTag, EquipmentId — the v3 enum changes land here
│   ├── ruleset.rs          # DamageMatrix, EnergyModes(→remove), AblativeMods, MountScale, air_mods
│   └── army.rs             # Combatant/derived stats, plan_b_slots, zone/home-zone, slot layout
├── sim/
│   ├── target.rs           # reach + targeting → rebuild as the priority-score chain (US2)
│   ├── damage.rs           # matrix + stance/energy mults, riders, splash (US1/US3/US4)
│   └── behavior.rs         # Plan-B latch + movement resolver → Kite/FallBack rebuild, triggers (US2/US4)
└── validate.rs             # loadout/slot/zone/plan-b validation (US3/US4)

crates/balancer/            # verify --field all; SkillBeatsGear fixture (S0, FR-030)
scripts/
├── field-metrics.js        # walls / contested / near-ties / monotone / spread reader
└── reseed-current-ruleset.ts   # push a new ruleset to the live current_ruleset DB row

# TS parity surface (kept green, not a gameplay change here):
lib/…                       # derive mirror; types.ts (SupportRange etc.); derive-parity.test.ts / derive-battery.json
```

**Structure Decision**: The change is overwhelmingly in **`crates/engine`** (data in `content.rs` +
`model/ruleset.rs`; enums in `model/types.rs`; behavior in `sim/*`) plus the **balancer** fixture
(S0). The TS side is touched only to keep **derive-parity** green when enum/stat shapes change (per
[[derive-battery-fixture-stale]] — regenerate deliberately, never as a side effect). No new gameplay
UI in this feature.

## Complexity Tracking

*No constitution violations to justify.* One scope note recorded for transparency:

| Item | Why it's large | How it's kept safe |
|---|---|---|
| Whole-system rewrite in one feature | The counter-web needs the matrix, reach, equipment, and behaviors *together* — each alone is balance-neutral on the wall (five prior confirmations) | Sliced into 6 independently-**measurable** increments (S0 + US1–US5); each merges only with cargo tests + native==wasm parity + a balancer field read showing it moved (or held) the counter-web metric. Magnitudes are start-values, so a slice that regresses is re-tuned before the next. |
