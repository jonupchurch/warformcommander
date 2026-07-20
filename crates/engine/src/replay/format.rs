//! The **wire** replay format (US5, T048/T049) — the compact, random-access JSON the client and
//! balancer consume (replay-format contract).
//!
//! It is a *serialization* of the in-memory [`Replay`](super::Replay): **positional/columnar** rows
//! keyed by a `unitOrder` dictionary, **tick-indexed** (`snapshots[tick]`, `events[tick]` are O(1)
//! array lookups → the scrubber seeks by indexing, never re-simulates, SC-002), with an integer
//! `formatVersion` gate and a `meta` block carrying seed + rulesetHash + matchConfig + armies so an
//! old replay can be **regenerated, not migrated**. Snapshot rows are `[hull, shield, zoneIdx,
//! alive]` in fixed-point milli-units; the TS reader ([`sim/replay-reader.ts`]) is the pure consumer.

use std::ops::RangeInclusive;

use serde::{Deserialize, Serialize};

use crate::model::army::Army;
use crate::model::ruleset::{Ruleset, RulesetHash};
use crate::model::types::{DialKey, MachineTypeId, PlanBSlot, VariantId, ZoneId};

use super::{
    DamageLayer, GameResult, MatchConfig, MatchResult, Replay, Side, SupportKind, TickEvent, UnitRef,
};

/// Wire versions this build can read (inclusive). A replay outside the range is rejected, not
/// mis-rendered.
pub const SUPPORTED_FORMAT_VERSIONS: RangeInclusive<u16> = 1..=1;

/// Zone → the compact index used in snapshot rows + move events (`0=Air, 1=Front, 2=Middle, 3=Rear`).
pub fn zone_index(z: ZoneId) -> u8 {
    match z {
        ZoneId::Air => 0,
        ZoneId::Front => 1,
        ZoneId::Middle => 2,
        ZoneId::Rear => 3,
    }
}

/// The top-level wire replay.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireReplay {
    pub format_version: u16,
    pub meta: WireMeta,
    pub games: Vec<WireGame>,
    pub result: MatchResult,
}

/// Everything needed to render, filter, and regenerate — but not per-tick.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireMeta {
    /// `u64` seed as a string (JSON-safe; JS numbers can't hold a full u64).
    pub seed: String,
    pub ruleset_hash: RulesetHash,
    pub tick_rate: u16,
    pub tick_cap: u16,
    pub match_config: MatchConfig,
    /// The column dictionary — row *i* of every snapshot is this unit.
    pub unit_order: Vec<WireUnit>,
    /// The exact inputs, for debug/repair + regenerate-not-migrate.
    pub armies: [Army; 2],
}

/// One column of the positional snapshot rows.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireUnit {
    pub side: Side,
    pub instance_id: u8,
    pub type_id: MachineTypeId,
    pub variant_id: VariantId,
}

/// A positional snapshot row: `[hull, shield, zoneIdx, alive]` (hull/shield in milli-units).
pub type SnapshotRow = [i64; 4];

/// One game: its result + tick-indexed positional snapshots and compact events.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireGame {
    pub game_result: GameResult,
    /// `snapshots[tick][col]` — O(1) seek; `col` indexes `meta.unitOrder`.
    pub snapshots: Vec<Vec<SnapshotRow>>,
    /// `events[tick]` — the events resolved that tick.
    pub events: Vec<Vec<WireEvent>>,
}

impl WireGame {
    /// The `[hull, shield, zoneIdx, alive]` row for a unit column at a tick — the O(1) seek.
    pub fn row(&self, tick: usize, col: usize) -> Option<SnapshotRow> {
        self.snapshots.get(tick).and_then(|t| t.get(col)).copied()
    }
}

/// A compact tick event — actor/target are **indices into `meta.unitOrder`**; magnitudes are milli.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum WireEvent {
    Shot { a: u8, d: u8 },
    Hit {
        a: u8,
        d: u8,
        dmg: i64,
        layer: DamageLayer,
        crit: bool,
        splash: bool,
    },
    Miss { a: u8, d: u8 },
    Death { u: u8, k: Option<u8> },
    Move { u: u8, from: u8, to: u8 },
    Planb { u: u8, slot: PlanBSlot, dial: DialKey },
    Support { a: u8, d: u8, amt: i64, kind: SupportKind },
}

/// Convert the in-memory [`Replay`] to its compact wire form. `ruleset` supplies the `tickRate`/
/// `tickCap` meta (they are ruleset globals, not stored on the replay).
pub fn to_wire(replay: &Replay, ruleset: &Ruleset) -> WireReplay {
    // Column dictionary: side A machines then side B, in squad order (matches snapshot order).
    let mut unit_order = Vec::with_capacity(10);
    for (side, army) in [(Side::A, &replay.armies[0]), (Side::B, &replay.armies[1])] {
        for m in &army.machines {
            unit_order.push(WireUnit {
                side,
                instance_id: m.instance_id,
                type_id: m.type_id,
                variant_id: m.variant_id.clone(),
            });
        }
    }
    let col_of = |u: UnitRef| -> u8 {
        unit_order
            .iter()
            .position(|w| w.side == u.side && w.instance_id == u.instance_id)
            .unwrap_or(0) as u8
    };

    let games = replay
        .games
        .iter()
        .map(|game| {
            let snapshots = game
                .ticks
                .iter()
                .map(|tick| {
                    let mut rows = vec![[0i64; 4]; unit_order.len()];
                    for s in &tick.snapshot {
                        let col = col_of(s.unit) as usize;
                        rows[col] = [
                            s.hull.milli(),
                            s.shield.milli(),
                            zone_index(s.zone) as i64,
                            s.alive as i64,
                        ];
                    }
                    rows
                })
                .collect();
            let events = game
                .ticks
                .iter()
                .map(|tick| tick.events.iter().map(|e| wire_event(e, &col_of)).collect())
                .collect();
            WireGame {
                game_result: game.game_result,
                snapshots,
                events,
            }
        })
        .collect();

    WireReplay {
        format_version: replay.format_version,
        meta: WireMeta {
            seed: replay.seed.to_string(),
            ruleset_hash: replay.ruleset_hash.clone(),
            tick_rate: ruleset.globals.tick_rate,
            tick_cap: ruleset.globals.tick_cap,
            match_config: replay.match_config,
            unit_order,
            armies: replay.armies.clone(),
        },
        games,
        result: replay.result.clone(),
    }
}

fn wire_event(e: &TickEvent, col_of: &impl Fn(UnitRef) -> u8) -> WireEvent {
    match *e {
        TickEvent::Shot { actor, target } => WireEvent::Shot {
            a: col_of(actor),
            d: col_of(target),
        },
        TickEvent::Hit {
            actor,
            target,
            dmg,
            layer,
            crit,
            splash,
        } => WireEvent::Hit {
            a: col_of(actor),
            d: col_of(target),
            dmg: dmg.milli(),
            layer,
            crit,
            splash,
        },
        TickEvent::Miss { actor, target } => WireEvent::Miss {
            a: col_of(actor),
            d: col_of(target),
        },
        TickEvent::Death { unit, killer } => WireEvent::Death {
            u: col_of(unit),
            k: killer.map(col_of),
        },
        TickEvent::Move { unit, from, to } => WireEvent::Move {
            u: col_of(unit),
            from: zone_index(from),
            to: zone_index(to),
        },
        TickEvent::PlanB { unit, slot, dial } => WireEvent::Planb {
            u: col_of(unit),
            slot,
            dial,
        },
        TickEvent::Support {
            actor,
            target,
            amount,
            kind,
        } => WireEvent::Support {
            a: col_of(actor),
            d: col_of(target),
            amt: amount.milli(),
            kind,
        },
    }
}

/// Is a wire version renderable by this build?
pub fn is_supported(version: u16) -> bool {
    SUPPORTED_FORMAT_VERSIONS.contains(&version)
}
