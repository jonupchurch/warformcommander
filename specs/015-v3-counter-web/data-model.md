# Data Model — v3 Counter-Web

Entities are engine types (`crates/engine/src`) + ruleset data. Tags: **[KEEP]** unchanged ·
**[TUNE]** value-only change (data) · **[CHANGE]** shape/logic change · **[NEW]** added · **[REMOVE]**
deleted. Magnitudes are start-values (P4/P8).

## Weapons & the triangle (US1)

### DamageMatrix — `model/ruleset.rs` **[TUNE]**
- Fields: `kinetic`, `energy`, `explosive : LayerMultipliers { vs_shields, vs_armor }` (bp).
- Change: values → Kinetic {1.6, 0.7}, Energy {0.7, 1.6}, Explosive {1.0, 1.0} (start; measure P2).
- Validation: hash-stable at defaults (serde skip-at-default) so untouched replays don't churn.

### Weapon / cadence — `content.rs`, `CadenceTier` (`model/types.rs`) **[TUNE]**
- One weapon per machine (already true; no secondary weapons). Native type per chassis grants +12%
  (existing `RoleDamageBonus`/native-family path — confirm it's the +12% lever).
- Cadence welded to type (Energy Fast / Kinetic Med / Explosive Slow / Artillery Siege); throughput
  not flat (fast +DPS/low alpha, slow −DPS/high alpha) — tune per-weapon `damage`/`cadence` in data.
- Heavy+Mech chassis modifier: +1 firing tick & +10% damage (data on those chassis/variants).

## Defenses (US1)

### Mount defense catalog — `content.rs` **[CHANGE/TUNE]**
- Populate shield/armor defensive options across mounts so the matrix has two layers to bite (today
  only 2 of 7 mounts have shields → triangle dormant). Reuse existing family machinery.
- Hedge: **only** Mech Reactive Plating (`special_mitigation`/reactive path) survives; **Ablative
  retired** from the core set (`AblativeMods` may remain but is not a core defense choice).
- Validation: no single defense beats all three damage types (SC / acceptance US1.3).

## Targeting (US2)

### TargetingPriorityChain — `sim/target.rs` + `model/types.rs` **[CHANGE]**
- Replaces the `TargetRow` + `TargetRule` two-dial pick with an ordered **priority list** (2 filter
  slots + a `Closest`/`Furthest` fallback) scored per candidate.
- Score = base 1–5 (rank in list) + offsets (**Decoy +2**, **ECM −2**); highest wins; ties → fallback.
  **Recomputed per shot.**
- Filters (declarative only): `TargetAir` · `TargetArmor(by armor_pct)` · `TargetSupport` ·
  `TargetIndirect` · `Follow`. **[REMOVE]** all smart selectors (Most/Least HP, *Threat, SmartCounter).
- `Follow`: non-chaining focus-fire (anchor = an independently-choosing zone ally; resolve
  independents first, same tick). Camo = +evasion (hit-time dodge), separate from ECM.
- Reach still gates candidates first (unchanged reach model).

## Movement & zones (US2)

### MovementMode — `model/types.rs` **[CHANGE]**
- Variants → `Hold` · `Advance` · `Kite` · `FallBack`. **[REMOVE]** `Reposition`, `Escort`, and the
  Kite/Reposition/Escort capability gates.
- Advance **self-terminates** (idle in reach, re-close if stranded); Kite oscillates; FallBack ducks
  ~10 ticks then returns to home zone if a slot is free.

### Combatant — `model/army.rs` **[CHANGE]**
- **[NEW]** fields: `home_zone` (from assigned placement) + small counters for the FallBack return
  timer / Kite phase. Existing `zone`, `move_cooldown`, `plan_b_slots` reused.
- Zones: per-side rows Rear/Middle/Front + Air, cap **3 ground / 2 air** (`validate.rs`, unchanged).

## Equipment (US3)

### SlotLayout / budgets — `content.rs`, `model/army.rs` **[CHANGE/TUNE]**
- Utility budget per chassis: Commander 5 · Mech 4 · Heavy 3 · Light 3 · Heli 2 · Arty 2 · RktArty 2.
- Loadout = 1 weapon + 1 defense + N utilities (no duplicates, `validate.rs`).

### EquipmentModule / catalog — `content.rs`, `EquipmentId` (`model/types.rs`) **[CHANGE/NEW]**
- Three domains: **Self** (single-stat boosters — common pool, 1 slot each, one per stat) · **Enemy**
  (on-hit riders: EMP/Suppress/Snare/Paint) · **Ally** (auras). Capability unlocks (AA, ECM, Decoy,
  Jump Jets) are class-specific.
- Per-item **cost tier 1/2/3** (Jump Jets = 3). **[NEW]** rider effects (EMP = suppress heal/regen N
  ticks; Suppress/Snare/Paint) and their engine hooks in `sim/damage.rs`.
- Validation: `P1` — no item is a straight upgrade; total power gap ≤ ~25% (SC-007, balancer-checked).

## Behaviors (US4)

### Stance — `model/types.rs` **[CHANGE]**
- Variants → `Aggressive` · `Neutral` (UI "Balanced") · `Defensive`. **[REMOVE]** Protector,
  Opportunist, Triage, Sustain, Empower + `Stance::{COMBAT,SUPPORT,is_support,fits_role}` +
  `OpportunistStance` unlock.
- Effect (two-sided, on **output** = weapon damage or Commander projection): Aggressive +5% dmg/+5%
  acc/+10% taken; Neutral 0; Defensive −5% taken/+5% evasion/+5% armor/+5% shield/−20% output. Applied
  in `sim/damage.rs` (`execute`/stance mults already present).

### Energy dial — **[REMOVE]**
- Delete `EnergyMode`, `EnergyModes`/`EnergyProfile`, `energy_damage_mult`/`energy_damage_taken_mult`,
  and `BehaviorDials.energy`; strip energy from `damage.rs`/`target.rs`/`army.rs`/`validate.rs`.
- **Keep** the Energy *damage type* and `air_mods.energy_air_dmg_mult` (unrelated).

### BehaviorDials — `model/types.rs` **[CHANGE]**
- Fields → `targeting` (priority chain) · `movement` · `stance`. **[REMOVE]** `energy`, and the
  separate `target_row`/`target_rule` (folded into the chain).

### Plan-B: PlanBTrigger / TriggerCondition / DialKey / DialValue — `model/types.rs` **[CHANGE]**
- `TriggerCondition`: keep `HullBelowPct`, `ShieldDown`, `AfterTick`, `AllyLostInZone`; **[NEW]**
  `NoTargetsReachable`; **[REMOVE]** `AirEnemyExists`, `EnemyInZone`.
- `DialKey`/`DialValue`: restrict to `Movement` | `Stance`; **[REMOVE]** `Energy`, `Targeting`(TargetRow/
  TargetRule). Keep latch, Slot-1 > Slot-2 precedence, 1 slot (+1 via Combat AI `ExtraPlanBSlot`).

## Commander (US5)

### AuraKind — `model/types.rs` **[NEW variant]**
- Add `DamageTaken` (the one new aura kind). Keep `DamageDealt`, `CommandBoost`, `StartShield`.

### Command / Commander — `content.rs`, `army.rs` **[CHANGE/NEW]**
- Commander: 0 damage; weapon slot = Heal/Shield/Ablation **projector** (support-weapon output, scaled
  by stance). Innate **Command** while alive → army `plan_b_slots` +1 (existing grant path) + advanced-
  behavior unlock; revoked army-wide on death.
- Assassination: expressible via `TargetSupport` + deep reach (no new mechanic).

## Cross-cutting

### Ruleset — `content.rs` / `model/ruleset.rs` **[CHANGE]** (P8 single source of truth)
- Carries matrix, cadence, defenses, equipment catalog + costs, slot budgets, stance table, aura
  kinds, trigger set — all typed data read by **sim + UI + balancer**. Hash-stable at defaults.
- **Propagation:** new enum variants ⇒ wasm deploy **before** `reseed-current-ruleset.ts` (D8).

### Balancer fixtures — `crates/balancer` **[CHANGE]** (S0)
- Re-fixture `SkillBeatsGear` to a composition-quality skilled side (FR-030) so a matrix change doesn't
  fail it by construction.

### TS derive-parity — `lib/*`, `derive-battery.json` **[CHANGE, keep green]**
- Update the TS `SupportRange`/enum mirror + regenerate `derive-battery.json` **only when** a stat/enum
  shape changes — deliberately, to keep `derive-parity.test.ts` green (never as a side effect).
