# Data Model: Battle Simulation Core + Game Data Model

**Feature**: `001-battle-sim-core` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

This is the **typed game-data schema** the engine operates on and emits — the shared
source of truth the Garage (Feature 4), the Battle Playback (Feature 5), the Arena
(Feature 8), and the auto-balancer (Feature 2) all bind to (constitution **P8**).
The canonical definitions live in **Rust** (`serde`-derived) inside the sim crate;
a **TypeScript** mirror is generated/hand-kept in sync for the web app and stored
as the shared contract in `contracts/`. Nothing here is hard-coded engine logic —
every number is data (**FR-007**).

## Layering — three tiers of data

The model separates cleanly into three tiers. Keeping them apart is what makes the
engine a pure `resolve(armies, ruleset, seed) → Replay` (FR-023) and the balance
table live-editable (FR-007):

1. **Content / configuration (input, authored data)** — Machine Types, Chassis
   Variants, Equipment, Dials, Presets, Squads, Placements. *What a player builds.*
2. **Ruleset (input, the balance table)** — every tunable number (base stats, the
   damage matrix, cadence tiers, tick constants, air modifiers). Admin-editable at
   runtime (Feature 12); the engine hard-codes **none** of it.
3. **Runtime & output** — the live per-tick battle state the engine mutates
   internally, and the serializable **Replay** + **Battle Result** it emits.

Numeric fields marked **`Fixed`** are fixed-point (not floats) for cross-platform
determinism (P6) — exact representation pinned in [research.md](./research.md).
Percentages are stored as fixed-point fractions in `[0,1]` unless noted.

---

## Tier 1 — Content / configuration

### MachineType

One of the seven unit classes. Immutable identity; carries the rules a variant
cannot change (**FR-001**).

| Field | Type | Notes |
|---|---|---|
| `id` | `MachineTypeId` (enum) | `HeavyTank \| LightTank \| Mech \| AttackHeli \| RocketArtillery \| Artillery \| RearSupport` |
| `nativeFamily` | `DamageFamily` | Kinetic / Energy / Explosive / Support; **Mech = generalist (none)**. Variants never change this (FR-002). |
| `homeZones` | `ZoneId[]` | Eligible starting zones. Heli → `[Air]` only (air-locked). Ground types → `[Front, Middle, Rear]`. Support → ground zones. |
| `mountClass` | `MountClass` | `Heavy \| Light \| Mech \| Heli \| RktArty \| Artillery \| Support` — gates which weapons/defenses fit. |
| `slotLayout` | `SlotLayout` | `{ weapon: 1, defense: 1, utility: 3 }`; some **variants** raise utility to 4. |
| `canFireFromRear` | `bool` | Only Artillery + RocketArtillery `true` (rear-row reach rule, §4). |
| `airCapableByDefault` | `bool` | Whether its native weapon can target Air at all (see reach). |

### ChassisVariant

Three per type at launch, extensible (**FR-002**). Sets the machine's **fixed
base-stat identity** — an edge in one axis paid for in another. Never shifts the
native damage family.

| Field | Type | Notes |
|---|---|---|
| `id` | `VariantId` | e.g. `Grizzly`, `Cavalier`, `Bulwark`. |
| `typeId` | `MachineTypeId` | Parent type. |
| `baseStats` | `BaseStats` | The variant's base stat block (see **BaseStats**), pulled from the **Ruleset**, not baked in. |
| `slotLayoutOverride` | `SlotLayout?` | e.g. *Sentinel* mech & *Command Post* support → 4 utility. |
| `cadenceTier` | `CadenceTier` | `Fast \| Medium \| Slow \| Siege` — base fire cadence (equipment/utility may shift it one tier). |
| `passiveAura` | `AuraEffect?` | e.g. Bulwark's −8% damage aura to zone allies; Command Post's C&C boost. Optional, data-driven. |

**BaseStats** (per variant; every value sourced from the Ruleset):

| Group | Fields |
|---|---|
| Survivability | `hull: Fixed`, `armorPct: Fixed` (0–1), `shieldCap: Fixed`, `shieldRegen: Fixed` (/tick), `shieldDelay: u16` (ticks untouched before regen) |
| Offense | `damage: Fixed`, `damageType: DamageType`, `accuracy: Fixed` (0–1), `critChance: Fixed`, `critMult: Fixed`, `splash: Fixed` (0–0.25), `penetration: Fixed` (0–1), `reach: ReachTag` |
| Mobility | `moveSpeed: u8` (zone-transition capability; 0 = immobile, `None` = air-locked N/A), `evasion: Fixed` (0–1), `threat: Fixed` (aggro weight) |
| Support | `supportPower: Fixed?`, `supportRange: SupportRange?` (`OwnZone \| OwnPlusAdjacent`) |

> **Power Rating** is *derived* from base stats + equipment tiers (see
> **MachineInstance.powerRating**) and is used **only** for out-of-combat
> matchmaking — never in combat math (FR-006).

### EquipmentModule

A Weapon, Defense, or Utility item. Every equipment choice is a **trade-off, never
a strict upgrade** (**FR-003**, constitution **P1**). Modeled as a tagged union.

**Common fields**: `id: EquipmentId`, `kind: Weapon | Defense | Utility`, `name: string`.

**Weapon** (gated by `mountClass`; family crossover *within* what fits):

| Field | Type | Notes |
|---|---|---|
| `mountClass` | `MountClass` | Must match the machine's mount to be legal (FR-009). |
| `family` | `DamageFamily` | May differ from the type's native family (crossover); native match earns the +12% bonus. |
| `statDeltas` | `StatDeltas` | Overrides/deltas on `damage`, `cadenceTier`, `reach`, `splash`, `penetration`, `accuracy`. |

**Defense** (gated by weight/mount; **sets the primary mitigation layer**):

| Field | Type | Notes |
|---|---|---|
| `mountClass` | `MountClass` | Legality gate. |
| `armorPctDelta` | `Fixed` | e.g. Composite Armor +0.12. |
| `shieldDelta` | `{ cap, regen, delay }?` | e.g. Deflector +250/6/25. |
| `specialMitigation` | `MitigationMod?` | e.g. Blast Plating −40% Explosive splash taken. |
| `tradeoff` | `StatDeltas` | The cost (e.g. −1 Move). |

**Utility** (ungated; **no duplicates on one machine**; may unlock capabilities):

| Field | Type | Notes |
|---|---|---|
| `statDeltas` | `StatDeltas?` | e.g. Fire Control +0.08 acc vs evasive; Drive Servos +2 move. |
| `unlocks` | `Capability[]` | e.g. Combat AI Core → `+1 PlanBSlot`, `AdaptiveEnergy`, `OpportunistStance`; Rangefinder → `+1 reach`; Sensor Suite → `TargetAir`. |
| `cadenceShift` | `i8?` | e.g. Autoloader → one tier faster (min Fast). |

### BehaviorDials

The four always-present dials + up to two Plan-B triggers (**FR-004**, §8.1). Advanced
options are **capability-gated** by utility unlocks (`unlocks`).

| Dial | Type | Starter options | Unlockable options |
|---|---|---|---|
| `targetRow` | `TargetRow` | `FrontReachable` (default) · `LastReachable` | `FullestRow` · `WeakestRow` |
| `targetRule` | `TargetRule` | `FocusFire` · `DisperseFire` · `Nearest` · `Weakest` · `BiggestThreat` | `TargetSupport` · `TargetAir` · `SmartCounter` |
| `energy` | `EnergyMode` | `Offense` · `Balanced` · `Defense` | `Overdrive` · `Fortify` · `Adaptive` |
| `movement` | `MovementMode` | `Hold` · `Advance` · `FallBack` | `Kite` · `Reposition` · `Escort` |
| `stance` | `Stance` | `Aggressive` · `Neutral` · `Defensive` | `Protector` · `Opportunist` · support flavors `Triage`/`Sustain`/`Empower` |

> **Target Priority is two sub-picks** — `targetRow` (a) + `targetRule` (b) — that
> combine (Revision Notes; §8.1). Ties break deterministically: **zone order →
> placement index**.

### PlanBTrigger

`when [condition] → set [dial] to [plan-B value]`. **Base 1 slot, max 2** (2nd via
Combat AI). Triggers **latch** (fire once, stay flipped) (**FR-016**, §8.2).

| Field | Type | Notes |
|---|---|---|
| `slot` | `1 \| 2` | **Precedence: Slot 1 > Slot 2.** Same dial → Slot 1 wins even if Slot 2 latched first. |
| `condition` | `TriggerCondition` | Tagged union over the §8.2 menu (Self / Allies / Enemy / Position / Time), with thresholds (`Hull<{75,50,25}%`, `after tick T`, `air enemy exists`, …). |
| `dial` | `DialKey` | Which dial flips (`targetRow \| targetRule \| energy \| movement \| stance`). |
| `planBValue` | dial-typed value | The value to latch. |

> **Determinism law**: the final dial state depends only on *which triggers have
> fired + slot priority* — never on firing order (§8.2, FR-016).

### Preset

A named bundle of a machine's whole setup — **per machine type** (**FR-005**, §8.4).

| Field | Type |
|---|---|
| `id`, `name` | `PresetId`, `string` (e.g. "Breacher", "AA Screen", "Siege") |
| `typeId` | `MachineTypeId` (presets are type-scoped; gear is mount-gated) |
| `variantId` | `VariantId` |
| `loadout` | `Loadout` (1 weapon + 1 defense + 3–4 utilities) |
| `dials` | `BehaviorDials` |
| `planB` | `PlanBTrigger[]` (0–2) |
| `origin` | `Stock \| Custom` |

### Loadout

| Field | Type | Validation |
|---|---|---|
| `weapon` | `EquipmentId` | mount-legal for the machine (FR-009) |
| `defense` | `EquipmentId` | mount-legal |
| `utilities` | `EquipmentId[]` | length 3 (or 4 for 4-util variants); **no duplicates** |

### MachineInstance (configured, pre-battle)

A placed, fully-configured machine. Its **effective stats are derived** from
`type + variant + equipment` as pure data (**FR-007**) — the derivation is a shared
function the engine, Garage, and balancer all call.

| Field | Type | Notes |
|---|---|---|
| `instanceId` | `u8` | Stable index within the squad (0–4); used for deterministic tie-breaks and replay identity. |
| `typeId` / `variantId` | ids | |
| `loadout` | `Loadout` | |
| `dials` | `BehaviorDials` | |
| `planB` | `PlanBTrigger[]` | 0–2 |
| `zone` | `ZoneId` | Assigned placement (within caps + home-zone eligibility). |
| `effectiveStats` | `EffectiveStats` | **Derived** = `baseStats ⊕ equipment deltas ⊕ capability unlocks`. |
| `powerRating` | `Fixed` | Derived, matchmaking-only (never combat). |

### Squad / Army

Exactly **five** MachineInstances placed across the four zones within caps
(**FR-008**). The shared unit the Garage saves and the Arena runs.

| Field | Type | Validation |
|---|---|---|
| `machines` | `MachineInstance[]` | **length == 5** (FR-009; a battle is 5v5 unless a mode explicitly allows otherwise). |
| `placement` | derived from each machine's `zone` | ground zone ≤ 3, Air ≤ 2; home-zone eligibility respected. |
| `powerRating` | `Fixed` | Aggregate; matchmaking-only. |

---

## Tier 2 — Ruleset (the balance table, engine input)

The **entire set of tunable numbers**, passed into `resolve(...)` as data. Admin-editable
live (Feature 12); un-versioned at rest (safe — recorded replays never re-derive from it);
the engine reads it and hard-codes nothing (**FR-007**, §16.2).

| Field | Type | Source |
|---|---|---|
| `variants` | `Map<VariantId, BaseStats>` | Base stat block per variant (stat block §2–3). |
| `equipment` | `Map<EquipmentId, EquipmentModule>` | Full catalog with deltas (stat block §4). |
| `damageMatrix` | `DamageMatrix` | Type × layer multipliers: Kinetic ×1.4/×0.85, Energy ×0.6/×1.25, Explosive ×1.0/×1.0 (§1/§6). |
| `cadenceTicks` | `{ Fast:1, Medium:3, Slow:5, Siege:10 }` | Ticks per shot (§1). |
| `airMods` | `AirModifiers` | AA vs air (+0.10 acc, ×1.5 dmg); direct-fire plink (−0.25 acc, ×0.5 dmg); indirect artillery = never. |
| `globals` | `GlobalConstants` | `tickRate:10`, `tickCap:1000`, `damageVariance:0.05`, `critBaseChance:0.05`, `critBaseMult:1.5`, `nativeBonus:0.12`, `minDamageFloor:0.10`, `splashCap:0.25`, `hitClamp:[0.05,0.95]`. |

> **`rulesetHash`** — a stable hash of the Ruleset is stamped into each Replay and
> Battle Result for provenance/debugging (not for re-derivation).

---

## Tier 3 — Runtime & output

### Zone / Battlefield

Four ordered zones **per side**, mirrored across a contact line (**FR-008**, §4).

| Field | Type | Notes |
|---|---|---|
| `zones` | `[Air, Front, Middle, Rear]` | Ordered enum; caps: ground 3, Air 2. |
| Reach relationships | derived | Front→nearest occupied enemy row (collapsing forward); Middle→enemy Front+Middle (Rear after both clear); Rear→artillery-only (any); Air→air-capable weapons only. |

### LiveMachineState (internal, per tick)

Engine-internal mutable state (not all persisted per tick — see Replay for what is
snapshotted). Drives resolution; deterministic.

`hullCurrent: Fixed`, `shieldCurrent: Fixed`, `ticksSinceHit: u16`, `cooldownRemaining: u16`,
`zone: ZoneId`, `alive: bool`, `activeDials: BehaviorDials` (post-latch), `firedTriggers: Set<slot>`,
`cumulativeDamageDealt: Fixed`.

### Damage resolution (pure pipeline, per hit — FR-012, §9.2)

Order is fixed and deterministic:
1. `hit = clamp(acc − evasion [+airAccMod], 0.05, 0.95)` → seeded roll → hit/miss.
2. `D0 = weaponDmg × (nativeMatch ? 1.12 : 1.0) × crit? × airDmgMod`.
3. **Shields** absorb first: `shieldDmg = D0 × shieldMult(type)`; overflow (net of
   penetration) converts back and passes to hull.
4. **Hull**: `hullDmg = max(hullIn × armorMult(type) × (1 − armorPct), hullIn × 0.10)`
   (min-damage floor; penetration may skip part of armor).
5. **Splash**: a reduced hit (`× splash`, ≤ 0.25) repeats on **other** enemy units in
   the target's zone.

### Tick

One discrete step of simulated time (**FR-021**). Carries a **full state snapshot**
+ the **events** resolved in it (this is the deliberate anti-pattern-fix: snapshots,
not deltas, so the scrubber seeks by indexing and never re-simulates — Revision Notes,
SC-002).

| Field | Type |
|---|---|
| `index` | `u16` (0..=1000) |
| `snapshot` | `MachineSnapshot[10]` — per machine: `{ instanceRef, hull: Fixed, shield: Fixed, zone: ZoneId, alive: bool }` |
| `events` | `TickEvent[]` — `Shot`, `Hit`, `Miss`, `Damage`, `Death`, `Move`, `PlanBTrigger`, `SupportEffect` (each with actor/target refs + magnitudes) |

### Replay (primary output — FR-021)

The serializable, **random-access** tick stream. Client plays it back; balancer
aggregates it. See [contracts/replay-format.md](./contracts/replay-format.md) for the
wire schema.

| Field | Type | Notes |
|---|---|---|
| `replayFormatVersion` | `u16` | Stamped every replay; playback rejects unknown majors (Revision Notes). |
| `seed` | `u64` | The PRNG seed. |
| `rulesetHash` | `Hash` | Provenance of the balance table used. |
| `armies` | `[Army, Army]` | The exact inputs (persisted for debug/repair). |
| `games` | `GameReplay[]` | One per game in the Bo3 (1–3). |
| `result` | `MatchResult` | Summary (below). |

`GameReplay = { ticks: Tick[], gameResult: GameResult }`. Ticks are stored as a
**tick-indexed array** so `ticks[n]` is O(1) — the seek primitive.

### Game / Match (FR-019, FR-020)

- **Game** ends by **Conquest** (a side fully destroyed → full-reward win) or **Time**
  (tick cap reached, both alive → most cumulative damage dealt wins at lesser reward;
  **exact tie → defender**).
- **Match** = best-of-three; winner is first to two games. **Adaptation policy** is a
  caller-supplied flag: `Locked` (ranked — same army+placement all three games) or
  `Free` (practice/balancer — inputs may vary between games).

| Entity | Fields |
|---|---|
| `MatchConfig` | `adaptation: Locked \| Free`, `defenderSide: Side` (for tie-break), `seed: u64` |
| `GameResult` | `winner: Side \| null`, `condition: Conquest \| Time`, `rewardTier: Full \| Lesser`, `durationTicks: u16` |
| `MatchResult` | `winner: Side`, `games: GameResult[]`, per-machine fates, per-side damage totals, survivor counts |

### BattleResult (summary — FR-022)

Reconcilable from the tick stream (SC-002): `winner`, `winCondition`, `perMachineFates`
(`DestroyedAtTick(t) | SurvivedWithHullPct(p)`), `perSideDamageTotals`, `survivorCounts`,
`durationTicks`. Every total must equal the sum of the corresponding tick-stream events.

---

## Consolidated validation rules (trust boundary — FR-009, Principle II, SC-005)

Applied **before any simulation** (a battle never runs on an illegal army):

| # | Rule | Rejects |
|---|---|---|
| V1 | Squad size == 5 | empty / under- / over-strength |
| V2 | Ground zone ≤ 3, Air ≤ 2 | zone-cap breach |
| V3 | Machine placed only in a `homeZone` of its type | heli on ground, tank in air |
| V4 | Weapon & defense `mountClass` match the machine | mount-illegal equipment |
| V5 | Utilities: exactly 3 (or 4 for 4-util variants), **no duplicates** | wrong count / duplicate module |
| V6 | Plan-B slots ≤ 2, and slot 2 requires the unlocking capability | excess / ungated Plan-B |
| V7 | Dial option legal for the machine's unlocked capabilities | ungated advanced option |
| V8 | Movement order feasible for the machine (immobile/air-locked → no move order) | impossible movement order |

Every rejection returns a **reason** (FR-009). Validation is a shared function so the
Garage rejects the same illegal builds the engine would (P8).

---

## Entity relationship summary

```
MachineType 1──* ChassisVariant
MachineType 1──* EquipmentModule (via mountClass gating)
ChassisVariant + Loadout + BehaviorDials + PlanBTrigger[] ──derive──> MachineInstance
MachineInstance 5 ──> Squad/Army
Army × Army + Ruleset + seed + MatchConfig ──resolve()──> Replay { GameReplay[] } + MatchResult
Replay.GameReplay 1──* Tick 1──* TickEvent
Ruleset ──feeds──> resolve()   (data input, never baked in)
Preset ──is a saved──> (Loadout + BehaviorDials + PlanBTrigger[]) per MachineType
```
