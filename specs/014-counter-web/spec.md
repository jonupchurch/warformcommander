# Feature Specification: Counter-Web — a contested battle field

**Feature Branch**: `feat/014-counter-web`

**Created**: 2026-07-22

**Status**: Draft

**Input**: Break the degenerate near-total-order battle field into a contested counter-web. Flatten
composition power gaps (Axis A, mechanics) so matchups land near parity, then add graded soft counters
(Axis B, content) so parity matchups are decided by counter-matching — with a few hard capability
counters kept as the minority. Evidence base: [diagnosis.md](./diagnosis.md).

## Why this feature exists (the measured problem)

The battle engine is correct and deterministic; the *field* it produces is degenerate. Measured on the
live v17 ruleset ([diagnosis.md](./diagnosis.md)):

- **93.9% of composition pairings are a total order** — the higher-ranked army wins, with **zero
  near-ties**. Matchups are decided by which composition simply ranks higher on a single scalar
  "power level," and the gaps dwarf every counter.
- **120+/132 matchups are 0/100 sweeps.** Only **4** counter-relationships (all capability counters,
  e.g. anti-air → air) are strong enough to overturn the ranking.
- **No single mechanic moves it.** Damage magnitude (11 prior tuning rounds), fire concentration, and
  reach/screening each shift ~4 matchups and no more — each is a perturbation too small to reorder a
  ladder this steep. This is why balance has felt unmovable since v5.

The root cause is **super-linear composition power**: stacking identical units (or durability) raises
an army's power level faster than linearly, so almost every matchup lands cleanly on one side of a
rank boundary. This directly opposes the game's own law — **P2 (planning over stats)** and **P1
(power gaps stay small and lateral)**. A contested, counter-decided field is not a nice-to-have; it is
those invariants actually holding at the composition level.

The correction has **two axes, and order matters**: flatten the power ladder first (so matchups land
near parity), then make counter-matching the thing that decides the now-even fights. Adding counter
content to today's steep ladder only mints more 0/100 walls — which is why "just add weapons" was the
wrong instinct.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stacking the strongest unit stops being a free win (Priority: P1)

A player can no longer win by simply massing more of the single best unit. As identical units (or raw
durability) are stacked into one army, each additional copy contributes **less** than the last, so a
composition's total combat power is bounded rather than runaway. Two armies built from different but
sensible ideas land close in power instead of one dominating outright.

**Why this priority**: This is the prerequisite for everything else. Until the power ladder is
flattened, no amount of counter content produces contested matchups — it only produces more hard
counters. Flattening is the direct kill for the super-linearity the diagnosis identified, and it is
**P1/P2 enforced at the composition level**. Delivered alone it already makes the field measurably less
of a total order (an MVP: near-ties appear where there were none).

**Independent Test**: Re-measure the field with the balancer (`verify --field all`). The **near-tie**
count (matchups at 45–55%) rises above **0**; the monotone (total-order) rate drops below the baseline
94%; and a controlled "add the Nth copy of a specialist" sweep shows the 0→100 cliff replaced by a
graded curve — the 2nd copy no longer flips a matchup from total loss to total win.

**Acceptance Scenarios**:

1. **Given** an army and a candidate reinforcement, **When** a 2nd identical unit of a type is added,
   **Then** the army's measured across-field win rate increases by **markedly less** than the first
   copy contributed (diminishing marginal value), rather than crossing a rank boundary in one step.
2. **Given** the "1 flak loses 0–100 / 2 flak wins 100–0" cliff from the diagnosis, **When** the
   flattening is applied, **Then** the same 1-vs-2 sweep resolves as a **gradient** (e.g. 1 flak ~30%,
   2 flak ~55–65%), not a switch.
3. **Given** two near-equal-power compositions, **When** they are matched, **Then** the result lands in
   a contested band rather than 0/100.

---

### User Story 2 - Countering the enemy tilts the battle in my favor (Priority: P2)

In the flattened field, a player who reads the opponent's composition and brings the right counter
**wins a near-even fight** — decisively enough to reward the read (roughly 60/40, not 50/50), but not
so hard that the fight was over before it started (not 100/0). Counter-matching, not raw power, is what
decides most battles — which is the "planning beats gear" promise made real.

**Why this priority**: This is the payoff — the reason to flatten the ladder. It converts near-parity
matchups (from US1) into *interesting* ones whose winner is the better counter-picker. It depends on
US1: soft counters only read as "graded" once power gaps are small; on the steep ladder they are
invisible. Built entirely from the existing configuration axes (damage matrix, role bonuses, reach
tiers, defense families) per **P3 — no roster growth.**

**Independent Test**: In the flattened field, a controlled matchup between two equal-power armies where
one is the intended counter of the other resolves in the **40–70%** band (a real tilt), and across the
whole field the count of **contested** matchups (5–95%) rises substantially toward the target — with
the winners explainable by counter relationships rather than power rank.

**Acceptance Scenarios**:

1. **Given** two equal-power compositions, one countering the other on the damage matrix / role /
   reach axis, **When** matched, **Then** the countering side wins in the **55–70%** band (graded, not
   a sweep).
2. **Given** the same two compositions with the counter relationship removed (mirror), **When**
   matched, **Then** the result is a near-tie (45–55%) — isolating the counter as the cause of the
   tilt.
3. **Given** the full field after both axes, **When** swept, **Then** contested matchups (5–95%) number
   **≥26 of 132** and near-ties (40–60%) are a substantial share — not a field of new 0/100 counters.

---

### User Story 3 - Hard counters still exist for the fantasy (Priority: P3)

A player who commits fully to a specialist answer (a dedicated anti-air army vs an all-air army) still
gets a **decisive** hard counter. Flattening power and adding soft counters does **not** dissolve the
game into uniform coin-flips; the handful of intended hard capability counters survive as deliberate,
readable texture — the minority, not the rule.

**Why this priority**: A field of nothing but 55/45 fights is as flavorless as a field of 100/0 sweeps.
The design wants a *spectrum*: mostly graded counter-play, with a few genuine hard counters as
landmarks. This story guards against over-flattening — it is the explicit non-goal boundary on US1/US2.

**Independent Test**: After both axes, the intended hard capability counters (anti-air → air is the
canonical one) still resolve strongly (≥80% for the counter), while remaining the **minority** of the
field — most matchups are graded, a few are hard.

**Acceptance Scenarios**:

1. **Given** a dedicated anti-air composition vs an all-air composition, **When** matched, **Then** the
   anti-air side still wins ≥80% (a preserved hard counter).
2. **Given** the full field, **When** swept, **Then** the number of remaining 0/100 sweeps is small and
   attributable to *intended* hard counters, not to unflattened power gaps.

---

### Edge Cases

- **Over-flattening → coin-flips.** If power-flattening is too aggressive, every matchup collapses to
  ~50/50 and counter-play becomes noise. Guarded by US3 and SC-006/SC-007 (hard counters preserved,
  determinism intact — the winner must still be the counter-match, not the seed).
- **A new dominant emerges.** Flattening one lever can re-inflate another (the see-saw seen v7–v11).
  Every slice re-runs the full field; the `NoDominantUnit` invariant must stay green (SC-005).
- **P1 power-cap breach.** A flattening or counter lever must not open a >~25% fresh-vs-progressed
  power gap (SC-008). Counters are *lateral* tilts, never straight upgrades.
- **Determinism / hash stability.** Ruleset changes that are field-only (no catalog additions) must not
  re-bless goldens; catalog additions re-bless but the tick stream stays byte-identical native==wasm
  (SC-007). The seed remains bounded texture, never the decider (P6).
- **Duration drift.** Flattening durability or sharpening counters can shorten or lengthen battles;
  median duration must stay within ~10% of the 491-tick baseline (SC-004).

## Requirements *(mandatory)*

### Functional Requirements

**Axis A — flatten composition power (US1)**

- **FR-001**: The marginal combat value of the **Nth identical unit** in an army MUST diminish, so that
  stacking one unit type yields sub-linear returns rather than the current super-linear returns.
- **FR-002**: A composition's total effective combat power MUST be **bounded** relative to a
  same-size baseline, so two sensibly-built armies of the same size land close in power rather than one
  dominating by degree.
- **FR-003**: The flattening MUST be expressed as **typed ruleset data** (P8), tunable without an
  engine code change where possible, and read from the same source of truth as the sim, UI, and
  balancer.
- **FR-004**: The flattening MUST convert the diagnosed 0→100 stacking cliffs (1-vs-2 specialist) into
  **graded** curves, verifiable by a controlled add-the-Nth-copy sweep.

**Axis B — graded soft counters (US2)**

- **FR-005**: The existing counter axes (damage-family matrix, role bonuses, reach tiers, defense
  families) MUST be made strong enough that a countering composition **tilts** a near-parity matchup
  into the 55–70% band — a graded advantage, not a 100/0 switch.
- **FR-006**: Soft counters MUST be built from the **existing configuration axes and content** (P3) —
  no new unit *types* added; new *options/tables* within the existing axes are allowed.
- **FR-007**: Every counter lever MUST remain **lateral** (a trade-off, P1) — strengthening a
  composition against one opponent MUST cost it against another, never act as a straight upgrade.

**Axis C — preserve hard-counter texture (US3)**

- **FR-008**: The intended **hard capability counters** (anti-air → air as the canonical case) MUST be
  preserved at ≥80% for the counter, remaining a deliberate minority of the field.
- **FR-009**: The field MUST retain a **spectrum** of decisiveness — mostly graded matchups, a few hard
  counters — not collapse to uniform coin-flips.

**Cross-cutting**

- **FR-010**: Each slice MUST be **measured on the full field** (`verify --field all`) before and after,
  and MUST NOT introduce a new dominant composition (the `NoDominantUnit` invariant stays green).
- **FR-011**: All changes MUST preserve **deterministic native==wasm** battles (P6); catalog-only
  additions may re-bless goldens but MUST NOT change existing tick streams beyond the ruleset hash.
- **FR-012**: Changes MUST honor **P1** — the fresh-vs-fully-progressed power gap stays within the
  ~25% cap, and the `skill-beats-gear` and `power-gap-cap` invariants stay green.

### Key Entities

- **Composition power**: an army's aggregate effective combat capacity — the scalar the field currently
  orders on. The property Axis A bounds; measured, not necessarily a stored value.
- **Stacking-returns lever**: the typed ruleset data expressing diminishing marginal value of repeated
  units / durability (Axis A). New table(s) in the ruleset.
- **Counter strength**: the magnitude of the existing counter axes (matrix multipliers, role bonuses,
  reach advantages, defense-family effectiveness) — turned up, in a lateral way, for Axis B.
- **Field measurement**: the balancer's `verify --field all` report — the instrument (P4) every slice is
  judged against (wall count, contested count, near-tie count, monotone rate, spread, invariants).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Contested matchups** (win rate 5–95%) rise from the baseline **~8** to **≥26 of 132**.
- **SC-002**: **Near-ties** (matchups at 40–60%) rise from the baseline **0** to a substantial share
  (target ≥20 of 132) — the direct signature that the total order is broken.
- **SC-003**: The **monotone / total-order rate** (pairings where the higher-ranked army wins) drops
  from **93.9%** to **≤75%** — i.e. rank stops determining outcome for a meaningful fraction.
- **SC-004**: **Median battle duration** stays within **±10%** of the 491-tick baseline (redistribution,
  not inflation/deflation).
- **SC-005**: **No dominant composition** — no army clean-sweeps the field; the balancer's
  `NoDominantUnit` invariant stays green and the top-to-bottom **spread narrows** versus the 87-point
  baseline.
- **SC-006**: **Hard counters preserved** — the canonical anti-air → air counter still resolves ≥80%
  for the counter after both axes; the field retains a few (not zero, not most) hard counters.
- **SC-007**: **Determinism** — native == wasm byte-identical on every sampled seed for every slice;
  field-only changes do not re-bless goldens, catalog additions re-bless with identical tick streams.
- **SC-008**: **P1 honored** — the fresh-vs-progressed power gap stays within ~25%; `skill-beats-gear`
  and `power-gap-cap` invariants stay green (counters are lateral, not upgrades).
- **SC-009**: Each newly-contested matchup's winner is **explainable by a counter relationship**, not by
  power rank — verified on a sample of newly-contested matchups.

## Assumptions

- **The engine mechanics are sufficient; this is a tuning/content pass, not an engine rewrite.** The v2
  vocabulary (defense families, reach tiers, damage matrix, role bonuses, mount scaling) is the toolkit;
  a small, additive engine change for Axis A's stacking-returns lever is acceptable if no existing
  ruleset table can express it, but the bar is "smallest data-first change" (P8).
- **The balancer's `--field all` (12 archetypes, 132 matchups) is the field of record**, as in v2. The
  archetypes may be extended if coverage gaps surface, but the baseline is measured against the current
  set for comparability with [diagnosis.md](./diagnosis.md).
- **The measured baseline is the live v17 ruleset** (`503e5b42`), not v11 — comparisons use the numbers
  in [diagnosis.md](./diagnosis.md) (125 walls, 7 contested, 0 near-ties, 93.9% monotone at 250 samples).
- **"Power" is measured, not modeled.** Success is judged by the field's win-rate distribution, not by a
  theoretical power formula — the balancer (P4) is the arbiter.
- **Nothing is re-seeded to production** during development; each slice is built and locally verified. A
  production re-seed follows the v2 deploy-before-reseed procedure only after sign-off on the diff.
- **This does not touch the live ladder or player data** — it changes ruleset content/mechanics only.
