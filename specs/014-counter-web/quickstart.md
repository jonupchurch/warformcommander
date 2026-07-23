# Quickstart — measuring a Counter-Web slice

This feature's acceptance is a **field measurement**, not a golden path click-through. Every slice is
validated by the same loop (the v2 methodology). Prerequisites: Rust toolchain on PATH
(`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` in PowerShell), Node for the metric scripts.

## The per-slice acceptance loop

1. **Baseline (once):** the numbers in [diagnosis.md](./diagnosis.md) — 125 walls, 7 contested,
   **0 near-ties**, **93.9% monotone**, spread 87 pts, median ~491 ticks — measured on live v17 at
   `verify --field all --seed 1 --samples 250`.

2. **Apply the slice** (ruleset data ± the Axis A derive hook) and run the engine cascade:
   `cargo test -p engine` → clippy → fmt → re-bless goldens **only if the catalog changed** →
   `wasm-pack build` → derive/replay parity → `wasm-parity.mjs` (native==wasm) → `npx tsc --noEmit` →
   `npm test` (after the wasm rebuild) → `npm run build`.

3. **Measure the field before/after:**
   ```
   cargo run -q -p balancer --release -- verify --field all --seed 1 --samples 250 --out <out-dir>
   ```
   Then the two feature metrics (promote the diagnosis probes to committed scripts):
   ```
   node scripts/field-metrics.js <out-dir>/balance-report.json   # walls / contested / near-ties / monotone
   ```

4. **Accept the slice** only if it moves its target metric **and** breaks no invariant:

   | Slice | Must move | Must NOT break |
   |---|---|---|
   | A1 coordination | near-ties 0 → >0; monotone < 94%; 1-vs-2 cliff → gradient | `NoDominantUnit`, `power-gap-cap`, `skill-beats-gear` green; median duration ±10%; determinism |
   | B1/B2 counters | contested → climbing toward ≥26/132; countering equal-power comp wins 55–70% | AA→air stays ≥80%; no new dominant; lateral (invariants green) |
   | C1 guard | AA→air ≥80%; field is a spectrum (few hard, many graded) | not over-flattened (winner still tracks counter, not seed) |

5. **Final acceptance (all SCs):** contested ≥26/132 (SC-001), near-ties ≥20 (SC-002), monotone ≤75%
   (SC-003), duration ±10% (SC-004), no dominant + spread narrowed (SC-005), AA→air ≥80% (SC-006),
   native==wasm every seed (SC-007), P1 invariants green (SC-008), newly-contested winners
   counter-explainable (SC-009).

## Controlled micro-checks (unit-level, per US)

- **US1 cliff → gradient:** the balancer `matchup` mode on the diagnosis's `ca-air` vs `ca-line + Nth
  flak` (or an add-the-Nth-copy sweep) resolves as a gradient, not 0→100.
- **US2 counter isolates the tilt:** two equal-power comps, one countering the other → 55–70%; the same
  pair with the counter removed (mirror) → 45–55%.
- **US3 hard counter preserved:** dedicated anti-air vs all-air → ≥80% for AA.

## What "done" is not

- Not "the standings look better" — the aggregate spread can improve while the field stays walls
  (v2 proved this). The **near-tie count** and **monotone rate** are the real signal.
- Not a production re-seed — that is a separate, signed-off step following the v2 deploy-before-reseed
  procedure, out of scope for building/verifying the slices.
