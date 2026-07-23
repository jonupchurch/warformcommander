# Feature Specification: v3 Counter-Web — a ground-up systems rewrite

**Feature Branch**: `feat/014-counter-web`

**Created**: 2026-07-23

**Status**: Draft

**Input**: Ground-up v3 redesign of the combat systems (weapons, armor/defense, targeting, equipment,
behaviors) to turn the degenerate battle field into an **intransitive counter-web**. Supersedes spec
014's falsified Axis-A (power-flattening) approach. The complete, decided design is the source of
truth — this spec does not re-derive it:

- **Design**: [`specs/014-counter-web/weapons-design.md`](../014-counter-web/weapons-design.md) — the
  **§11 registry (P1–P27)** is the authoritative decided-decisions list.
- **Measured problem**: [`specs/014-counter-web/diagnosis.md`](../014-counter-web/diagnosis.md).

> All mechanical magnitudes below (matrix multipliers, stance %s, cadence ticks, slot counts) are
> **start values to tune with the balancer**, not final numbers. This is a measure-driven build.

## Why this feature exists (the measured problem)

The engine is correct and deterministic; the *field* it produces is degenerate. Measured on the live
v2 ruleset (diagnosis.md):

- **93.9% of composition pairings form a total order** — the higher-ranked army wins, with **zero
  near-ties**. **125 of 132 matchups are 0/100 sweeps**, decided by which army ranks higher on a
  single "power level" scalar.
- **Only 4 counter-relationships survive** (all capability counters, anti-air → air) — every other
  counter is dwarfed by the rank gap.
- **No single mechanic moves it.** Axis-A power-flattening was built, measured, and **falsified**
  (it made the field slightly *worse* — a symmetric change cannot create an intransitive cycle).
  Five independent confirmations show single mechanical levers are balance-neutral on the wall. The
  walls are a **content/structure** problem.

The correction is to rebuild the **engagement and counter vocabulary** (damage-type triangle,
reach/targeting, defenses that make the triangle bite, graded equipment counters, reactive behaviors)
so that **different builds point different weapons at different defenses and cycles can form** — the
game's own invariants **P2 (planning over stats)** and **P1 (small, lateral power gaps)** actually
holding at the composition level.

## User Scenarios & Testing *(mandatory)*

Each user story is an **independently measurable slice**: build it, then run the balancer
(`verify --field all`) and read the counter-web metrics (walls / contested / monotone / spread /
duration) to confirm it moved the field the right way. Slices are ordered by their leverage on the
counter-web.

### User Story 1 - The damage-type triangle decides matchups (Priority: P1)

The core counter. A player who brings the **right damage type for the enemy's defensive layer** wins
a matchup they would otherwise lose on raw power. Kinetic shreds shields; Energy melts armor;
Explosive is the neutral middle. Crucially, **defenses become a real choice on every chassis** — a
field that is all-armor keeps the triangle dormant (the v2 failure), so shields must exist on the
field for Kinetic's advantage to point at something.

**Why this priority**: this is the primary counter axis and the direct answer to the diagnosis
(matrix too weak + only ~3% of the field shielded). Without a triangle that bites, nothing else in
the counter-web has a foundation.

**Independent Test**: build three mono armies (kinetic / energy / explosive) against three defensive
profiles (shielded / armored / mixed) and confirm the type-vs-layer counter overturns a rank gap —
i.e. the "wrong on paper" army wins the matchup its damage type counters. Measure that contested
matchups rise and the monotone rate falls versus the v2 baseline.

**Acceptance Scenarios**:

1. **Given** a shielded army that out-ranks a kinetic army on raw power, **When** they fight, **Then**
   the kinetic army wins or contests the matchup (Kinetic ×1.6 vs shields overturns the gap).
2. **Given** an armored army, **When** an energy army of similar power engages it, **Then** energy's
   ×1.6 vs armor lets it win despite the rank order.
3. **Given** any chassis, **When** a player picks its defense, **Then** shield vs armor vs hedge is a
   genuine trade-off (no single defense wins against all three damage types).

### User Story 2 - Reach and positioning are a counter axis (Priority: P1)

*"Engagement beats numbers"* — the most consistent lesson from every prior balance pass. A
**long-reach or mobile** build counters a slower brawler it cannot out-damage, by controlling **who
can even shoot whom**. Targeting is a declarative **priority chain** (the player configures who their
units prefer to shoot); movement is four modes (Hold / Advance / Kite / FallBack) where **kiting and
positioning turn reach into a playable counter**.

**Why this priority**: reach/engagement is the second structural counter axis and one of only two
things (with capability counters) that has ever moved this field. It is also what makes the movement
and reach content matter rather than collapsing to contact.

**Independent Test**: a long-reach kiting build versus a short-reach brawler of higher raw power —
confirm the kiter whittles the brawler (which cannot close) and wins/contests. Confirm a stranded
backline unit advances to find the fight rather than idling, and a wounded unit that falls back
returns rather than fleeing uselessly.

**Acceptance Scenarios**:

1. **Given** a kiting unit with reach advantage, **When** it faces a slower brawler, **Then** it fires
   and repositions on the reach boundary and is only exposed on its forward (shoot) step.
2. **Given** a unit with no reachable target, **When** `Advance` is its movement mode, **Then** it
   steps toward contact and idles once something is in reach (does not march off uselessly).
3. **Given** a wounded unit set to fall back, **When** it ducks, **Then** it returns to its home zone
   once a slot is free instead of rotting in the backline.
4. **Given** a priority chain listing "Target Air", **When** aircraft appear, **Then** the unit swings
   onto them and falls back to ground targets when the skies clear — with no reactive trigger needed.

### User Story 3 - Equipment gives graded, accessible counters (Priority: P2)

The soft-counter layer. Beyond the weapon, each machine fits **equipment** — self stat-buffs, on-hit
riders that disrupt the enemy (EMP / Suppress / Snare / Paint), and ally auras — plus capability
unlocks (anti-air, ECM/Decoy targeting shifts). This lets a player **counter-match** a near-parity
opponent: bring AA when you expect air, ECM when you expect focus-fire, a rider when you expect
sustain. Equipment costs slots (budget varies by chassis) and every item is a **trade-off, never a
straight upgrade** (P1).

**Why this priority**: graded soft counters are what tilt the *now-contestable* matchups US1/US2
create — "planning beats gear." They depend on the triangle and reach already biting.

**Independent Test**: take a matchup an air build wins, give the loser an AA capability via equipment,
and confirm the matchup **bends** (not flattens) — the air build now loses or contests. Confirm no
equipment choice is a pure power gain (fresh-vs-max power gap stays within the ~25% cap).

**Acceptance Scenarios**:

1. **Given** an army losing to air, **When** it fits an anti-air capability, **Then** the air matchup
   flips or contests without making that army dominant elsewhere.
2. **Given** a focus-fire opponent, **When** a unit fits ECM (−2 target draw) or a Decoy (+2),
   **Then** enemy targeting redistributes measurably.
3. **Given** any equipment slot, **When** a player fills it, **Then** the choice trades one capability
   for another (validated against the slot budget and no-duplicate rules).

### User Story 4 - Reactive behavior rewards planning (Priority: P2)

Because there is **no in-battle input**, the reactive layer is authored *before* the fight. A machine
carries a **stance** (Aggressive / Balanced / Defensive — a posture trade) and up to two **Plan-B**
triggers that flip its Movement or Stance when a condition on **its own state** is met (hull low,
shield down, stranded, an ally in its zone lost, a set tick). This lets a player encode "if it goes
wrong, do this" — turning foresight into an edge.

**Why this priority**: behaviors add depth and a reactive dimension on top of the structural counters,
but they are a **symmetric** lever (both players set them) and cannot create cycles alone — so they
follow the content that can.

**Independent Test**: the same army with and without a `HullBelowPct → FallBack` (or
`→ Defensive`) Plan-B — confirm the reactive version survives longer / converts a loss to a contest,
and that the change is deterministic.

**Acceptance Scenarios**:

1. **Given** a Defensive stance, **When** a unit fights, **Then** it takes −20% output for a stack of
   survivability — and for the Commander that −20% applies to its healing/shielding too (no free ride).
2. **Given** a `Hull below 40% → FallBack` Plan-B, **When** the unit is wounded, **Then** it ducks and
   returns, measurably outlasting the same unit without the trigger.
3. **Given** a Plan-B slot, **When** a player authors it, **Then** it may set only Movement or Stance
   (targeting is self-reactive via the priority chain) and latches once.

### User Story 5 - The Commander is a strategic keystone (Priority: P3)

A protect-vs-assassinate cycle. The **Commander** deals no damage; it projects support (a
Heal / Shield / Ablation projector) and, while it lives, its innate **Command** grants the whole army
an extra Plan-B slot and unlocks advanced behaviors — making it the **single highest-value
assassination target**. Fielding a Commander is powerful but creates a weakness a deep-strike or
support-hunting build can exploit — a counter-cycle by construction.

**Why this priority**: it is a capstone counter-cycle that depends on targeting (assassination via
Target Support / deep reach), equipment (protection tools), and behaviors (Command unlocks) already
existing.

**Independent Test**: an army built around a Commander versus an army built to assassinate it
(deep-reach + Target Support) — confirm the assassin counters the Commander build, while the Commander
build beats armies that cannot reach the backline.

**Acceptance Scenarios**:

1. **Given** a living Commander, **When** the battle runs, **Then** allies carry +1 Plan-B slot and
   advanced behaviors; **When** it dies, **Then** those evaporate army-wide mid-battle.
2. **Given** an assassin build with Target Support and deep reach, **When** it faces a Commander army,
   **Then** it can win by removing the Commander early.

### Edge Cases

- **Kite degeneracy**: if a kiting unit could fire while permanently out of enemy reach it becomes an
  unkillable poke and breaks the web — the design requires the shoot-step to expose it. Must be
  measured explicitly.
- **Defensive stalls**: two Defensive armies (both −20% output, both tankier) risk pushing battle
  duration past the acceptable band — the −20% is the first dial to revisit if median duration drifts.
- **Aura stacking**: multiplicative buff auras (Boost / Reduction / Coordination / Recon) may compound
  too hard; needs a cap or diminishing returns if measurement runs hot.
- **Zone caps**: a unit that falls back cannot return if its home zone (cap 3 ground / 2 air) has
  filled — it must hold at the nearest open zone rather than break.
- **All-armor field**: if content ships too few shields, Kinetic's advantage points at nothing and the
  triangle stays dormant (the exact v2 failure) — defense diversity must be verified, not assumed.

## Requirements *(mandatory)*

### Functional Requirements — Weapons & the damage triangle (US1)

- **FR-001**: Each machine MUST field exactly **one** weapon; there are no secondary weapons.
- **FR-002**: The damage matrix MUST make each type strong against one defensive layer and weak
  against the other (start values: Kinetic ×1.6 shields / ×0.7 armor; Energy ×0.7 / ×1.6; Explosive
  ×1.0 / ×1.0), sharp enough that the right type can overturn a rank gap.
- **FR-003**: Each chassis MUST have a **native damage type** that grants a modest bonus (start +12%),
  so choosing an off-type weapon is a real trade-off.
- **FR-004**: Weapon cadence MUST be welded to damage type (Energy Fast / Kinetic Medium / Explosive
  Slow / Artillery Siege), and throughput MUST NOT be flat across cadences (fast = slight DPS lead /
  low alpha; slow = less DPS / high alpha).
- **FR-005**: Heavy and Mech chassis MUST carry a chassis modifier (+1 firing tick and +10% damage
  across all types).

### Functional Requirements — Defenses (US1)

- **FR-006**: Each chassis MUST have a real defensive choice whose layers (shield vs armor) are what
  the damage matrix bites on; no single defense may be best against all three damage types.
- **FR-007**: Shields MUST exist widely enough across the field that Kinetic's anti-shield advantage
  has targets (the triangle must not be dormant).
- **FR-008**: The one-time "hedge" (anti-counter-pick) defense MUST be limited to a single option
  (Mech Reactive Plating); Ablative plating is retired from the core set.

### Functional Requirements — Targeting & movement (US2)

- **FR-009**: Targeting MUST be a **priority-score chain** (two declarative filters + a Closest /
  Furthest positional fallback), scoring each reachable candidate and firing at the highest,
  recomputed per shot. It replaces the two-dial Target-Row + Target-Rule system.
- **FR-010**: Targeting filters MUST be declarative only (Target Air / Target Armor by armor% / Target
  Support / Target Indirect / Follow); there MUST be no smart / auto-optimizing selectors.
- **FR-011**: `Follow` MUST be non-chaining focus-fire (anchors to an independently-choosing zone ally;
  followers never follow followers).
- **FR-012**: Target-draw offsets MUST apply (Decoy +2, ECM −2); evasion (Camo) is a separate
  hit-time dodge, not a targeting offset.
- **FR-013**: The priority chain MUST be self-reactive — a Target-Air filter engages air only while air
  exists and falls through otherwise; **no reactive trigger is needed for target selection**.
- **FR-014**: Movement MUST offer four modes — Hold, Advance, Kite, FallBack — and they MUST
  **self-terminate**: Advance idles once in reach (and re-closes if re-stranded); FallBack ducks then
  returns to the home zone once a slot is free; Kite oscillates (forward → shoot → fall back).
- **FR-015**: Zones MUST remain per-side formation rows (Rear / Middle / Front + Air), capped at 3
  ground / 2 air; reach reads a unit's zone.

### Functional Requirements — Equipment (US3)

- **FR-016**: Each machine MUST have a chassis-specific **utility slot budget** (start: Commander 5 ·
  Mech 4 · Heavy 3 · Light 3 · Heli 2 · Artillery 2 · Rocket-Arty 2), spent on equipment.
- **FR-017**: Equipment MUST span three target domains — Self (stat buffs), Enemy (on-hit riders:
  EMP / Suppress / Snare / Paint), Ally (auras) — plus capability unlocks (e.g. anti-air).
- **FR-018**: A **common pool** of single-stat boosters MUST exist (one per stat, one slot each);
  capabilities and riders are class-specific, not common.
- **FR-019**: Equipment MUST have variable slot cost (tiers 1 / 2 / 3; build-defining items such as
  Jump Jets cost 3), and **every equipment choice MUST be a trade-off, never a straight power upgrade**
  (Constitution P1).
- **FR-020**: Loadouts MUST validate against the slot budget with no duplicate utilities.

### Functional Requirements — Behaviors (US4)

- **FR-021**: Stance MUST collapse to three universal options (Aggressive / Balanced / Defensive)
  applying to combat and support machines alike, where "output" means whatever the unit produces —
  weapon damage for combat, projector output for the Commander.
- **FR-022**: The energy posture **dial** MUST be removed (it duplicated stance). *(This is the energy
  dial; the Energy damage type is unaffected.)*
- **FR-023**: Plan-B MUST keep the one-shot latch, set **Movement or Stance only**, and offer five
  own-state triggers (HullBelowPct, ShieldDown, AfterTick, AllyLostInZone, NoTargetsReachable). Slot
  count is 1 (+1 with the Combat AI equipment). The AirEnemyExists and EnemyInZone triggers are
  removed.
- **FR-024**: Plan-B slot precedence MUST stay deterministic (Slot-1 over Slot-2, independent of firing
  order).

### Functional Requirements — Commander (US5)

- **FR-025**: The Commander MUST deal no direct damage; its weapon slot holds a Heal / Shield /
  Ablation projector (support-weapon output).
- **FR-026**: While a Commander lives, its innate **Command** MUST grant the army +1 Plan-B slot and
  unlock advanced behaviors; both MUST revoke army-wide the moment it dies.

### Functional Requirements — Cross-cutting (all stories)

- **FR-027**: All new content (weapons, defenses, equipment, dials, triggers, matrix) MUST be
  expressed as **typed data** read by the same single source of truth for sim, UI, and balancer
  (Constitution P8) — a live-ruleset change, not hardcoded logic.
- **FR-028**: The simulation MUST stay **deterministic and reproducible** from seed + inputs, and the
  native engine MUST equal the wasm build bit-for-bit (Constitution P6, never waived).
- **FR-029**: Every slice MUST be measured with the balancer (`verify --field all`) against the
  counter-web metrics before it is considered done (Constitution P4).
- **FR-030**: The balancer's `SkillBeatsGear` invariant MUST be re-fixtured before it can gate the
  counter-web — its current fixture measures a single damage type, not composition quality — so it does
  not fail every structural matrix change by construction.

### Key Entities

- **Damage matrix**: per-type multipliers vs each defensive layer (shield / armor). The counter
  triangle.
- **Weapon**: one per machine — damage type, cadence (from type), throughput profile, native-bonus
  eligibility.
- **Defense**: a chassis's defensive layer choice (shield / armor / Mech-only reactive hedge).
- **Targeting priority chain**: an ordered set of declarative filters + a positional fallback +
  per-candidate score with Decoy/ECM offsets.
- **Equipment / loadout**: weapon + defense + a budgeted set of utility modules across Self/Enemy/Ally
  domains, with per-item slot cost.
- **Behavior dials**: Stance (3), Movement (4), and the Plan-B trigger set (condition → Movement/Stance
  value, latched, slotted).
- **Commander / Command**: the no-damage support chassis, its projector, and the army-wide innate
  buff-while-alive.
- **Ruleset**: the typed, single-source data carrying all of the above (P8), the object the balancer
  and arena both read.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **No dominant build** — no army wins more than ~8 of its 11 matchups (today the top army
  wins ~10–11).
- **SC-002**: **Every top-tier build has ≥2 non-trap counters** — counters that are not themselves
  field-losers (a counter that loses to the whole field, like today's bottom-tier AA specialist, does
  not count).
- **SC-003**: **The field stops being a total order** — the monotone / total-order rate drops from
  **93.9% toward ~70% or below**.
- **SC-004**: **Cycles appear** — surviving counter-relationships (upsets) rise from **4 to many**; the
  field contains at least one genuine rock-paper-scissors cycle among top builds.
- **SC-005**: **Battles stay decisive, not slow** — median battle duration stays **within ~10% of the
  491-tick** v2 baseline.
- **SC-006**: **Determinism preserved** — for any seed + inputs, the native engine and the wasm build
  produce identical results (bit-for-bit).
- **SC-007**: **Power stays lateral** — every equipment / stance / weapon choice is a trade-off, and
  the total power gap between a fresh and a fully-progressed army stays within the ~25% cap (P1).
- **SC-008**: **Decisive-but-strategic** — decisive (100-0) outcomes are acceptable *only* where the
  loser had a winning counter available against a different opponent; no matchup is a coin-flip
  (~50/50) decided by seed rather than composition.

## Assumptions

- **The engine is correct.** This is a content + systems-vocabulary rewrite, not an engine-correctness
  fix; the deterministic fixed-tick core and reach/zone model are reused as-is.
- **The complete design is decided** and lives in `specs/014-counter-web/weapons-design.md` (§11
  registry). This spec formalizes the *what/why*; that doc holds the *exact mechanics*. Where they
  differ, the design doc's registry wins and this spec is updated.
- **All magnitudes are start values.** Matrix multipliers, stance percentages, cadence ticks, slot
  counts, and native bonus are seeds for balancer tuning — success is defined by the field metrics
  (SC-001…008), not by hitting any specific number.
- **Slices are built and measured in priority order** (US1 → US5), re-baselining the field after each
  with `cargo run -p balancer --release -- verify --field all` + `scripts/field-metrics.js`. A slice
  that regresses the counter-web metrics is revisited before the next begins.
- **The roster is stable.** The ~7 machine types × 3 variants are reused; v3 changes their systems
  (weapons, defenses, equipment, behaviors), not the roster count (Constitution P3). Base-stat
  rebalancing is content tuning within the measure loop, not new units.
- **Supersedes spec 014.** The 014 Axis-A spec/plan/tasks are marked superseded; 014's `diagnosis.md`
  and measured baseline remain the valid evidence base.
- **The near-ties target is retired.** The old "≥ 20 contested (40–60%) matchups" bar is explicitly
  dropped in favor of cycle formation (SC-002/003/004); a 40–60% coin-flip is not a goal (SC-008).
