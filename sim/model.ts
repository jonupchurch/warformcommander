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

// --- Closed enums (bare-string serialization) ------------------------------

/** The seven machine classes — a closed set (`MachineTypeId`, model/types.rs). */
export type MachineTypeId =
  | "HeavyTank"
  | "LightTank"
  | "Mech"
  | "AttackHeli"
  | "RocketArtillery"
  | "Artillery"
  | "RearSupport";

/** The four battlefield rows (`ZoneId`). Air is separate from the ground rows. */
export type ZoneId = "Air" | "Front" | "Middle" | "Rear";

/** Target-row sub-pick (`TargetRow`). `Fullest`/`Weakest` are capability-gated. */
export type TargetRow = "FrontReachable" | "LastReachable" | "FullestRow" | "WeakestRow";

/** Target-rule sub-pick (`TargetRule`). `TargetSupport`/`TargetAir`/`SmartCounter` are gated. */
export type TargetRule =
  | "FocusFire"
  | "DisperseFire"
  | "Nearest"
  | "Weakest"
  | "BiggestThreat"
  | "TargetSupport"
  | "TargetAir"
  | "SmartCounter";

/** Energy allocation dial (`EnergyMode`). `Overdrive`/`Fortify`/`Adaptive` are gated. */
export type EnergyMode = "Offense" | "Balanced" | "Defense" | "Overdrive" | "Fortify" | "Adaptive";

/** Movement dial (`MovementMode`). `Kite`/`Reposition`/`Escort` are gated. */
export type MovementMode = "Hold" | "Advance" | "FallBack" | "Kite" | "Reposition" | "Escort";

/** Stance dial (`Stance`). `Protector`/`Opportunist` and support flavors are gated. */
export type Stance =
  | "Aggressive"
  | "Neutral"
  | "Defensive"
  | "Protector"
  | "Opportunist"
  | "Triage"
  | "Sustain"
  | "Empower";

/** Which dial a Plan-B trigger flips (`DialKey`). */
export type DialKey = "TargetRow" | "TargetRule" | "Energy" | "Movement" | "Stance";

/** Plan-B precedence slot (`PlanBSlot`). Slot 1 wins over Slot 2 on the same dial. */
export type PlanBSlot = "Slot1" | "Slot2";

/**
 * A dial-typed value a Plan-B trigger latches (`DialValue`, externally tagged — e.g.
 * `{ "Energy": "Overdrive" }`).
 */
export type DialValue =
  | { TargetRow: TargetRow }
  | { TargetRule: TargetRule }
  | { Energy: EnergyMode }
  | { Movement: MovementMode }
  | { Stance: Stance };

/**
 * The §8.2 Plan-B trigger menu (`TriggerCondition`). Unit variants serialize as bare strings; the
 * data-carrying ones are externally tagged (e.g. `{ "HullBelowPct": 5000 }`, basis points).
 */
export type TriggerCondition =
  | "ShieldDown"
  | "AllyLostInZone"
  | "AirEnemyExists"
  | { HullBelowPct: number } // basis points (bp)
  | { AfterTick: number } // tick index
  | { EnemyInZone: ZoneId };

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

/** The five behavior dials a player sets per machine (`BehaviorDials`). */
export interface BehaviorDials {
  targetRow: TargetRow;
  targetRule: TargetRule;
  energy: EnergyMode;
  movement: MovementMode;
  stance: Stance;
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

/** The engine's best-of-three summary (`MatchResult`) — embedded in `Replay.result`. */
export interface MatchResult {
  winner: Side;
  games: GameResult[];
  machineFates: unknown[];
  sideA: SideSummary;
  sideB: SideSummary;
  durationTicks: number;
}

/**
 * The admin-editable balance table (`Ruleset`) — the engine's Tier-2 input. **Owned by the engine**;
 * the persistence layer treats it as opaque and passes it to `validate()`/`resolve()` unmodified
 * (constitution P8 — one source of truth, never re-declared in SQL). Feature 12 makes it DB-editable;
 * until then the server loads the engine's default ruleset (`sim/validate.ts`).
 */
export interface Ruleset {
  machineTypes: unknown;
  chassis: unknown;
  variants: unknown;
  equipment: unknown;
  damageMatrix: unknown;
  cadenceTicks: unknown;
  airMods: unknown;
  globals: unknown;
}
