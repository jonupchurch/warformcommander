# Feature Specification: v2 Ruleset — Second-Generation Content

**Feature Branch**: `013-v2-ruleset`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Warform Commander 'v2 ruleset' — a second-generation content pass on the existing (unchanged) engine, driven by measured balance findings. Scope: (1) Defense catalog rebuild — four families (Armor / Shield / Ablative / Balanced) across all seven mount classes, generated from one loop plus a per-mount scale table; Balanced replaces the do-nothing Standard Hull as default; ablative is a depleting pool with a 20% per-hit save and no splash immunity; all chassis base stats rebased so lighting up dead slots is a REDISTRIBUTION not a survivability inflation, with Heli/Artillery/RocketArtillery landing below today's durability. (2) Stance dial made real — an allocation axis (aggro tiers narrowing the candidate row before the Target Rule picks), Aggressive/Neutral/Defensive/Protector for combat units with no magnitude rider, role-split so support units get Triage/Sustain/Empower, Empower gaining a real buff mechanic, Opportunist as execute damage vs targets under 40% hull. (3) Mech identity — adaptive reactive defense (Mech-exclusive) plus native behavioral flexibility; optional Rocket Pack equipment granting full-power anti-air. (4) Air counterplay — laser weapons can engage air at an intermediate rate between plink and dedicated AA. Explicitly OUT OF SCOPE: the tick loop, seeded RNG, replay format, zones/reach, derivation pipeline, wasm parity harness, and the entire Next.js app. Key constraints: four anti-air changes must land STAGED and measured (air is at 60%, dedicated AA is last at 20%); the offensive half of Mech adaptivity is deferred to a later weapons pass; ships as ruleset v12 (live is v11 0062f62e) requiring a re-seed and one golden re-bless."

## Overview

This feature is a **second-generation content ruleset** for the battle system. It is *not* a new
engine. The simulation core built in [Feature 1](../001-battle-sim-core/spec.md) — the fixed-tick
loop, the seeded PRNG, the replay format, zones and reach, the derivation pipeline — is correct,
verified, and stays exactly as it is. What changes is the **content those systems operate on**: the
defense catalog, chassis base stats, the meaning of the Stance dial, the Mech's identity, and air's
counterplay.

The reason this is necessary is that eleven consecutive tuning passes have exhausted what numbers
can do. The [auto-balancer](../002-auto-balancer/spec.md) has established four findings that are
structural, not numeric:

1. **The counter-web does not function.** 24 of 30 archetype matchups resolve at exactly 0/100, and
   17 of 30 are clean sweeps in every sample. Aggregate win rates are effectively a count of how
   many opponents an archetype hard-counters, which is why standings quantize to 20/40/60.
2. **The damage matrix is decorative.** Its two axes are effectiveness *vs shields* and *vs armour*,
   but only 3 of 21 chassis variants carry any shields at all — roughly 3% of the field's effective
   hit points. Half the matrix is aimed at a defensive layer that essentially does not exist, so the
   whole table produces a flat spread that flips zero degenerate matchups.
3. **Configuration depth is missing where the game promises it.** The defense slot has exactly one
   legal option — and that option grants nothing — on five of seven mount classes. The Stance dial
   has eight options and no observable effect whatsoever. This directly contradicts **P3 (Depth from
   Configuration, Not Roster Count)**: the axes exist on paper but are inert in play.
4. **Unit value is super-linear in count.** One artillery piece is worth less than nothing; two
   dominate. One anti-air platform loses outright to aircraft; two win 100–0. A damage number can
   only choose which of those regimes is broken, which is why every previous pass moved single
   matchups without moving the field.

The through-line is that **the content never gave the mechanics anything to work on**. This feature
supplies it: real defensive choices on every chassis so the damage matrix has something to
discriminate between, a Stance dial that reallocates incoming fire, an identity for the game's most
generic chassis, and staged counterplay against air.

The governing constraint is that this must be a **redistribution, not an inflation**. Lighting up
five dead defense slots would, done naively, make every machine in the game tougher, lengthen every
battle, and flatten the counter-web further. Every chassis is therefore rebased so that the *best*
defensive choice lands near today's durability and a mismatched choice lands below it.

The actors are the **player**, who gains real decisions where there were none, and the **designer**,
who gains a content surface that the balancer can actually move.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every machine has a real defensive decision (Priority: P1)

A player opens the Customize screen for any machine — a helicopter, an artillery piece, a support
unit, a mech, not just a heavy tank — and finds four genuinely different defensive options instead
of a single item that does nothing. Choosing **Armor** trades mobility for a permanent reduction to
incoming hull damage. Choosing **Shield** adds a pool that regenerates between engagements but can
be bypassed entirely by penetrating weapons. Choosing **Ablative** adds a large pool that absorbs
damage and does not regenerate, but each hit has a chance not to consume it — front-loaded and
streaky. Choosing **Balanced** takes a modest amount of both with no drawback attached.

Because each option is strong against a different threat, the same machine can be built to survive
different opponents, and no option is correct against everything.

**Why this priority**: This is the foundation the rest of the feature stands on. It is the direct
fix for findings 2 and 3, and it is a hard prerequisite for User Story 3 — an adaptive Mech identity
is meaningless while the damage matrix has nothing to discriminate between. It also delivers
complete standalone value: even shipped alone, it converts a dead slot into a real decision on five
of seven mount classes.

**Independent Test**: Verify every mount class offers four mutually-exclusive defensive options with
measurably different survival profiles; confirm a shielded machine survives longer against energy
weapons and worse against penetrating ones than an armoured machine of the same chassis; confirm
median battle duration across the archetype field stays within tolerance of the current baseline.

**Acceptance Scenarios**:

1. **Given** any machine of any mount class, **When** the player opens its defense slot, **Then**
   four distinct options are offered and none of them is a no-op.
2. **Given** two identical chassis, one Armor and one Shield, **When** each is attacked by a
   penetrating weapon, **Then** the shielded one takes materially more damage.
3. **Given** two identical chassis, one Armor and one Shield, **When** each is attacked by sustained
   low-damage fire with pauses, **Then** the shielded one survives materially longer.
4. **Given** a machine with an Ablative defense, **When** it is struck repeatedly, **Then** its
   ablative pool depletes without regenerating, and some fraction of hits do not deplete it.
5. **Given** the full archetype field, **When** every machine takes its strongest defensive option,
   **Then** aggregate time-to-kill is within tolerance of the pre-change baseline rather than
   uniformly longer.
6. **Given** a Helicopter, Artillery, or Rocket-Artillery machine with its *best* defensive option,
   **When** it is focused by fire it is vulnerable to, **Then** it dies at least as fast as the same
   chassis does today.

---

### User Story 2 - Stance decides who absorbs the incoming fire (Priority: P2)

A player assigns Stance per machine and it visibly changes which of their units gets shot. Setting a
heavy machine to **Protector** pulls enemy fire onto it and away from allies — including allies in
neighbouring zones. Setting a fragile artillery piece to **Defensive** means it is only targeted once
no other option remains in its row. Setting a key damage dealer to **Aggressive** draws fire onto it,
but in exchange its own targeting cannot be misdirected by an enemy's taunt or evaded by an enemy's
Defensive stance. **Neutral** does nothing.

Crucially the choice is zero-sum within an army: if every machine takes the same stance, nothing
happens at all. The dial expresses a *ranking* of one's own units, so the decision is about which
unit is worth protecting, not about acquiring a bonus.

**Why this priority**: It converts eight inert options into a live configuration axis (**P3**), and
it acts on the one dimension the balancer identified as decisive — kill order — where eleven passes
of damage tuning failed. It is fully independent of User Story 1 and can ship in either order.

**Independent Test**: Verify that identical armies differing only in stance assignment produce
different casualty orders; verify a uniform-stance army behaves identically to an all-Neutral army;
verify an Aggressive attacker ignores an enemy Protector that would redirect a Neutral attacker.

**Acceptance Scenarios**:

1. **Given** two allied machines in one zone, one Aggressive and one Defensive, **When** an enemy
   fires into that zone, **Then** the Aggressive machine is targeted while the Defensive one is not.
2. **Given** an army where every machine holds the same stance, **When** the battle resolves,
   **Then** the outcome is identical to the same army with every machine Neutral.
3. **Given** a lone machine in a zone set to Defensive, **When** an enemy targets that zone,
   **Then** it is targeted normally — shedding fire requires someone else to absorb it.
4. **Given** an enemy Protector guarding an adjacent zone, **When** an Aggressive machine selects a
   target, **Then** it selects its preferred target rather than the Protector.
5. **Given** any of the eight target-selection rules, **When** stance tiers apply, **Then** the
   narrowing happens before the rule chooses, so stance functions with every rule.
6. **Given** a machine holding the Opportunist stance, **When** it attacks a target below the
   execute threshold, **Then** it deals bonus damage; above the threshold it does not.

---

### User Story 3 - The Mech becomes the machine that adapts mid-battle (Priority: P3)

A player who fields a Mech gets a chassis that is deliberately mediocre in the opening exchange and
increasingly effective as a battle wears on. Its exclusive **reactive plating** retunes its
mitigation toward whichever damage family has actually been hitting it, so it is punished by burst
and rewards attrition. It natively carries the behavioural flexibility other chassis must buy with a
utility slot. Optionally it can mount a **Rocket Pack** that lets it answer aircraft directly.

Today the Mech is the arithmetic midpoint of the heavy and light tanks on every stat — hull, armour,
damage, cadence, movement, evasion — while uniquely forfeiting the native-family weapon bonus and
receiving nothing for it. Its stated identity is "generalist", but weapon choice is locked in before
the battle begins, so its flexibility evaporates at the moment the fighting starts and leaves a
worse specialist behind.

**Why this priority**: It fixes a chassis that is simultaneously the field's strongest archetype and
its least interesting — it wins on arithmetic while doing nothing memorable, which is exactly the
"stat check instead of a decision" that **P2 (Planning Over Twitch, Skill Over Stats)** rejects. It
is P3 because it *depends on* User Story 1: adaptive mitigation is worthless until defensive layers
are widespread enough for the damage matrix to discriminate.

**Independent Test**: Verify a Mech's effective mitigation shifts measurably toward the damage family
it has been absorbing; verify it performs worse than a specialist in short engagements and better in
long ones; verify a Rocket-Pack Mech can engage aircraft while a stock Mech cannot.

**Acceptance Scenarios**:

1. **Given** a Mech with reactive plating repeatedly struck by one damage family, **When** it is
   later struck by that same family, **Then** it takes measurably less damage than it did initially.
2. **Given** a Mech and a specialist chassis of comparable cost, **When** the battle is decided
   quickly, **Then** the specialist outperforms the Mech.
3. **Given** the same pairing in a prolonged battle, **When** it resolves, **Then** the Mech's
   relative performance improves.
4. **Given** a Mech mounting a Rocket Pack, **When** enemy aircraft are present, **Then** it can
   engage them at the full anti-air rate.
5. **Given** reactive plating, **When** any non-Mech chassis is configured, **Then** the option is
   not offered.

---

### User Story 4 - Aircraft can be contested without a dedicated counter (Priority: P4)

A player facing helicopters is not required to have pre-committed a dedicated anti-air platform in
order to fight back. Energy weapons can engage aircraft at a rate between incidental fire and true
anti-air, so an army carrying lasers has partial recourse. Dedicated anti-air remains strictly the
best answer, distinguished by reaching aircraft across the whole battlefield where the improvised
options only engage what is close.

**Why this priority**: Aircraft currently sit near the top of the field while dedicated anti-air sits
dead last, an inversion of the intended counter relationship. It is lowest priority because it
carries the highest regression risk in the feature: several independent changes all push in the same
direction, and applied together they could remove aircraft from the game entirely.

**Independent Test**: Verify an energy-armed ground machine can engage aircraft at a rate strictly
between incidental and dedicated anti-air; verify dedicated anti-air retains a reach advantage;
verify aircraft remain viable after each staged change.

**Acceptance Scenarios**:

1. **Given** a ground machine with an energy weapon, **When** enemy aircraft are present, **Then** it
   can engage them at better than the incidental rate and worse than the dedicated anti-air rate.
2. **Given** a dedicated anti-air platform and an improvised one, **When** aircraft are distant,
   **Then** only the dedicated platform can engage.
3. **Given** each anti-air change applied one at a time, **When** the field is measured after each,
   **Then** the aircraft archetype's win rate remains within the viability band at every stage.
4. **Given** all anti-air changes applied, **When** the field is measured, **Then** dedicated
   anti-air is no longer the field's worst archetype.

---

### User Story 5 - Support machines choose how they support (Priority: P5)

A player fielding a support machine chooses its priority rather than accepting one hardcoded
behaviour. **Triage** commits its output to whoever is closest to dying. **Sustain** keeps the
machines that are still effective topped up rather than chasing losses. **Empower** forgoes repair
entirely to strengthen nearby allies. Support machines are offered only these stances; combat
machines are offered only the combat stances.

**Why this priority**: It is the smallest and most separable slice, and Empower requires a
strengthening mechanic that does not exist yet. Support sits mid-field rather than at either extreme,
so this is refinement rather than repair.

**Independent Test**: Verify each support stance produces a different repair-target sequence from the
same battle state; verify Empower produces a measurable ally improvement instead of repair; verify
stance options offered are constrained by machine role.

**Acceptance Scenarios**:

1. **Given** a support machine set to Triage and allies at differing health, **When** it acts,
   **Then** it services the most badly damaged ally in range.
2. **Given** the same state with Sustain, **When** it acts, **Then** it services a different ally
   than Triage would.
3. **Given** Empower, **When** it acts, **Then** allies in range are strengthened and no repair is
   performed.
4. **Given** a combat machine, **When** the player opens the stance dial, **Then** support stances
   are not offered, and vice versa.

---

### Edge Cases

- **A machine is the only occupant of its row and holds Defensive.** Shedding fire requires another
  unit to absorb it, so the stance has no effect. This is intended and must not be "fixed" by
  granting a mitigation bonus instead.
- **Every machine in a row holds the same stance.** Tiers flatten and targeting proceeds exactly as
  if all were Neutral.
- **Two Protectors guard the same zone from opposite sides.** Selection must remain deterministic and
  reproduce identically on replay.
- **An ablative pool absorbs a hit larger than its remaining capacity.** Overflow must carry through
  to the layer beneath rather than being discarded.
- **The ablative save triggers on a hit that would have emptied the pool.** The pool survives intact;
  this must not create a path to negative or unbounded values.
- **A Mech's reactive plating has absorbed nothing yet.** It must have a defined baseline rather than
  an undefined or maximal state.
- **A Mech is struck by two damage families in equal measure.** Adaptation must resolve
  deterministically, not by whichever arrived last within a tick.
- **All aircraft are destroyed while improvised anti-air is engaging them.** Those machines must
  return to ground targets rather than idling.
- **An army's existing saved configuration holds a stance now restricted to the other role.** The
  configuration must remain loadable and behave predictably rather than being rejected or crashing.
- **A support machine holds Empower with no allies in range.** It must not error or waste the game
  state; behaviour must be defined.

## Requirements *(mandatory)*

### Functional Requirements

**Defense catalog**

- **FR-001**: Every mount class MUST offer four defensive options: Armor, Shield, Ablative, and
  Balanced.
- **FR-002**: The system MUST NOT offer any defensive option that confers no effect; the current
  no-effect default MUST be removed and Balanced MUST become the default.
- **FR-003**: Armor MUST reduce incoming hull damage permanently and MUST NOT reduce damage absorbed
  by shields.
- **FR-004**: Shield MUST provide a pool that regenerates after a period without being struck and
  MUST be bypassable by penetrating weapons.
- **FR-005**: Ablative MUST provide a pool that does not regenerate, and each hit against it MUST
  have a fixed probability of not depleting it.
- **FR-006**: Ablative MUST NOT confer immunity to splash or to any damage family.
- **FR-007**: Balanced MUST provide a moderate amount of more than one defensive layer and MUST carry
  no offsetting penalty.
- **FR-008**: Armor, Shield, and Ablative MUST each carry a distinct drawback so that no option is a
  strict upgrade over Balanced.
- **FR-009**: Defensive option magnitudes MUST be derived per mount class from a single scale table
  so that rebalancing the system is one coordinated edit.
- **FR-010**: Chassis base statistics MUST be rebased such that aggregate survivability across the
  field does not increase relative to the current baseline.
- **FR-011**: Artillery and Rocket-Artillery chassis MUST end below their current durability even when
  holding their most favourable defensive option. The Helicopter MUST end **level with** its current
  durability, not below it — measurement showed it already dies at tick 48 with a 0% survival rate
  when any counter is present, so it has no headroom to lose. Its defensive slot must change *what*
  kills it, not *how fast*.

**Stance**

- **FR-012**: Stance MUST determine which of several eligible allied machines receives incoming fire,
  and MUST NOT alter damage magnitude, except as specified in FR-018.
- **FR-013**: Stance narrowing MUST be applied before the target-selection rule chooses, so that it
  applies to all target-selection rules.
- **FR-014**: Aggressive MUST draw fire ahead of Neutral allies in the same row, and its own target
  selection MUST ignore enemy stance narrowing.
- **FR-015**: Defensive MUST be targeted only when no non-Defensive ally is eligible in the same row.
- **FR-016**: Protector MUST draw fire ahead of Neutral allies and MUST extend that effect to allied
  machines in adjacent ground zones that the attacker can already reach.
- **FR-017**: When all eligible machines hold the same stance, targeting MUST be identical to
  all-Neutral.
- **FR-018**: Opportunist MUST deal bonus damage against targets below a configurable health
  threshold, and MUST remain gated behind the capability that gates it today.
- **FR-019**: Combat machines MUST be offered only combat stances and support machines only support
  stances.
- **FR-020**: Support stances MUST each produce a distinct support-target ordering: Triage
  prioritising the most damaged, Sustain prioritising effectiveness retention.
- **FR-021**: Empower MUST strengthen allies in range instead of repairing them.
- **FR-022**: Existing saved army configurations MUST remain loadable after the role split.

**Mech**

- **FR-023**: The Mech MUST have access to a reactive defensive option that adjusts its mitigation
  toward the damage family it has absorbed most, and no other mount class MUST have access to it.
- **FR-024**: Reactive mitigation MUST begin from a defined neutral baseline and MUST resolve
  deterministically when families are absorbed in equal measure.
- **FR-025**: The Mech MUST natively provide the behavioural flexibility that other chassis purchase
  with a utility slot.
- **FR-026**: An optional Mech-mountable module MUST grant full-rate anti-air engagement.
- **FR-027**: The Mech MUST continue to forfeit the native-family weapon bonus; its compensation is
  mechanical, not numeric.

**Air**

- **FR-028**: Energy weapons MUST be able to engage aircraft at a rate strictly between the
  incidental rate and the dedicated anti-air rate.
- **FR-029**: Dedicated anti-air MUST retain a reach advantage over all improvised anti-air options.
- **FR-030**: The four anti-air changes MUST be introduced one at a time, with the field measured
  after each, and each MUST be individually reversible.

**Delivery**

- **FR-031**: Each slice MUST ship as its own versioned ruleset, since live battles read a frozen
  ruleset rather than the built engine.
- **FR-032**: Battles MUST remain fully reproducible from seed and inputs after every change,
  including those introducing new random draws.
- **FR-033**: Every new or changed option MUST be explained accurately in the Customize screen from
  live values rather than authored text.

### Key Entities

- **Defense Family**: One of four defensive archetypes (Armor, Shield, Ablative, Balanced). Carries a
  layer type, a magnitude, and a drawback. Instantiated once per mount class via a scale factor.
- **Ablative Pool**: A non-regenerating absorption capacity held by a machine during battle, with a
  per-hit probability of surviving a strike without depletion.
- **Reactive Mitigation State**: Per-machine, per-battle record of absorbed damage by family, used to
  bias a Mech's incoming mitigation. Starts neutral; resolves ties deterministically.
- **Aggro Tier**: A per-stance ordinal priority that narrows the set of eligible targets within a row
  before the target-selection rule applies. Relative, not absolute — uniform tiers are a no-op.
- **Stance Role**: The partition of stance options into combat and support sets, determined by
  whether a machine has support capability.
- **Mount Scale Factor**: The per-mount-class multiplier applied to defensive magnitudes, and the
  single point of adjustment for rebalancing the defense system.
- **Ruleset Version**: The frozen, content-complete balance table that live battles read. Each slice
  produces a new one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Contested matchups — those where neither side wins more than 95% of the time — increase
  from a measured **8 of 132** to at least **26 of 132** (a tripling, and the first time more than one
  matchup in five is genuinely in doubt).
- **SC-002**: The spread between the strongest and weakest archetype narrows from a measured **87
  points** (3.8% to 90.9%) to **at most 50 points**, with no archetype below 20% or above 80%. The
  longer-term goal remains a 30–70% band, but a single content pass closing 87 points to 40 is not a
  credible target and a criterion nobody expects to meet is not a criterion.
- **SC-003**: Shielded and ablative capacity rises from roughly 3% of the field's effective hit
  points to at least 25%.
- **SC-004**: The number of mount classes whose defense slot offers only one option falls from five
  to zero.
- **SC-005**: Median battle duration across the archetype field stays within 10% of the measured
  baseline of **484.8 ticks** (i.e. 436–533), confirming redistribution rather than inflation.
- **SC-006**: Every stance option produces a measurable change in outcome, up from zero of eight.
- **SC-007**: Two armies identical except for stance assignment produce different casualty orders in
  at least 80% of sampled matchups.
- **SC-008**: Helicopter, Artillery, and Rocket-Artillery chassis survive focused fire no longer than
  they do today, even on their best defensive option — measured against the baseline mean death ticks
  of **48.2 / 237.0 / 201.0** respectively.
- **SC-009**: Dedicated anti-air is no longer the field's lowest-ranked archetype.
- **SC-010**: Aircraft remain within the viability band after every individual anti-air change, not
  merely at the end.
- **SC-011**: Identical seed and inputs continue to produce identical battle outcomes across every
  execution environment, with no regression.
- **SC-012**: Every option presented in the Customize screen displays effects matching what the
  battle actually applies.

## Assumptions

These were decided by judgement where the description left room, and are the most likely points to
revise on review.

- **Reactive plating is Mech-exclusive.** Sharing it across mount classes would yield more content for
  the same code, but exclusivity is what gives the Mech an identity, which is the point of the story.
- **The Mech is paid entirely in mechanics.** It keeps forfeiting the native-family weapon bonus
  rather than receiving an adaptive version of it, keeping its advantage qualitative.
- **The offensive half of Mech adaptivity is deferred.** Shifting damage family by target is left to
  a later weapons pass; this feature is defensive only.
- **Improvised anti-air sits at an intermediate rate rather than full power.** Dedicated anti-air is
  the field's worst archetype; letting energy weapons match it would make it more redundant, not
  less. A three-tier gradient — incidental, improvised, dedicated — preserves its role.
- **Dedicated anti-air is differentiated by reach.** It engages aircraft anywhere; improvised options
  engage only nearby aircraft. Reach is the strongest lever in this engine, so it carries the
  distinction without needing a damage gap.
- **The squishy chassis land below today rather than level with it**, since the current complaint is
  that aircraft survive too long, and adding a defense slot would otherwise raise their durability.
- **Ablative sizing accounts for the save.** A one-in-five chance of not depleting makes the pool
  roughly a quarter more effective than its printed value, so printed values are set below target.
- **Stance ships without a magnitude rider and is then measured.** If the field does not move, a
  small accuracy-based trade is added afterwards with evidence behind the number rather than a guess.
- **Out-of-role stances degrade to neutral behaviour** rather than invalidating saved armies, so the
  role split cannot break existing player data.
- **Existing balance levers are left alone during measurement.** The anti-air focus cap in particular
  is not adjusted while other air changes are being evaluated, to avoid confounding the results.

## Dependencies

- **User Story 3 depends on User Story 1.** Adaptive mitigation cannot matter until defensive layers
  are widespread enough for the damage matrix to discriminate between them.
- **User Story 4 depends on User Story 1** for the chassis rebase that makes aircraft appropriately
  fragile, and its remaining changes must be staged individually afterward.
- **User Stories 1, 2, and 5 are mutually independent** and may ship in any order.
- Requires the auto-balancer ([Feature 2](../002-auto-balancer/spec.md)) to measure every success
  criterion; without it none of SC-001 through SC-010 is verifiable.
- Requires the admin ruleset pipeline ([Feature 12](../012-admin-console/spec.md)) to publish each
  slice, since live battles read a frozen ruleset.

## Out of Scope

Named explicitly so the boundary holds under pressure. This feature does **not** change:

- The fixed-tick simulation loop, the seeded random number generator, or the replay format.
- Zones, reach rules, or the movement model.
- The stat derivation pipeline or the native/browser parity harness.
- The application: Garage, Arena, Ladder, Profile, News, Admin — beyond the Customize screen text
  required by FR-033.
- The weapon catalog. Weapons are a follow-on pass; only air engagement rules change here.
- The roster. No new chassis, variants, or machine types — depth comes from configuration (**P3**).
