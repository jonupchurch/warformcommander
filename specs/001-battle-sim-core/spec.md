# Feature Specification: Battle Simulation Core + Game Data Model

**Feature Branch**: `001-battle-sim-core`

**Created**: 2026-07-18

**Status**: Draft — revised 2026-07-19 (see Revision Notes below)

**Input**: User description: "Battle Simulation Core + Game Data Model — the deterministic, seeded, server-authoritative real-time tick simulation at the heart of Warform Commander, plus the typed game-data schema it operates on. Foundation every other feature builds on."

## Revision Notes (2026-07-19)

A gameplay-design deep-dive locked decisions that **supersede or refine** parts of the
requirements below. Where they conflict, **these govern** — the design doc (`reference/
warformcommandergamedesigndoc.md` §4/§8/§9/§16/§18) and `reference/warformcommander-firstpass-stats.md`
are the source of truth.

- **Engine language & distribution (supersedes FR-023):** the core is **Rust compiled to WebAssembly**, a pure `resolve(armies, ruleset, seed) → Replay`. It runs **server-side via WASM** (authoritative) and **natively for the balancer**; the **client never runs it** — it is a **replay-only player**. "Two host contexts" (US-1 / SC-001) = server + balancer, not client.
- **Determinism (refines FR-011, SC-001):** use **integer / fixed-point math** (no floats) for byte-identical reproducibility across platforms.
- **Ruleset as an engine input (refines FR-007):** the **balance table** (all stat numbers) is a **data input** to `resolve(...)`, not baked in — admin-editable at runtime; the engine hard-codes no numbers.
- **Tick & cadence model (refines FR-010, Assumptions):** **10 ticks/sec**, hard cap **1000 ticks (100 s)**, target **average battle 30–45 s (~300–450 ticks)**. Fire cadence is **four fixed tiers** — Fast 1 / Medium 3 / Slow 5 / Siege 10 ticks/shot.
- **Movement is discrete zone-to-zone (refines FR-015):** no continuous position; a unit's position = **which of the 4 zones** it occupies; helicopters are air-locked (no movement).
- **Row-based targeting & reach (supersedes FR-014):** Front row → nearest occupied enemy row (collapsing forward); Middle row → enemy Front + Middle (Rear only after both clear); Rear row → cannot fire unless Artillery / Rocket-Artillery (reach anything); Air always targetable by air-capable weapons (indirect Artillery never). **Splash ≤25%** of the hit, confined to the targeted row. Armor is **percentage** mitigation.
- **Behavior dials (refines FR-015):** Target Priority is **two sub-picks** — Target **Row** + Target **Rule** — plus Energy, Movement, Stance.
- **Plan-B triggers (refines FR-016):** triggers **latch** (fire once, stay flipped); **precedence = Slot 1 > Slot 2** (player-assigned); same-dial conflicts resolve to Slot 1; the final dial state is **order-independent** given the fired set — fully deterministic.
- **Replay is random-access (refines FR-021, SC-002):** the tick stream is **full per-tick state snapshots + events**; the client reconstructs **nothing** and never re-simulates — the playback scrubber seeks any tick by **indexing**. Each replay carries a **replay-format** version. Persist **replay + seed + inputs**.
- **Config budget:** 1 weapon + 1 defense + 3 utility (4 on *Sentinel* / *Command Post*) + 4 dials + ≤2 Plan-B trigger slots per machine.

First-pass placeholder stat numbers (to seed the engine, the counter-web tests, and the balancer) live in `reference/warformcommander-firstpass-stats.md`.

## Overview

This feature is the **combat engine and the game-data schema it runs on** — the
foundation the whole product stands on. Nothing here is a screen the player sees;
it is the rules of the world. The Garage will *configure* the data this engine
reads, the Battle Playback will *render* the tick stream this engine emits, the
Arena and Ladder will *run* this engine server-side to resolve ranked matches,
and the auto-balancer will *run the same engine* offline thousands of times to
prove fairness. Because every one of those depends on it, it is built and
hardened first (constitution P6, P8).

The value it delivers: **a battle that is fair, reproducible, and watchable.**
Give the engine two 5-unit squads (each machine kitted, dialed in, and placed
across the four zones) plus a seed, and it resolves a best-of-3 match into an
exact, replayable tick stream and a result — identically every time, on a server,
in a browser, or in an offline balancing run.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resolve a battle deterministically from a seed (Priority: P1)

A caller (the server resolving a ranked match, or the balancer running a matchup)
supplies two fully-specified 5-unit squads, their zone placements, and a seed. The
engine simulates the battle tick by tick and returns a **tick stream** (the ordered
record of everything that happened) plus a **result** (winner, per-machine fates,
damage totals, survivors, duration). Re-running with the same seed and inputs
produces byte-for-byte the same output.

**Why this priority**: This is the entire product's beating heart. Without
deterministic resolution there is no ladder integrity (P6), no replay to watch, no
balancer to prove fairness (P4). Every other feature is inert without it. It is the
MVP: even alone, it is a complete, demonstrable combat engine.

**Independent Test**: Feed two fixed squads and a fixed seed to the engine 1,000
times; assert every run yields an identical tick stream and identical result. Flip
one input (a dial, a placement, the seed) and assert the output changes.

**Acceptance Scenarios**:

1. **Given** two valid 5-unit squads with placements and a seed, **When** the engine resolves the battle, **Then** it returns a tick stream and a result naming a winner (or a Time-limit outcome) with per-machine fates.
2. **Given** identical squads, placements, and seed, **When** the battle is resolved twice (and in two different host contexts), **Then** both tick streams and both results are identical.
3. **Given** the same squads and seed but one changed behavior dial, **When** resolved, **Then** the output differs from the unchanged run.
4. **Given** a resolved tick stream, **When** a consumer replays it tick by tick, **Then** the machine states it reconstructs at every tick match the states the engine computed.

---

### User Story 2 - Configure armies as typed data (Priority: P1)

A caller expresses a squad entirely as **data** — choosing each machine's type,
chassis variant, loadout (1 weapon / 1 defense / 3 utility), the four behavior
dials, an optional Plan-B trigger, and a zone — and the engine consumes that data
directly. The same typed schema is the single source of truth the Garage UI and
the balancer will also read (P8). Illegal configurations are rejected before a
battle runs.

**Why this priority**: The engine is meaningless without the data model it
operates on, and the data model is the shared contract every later feature binds
to. Getting the schema right now is what lets the Garage, the balancer, and the
sim never disagree about what a machine *is*. Co-equal P1 with Story 1.

**Independent Test**: Construct a squad purely as data (no engine run needed);
assert the type system and validation accept a legal squad and reject each class
of illegal one (zone over cap, weapon that doesn't fit the mount, a fourth utility
on a 3-slot machine, duplicate utility modules, more than two Plan-B trigger slots).

**Acceptance Scenarios**:

1. **Given** a machine of a given type, **When** a chassis variant and a mount-legal loadout are assigned, **Then** the configuration is accepted and the machine's effective stats are derived from type + variant + equipment.
2. **Given** a squad, **When** it places more than 3 machines in a ground zone or more than 2 in Air, **Then** validation rejects it with a reason.
3. **Given** a machine, **When** a weapon whose mount class does not fit is assigned, **Then** validation rejects it.
4. **Given** a machine, **When** more than two Plan-B trigger slots or duplicate utility modules are configured, **Then** validation rejects it.
5. **Given** a legal squad expressed as data, **When** the engine reads it, **Then** it simulates without any content hard-coded in engine logic.

---

### User Story 3 - The counter-web resolves as designed (Priority: P2)

When two squads meet, the outcomes reflect the intended rock-paper-scissors: the
damage-type × defense matrix (Kinetic beats Shields / folds to Armor; Energy beats
Armor / folds to Shields; Explosive punishes clustering), reach and air rules
(rocket-artillery hard-counters aircraft; direct-fire only plinks air; indirect
artillery can never hit air; artillery snipes the backline), and shield-recharge
timing. No single machine dominates.

**Why this priority**: This is where "depth from configuration" and "fairness"
become real (P2, P3, P4). It is the behavior the balancer will later verify at
scale, but the core interactions must be correct first. P2 because Stories 1–2
must exist to test it.

**Independent Test**: Run curated matchups and assert the designed counter wins the
large majority: an Energy loadout beats an Armor-heavy target it counters; rocket-
artillery beats an all-helicopter squad; artillery punishes a stacked backline;
an all-air squad facing zero anti-air is favored, but adding AA flips it.

**Acceptance Scenarios**:

1. **Given** a Kinetic attacker and a Shield-primary defender, **When** they fight, **Then** the attacker deals its Kinetic-vs-Shield bonus and the shield folds faster than armor would.
2. **Given** helicopters versus a squad containing rocket-artillery, **When** they fight, **Then** the rocket-artillery hits air more often and for more damage than any direct-fire plinking would.
3. **Given** indirect artillery whose only enemies are in Air, **When** it acts, **Then** it never targets or damages the aircraft.
4. **Given** a defender who stacks a single zone, **When** facing Explosive splash, **Then** the clustered machines take correlated splash damage.

---

### User Story 4 - Win conditions and best-of-3 resolve correctly (Priority: P2)

A single game ends by **Conquest** (one side eliminated → full win) or by **Time**
(a fixed, tunable number of ticks elapses with both sides alive → the side that
dealt the most damage wins; an exact damage tie goes to the defender). A **match**
is best-of-three of those games, with the option (used by ranked callers) to lock
army/placement across all three games and the option (used by practice/balancer) to
vary inputs between games.

**Why this priority**: Determines who actually wins, which the ladder and summary
depend on. P2 because it rides on Stories 1–2.

**Independent Test**: Drive games to each ending — a wipe (Conquest), a timeout with
a clear damage lead (Time), and a constructed exact-damage tie (defender wins) — and
assert the declared winner and reward tier each time; run a Bo3 and assert the match
winner is the first to two games.

**Acceptance Scenarios**:

1. **Given** a game where one side is fully destroyed before the time limit, **When** it ends, **Then** the surviving side wins by Conquest at full reward.
2. **Given** a game reaching the time limit with both sides alive, **When** it ends, **Then** the side with more cumulative damage dealt wins by Time at lesser reward.
3. **Given** a Time-limit game with exactly equal damage dealt, **When** it ends, **Then** the defender is declared the winner.
4. **Given** a best-of-three with the ranked lock enabled, **When** the match resolves, **Then** the same army and placement are used for all three games and the match winner is the first side to win two.

---

### User Story 5 - Emit a serializable tick stream for replay and analysis (Priority: P3)

The engine's output is a compact, serializable record — the sequence of ticks with
the events in each (shots, hits, misses, damage, deaths, movements, Plan-B triggers,
support effects) and enough per-tick state to reconstruct the battlefield — that a
renderer can play back and a balancer can aggregate, without re-running the sim.

**Why this priority**: Enables the Battle Playback and the balancer to consume
results as data rather than re-simulating. P3 because Stories 1–4 define the content
the stream carries; the serialization shape can firm up alongside them.

**Independent Test**: Resolve a battle, serialize the tick stream, deserialize it in
a separate context, and assert a consumer can (a) reconstruct machine HP/position at
any tick and (b) compute the same damage totals the result reports.

**Acceptance Scenarios**:

1. **Given** a resolved battle, **When** its tick stream is serialized and deserialized, **Then** the reconstructed per-tick states equal the engine's computed states.
2. **Given** a tick stream, **When** a consumer sums per-hit damage events, **Then** the totals equal the result's reported damage totals for each side.

---

### Edge Cases

- **No anti-air present** against an all-air enemy: direct-fire units still plink air at penalty; indirect artillery cannot engage; the side with no reachable target must still be handled without stalling the tick loop.
- **Fully immobile squad** (e.g. dug-in artillery with no movement module): movement dials are inert; the game must still terminate.
- **Simultaneous lethal damage** on the same tick to units on both sides (or to the last unit on each side): resolution order is deterministic and the win-condition/tiebreak is well-defined.
- **Exact damage tie** at the Time limit → defender wins (already specified; the "defender" in a non-PvP/practice run must be a defined side).
- **Zero-accuracy vs maximum-evasion**, and **penetration exceeding a defense layer**: bounded, no negative damage, no divide-by-zero.
- **Shield recharge exactly at the untouched-tick threshold**: recharge begins deterministically at the defined tick.
- **Splash into a partially-occupied zone** and **splash on the killing tick**: splash targets are the machines present at the moment of resolution.
- **Support-only squad** (no offense) reaching the Time limit: resolves by damage tiebreak (likely 0–0 → defender).
- **Plan-B trigger that never fires**, and **multiple triggers eligible on the same tick** (capped at 2): deterministic selection.
- **Empty or under-strength squad** submitted: rejected by validation before simulation (a battle is always 5 vs 5 unless a mode explicitly allows otherwise).

## Requirements *(mandatory)*

### Functional Requirements

**Game-data schema (data-driven, P8)**

- **FR-001**: The system MUST define a typed schema for the seven machine **types** (Heavy Tank, Light Tank, Mech, Attack Helicopter, Rocket Artillery, Artillery, Rear Support), each with its home-zone eligibility, native damage family, mount class, and slot layout.
- **FR-002**: The system MUST support **chassis variants** (three per type at launch, extensible) that set a machine's fixed base-stat identity (trading along durability↔mobility, role-lean, fire cadence, and occasionally slot count/mount), without changing the type's native damage family.
- **FR-003**: The system MUST model **equipment** in five slots — 1 Weapon, 1 Defense, 3 Utility — where weapons and defenses are gated by mount/weight class with damage-family crossover inside what fits, utilities are ungated (no duplicates on one machine), and every equipment choice is a trade-off, never a strict upgrade.
- **FR-004**: The system MUST model the four **behavior dials** (Target Priority, Energy Allocation, Position & Movement, Stance) with their starter and capability-gated options, plus a **Plan-B conditional trigger** (base one slot, at most two total) that flips a chosen dial to a Plan-B setting when its condition fires.
- **FR-005**: The system MUST support **presets** — named bundles of a machine's full setup (weapon + defense + 3 utilities + four dials + Plan-B) — usable as the unit of configuration, defined per machine type.
- **FR-006**: The system MUST represent each machine's **stats** per the design's stat schema: Hull; Armor Rating; Shield Capacity, Recharge Rate, and Recharge Delay (as independent, coexisting layers alongside Armor); Damage, Damage Type, Fire Rate, Accuracy, Crit Chance/Multiplier, Splash, Penetration, Reach; Move Speed, Evasion, Threat/Aggro; Support Power/Range for support machines; and a derived **Power Rating** used only for out-of-combat matchmaking, never in combat math.
- **FR-007**: The system MUST derive a machine's effective stats from **type + variant + equipment** as data, so the simulation, UI, and balancer read one source of truth and no game content is hard-coded in engine logic.

**Battlefield and validation (trust boundary, Principle II)**

- **FR-008**: The system MUST model the four zones — **Air, Front, Middle, Rear** — with hard placement caps (each ground zone up to 3 machines, Air up to 2) and free placement within those caps.
- **FR-009**: The system MUST **validate** any submitted squad/placement before simulating and reject, with a reason, any illegal configuration (wrong squad size, zone cap exceeded, mount-illegal weapon/defense, duplicate utility, more than two Plan-B slots, immobile machine assigned a movement order it cannot perform).

**Deterministic simulation (P6)**

- **FR-010**: The system MUST advance the battle as a **fixed-tick real-time simulation** in which each machine acts on its own cooldown derived from its fire rate ("slow-firing" and "fast-acting" are literal), not in global discrete turns.
- **FR-011**: The system MUST drive all randomness from a **single seeded PRNG**, such that identical seed + identical inputs produce identical output, with no dependence on wall-clock time, unseeded randomness, or unordered iteration.
- **FR-012**: The system MUST resolve each hit through the pipeline: **Accuracy vs Evasion → hit/miss; base damage × crit × native-family bonus; absorbed by Shields (with shield type-interaction and any penetration); overflow to Hull reduced by Armor Rating (with armor type-interaction and any penetration); then Splash a reduced hit to other machines in the target's zone.**
- **FR-013**: The system MUST apply the **damage-type × defense interactions**: Kinetic strong vs Shields / weak vs Armor; Energy strong vs Armor / weak vs Shields; Explosive normal vs both but splashing; Armor is permanent flat mitigation unless repaired; Shields are a rechargeable buffer that begins recharging after a defined number of untouched ticks.
- **FR-014**: The system MUST resolve **targeting and reach**: default target is the nearest occupied enemy ground zone, carrying deeper as fronts collapse; reach exceptions (`any-ground`, `deep`, `air`, `front+mid`) apply per weapon; anti-air (rocket-artillery) hits Air more accurately and for more damage; direct-fire may only plink Air at penalty; indirect artillery can never hit Air; rear support does not attack (beyond its defined defensive teeth).
- **FR-015**: The system MUST resolve **behavior dials** each tick: Target Priority selects the target; Energy Allocation shifts the offense/mitigation balance; Position & Movement governs starting placement and when a machine advances/holds/falls back/kites/escorts/repositions (bounded by move speed); Stance governs decision logic (aggressive/defensive/protector/opportunist/support flavors), kept orthogonal to Energy (numbers vs decision-logic).
- **FR-016**: The system MUST evaluate **Plan-B triggers** deterministically: when a trigger's condition fires (e.g. HP below a threshold, an ally falls, zone breached, air detected, after tick T), the designated dial flips to its Plan-B setting; at most two trigger slots are active and same-tick eligibility resolves deterministically.
- **FR-017**: The system MUST apply **support effects** (heal lowest/zone, shield projection, fire-rate/damage buffs, targeting marks, point-defense against incoming missiles) as deterministic per-tick modifiers.
- **FR-018**: The system MUST keep randomness **bounded** — crit chance, small damage variance, and tick-timing jitter as texture only; no random miss on a decisive shot and no random-target decisive effect may swing a battle.

**Match resolution**

- **FR-019**: The system MUST end a single **game** by Conquest (all of one side destroyed → full-reward win) or by Time (a fixed, tunable tick limit reached with both sides alive → most-cumulative-damage-dealt wins at lesser reward; exact damage tie → defender wins).
- **FR-020**: The system MUST resolve a **match** as best-of-three games, supporting both a locked mode (same army + placement across all three games, for ranked callers) and a free mode (inputs may change between games, for practice/balancer callers); the match winner is the first side to win two games.

**Output**

- **FR-021**: The system MUST emit a **serializable tick stream** capturing, per tick, the events that occurred (shots, hits, misses, damage dealt, deaths, movements, Plan-B triggers, support effects) and sufficient state to reconstruct each machine's hull/shield/position at any tick.
- **FR-022**: The system MUST emit a **battle result** summarizing winner and win condition, per-machine fates (destroyed-at-tick or survived-with-hull-percent), per-side damage totals, survivor counts, and duration — with the result's totals reconcilable from the tick stream's events.

**Reusability (P6/P8)**

- **FR-023**: The engine MUST be a single self-contained module with no dependency on any UI, rendering, storage, or network layer, so the identical core runs server-side (authoritative), client-side (render preparation), and offline (balancer).
- **FR-024**: The system MUST expose enough of a battle's outcome distribution (via repeated seeded runs of a matchup) for an external balancer to read win probabilities — without the engine itself performing balancing.

### Key Entities *(include if feature involves data)*

- **Machine Type**: one of the seven unit classes; carries home-zone eligibility, native damage family, mount class, and slot layout.
- **Chassis Variant**: a named identity within a type (e.g. Grizzly / Cavalier / Bulwark) setting fixed base-stat trade-offs; three per type at launch.
- **Equipment Module**: a Weapon, Defense, or Utility item, with mount/weight gating (weapons/defenses), damage family (weapons), and the stat/capability effects it grants; all trade-offs, never strict upgrades.
- **Behavior Dials**: the four-dial configuration (Target / Energy / Position / Stance) plus up to two Plan-B triggers, defining a machine's autonomous logic.
- **Preset**: a named, reusable bundle of a machine's full loadout + dials + Plan-B, per type.
- **Machine Instance**: a placed, fully-configured machine with derived effective stats (Hull, Armor, Shields + recharge, offense stats, mobility, support), an assigned zone, and live battle state (current hull/shields/cooldowns/orders).
- **Squad / Army**: exactly five machine instances placed across the four zones within caps; has an aggregate Power Rating.
- **Zone / Battlefield**: the four ordered zones (Air / Front / Middle / Rear) with per-zone caps and the reach relationships between them, per side, mirrored across a contact line.
- **Damage Type & Defense Layer**: Kinetic / Energy / Explosive and Armor / Shields, with the fixed interaction matrix.
- **Tick**: one discrete step of simulated time carrying the events resolved in it.
- **Tick Stream**: the ordered, serializable sequence of ticks + events that constitutes a replayable battle.
- **Game / Match**: a single game (one battle to a win condition) and a best-of-three match of games with a lock/free adaptation policy.
- **Battle Result**: the summarized outcome (winner, win condition, per-machine fates, damage totals, survivors, duration) derivable from the tick stream.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Determinism** — for a fixed seed and fixed inputs, 1,000 consecutive resolutions (including runs executed in two different host contexts) produce byte-identical tick streams and identical results (100% reproducibility).
- **SC-002**: **Reconstructability** — from the serialized tick stream alone, a consumer reconstructs every machine's hull, shields, and position at every tick with zero discrepancy against the engine's computed states, and the summed per-hit damage equals the result's reported totals.
- **SC-003**: **Counter-web integrity** — across a defined suite of representative matchups, each documented counter (Kinetic→Shields, Energy→Armor, rocket-artillery→air, artillery→backline, Explosive→clustering) wins at least a strong majority of games, and no single machine type/variant/loadput wins across all matchups it is tested in.
- **SC-004**: **Win-condition correctness** — 100% of the defined win-condition scenarios (Conquest, Time-by-damage, exact-tie-to-defender) and best-of-three outcomes resolve to the specified winner and reward tier.
- **SC-005**: **Validation coverage** — 100% of the enumerated illegal-configuration cases (bad squad size, zone-cap breach, mount-illegal equipment, duplicate utility, excess Plan-B slots, impossible movement order) are rejected before any simulation runs.
- **SC-006**: **Balancer throughput** — the engine resolves a full best-of-three match fast enough that a batch of at least 10,000 matchup resolutions completes within a single practical balancing run (target: minutes, not hours), enabling the Monte-Carlo balancer (P4).
- **SC-007**: **Adaptation-lock enforcement** — in locked (ranked) mode, army and placement are provably identical across all three games of a match; in free mode, per-game input changes are honored.

## Assumptions

- **Content subset for v1 of this feature**: the schema accommodates all 7 types × 3 variants and the full equipment catalog, but this feature seeds only a **representative subset** sufficient to exercise the engine and the counter-web tests. Exhaustive data-entry of all 21 variants and every weapon/defense/utility is a follow-on data task (and numeric tuning is the balancer's job, per P4), not a blocker for this feature.
- **Tick/time model**: battles run on a fixed tick rate with a **tunable time limit** (the mockups depict ~100 ticks over roughly 8–10 seconds); the exact tick count, tick duration, and time limit are configurable values to be tuned by the balancer, defaulted here and not treated as fixed constants.
- **Adaptation policy ownership**: the engine *supports* both locked and free best-of-three modes; *which* mode a given battle uses (ranked = locked, practice = free) is decided by the calling feature (Arena/Practice), not by the engine.
- **"Defender" definition outside PvP**: in practice/balancer runs where there is no human defender, one side is designated the defender for the exact-tie tiebreak (by convention, the second/AI side), configurable by the caller.
- **Randomness scope**: all nondeterminism flows through the single injected seed; the runtime provides no ambient randomness or wall-clock reads inside the engine (constitution P6).
- **Reuse contract**: the engine is consumed as a shared module by later server, client, and balancer features; those integrations are out of scope here beyond keeping the engine free of UI/storage/network dependencies (FR-023).
- **Manual override**: the design allows an optional single manual override per battle but keeps it off for v1; this feature does not implement it (the tick model should not preclude adding it later).
