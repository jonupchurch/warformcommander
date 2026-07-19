# Research: Auto-balancer (Monte-Carlo)

**Feature**: `002-auto-balancer` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

Resolves the technical unknowns behind the balancer. Most of this feature's hard problems
were already solved in Feature 1 — the deterministic engine, the fixed-point math, the
"parallelize across matches, never within one" rule ([Feature 1 research A4](../001-battle-sim-core/research.md#a4-deterministic-ordering--btreemapvec-total-order-sorts-single-threaded-timeentropy-free)),
and the ≥10,000-Bo3-in-minutes throughput target ([Feature 1 SC-006](../001-battle-sim-core/spec.md#success-criteria)).
What remains is the **sweep/reporting layer**: how to parallelize the batch *reproducibly*, how
to turn raw win/loss counts into a **statistically honest** estimate, and how to define and
present the **flags/invariants**. Format per decision: **Decision / Rationale / Alternatives
considered**, sources cited inline. Three workstreams — **(A) reproducible parallelism**,
**(B) win-rate statistics**, **(C) flagging, invariants & report delivery**.

---

## Workstream A — Reproducible parallelism across matches

### A1. Parallel batch → **`rayon` across matches; per-*match* seeding (not per-thread); integer-count reduction**

- **Decision**: Run the batch with `rayon` (`into_par_iter()` over match indices). Each match
  gets its own seed **derived from the base seed + the match index** and its own engine call;
  results reduce into **integer win counts**. Parallelism is **strictly across independent
  matches** — never inside a `resolve()`, which stays single-threaded per Feature 1.
- **Rationale**: The Rust `rand` book's own parallel guidance is exactly this pattern — *"use a
  custom RNG per work unit, not per worker thread … if these RNGs are seeded in a deterministic
  fashion then deterministic results are possible."* Seeding per **match index** (the work unit),
  not per thread, makes the batch reproducible **independent of how rayon schedules it**: match
  *i* always uses the same seed no matter which core runs it. Because we reduce **integer counts**
  (associative + commutative), rayon's unspecified reduction order cannot change the total — the
  book's caveat that *"the reduce operation should be commutative and associative or else the
  results will be non-deterministic"* is satisfied by counting, never by a running float. This is
  the direct fulfilment of Feature 1's across-matches-only rule (research A4 rule 3) and gives
  SC-001 (reproducibility) + SC-005 (linear scaling) at once.
- **Alternatives considered**: *Per-thread RNG (`map_init`)* — the book's non-deterministic path;
  rejected because the aggregate would depend on thread scheduling. *A hand-rolled thread pool* —
  reinvents rayon for no gain. *`rayon`'s `sum()`/`reduce()` over floats mid-stream* — rejected:
  float addition isn't associative, so parallel order would perturb the low bits (Feature 1's
  whole no-float-in-decisions concern); count integers, derive floats once at the end.
- **Seed derivation**: `match_seed = splitmix64(base_seed ^ (match_index as u64))` (or
  `Pcg64::seed_from_u64` per index) — a value-stable, integer-only mix, matching Feature 1's
  pinned-PRNG discipline (research A3). Every match is independent and independently seeded.
- Sources: [The Rust Rand Book — Parallel RNGs](https://rust-random.github.io/book/guide-parallel.html),
  [Parallel Monte Carlo Simulation in Rust (cjwebb)](https://cjwebb.com/parallel-monte-carlo-rust/),
  [Feature 1 research A3/A4](../001-battle-sim-core/research.md#workstream-a--cross-platform-determinism-p6-sc-001).

### A2. Sweeping the space efficiently → **bounded enumeration + reference-field evaluation, not full round-robin**

- **Decision**: The sweep evaluates each candidate combo against a **reference field** (a curated
  set of representative opponents) rather than a full all-pairs round-robin, and **bounds** the
  candidate set from the `SweepConfig` axes. Total resolutions = `combos × field × samples`, kept
  under the SC-005 budget by the config.
- **Rationale**: The full space (7 types × 3 variants × equipment × dials × positioning) is
  combinatorially enormous — a true all-pairs sweep is `O(combos²)` and never finishes. Evaluating
  each combo against a *fixed reference field* is `O(combos × field)` and is the standard
  agent-vs-baseline evaluation shape (e.g. best-agent identification runs each candidate against a
  common opponent set and reads win rates with confidence intervals). It surfaces dominant/
  underpowered outliers — which is what flagging needs — without the quadratic blowup. Coverage is
  a knob the designer widens over time (spec Assumptions).
- **Alternatives considered**: *Full all-pairs round-robin* — most thorough but quadratic;
  rejected for v1 as unbounded. *Pure random sampling of matchups* — cheaper but gives no stable
  per-combo estimate; the reference-field approach fixes the opponent axis so each combo gets a
  clean, comparable across-field number. Widening from reference-field toward round-robin is a
  later refinement.
- Sources: [Best Agent Identification for General Game Playing (arXiv 2507.00451)](https://arxiv.org/pdf/2507.00451).

---

## Workstream B — Win-rate statistics

### B1. Interval estimate → **Wilson score interval on the binomial win count**

- **Decision**: Report each matchup's win rate `p̂ = wins/n` with a **Wilson score confidence
  interval** at 95% (`z = 1.96`), plus the sample size `n`. A combo is only flagged (US2) when its
  **interval clears the fair band**, not merely its point estimate (FR-011).
- **Rationale**: A batch of N seeded Bo3s is a **binomial** experiment (each match is a
  win/not-win Bernoulli trial), so the win rate is a binomial proportion and the right interval is
  Wilson's. Wilson is the **modern default** — it gives *"substantially better coverage than the
  widely used Wald interval, especially when the sample size is small or the true proportion is
  near 0 or 1,"* and it **always stays within [0,1]**, which matters here because dominant/
  underpowered combos sit exactly near 0 and 1 where the naive Wald interval breaks. Formula:
  `CI = (p̂ + z²/2n ± z·√[p̂(1−p̂)/n + z²/4n²]) / (1 + z²/n)`. Gating flags on the interval (not the
  point) is what prevents flagging noise (the small-sample edge case).
- **Sample-size sizing**: Monte-Carlo error shrinks as ≈`1/√n`. At `p̂ = 0.5` the Wilson
  half-width is ≈ **±3.1% at n = 1000**, ≈ **±2.2% at n = 2000**, ≈ **±4.9% at n = 400** — so a
  default of **~1500–2000 samples per matchup** hits the SC-002 ≤±2.5% target, and Feature 1's
  ≥10,000-Bo3-in-minutes throughput means a matchup's batch is seconds, a modest sweep is minutes.
  The target half-width is a config knob; the tool reports the achieved `n` and interval so the
  designer sees exactly how much confidence a run bought.
- **Alternatives considered**: *Wald (normal-approximation) interval* — rejected: poor coverage at
  the extremes we care about, can exceed [0,1]. *Clopper–Pearson (exact)* — valid but conservative
  (wider) and needless here. *Bare point win rate with no interval* — rejected: it invites flagging
  noise as imbalance (the exact failure mode FR-011/SC-002 guard against).
- **Determinism note**: the win **count** is integer and fully deterministic (it comes from the
  deterministic engine); only the interval bounds are float, computed **once** at the end and
  **rendered at fixed decimal precision** — so report bytes are stable and the float never enters a
  flag/verdict decision except through the fixed-precision interval comparison (spec Assumptions,
  plan Complexity Tracking).
- Sources: [Wilson Score Interval — GM-RKB](https://www.gabormelli.com/RKB/Wilson_Score_Interval),
  [Wilson Score Interval: Formula, Calculator & Examples](https://statisticsfundamentals.com/confidence-intervals/wilson-score-interval/),
  [Confidence Intervals for Binomial Proportions (MWSUG P08)](https://www.mwsug.org/proceedings/2008/pharma/MWSUG-2008-P08.pdf).

---

## Workstream C — Flagging, invariants & report delivery

### C1. "Dominant" / "degenerate" / "underpowered" thresholds → **a configurable fair band; interval-gated flags**

- **Decision**: Define a **fair band** `[floor, ceiling]` on the across-field win rate (default
  centred on 50%, e.g. `[40%, 60%]` — a config knob). A combo is **Dominant** if its Wilson
  interval lies **entirely above** the ceiling, **Underpowered** if entirely **below** the floor,
  and **Degenerate** if it either **wins across *every* matchup in its field** (a stricter,
  no-counterplay condition — the "no dominant unit" idea at combo granularity) **or** is a Plan-B
  build with **no offsetting trade-off** (the §8.2 "free-turtle" trade-off law). Severity = the
  interval's distance from the nearest band edge; flags sort by severity descending.
- **Rationale**: Grounding the flag on the **interval clearing the band** (not the point estimate)
  is the statistically honest rule — it means "we're 95% confident this is out of band," so a
  flag is signal, not noise (FR-011). The band is a *policy* the designer owns (design doc gives
  ~25% power spread and ~10–15% family bonus as *bands*, not points), so it must be configurable
  with documented defaults, not hard-coded. "Wins across *all* its matchups" is the direct scaling
  of Feature 1's SC-003 "no single unit wins across all matchups it is tested in" to the combo
  level. The trade-off-law flag operationalises §8.2's explicit instruction that *"the
  auto-balancer flags free-turtle combos."*
- **Alternatives considered**: *A single hard win-rate cutoff on the point estimate* — rejected:
  flags noise, and picks an arbitrary point where the design specifies a band. *An Elo/MMR model
  over the sweep* — heavier machinery than needed to answer "is this combo out of the fair band,"
  and Elo assumes transitivity the intransitive counter-web deliberately breaks; win-rate-vs-field
  with intervals is the honest primitive.
- Sources: [GDD §8.2 trade-off law + §14 balancer](../../reference/warformcommandergamedesigndoc.md),
  [Feature 1 SC-003 counter-web](../001-battle-sim-core/spec.md#success-criteria).

### C2. The four invariants → **each a numeric assertion against head-to-head distributions, reported with margin**

- **Decision**: Implement each constitution-P4 balance claim as a distribution read:
  - **Native-family band (FR-012)** — resolve `native-weapon build` vs `off-family-weapon build`
    (same variant/target), read the win-rate/effective-damage edge, assert it sits in ~10–15%
    (+12% default).
  - **Power-gap cap (FR-013)** — resolve `max-gear army` vs an **equal-composition base-gear army**,
    assert the max-gear win rate is within the moderate (~25%) cap band.
  - **No dominant unit (FR-014)** — over the sweep, assert no type/variant's set of across-field
    results is a clean sweep (a win in *every* matchup) — the counter-web must show teeth
    somewhere for everyone.
  - **Skill beats gear (FR-015)** — resolve `well-composed base-gear` vs `sloppy max-gear`
    (authored fixtures), assert the base-gear side wins the majority.
  Each returns `{ name, band, measured, margin, pass }` (FR-016) — never a bare boolean.
- **Rationale**: These are exactly the claims the constitution says must be *"validated
  numerically, not asserted"* (P4) and the §10 governing law *"the auto-balancer verifies this
  (skilled base-gear vs sloppy max-gear → skill wins)."* Reporting the **measured number + margin**
  (not pass/fail alone) is what makes the report *actionable* — the designer sees not just that a
  band is breached but by how much, so they know how hard to tune. Testability comes from
  **deliberately-violating fixtures** (SC-004): set the family bonus far out of band and assert the
  check fails, etc.
- **Alternatives considered**: *Boolean pass/fail only* — rejected: uninformative for tuning.
  *Rolling these into US2's generic flagging* — rejected: the four invariants are named,
  constructed, targeted checks (against known fixtures), not open-ended field flagging; they earn a
  distinct mode.
- Sources: [Constitution P1/P2/P4](../../.specify/memory/constitution.md),
  [GDD §7.1 native bonus, §10 progression law](../../reference/warformcommandergamedesigndoc.md).

### C3. Report delivery → **committed JSON + markdown from a CLI; the future admin view (Feature 12) is a downstream consumer**

- **Decision**: Emit two artifacts from the CLI: a **machine-readable JSON** report (the source of
  truth for tooling) and a **human-readable markdown/CLI** rendering of the same, both written to a
  configurable output path and committable alongside the balance table. **No database, no server,
  no live surface** in this feature. Each report carries the `rulesetHash` + engine/format-version
  stamp (FR-019).
- **Rationale**: The balancer is an **offline dev tool** (spec Assumptions); its output is a
  *document a human reads*, not a live datastore — so committed files + CLI output is the right,
  minimal delivery (the design doc's §16.2 live-editing/auto-news pipeline and the admin console
  are **Feature 12**, explicitly out of scope here). JSON as the canonical shape mirrors Feature 1's
  "structured data as data" ethos ([replay-format](../001-battle-sim-core/contracts/replay-format.md))
  and makes the report a clean seam a future admin view can consume without rework. The version
  stamp is what stops a designer tuning off a stale run (edge case: engine/format drift).
- **Alternatives considered**: *Write results into Postgres now* — rejected: premature; no live
  consumer exists until Feature 12, and the DB is for game/replay data, not dev-tool output.
  *CLI stdout only (no JSON)* — rejected: loses the machine-readable seam and diffability across
  runs. *Feed the admin console directly* — that is Feature 12's job; coupling now would violate
  scope discipline (Principle IV).
- Sources: [GDD §16.2 admin console + news = Feature 12](../../reference/warformcommandergamedesigndoc.md),
  [Feature 1 replay-format (data-as-JSON precedent)](../001-battle-sim-core/contracts/replay-format.md).

---

## Cross-cutting decisions (summary for plan.md Technical Context)

| Area | Decision |
|---|---|
| **Language / target** | Rust (stable), **native only** — no wasm target for the balancer bin; reuses `crates/engine` (rlib) as-is |
| **Parallelism** | `rayon` **across matches only**; per-*match* seed = `f(base_seed, match_index)`; reduce **integer counts** (associative) → reproducible regardless of thread count |
| **Statistics** | **Wilson score** 95% CI on the binomial win count; default ~1500–2000 samples/matchup for ≤±2.5% half-width; MC error ≈ `1/√n` |
| **Flag rule** | configurable fair band `[floor, ceiling]`; flag only when the **Wilson interval clears the band** (no noise flags); severity = distance from band; degenerate = wins-all-matchups **or** no-trade-off Plan-B |
| **Invariants** | four numeric checks (family band, power-gap cap, no-dominant-unit, skill>gear); each reports `{measured, margin, pass}`; tested via deliberately-violating fixtures |
| **Floats** | decision-bearing aggregates are **integer counts** (deterministic); CI/means are floats computed once, rendered at fixed precision — kept out of the authoritative path |
| **Delivery** | offline CLI (`crates/balancer`) → committed **JSON + markdown** reports, `rulesetHash`+version stamped; **no DB/server/live surface** (that's Feature 12) |
| **Ruleset** | read as a **data input** (Feature 1 Tier 2); **never mutated** (advisory only, P1) |
| **Throughput** | ≥10,000 Bo3 in minutes (Feature 1 SC-006), ~linear scaling across cores (rayon) |

All genuine unknowns (reproducible parallelism, win-rate statistics, flag/invariant definitions,
report delivery) are resolved. No unresolved items remain for the design phase.
