//! Tier 3 — runtime output: the in-memory [`Replay`] + [`MatchResult`] the engine emits
//! (data-model Tier 3, T013).
//!
//! These are the **engine-friendly** shapes `resolve()` builds as it simulates. The compact
//! *wire* format (positional/columnar, `unitOrder`-keyed, tick-indexed — replay-format contract)
//! is finalized in US5 (T048); it is a serialization of exactly this state, so the two never
//! diverge. Everything here is **integer/enum only**, which is what makes a whole replay
//! serialize to a canonical byte string and hash deterministically (research A5) — the golden
//! test's foundation.

use serde::{Deserialize, Serialize};

use crate::fixed::{Bp, Fixed};
use crate::model::army::Army;
use crate::model::ruleset::RulesetHash;
use crate::model::types::{DialKey, PlanBSlot, ZoneId};

/// The replay wire/format version. Players gate on a supported range; a breaking layout change
/// bumps this and old replays are **regenerated, never migrated** (seed+armies+rulesetHash persist).
pub const CURRENT_FORMAT_VERSION: u16 = 1;

/// Which side of the battle. Index 0 (`A`) is the attacker; `B` is the defender (tie-break winner).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
pub enum Side {
    A,
    B,
}

impl Side {
    /// The opposing side.
    pub fn other(self) -> Side {
        match self {
            Side::A => Side::B,
            Side::B => Side::A,
        }
    }
}

/// A stable reference to one machine across the whole battle: its side + squad index.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitRef {
    pub side: Side,
    /// The machine's `instance_id` within its squad (0..5).
    pub instance_id: u8,
}

/// Best-of-three adaptation policy (an engine *input*, echoed into replay meta).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum Adaptation {
    /// Ranked: identical army + placement across all three games.
    Locked,
    /// Practice / balancer: inputs may vary between games.
    Free,
}

/// Match configuration — part of the engine input and stamped into the replay meta.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchConfig {
    pub adaptation: Adaptation,
    /// Which side is the defender (wins exact-damage ties, §9.3).
    pub defender_side: Side,
    /// Best-of count (3 for v1).
    pub best_of: u8,
}

// ---------------------------------------------------------------------------
// Per-tick state
// ---------------------------------------------------------------------------

/// A machine's rendered state at one tick — exactly what playback draws (cooldowns/dials are
/// engine-internal and not snapshotted). The wire form is the positional row `[hull, shield,
/// zoneIdx, alive]`; this named struct is its in-memory twin.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineSnapshot {
    pub unit: UnitRef,
    pub hull: Fixed,
    pub shield: Fixed,
    pub zone: ZoneId,
    pub alive: bool,
}

/// Which defense layer a hit struck (reconciliation groups damage by layer).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum DamageLayer {
    Shield,
    Hull,
}

/// What a support action did.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum SupportKind {
    Heal,
    ShieldBoost,
    Aura,
}

/// One resolved event within a tick. `Hit`/`Support` carry the magnitudes that must reconcile
/// with [`MatchResult`] totals (SC-002). Externally tagged for a clean, self-describing wire form;
/// variant names stay PascalCase (all fields are single-word, so no `rename_all` is needed). The
/// compact columnar wire encoding (`"t":"hit"`, short keys) is the US5 serialization concern.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum TickEvent {
    /// A weapon fired (drives cadence/animation; no damage implied yet).
    Shot { actor: UnitRef, target: UnitRef },
    /// A shot landed for `dmg` against `layer` (splash hits set `splash = true`).
    Hit {
        actor: UnitRef,
        target: UnitRef,
        dmg: Fixed,
        layer: DamageLayer,
        crit: bool,
        splash: bool,
    },
    /// A shot missed.
    Miss { actor: UnitRef, target: UnitRef },
    /// A machine was destroyed this tick.
    Death {
        unit: UnitRef,
        killer: Option<UnitRef>,
    },
    /// A machine changed zones.
    Move {
        unit: UnitRef,
        from: ZoneId,
        to: ZoneId,
    },
    /// A Plan-B trigger latched (flipped `dial` in `slot`).
    PlanB {
        unit: UnitRef,
        slot: PlanBSlot,
        dial: DialKey,
    },
    /// A support effect applied `amount` to `target`.
    Support {
        actor: UnitRef,
        target: UnitRef,
        amount: Fixed,
        kind: SupportKind,
    },
}

/// One discrete step of simulated time — a full state snapshot **plus** the events resolved in it
/// (snapshots not deltas → the scrubber seeks by indexing and never re-simulates; SC-002).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tick {
    pub index: u16,
    /// One entry per machine (all 10), in a stable order.
    pub snapshot: Vec<MachineSnapshot>,
    pub events: Vec<TickEvent>,
}

// ---------------------------------------------------------------------------
// Game + match results
// ---------------------------------------------------------------------------

/// How a single game ended.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum WinCondition {
    /// A side was fully destroyed.
    Conquest,
    /// The tick cap was reached with both sides alive → most-damage wins.
    Time,
}

/// The reward tier a win earns.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum RewardTier {
    Full,
    Lesser,
}

/// The outcome of one game.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameResult {
    /// `None` only for a theoretical double-KO before the tie-break resolves; normally `Some`.
    pub winner: Option<Side>,
    pub condition: WinCondition,
    pub reward_tier: RewardTier,
    pub duration_ticks: u16,
}

/// One game's full tick stream + its result.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameReplay {
    /// Tick-indexed: `ticks[n].index == n` — the O(1) seek primitive.
    pub ticks: Vec<Tick>,
    pub game_result: GameResult,
}

/// What became of one machine by match end.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Fate {
    DestroyedAtTick(u16),
    /// Survived with this fraction of hull remaining (bp).
    SurvivedWithHullPct(Bp),
}

/// A machine's final fate, keyed by its ref.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineFate {
    pub unit: UnitRef,
    pub fate: Fate,
}

/// One side's aggregate totals across the match.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SideSummary {
    pub damage_dealt: Fixed,
    pub survivors: u8,
}

/// The match summary — reconstructable from the tick stream (SC-002): every total must equal the
/// sum of the corresponding events.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResult {
    pub winner: Side,
    /// One entry per game played (1–3).
    pub games: Vec<GameResult>,
    pub machine_fates: Vec<MachineFate>,
    pub side_a: SideSummary,
    pub side_b: SideSummary,
    /// Total ticks across all games.
    pub duration_ticks: u16,
}

impl MatchResult {
    /// One side's summary.
    pub fn side(&self, side: Side) -> &SideSummary {
        match side {
            Side::A => &self.side_a,
            Side::B => &self.side_b,
        }
    }
}

// ---------------------------------------------------------------------------
// Replay (top-level output)
// ---------------------------------------------------------------------------

/// The engine's primary output (FR-021): the serializable, random-access tick stream + the
/// summary. Persisted whole; the client plays it back; the balancer aggregates it.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Replay {
    pub format_version: u16,
    pub seed: u64,
    /// Provenance of the balance table used (never used to re-derive — replays persist inputs).
    pub ruleset_hash: RulesetHash,
    pub match_config: MatchConfig,
    /// The exact inputs, persisted for debug/repair + regenerate-not-migrate.
    pub armies: [Army; 2],
    /// One [`GameReplay`] per game in the Bo3 (1–3).
    pub games: Vec<GameReplay>,
    pub result: MatchResult,
}

impl Replay {
    /// A stable, portable content digest (BLAKE3 hex over canonical JSON) — identical on native
    /// and wasm32 (P6). This is what the golden-hash determinism test pins (research A5, T015).
    pub fn digest(&self) -> String {
        let bytes = serde_json::to_vec(self).expect("Replay is always serializable");
        blake3::hash(&bytes).to_hex().to_string()
    }

    /// Sum of every `Hit` event's damage attributed to `side`'s actors, across all games. The
    /// reconciliation invariant (SC-002): this must equal `result.side(side).damage_dealt`.
    pub fn total_hit_damage_by(&self, side: Side) -> Fixed {
        let mut total = Fixed::ZERO;
        for game in &self.games {
            for tick in &game.ticks {
                for ev in &tick.events {
                    if let TickEvent::Hit { actor, dmg, .. } = ev {
                        if actor.side == side {
                            total = total.saturating_add(*dmg);
                        }
                    }
                }
            }
        }
        total
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit(side: Side, id: u8) -> UnitRef {
        UnitRef {
            side,
            instance_id: id,
        }
    }

    fn tiny_replay() -> Replay {
        let a = unit(Side::A, 0);
        let b = unit(Side::B, 0);
        let tick0 = Tick {
            index: 0,
            snapshot: vec![
                MachineSnapshot {
                    unit: a,
                    hull: Fixed::from_int(1700),
                    shield: Fixed::ZERO,
                    zone: ZoneId::Front,
                    alive: true,
                },
                MachineSnapshot {
                    unit: b,
                    hull: Fixed::from_int(650),
                    shield: Fixed::ZERO,
                    zone: ZoneId::Front,
                    alive: true,
                },
            ],
            events: vec![
                TickEvent::Shot { actor: a, target: b },
                TickEvent::Hit {
                    actor: a,
                    target: b,
                    dmg: Fixed::from_int(172),
                    layer: DamageLayer::Hull,
                    crit: false,
                    splash: false,
                },
            ],
        };
        let game = GameReplay {
            ticks: vec![tick0],
            game_result: GameResult {
                winner: Some(Side::A),
                condition: WinCondition::Conquest,
                reward_tier: RewardTier::Full,
                duration_ticks: 1,
            },
        };
        Replay {
            format_version: CURRENT_FORMAT_VERSION,
            seed: 0xDEAD_BEEF,
            ruleset_hash: RulesetHash("abc123".into()),
            match_config: MatchConfig {
                adaptation: Adaptation::Locked,
                defender_side: Side::B,
                best_of: 3,
            },
            armies: [Army { machines: vec![] }, Army { machines: vec![] }],
            games: vec![game],
            result: MatchResult {
                winner: Side::A,
                games: vec![GameResult {
                    winner: Some(Side::A),
                    condition: WinCondition::Conquest,
                    reward_tier: RewardTier::Full,
                    duration_ticks: 1,
                }],
                machine_fates: vec![
                    MachineFate {
                        unit: a,
                        fate: Fate::SurvivedWithHullPct(9_000),
                    },
                    MachineFate {
                        unit: b,
                        fate: Fate::DestroyedAtTick(1),
                    },
                ],
                side_a: SideSummary {
                    damage_dealt: Fixed::from_int(172),
                    survivors: 1,
                },
                side_b: SideSummary {
                    damage_dealt: Fixed::ZERO,
                    survivors: 0,
                },
                duration_ticks: 1,
            },
        }
    }

    #[test]
    fn replay_round_trips() {
        let r = tiny_replay();
        let json = serde_json::to_string(&r).unwrap();
        let back: Replay = serde_json::from_str(&json).unwrap();
        assert_eq!(r, back);
    }

    #[test]
    fn digest_is_stable_and_sensitive() {
        let r = tiny_replay();
        assert_eq!(r.digest(), r.digest(), "same replay → same digest");
        assert_eq!(r.digest().len(), 64);

        let mut r2 = tiny_replay();
        r2.seed += 1;
        assert_ne!(r.digest(), r2.digest(), "a changed seed changes the digest");
    }

    /// The SC-002 reconciliation shape: summed Hit damage equals the side's result total.
    #[test]
    fn hit_damage_reconciles_with_result_total() {
        let r = tiny_replay();
        assert_eq!(
            r.total_hit_damage_by(Side::A),
            r.result.side(Side::A).damage_dealt
        );
        assert_eq!(r.total_hit_damage_by(Side::B), Fixed::ZERO);
    }

    #[test]
    fn event_wire_is_externally_tagged() {
        let ev = TickEvent::Hit {
            actor: unit(Side::A, 0),
            target: unit(Side::B, 2),
            dmg: Fixed::from_int(10),
            layer: DamageLayer::Shield,
            crit: true,
            splash: false,
        };
        let v = serde_json::to_value(ev).unwrap();
        assert!(v.get("Hit").is_some(), "externally tagged by variant name");
        assert_eq!(v["Hit"]["layer"], serde_json::json!("Shield"));
        assert_eq!(v["Hit"]["dmg"], serde_json::json!(10_000)); // milli-units
    }

    #[test]
    fn side_other_flips() {
        assert_eq!(Side::A.other(), Side::B);
        assert_eq!(Side::B.other(), Side::A);
    }
}
