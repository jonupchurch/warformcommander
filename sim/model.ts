/**
 * TypeScript mirror of the Feature-1 game-data model (`crates/engine/src/model/`) — **types only,
 * no logic**. This is the shared shape a saved squad, a preset, and a battle input are made of; the
 * Garage (Feature 4) edits it and the persistence layer (Feature 7) stores it as typed `jsonb`.
 *
 * The **authoritative** definition is the Rust model; these types track its serde serialization
 * (camelCase structs; bare-string enums; externally-tagged data enums). They carry **no runtime
 * validation** — the trust boundary is the engine's `validate()` (see `sim/validate.ts`, constitution
 * P8: the DB rejects exactly the builds the engine would). Keep this file in lockstep with the Rust
 * model when the content schema evolves (`schemaVersion` gates stored configs).
 */

import type { DamageType } from './ruleset';

// --- Closed enums (bare-string serialization) ------------------------------

/** The eight machine classes — a closed set (`MachineTypeId`, model/types.rs). */
export type MachineTypeId =
  | "HeavyTank"
  | "LightTank"
  | "Mech"
  | "AttackHeli"
  | "RocketArtillery"
  | "Artillery"
  | "RearSupport"
  | "Commander";

/** The four battlefield rows (`ZoneId`). Air is separate from the ground rows. */
export type ZoneId = "Air" | "Front" | "Middle" | "Rear";

/**
 * A declarative targeting **class filter** (v3 US2, design §12.2) — *what to hunt*, never an
 * auto-optimizer. `Follow` is dynamic: it focus-fires on a zone ally's independently-chosen target
 * (non-chaining). Serializes as a bare PascalCase name.
 */
export type TargetFilter =
  | "TargetAir"
  | "TargetArmor"
  | "TargetSupport"
  | "TargetIndirect"
  | "Follow";

/**
 * The positional **fallback selector** (v3 US2, design §12.1) — always resolves. `Closest` sweeps
 * from the contact line (air first, then front→rear); `Furthest` from the enemy backline. No
 * enemy-state "smart" selectors (Most/Least HP, threat) — those were retired (§12.7).
 */
export type TargetSelector = "Closest" | "Furthest";

/**
 * The targeting **priority-score chain** (`TargetingChain`, v3 US2) — two ordered class filters
 * (either may be absent) plus a positional fallback. Reachable enemies are scored per shot: a
 * Priority-1 match highest, a Priority-2 match next, an unmatched candidate lowest; the target's own
 * draw offset (Decoy +2 / ECM −2) adjusts the score; the highest wins, the fallback breaks ties.
 * Replaces the v2 target-row + target-rule pair. Fields are absent (not null) when a tier is unused.
 */
export interface TargetingChain {
  priority1?: TargetFilter;
  priority2?: TargetFilter;
  fallback: TargetSelector;
}

/** Movement dial (`MovementMode`, v3 US2) — four self-terminating modes, no capability gates. */
export type MovementMode = "Hold" | "Advance" | "FallBack" | "Kite";

/**
 * Stance dial (`Stance`, v3 US4) — three universal postures (every machine may hold any). A
 * two-sided magnitude axis: `Aggressive` trades survivability for output, `Defensive` the reverse,
 * `Neutral` (UI label "Balanced") is the identity baseline.
 */
export type Stance = "Aggressive" | "Neutral" | "Defensive";

/**
 * Which dial a Plan-B trigger flips (`DialKey`, v3) — Movement, Stance, or (v3 US3 Adaptive Munitions)
 * the outgoing damage `DamageType`. Targeting is self-reactive via the priority chain, so Plan-B never
 * sets it (design §12.3/§15.4). A `DamageType` flip is capability-gated in `validate` (V7).
 */
export type DialKey = "Movement" | "Stance" | "DamageType";

/** Plan-B precedence slot (`PlanBSlot`). Slot 1 wins over Slot 2 on the same dial. */
export type PlanBSlot = "Slot1" | "Slot2";

/**
 * A dial-typed value a Plan-B trigger latches (`DialValue`, externally tagged — e.g.
 * `{ "Movement": "FallBack" }`). The `DamageType` variant (v3 US3 Adaptive Munitions) switches the
 * machine's outgoing damage type mid-battle; it is capability-gated in `validate`.
 */
export type DialValue =
  | { Movement: MovementMode }
  | { Stance: Stance }
  | { DamageType: DamageType };

/**
 * The Plan-B trigger menu (`TriggerCondition`, v3 §15.4). **Every trigger reads own-state** — the
 * enemy-reactive conditions (`AirEnemyExists`, `EnemyInZone`) were dropped because the priority-score
 * targeting chain is already enemy-reactive per shot. Unit variants serialize as bare strings; the
 * data-carrying ones are externally tagged (e.g. `{ "HullBelowPct": 5000 }`, basis points).
 */
export type TriggerCondition =
  | "ShieldDown"
  | "AllyLostInZone"
  | "NoTargetsReachable"
  | { HullBelowPct: number } // basis points (bp)
  | { AfterTick: number }; // tick index

// --- String-id newtypes (serde `transparent` → bare strings) ---------------

/** A chassis variant id, e.g. `"Grizzly"` (extensible; a Ruleset key, not an enum). */
export type VariantId = string;
/** An equipment module id, e.g. `"HeavyCannon"` (extensible catalog). */
export type EquipmentId = string;
/** A saved-preset id. */
export type PresetId = string;

// --- Configured, pre-battle structures (camelCase) -------------------------

/** A `when [condition] → set [dial] to [value]` Plan-B trigger. Latches once fired. */
export interface PlanBTrigger {
  slot: PlanBSlot;
  condition: TriggerCondition;
  dial: DialKey;
  planBValue: DialValue;
}

/** A machine's equipment picks. `utilities` is length 3 (or 4 for 4-utility variants), no dupes (V5). */
export interface Loadout {
  weapon: EquipmentId;
  defense: EquipmentId;
  utilities: EquipmentId[];
}

/** The behavior dials a player sets per machine (`BehaviorDials`, v3): targeting chain + movement + stance. */
export interface BehaviorDials {
  targeting: TargetingChain;
  movement: MovementMode;
  stance: Stance;
  /**
   * v3 US3 Adaptive Munitions: an active outgoing damage-type override, latched by a Plan-B
   * `DamageType` value. Absent in every authored/base build (the machine fires its weapon's own type),
   * so it is skipped-when-`None` on the Rust side and optional here.
   */
  damageOverride?: DamageType;
}

/** A configured machine placed in the army (`MachineInstance`). `instanceId` is unique within the army. */
export interface MachineInstance {
  instanceId: number;
  typeId: MachineTypeId;
  variantId: VariantId;
  loadout: Loadout;
  dials: BehaviorDials;
  planB: PlanBTrigger[];
  zone: ZoneId;
}

/**
 * A squad / army: exactly **five** {@link MachineInstance}s placed across the four zones within caps
 * (validated V1–V8 by the engine). This is the `SquadConfig` stored in `squads.config` /
 * `defense_snapshots.config`.
 */
export interface Army {
  machines: MachineInstance[];
}

/** Alias used by the persistence layer for a stored squad's config. */
export type SquadConfig = Army;

/**
 * A custom per-machine-type preset (`Preset` minus identity): the reusable `loadout + dials + planB`
 * a player saves to their library. Stored in `presets.config`; the machine type lives in a scalar column.
 */
export interface PresetConfig {
  loadout: Loadout;
  dials: BehaviorDials;
  planB: PlanBTrigger[];
}

// --- Match result (engine `resolve` summary) -------------------------------

/** Which army won — `A` = attacker (armies[0]), `B` = defender (armies[1]). */
export type Side = "A" | "B";

/** One game's outcome within a best-of-three (`GameResult`). `winner` is null on a draw. */
export interface GameResult {
  winner: Side | null;
  condition: "Conquest" | "Time";
  rewardTier: "Full" | "Lesser";
  durationTicks: number;
}

/** One side's post-match totals (`SideSummary`). `damageDealt` is in milli-units (÷1000 for whole). */
export interface SideSummary {
  damageDealt: number;
  survivors: number;
}

/** A machine's identity within the match (`UnitRef`) — joins a fate/event to `meta.unitOrder`. */
export interface UnitRef {
  side: Side;
  instanceId: number;
}

/**
 * What became of one machine by match end (`Fate`) — an externally-tagged union (camelCase serde):
 * either destroyed at a tick, or survived with a fraction of hull remaining in **basis points**
 * (÷100 for %). Mirrors the Rust `Fate` enum.
 */
export type Fate = { destroyedAtTick: number } | { survivedWithHullPct: number };

/** A machine's final fate keyed by its ref (`MachineFate`). */
export interface MachineFate {
  unit: UnitRef;
  fate: Fate;
}

/** The engine's best-of-three summary (`MatchResult`) — embedded in `Replay.result`. */
export interface MatchResult {
  winner: Side;
  games: GameResult[];
  machineFates: MachineFate[];
  sideA: SideSummary;
  sideB: SideSummary;
  durationTicks: number;
}

/**
 * The admin-editable balance table (`Ruleset`) — the engine's Tier-2 input. **Owned by the engine**;
 * the persistence layer treats it as opaque and passes it to `validate()`/`resolve()` unmodified
 * (constitution P8 — one source of truth, never re-declared in SQL). Feature 12 makes it DB-editable;
 * until then the server loads the engine's default ruleset (`sim/validate.ts`).
 *
 * The **concrete** shape (the content catalog + balance numbers the client derivation/validation
 * read) lives in `sim/ruleset.ts`; it is re-exported here so persistence-layer imports of `Ruleset`
 * are unchanged. See also {@link EffectiveStats} and the pure `deriveEffectiveStats`/`validateArmy`.
 */
export type { Ruleset, EffectiveStats } from './ruleset';
