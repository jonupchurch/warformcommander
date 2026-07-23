# Quickstart — Validating v3 Counter-Web

A run guide for verifying each slice. Details live in [data-model.md](./data-model.md),
[contracts/](./contracts/), and the design (`../014-counter-web/weapons-design.md`).

## Prerequisites

- Rust toolchain (native `cargo`); Node for `scripts/field-metrics.js` and the TS parity suite.
- Baseline captured: current v2 field metrics (the `93.9%` monotone / 491-tick numbers) as the
  before-picture. Re-baseline after **every** slice.

## The per-slice loop (every slice, in order)

```bash
# 1. Engine correctness + determinism
cargo test -p engine            # unit + stat-block + GOLDEN REPLAYS (native)
cargo test -p balancer
npm test                        # vitest incl. derive-parity.test.ts (native==TS mirror)
# 2. native==wasm parity — golden replays must match the wasm build (P6, never waived)
# 3. Field measurement (the acceptance gate — contracts/balancer-verification.md)
cargo run -p balancer --release -- verify --field all --seed 1 --samples 250
node scripts/field-metrics.js balance-reports/balance-report.json
```

A slice is done when: tests green, native==wasm green, and the field read shows it **moved (or held)**
the counter-web metric in the expected direction (never judge by spread alone).

## Slice order & what each should show

| Slice | Build | Expected field signal |
|---|---|---|
| **S0** balancer re-fixture (FR-030) | composition-quality `SkillBeatsGear` fixture | invariant no longer fails on a pure matrix change; usable as a gate |
| **US1** triangle + defenses | sharpen matrix; populate shields per mount | contested ↑, monotone ↓; a kinetic army beats a higher-power shielded army (acceptance US1.1–1.3) |
| **US2** reach + targeting + movement | priority chain; Kite/FallBack rebuild + `home_zone` | a kiter beats a higher-power brawler it can't out-damage; stranded units Advance, wounded units FallBack-and-return (US2.1–2.4) |
| **US3** equipment | catalog + budgets + riders/auras + costs | adding AA *bends* the air matchup without new dominance; ECM/Decoy redistribute targeting; power gap ≤ ~25% (US3.1–3.3) |
| **US4** behaviors | Stance→3, energy dial cut, Plan-B triggers | a `HullBelowPct→FallBack/Defensive` army outlasts the same army without it; watch Defensive-vs-Defensive **duration** (SC-005) (US4.1–4.3) |
| **US5** Commander | `AuraKind::DamageTaken`, Command, projector | assassin build (Target Support + deep reach) counters the Commander build; Commander build beats no-backline-reach armies (US5.1–2) |

## Live verification (after a slice ships to prod)

New enum variants ⇒ **deploy wasm FIRST, then** `tsx scripts/reseed-current-ruleset.ts`, then verify
on the **arena path** (the frozen `current_ruleset` row), not just the seed ruleset. See
[contracts/ruleset-schema.md](./contracts/ruleset-schema.md).

## Whole-feature acceptance

All of SC-001…008 hold **together** (no dominant build; ≥2 non-trap counters per top build; monotone
→ ~70%; cycles present; duration within ~10% of 491; native==wasm; power lateral ≤25%; no coin-flips).
Judge by contested/cycle count, not spread.
