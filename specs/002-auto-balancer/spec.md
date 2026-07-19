# Feature Specification: Auto-balancer (Monte-Carlo)

**Feature Branch**: `002-auto-balancer`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Auto-balancer (Monte-Carlo) — the offline, solo-dev fairness superpower. Run the Feature 1 engine natively thousands of times per matchup across the combinatorial space (unit × variant × loadout × dials × positioning), read win-probability distributions, and flag degenerate/dominant combinations before players find them. Verify the balance invariants numerically. Output is balance reports the human reads to tune the Ruleset; it does not itself change balance."

## Overview

This feature is the **offline Monte-Carlo auto-balancer** — the tool that makes
constitution **P4 (Fairness Is Verified, Not Hoped)** real. Because a Warform Commander
battle is a deterministic function of its inputs (Feature 1), the same engine can be run
thousands of times over the same matchup with different seeds to read a **win-probability
distribution**, and over the whole combinatorial space to **flag degenerate or dominant
combinations before players find them**. Given the size of the space this game deliberately
creates (7 types × 3 variants × equipment × 4 dials × ≤2 Plan-B × positioning), this tool is
what lets *one person* keep the game fair — it is not optional.

The value it delivers: **numeric proof, not hope, that the matchup space is fair.** Point it
at a matchup and it returns a win rate with error bars. Point it at the field and it returns
a ranked list of the worst offenders — the combos a designer must tune down (or up) — plus a
pass/fail readout on the game's four load-bearing balance claims: the native-family-bonus
band, the ~25% power-gap cap, "no dominant unit," and "skill beats gear."

It is a **dev/offline tool**. It runs the Feature 1 engine **natively** (the `crates/balancer`
binary — the stub already reserved in [Feature 1's plan](../001-battle-sim-core/plan.md) and
[tasks](../001-battle-sim-core/tasks.md#T051)) — *never* a second engine (a second engine
would drift and break P6/P4). It reads the **Ruleset** (the balance table, Feature 1
[data-model Tier 2](../001-battle-sim-core/data-model.md#tier-2--ruleset-the-balance-table-engine-input))
as data and emits reports; it **does not itself change balance** — the human reads the reports
and locks the shape. Its actor is the **solo dev/designer running the tool** from the command
line, not a player and not a live server.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Estimate a matchup's win probability from a seeded Monte-Carlo batch (Priority: P1)

The designer supplies two fully-specified 5-unit squads (a matchup) and a base seed, and the
tool resolves that matchup **N times** — once per derived seed — by calling the Feature 1
engine natively, then aggregates the outcomes into a **win-probability estimate** for each
side: a point win rate, a **confidence interval**, the sample size, and a breakdown of *how*
the matchup is won (Conquest vs Time-tiebreak, 2-0 vs 2-1, average duration). Re-running with
the same base seed produces an identical estimate; parallelism across cores never changes it.

**Why this priority**: This is the balancer's atom — the primitive every other story composes.
Even alone it is a complete, demonstrable fairness tool: a designer can point it at *any* two
armies and get a fair, reproducible win probability with error bars, which is already a
"superpower" no manual playtesting can match at this precision. Stories 2–4 are all "run this
primitive over many matchups and interpret the results," so it is the MVP.

**Independent Test**: Feed a fixed matchup + fixed base seed and assert the estimate is
identical across 1-thread and N-thread runs and across repeated invocations; assert a mirror
matchup (identical armies) lands near 50%; assert the reported confidence interval narrows as
sample size grows.

**Acceptance Scenarios**:

1. **Given** two valid squads and a base seed, **When** the tool runs a batch of N seeded resolutions, **Then** it returns a per-side win rate, a confidence interval, the sample size, and an outcome breakdown.
2. **Given** the same matchup and base seed, **When** the batch is run single-threaded and then multi-threaded, **Then** both produce byte-identical aggregate results (win counts, win rate, flags).
3. **Given** a mirror matchup (side A's army == side B's army), **When** it is estimated over a large batch, **Then** the win rate is within a small tolerance of 50% (allowing for the exact-damage-tie-to-defender rule).
4. **Given** two batch sizes N and 4N over the same matchup, **When** each is estimated, **Then** the larger batch reports a narrower confidence interval (≈ half the half-width).

---

### User Story 2 - Sweep the combinatorial space and flag dominant/degenerate combos (Priority: P2)

The designer supplies a **sweep configuration** — which axes to vary (type × variant × loadout
× dials × positioning), the field of opponents to test against, the sample size, and the
fairness band — and the tool evaluates each candidate combo across the field, computes its
**across-field win rate**, and **flags** the outliers: **dominant** combos (win rate above the
band's ceiling), **degenerate** combos (e.g. a combo that wins across *all* its matchups, or a
no-trade-off "free-turtle" Plan-B build that violates the §8.2 trade-off law), and
**underpowered** combos (win rate below the floor). Flagged combos are **ranked by severity**
(distance from the fair band) so the worst offenders surface first.

**Why this priority**: This is the feature's raison d'être per **P4 / GDD §14** — "flag
degenerate/dominant combos before players find them." A balancer that estimates one matchup is
a calculator; one that sweeps the field and surfaces the outliers is what actually keeps the
game fair at scale. P2 rather than P1 only because it composes the US1 primitive — it cannot
exist without it.

**Independent Test**: Run the sweep over a **seeded fixture Ruleset that contains a
deliberately dominant combo**; assert the balancer flags that combo and does *not* flag a
known-fair combo; assert a deliberately underpowered combo is flagged; assert the flag list is
sorted worst-first by severity.

**Acceptance Scenarios**:

1. **Given** a sweep config and a Ruleset containing a planted dominant combo, **When** the sweep runs, **Then** the planted combo appears in the flagged-dominant list and a known-fair combo does not.
2. **Given** a sweep, **When** a combo's across-field win rate falls below the configured floor, **Then** it is flagged underpowered.
3. **Given** a Plan-B build with no offsetting trade-off (a "free-turtle" combo), **When** the sweep runs, **Then** it is flagged degenerate.
4. **Given** several flagged combos, **When** the results are produced, **Then** they are ordered by severity (largest deviation from the fair band first).

---

### User Story 3 - Verify the balance invariants numerically (Priority: P2)

The designer runs the tool in **verify** mode and it evaluates the game's four load-bearing
balance claims against the current Ruleset, each as a numeric assertion against the
distributions, and reports each as **pass/fail with the measured number and its margin** (not a
bare boolean):

- **Native-family-bonus band** — a native-family weapon's edge over the same build with an
  off-family weapon stays within the intended band (~10–15%; +12% default).
- **Power-gap cap** — a fully-progressed (max-gear) army's advantage over a fresh (base-gear)
  army *of equal skill* stays within the moderate (~25%) cap (advantaged, not a blowout).
- **No dominant unit** — no machine type/variant wins across *all* the matchups it is tested in.
- **Skill beats gear** — a well-composed base-gear army beats a sloppy max-gear army a majority
  of the time (the **P2 / §10** governing law).

**Why this priority**: These four claims are asserted throughout the design doc and the
constitution (P1, P2, P4); this story is what turns them from assertions into *verified* numbers
(P4). P2 because it composes the US1 primitive and reads the same distributions US2 produces.

**Independent Test**: Run verify mode on the first-pass stat block and assert all four
invariants are evaluated and reported with measured numbers; run it on fixtures that
deliberately violate each invariant and assert each violation is detected and reported as a
fail with its margin.

**Acceptance Scenarios**:

1. **Given** the current Ruleset, **When** verify mode runs, **Then** each of the four invariants is reported pass/fail with its measured value and the distance from its band.
2. **Given** a fixture whose native-family bonus is set far above the band, **When** the family-bonus invariant is checked, **Then** it is reported as a fail with the measured over-band margin.
3. **Given** a max-gear army vs an equal-skill base-gear army, **When** the power-gap invariant is checked, **Then** the max-gear win rate is reported and flagged if it exceeds the moderate cap.
4. **Given** a well-composed base-gear army vs a sloppy max-gear army, **When** the skill-beats-gear invariant is checked, **Then** the base-gear side is reported as winning the majority (or the invariant fails).

---

### User Story 4 - Emit balance reports the designer reads to tune the Ruleset (Priority: P3)

The tool's output is a **balance report** in two forms: a **machine-readable** structured JSON
(per-matchup win rates + confidence intervals, flagged combos, invariant results) and a
**human-readable** markdown / CLI summary of the same. Each report is **stamped with the
`rulesetHash`** (and the engine + replay-format versions) it was produced against, so a report
is traceable to the exact balance table it evaluated. The report is the artifact the human reads
to decide how to tune the Ruleset — the tool **never edits the Ruleset itself**.

**Why this priority**: The estimates and flags are only useful if a human can read and act on
them. P3 because Stories 1–3 define the *content* the report carries; the serialization/
presentation shape can firm up alongside them (mirrors how Feature 1's replay-emission story was
P3). The report is also the seam a future admin view (Feature 12) will consume.

**Independent Test**: Run a full pass and assert the JSON report validates against its schema
and carries the `rulesetHash` + versions; assert the markdown report renders the flagged combos
and invariant pass/fails legibly; assert the input Ruleset is byte-for-byte unchanged after the
run (advisory-only).

**Acceptance Scenarios**:

1. **Given** a completed sweep + verify pass, **When** the report is emitted, **Then** a JSON report validates against its schema and a markdown report renders the same findings.
2. **Given** a report, **When** it is inspected, **Then** it carries the `rulesetHash` and engine/format versions it was produced against.
3. **Given** an input Ruleset, **When** a full balancer run completes, **Then** the Ruleset file is unchanged (verified by checksum before and after) — the tool is advisory only.
4. **Given** two reports produced against two different Rulesets, **When** they are compared, **Then** their provenance stamps distinguish them.

---

### Edge Cases

- **A turtle-vs-turtle matchup that always ends by Time** (both sides camp): the estimate must
  still be well-defined (win via the damage-dealt tiebreak, §9.3), and the pair should surface
  as a degenerate low-action flag rather than crash or hang.
- **A mirror matchup**: expected ≈ 50%, used as a calibration anchor; the exact-damage-tie →
  defender rule may skew it slightly off 50% and that skew must be explainable, not a bug.
- **Sample size too small for a stable interval**: the tool reports the wide confidence interval
  **honestly** and must **not flag** a combo dominant/underpowered on a sample too small to
  separate it from the fair band (no false positives from noise).
- **The full combinatorial space is too large to enumerate** (billions of combos): the sweep
  must be **bounded/sampled** per the sweep config, and the report must state what coverage it
  actually achieved rather than implying exhaustiveness.
- **A candidate combo the engine would reject** (an illegal army generated by the sweep): it is
  skipped and recorded, never crashing the batch (the engine's `validate()` is the gate).
- **Non-associative parallel reduction**: aggregation must be **order-independent** (integer win
  counts, not a running float), so thread scheduling cannot change the result.
- **Engine or replay-format version drift**: a report produced against a stale engine build must
  be detectable via its version stamp, so a designer never tunes off an outdated run.
- **A Ruleset change between runs**: two runs over different Rulesets must be distinguishable by
  `rulesetHash`; the tool never silently mixes results across balance tables.

## Requirements *(mandatory)*

### Functional Requirements

**Monte-Carlo batch (the sampling core — US1)**

- **FR-001**: The system MUST resolve a matchup by calling the **Feature 1 engine's `resolve()`** natively over a batch of independently-seeded matches, reusing the `crates/engine` crate **as-is** — it MUST NOT reimplement, fork, or approximate the engine (a second engine would break P6/P4).
- **FR-002**: The system MUST derive each match's seed **deterministically** from a single base seed plus the match index (per-work-unit seeding), so a batch is fully reproducible and its aggregate is independent of how the batch is scheduled.
- **FR-003**: The system MUST aggregate a batch into a **win-probability estimate** per side: a point win rate, a **confidence interval** (Wilson score), the sample size, and an outcome breakdown (Conquest vs Time-tiebreak, game-count split 2-0/2-1, average duration).
- **FR-004**: The system MUST parallelize **across independent matches only** — never inside a single `resolve()` — preserving Feature 1's single-threaded-resolve determinism, and the aggregate MUST be **identical** whether the batch runs single- or multi-threaded.
- **FR-005**: The system MUST reject-and-skip (never crash on) any candidate matchup the engine's `validate()` refuses, recording the skip so the run's coverage is honest.

**Combinatorial sweep + flagging (US2)**

- **FR-006**: The system MUST enumerate a **bounded sweep** over the parameter space (machine type × variant × loadout × dials × positioning) from a **sweep configuration expressed as data**, sized to stay within a practical time budget; where the space exceeds the budget it MUST sample it and record the coverage achieved.
- **FR-007**: The system MUST evaluate each candidate combo against a **field of opponents** (a reference set or round-robin) and compute its **across-field win rate**.
- **FR-008**: The system MUST **flag dominant** combos (across-field win rate above the configured band ceiling) and **degenerate** combos (a combo that wins across *all* its matchups, or a Plan-B build with no offsetting trade-off per §8.2), with the flag reason attached.
- **FR-009**: The system MUST **flag underpowered** combos (across-field win rate below the configured floor), so the sweep surfaces both ends of the imbalance, not only the dominant end.
- **FR-010**: The system MUST **rank flagged combos by severity** (distance from the fair band) so the worst offenders appear first.
- **FR-011**: The system MUST NOT flag a combo on a **sample too small** to statistically separate it from the fair band (flags require the confidence interval to clear the band, not just the point estimate).

**Balance-invariant verification (US3)**

- **FR-012**: The system MUST verify the **native-family-bonus band** — the win-rate/damage edge of a native-family weapon over the same build with an off-family weapon stays within the intended band (~10–15%; +12% default) — reading it from head-to-head distributions.
- **FR-013**: The system MUST verify the **power-gap cap** — a max-gear army's advantage over an **equal-skill** base-gear army stays within the moderate (~25%) cap (advantaged, not a blowout).
- **FR-014**: The system MUST verify **"no dominant unit"** — no machine type/variant wins across *all* the matchups it is tested in (the balancer's scaled version of Feature 1's counter-web check, [SC-003](../001-battle-sim-core/spec.md#success-criteria)).
- **FR-015**: The system MUST verify **"skill beats gear"** — a well-composed base-gear army beats a sloppy max-gear army a majority of the time (P2 / §10) — using authored skilled/sloppy fixtures.
- **FR-016**: The system MUST report each invariant as **pass/fail with the measured number and its margin** from the band, never as a bare boolean.

**Ruleset as data + advisory-only (P8, P1)**

- **FR-017**: The system MUST read the **Ruleset** (the balance table) as a **data input** — the same typed Ruleset the engine consumes ([Feature 1 data-model Tier 2](../001-battle-sim-core/data-model.md#tier-2--ruleset-the-balance-table-engine-input)) — and MUST hard-code no balance numbers of its own.
- **FR-018**: The system MUST NOT modify the Ruleset or any game-data file; its only output is **advisory reports** (the human locks the shape — changing balance automatically is explicitly out of scope).
- **FR-019**: The system MUST stamp every report with the **`rulesetHash`** and the engine + replay-format versions it was produced against, so a report is traceable to the exact balance table and engine build it evaluated.

**Reporting (US4)**

- **FR-020**: The system MUST emit a **machine-readable report** (structured JSON) capturing per-matchup win rates + confidence intervals, flagged combos with reasons and severity, and invariant results.
- **FR-021**: The system MUST emit a **human-readable report** (markdown and/or a CLI table) presenting the same findings legibly without additional tooling, suitable to commit alongside the balance table.
- **FR-022**: The system MUST run as an **offline command-line tool** (the `crates/balancer` binary) with configurable base seed, sample size, thread count, sweep scope, fairness band, Ruleset path, and output path — it is a dev tool, not a server route or a user-facing service.

**Reproducibility + throughput**

- **FR-023**: The system MUST produce a **reproducible** result for the same (Ruleset, sweep config, base seed): identical win counts, win rates, flags, and invariant verdicts, regardless of thread count or host, so a report is scientific evidence, not a one-off.
- **FR-024**: The system MUST sustain the Feature 1 throughput target — **≥10,000 Bo3 resolutions completing in minutes, not hours** ([Feature 1 SC-006](../001-battle-sim-core/spec.md#success-criteria)) — so a meaningful sweep finishes in a practical run, scaling roughly linearly with cores.

### Key Entities *(include if feature involves data)*

- **MatchupSpec**: a pairing of two fully-specified 5-unit squads (or army templates) to evaluate, plus the adaptation policy (the balancer uses the engine's `Free` mode). Reuses Feature 1's `Army`.
- **SweepConfig**: the parameter space to vary (which axes, which values), the field of opponents, the per-matchup sample size, the base seed, and the fairness band (ceiling/floor thresholds). Authored data.
- **BatchSeeding**: the deterministic mapping from a base seed + match index to a per-match seed (the reproducibility primitive).
- **WinRateEstimate**: the aggregated outcome of one matchup batch — point win rate, Wilson confidence interval, sample size, and the outcome/duration breakdown.
- **FlaggedCombo**: a combo plus its across-field win rate, a flag kind (Dominant / Degenerate / Underpowered), the reason, and a severity score (deviation from the fair band).
- **InvariantCheck**: one of the four balance invariants — its name, its band, the measured value, the margin, and a pass/fail verdict.
- **BalanceReport**: the aggregate output — the matchup win-rate table, the ranked flagged-combo list, the invariant results, and the provenance stamp (`rulesetHash` + engine/format versions).
- **Ruleset** *(reused — not redefined here)*: the balance table the balancer reads as data; see [Feature 1 data-model Tier 2](../001-battle-sim-core/data-model.md#tier-2--ruleset-the-balance-table-engine-input).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Reproducibility** — for a fixed (Ruleset, sweep config, base seed), the balancer produces identical win counts, win rates, flags, and invariant verdicts across repeated runs and across 1-thread vs N-thread execution (100% reproducible; verified by comparing serialized report bodies modulo timing metadata).
- **SC-002**: **Statistical stability** — every matchup win rate is reported with a **Wilson 95% confidence interval** whose half-width is within the configured target at the configured sample size (default target ≤±2.5%), and re-estimating the same matchup from a *different* base seed lands within the reported interval in ≥95% of cases (calibration).
- **SC-003**: **Catches a planted imbalance** — given a **seeded fixture Ruleset containing a deliberately dominant combo**, the balancer flags that combo *and* does not flag a co-located known-fair combo (the headline "flags a known-dominant combo in a seeded fixture" check); a deliberately underpowered combo is likewise flagged.
- **SC-004**: **Invariant verification** — on the first-pass stat block, all four invariants (family-bonus band, power-gap cap, no-dominant-unit, skill-beats-gear) are evaluated and reported pass/fail **with measured numbers and margins**; on four fixtures that each deliberately violate one invariant, each violation is detected as a fail.
- **SC-005**: **Throughput** — a representative sweep of **≥10,000 Bo3 resolutions completes in minutes, not hours** on a dev machine (ties to Feature 1 SC-006), and wall-clock time scales roughly linearly with core count (parallel efficiency demonstrated).
- **SC-006**: **Non-mutation** — a full balancer run completes without writing to or altering the input Ruleset or any game-data file (checksum identical before and after) — the tool is provably advisory only (P1: the human locks the shape).
- **SC-007**: **Traceability** — every report carries the `rulesetHash` + engine/replay-format versions it was produced against, and two reports over different Rulesets are distinguishable by that stamp (no silent mixing of results across balance tables).

## Assumptions

- **Depends on Feature 1's engine.** This feature reuses `crates/engine` (the rlib) exactly — the same deterministic core the server runs (P6). It is *planned* here as part of the foundation-first planning pass, but it can only be *implemented* once the Feature 1 engine exists; the `crates/balancer` stub is already reserved in Feature 1's [plan](../001-battle-sim-core/plan.md#project-structure) and [tasks](../001-battle-sim-core/tasks.md#T051). This is the one hard cross-feature dependency.
- **Native, offline only.** The balancer runs natively (never WASM, never in the browser, never on the server request path). It is a dev/CI tool. **Live/server-side balancing is out of scope**, and the **admin console that edits the Ruleset live is Feature 12** — this tool feeds the human who feeds Feature 12, it does not talk to it.
- **The tool provides mechanism, not policy.** The fairness band (dominance ceiling / underpowered floor), the target sample size, and the invariant bands are **configurable inputs with documented defaults** (default dominance ceiling and family/power/skill bands taken from the design doc's stated numbers). Their exact values are the designer's to set — just as the balance numbers themselves are the balancer's to tune (P4). The design doc pins the numbers as *bands* (§7.1 ~10–15%, §10 ~25%), not point values, so this spec treats them as configurable.
- **The sweep is bounded, not exhaustive.** The full combinatorial space is far too large to enumerate; v1 samples/bounds it via the sweep config over representative axes, and the report states the coverage achieved. Expanding coverage is incremental, not a blocker.
- **"Skill" is the quality of the pre-battle plan.** Consistent with P2, "skill" is modeled as the *quality of a squad's composition, loadout, dials, and positioning* — not a runtime input (there is none). The skilled/sloppy armies used by the skill-beats-gear invariant are **authored data fixtures**.
- **Reports are committed artifacts + CLI output in v1.** The JSON and markdown reports are files a designer commits alongside the balance table and reads directly; wiring reports into a future admin view is **Feature 12's** concern, out of scope here. The report schema is designed to be that future consumer's seam.
- **Statistics live outside the deterministic core.** The engine forbids floats for byte-identical determinism (Feature 1); the balancer's *decision-bearing* aggregates (win/loss counts, flags, invariant verdicts) are integer and fully deterministic, while derived presentation statistics (confidence-interval bounds, mean duration) use floats rendered at a fixed decimal precision — so reports stay reproducible without imposing the engine's no-float rule on a non-authoritative reporting layer (see [plan.md Complexity Tracking](./plan.md#complexity-tracking)).
