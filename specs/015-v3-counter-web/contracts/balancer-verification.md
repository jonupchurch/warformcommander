# Contract — Balancer Verification (the acceptance gate)

The measurement interface every slice is gated on (Constitution P4). This is the contract between an
implemented slice and "done."

## Interface

**Command** (from repo root):
```
cargo run -p balancer --release -- verify --field all --seed 1 --samples 250
node scripts/field-metrics.js <balance-report.json>
```

**Inputs**: the current seed ruleset (`content.rs`) — or, for *live* verification, the re-seeded
`current_ruleset` DB row (see ruleset-schema contract, propagation).

**Outputs**: `balance-report.json` → `field-metrics.js` prints **walls · contested · near-ties ·
monotone · spread** plus per-archetype win rates. Determinism side-check: native run == wasm run for
the same seed+inputs (golden replays).

## Pass thresholds (map to Success Criteria)

A slice is judged by **movement toward** these; the *feature* is done when they hold together. Judge by
**contested/cycle count and monotone rate — never by spread alone** (a better spread with fewer real
fights is a regression, per the falsified shield-populate experiment).

| Metric (field-metrics) | Target | Spec |
|---|---|---|
| Top archetype win rate | ≤ ~8 / 11 (from ~10–11) | SC-001 |
| Non-trap counters per top build | ≥ 2 | SC-002 |
| Monotone / total-order rate | 93.9% → ≤ ~70% | SC-003 |
| Surviving upsets / cycles | 4 → many; ≥ 1 real cycle among top builds | SC-004 |
| Median duration | within ~10% of 491 ticks | SC-005 |
| Native vs wasm | identical (bit-for-bit) | SC-006 |
| Fresh-vs-max power gap | ≤ ~25% | SC-007 |
| Coin-flip matchups | none decided ~50/50 by seed | SC-008 |

## Preconditions

- **S0 first**: `SkillBeatsGear` must be re-fixtured (FR-030) before it can gate — otherwise every
  matrix change fails it by construction. Until S0 lands, treat SkillBeatsGear as informational.
- Every slice: `cargo test -p engine` + `cargo test -p balancer` green, native==wasm parity green, TS
  derive-parity green — before the field read counts.

## Per-slice expectation (not the whole bar at once)

Each slice moves a *subset*: US1 should raise contested + drop monotone (triangle bites); US2 should
add reach/kite counters; US3 should *bend* specific matchups (e.g. air) without new dominance; US4 is
measured for reactive value + the Defensive-stall duration risk; US5 for the assassinate cycle. A slice
that **regresses** the counter-web metric is re-tuned (start-values) before the next begins.
