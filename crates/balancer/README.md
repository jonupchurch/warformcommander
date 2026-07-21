# `balancer` — Monte-Carlo auto-balancer (Feature 2)

The offline, native tool that makes constitution **P4 (Fairness Is Verified, Not Hoped)** real.
Because a Warform Commander battle is a deterministic function of its inputs (Feature 1), the **one**
engine can be run thousands of times over the same matchup with different seeds to read a
**win-probability distribution**, and over the field to **flag degenerate/dominant combos before
players find them**.

- **Spec:** [`specs/002-auto-balancer/spec.md`](../../specs/002-auto-balancer/spec.md)
- **Report contract:** [`specs/002-auto-balancer/contracts/balance-report.md`](../../specs/002-auto-balancer/contracts/balance-report.md)

## Boundaries (what this is, and is not)

- **One engine, reused.** Every simulation goes through `engine::resolve()` natively — the balancer
  holds **no second copy** of the combat rules (P6/P4). A second engine would drift and break
  determinism/fairness verification.
- **Advisory only.** It reads the `Ruleset` as **read-only data** and emits **reports**; it **never
  edits balance** (FR-018, SC-006). The human reads the report and locks the shape. The live Ruleset
  editor + auto-news pipeline is **Feature 12** — this tool feeds the human who feeds Feature 12.
- **Offline / native.** Never WASM, never the browser, never the server request path, never the DB.

## Usage

```bash
# Verify the four balance invariants + sweep the field + flag outliers.
cargo run -p balancer --release -- verify

# Sweep the reference field and flag dominant/degenerate/underpowered combos.
cargo run -p balancer --release -- sweep

# Estimate one matchup (built-in sample armies, or --army-a / --army-b JSON files).
cargo run -p balancer --release -- matchup

# Common flags (global): --seed --samples --threads --ruleset <path> --out <dir>
#                        --floor --ceiling (the fair band)
cargo run -p balancer --release -- --samples 2000 --seed 1 --out balance-reports verify
```

Each run writes a canonical **`balance-report.json`** (the machine-readable source of truth, the seam
Feature 12 will consume) + a human-readable **`balance-report.md`** to `--out` (default
[`balance-reports/`](../../balance-reports/)), both stamped with the `rulesetHash` + engine/format
versions they were produced against (SC-007).

## How it works

| Module | Role |
|---|---|
| `seed` | deterministic per-**match** seed derivation (SplitMix64) — the reproducibility spine |
| `batch` | `run_batch`: resolve a matchup N× in parallel **across matches only**, reduced to integer counts (thread-count-independent, SC-001) |
| `stats` | integer win-count tally + **Wilson 95%** confidence interval + outcome breakdown |
| `archetypes` | the curated candidate pool / reference field + the invariant fixtures |
| `sweep` | evaluate each candidate across the field (both roles, canceling the first-strike bias) |
| `flags` | dominant / degenerate / underpowered classification — **interval-gated**, severity-sorted |
| `invariants` | the four numeric checks (family-bonus band · power-gap cap · no-dominant-unit · skill>gear) |
| `fixtures` | deliberately-perturbed rulesets — the balancer's own golden tests |
| `report` | the `BalanceReport` model + JSON/markdown renderers |

**Reproducibility is the spine:** seed per **match index** (never per thread) and reduce **integer
counts** (never a running float), so thread count can never change a result. Decision-bearing values
(win counts, flags, verdicts) are integer + deterministic; floats appear only in derived
presentation statistics, computed once and rendered at fixed precision.

## Tests

```bash
cargo test -p balancer                 # reproducibility · statistics · planted-imbalance · flagging · invariants · report
cargo test -p balancer --release --test throughput -- --ignored --nocapture   # SC-005 throughput smoke
```

The **planted-imbalance** (SC-003) and **invariant-violation** (SC-004) fixtures are the load-bearing
golden tests — they prove the balancer catches the imbalances it exists to catch.
