//! The deterministic simulation core (US1) — the fixed-tick loop that turns two armies + a
//! ruleset + a seed into a per-game tick stream.
//!
//! Determinism spine (research A4): single-threaded, integer/fixed-point only, ordered iteration
//! (no `HashMap`), a fixed actor order, a fixed per-shot RNG draw order, and a fixed damage-pipeline
//! order. Given identical inputs the whole `Replay` is byte-identical on native and wasm32 (P6).
//!
//! Submodules: [`target`] (row-based reach + dial picks), [`damage`] (the per-hit pipeline),
//! [`behavior`] (Plan-B latch, movement, energy), [`outcome`] (termination + result assembly).

pub mod behavior;
pub mod damage;
pub mod outcome;
pub mod target;

use std::collections::BTreeSet;

use crate::fixed::{Bp, Fixed};
use crate::model::army::{derive_effective_stats, Army, DerivationError, EffectiveStats};
use crate::model::ruleset::Ruleset;
use crate::model::types::{
    BehaviorDials, DamageType, MachineTypeId, PlanBSlot, PlanBTrigger, ReachTag, SupportRange,
    VariantId, ZoneId,
};
use crate::replay::{
    GameReplay, GameResult, MachineSnapshot, MatchConfig, Side, SupportKind, Tick, TickEvent,
    UnitRef,
};
use crate::rng::Rng;

/// A live combatant — effective stats (derived once) + mutable battle state. Engine-internal;
/// only the fields the renderer needs are snapshotted into the replay.
pub(crate) struct Combatant {
    pub unit: UnitRef,
    /// Carried for the replay's `unitOrder` dictionary (populated in US5/T048); not read by the sim.
    #[allow(dead_code)]
    pub type_id: MachineTypeId,
    #[allow(dead_code)]
    pub variant_id: VariantId,
    pub stats: EffectiveStats,
    /// Active dials (mutated by Plan-B latches); recomputed from `base_dials` + `fired` each tick.
    pub base_dials: BehaviorDials,
    pub dials: BehaviorDials,
    pub plan_b: Vec<PlanBTrigger>,
    pub fired: BTreeSet<PlanBSlot>,
    pub can_fire_from_rear: bool,
    pub hull: Fixed,
    pub max_hull: Fixed,
    pub shield: Fixed,
    pub ticks_since_hit: u16,
    pub cooldown: u16,
    pub move_cooldown: u16,
    pub zone: ZoneId,
    pub alive: bool,
    pub damage_dealt: Fixed,
    pub destroyed_at: Option<u16>,
}

impl Combatant {
    /// Current hull as a fraction of max (bp) — for the `SurvivedWithHullPct` fate + WeakestRow.
    pub fn hull_pct(&self) -> Bp {
        if self.max_hull.milli() <= 0 {
            0
        } else {
            ((self.hull.milli() as i128 * crate::fixed::BP_ONE as i128)
                / self.max_hull.milli() as i128) as Bp
        }
    }
}

/// The compact, `Copy` attacking profile pulled off a combatant before targets are mutated (avoids
/// borrow conflicts + cloning the capability set each shot).
#[derive(Clone, Copy)]
pub(crate) struct AttackProfile {
    pub actor: UnitRef,
    pub damage: Fixed,
    pub damage_type: DamageType,
    pub native_match: bool,
    pub crit_chance: Bp,
    pub crit_mult: Bp,
    pub accuracy: Bp,
    pub penetration: Bp,
    pub splash: Bp,
    pub reach: ReachTag,
    /// Outgoing-damage multiplier from the active energy dial (bp).
    pub energy_mult: Bp,
}

/// Cadence tier → cooldown ticks, via the ruleset table.
fn cooldown_ticks(stats: &EffectiveStats, ruleset: &Ruleset) -> u16 {
    ruleset.cadence_ticks.ticks(stats.cadence)
}

/// Build the 10 combatants (side A then B, in instance order) from the two armies + ruleset.
pub(crate) fn build_combatants(
    armies: &[Army; 2],
    ruleset: &Ruleset,
) -> Result<Vec<Combatant>, DerivationError> {
    let mut out = Vec::with_capacity(10);
    for (side_idx, army) in armies.iter().enumerate() {
        let side = if side_idx == 0 { Side::A } else { Side::B };
        for m in &army.machines {
            let stats = derive_effective_stats(m, ruleset)?;
            let mtype = ruleset.machine_type(m.type_id);
            let can_fire_from_rear = mtype.map(|t| t.can_fire_from_rear).unwrap_or(false);
            out.push(Combatant {
                unit: UnitRef {
                    side,
                    instance_id: m.instance_id,
                },
                type_id: m.type_id,
                variant_id: m.variant_id.clone(),
                base_dials: m.dials,
                dials: m.dials,
                plan_b: m.plan_b.clone(),
                fired: BTreeSet::new(),
                can_fire_from_rear,
                hull: stats.hull,
                max_hull: stats.hull,
                shield: stats.shield_cap,
                ticks_since_hit: 0,
                cooldown: 0,
                move_cooldown: 0,
                zone: m.zone,
                alive: true,
                damage_dealt: Fixed::ZERO,
                destroyed_at: None,
                stats,
            });
        }
    }
    Ok(out)
}

/// Indices of every living combatant, in deterministic acting order: `(zone, side, instance_id)`.
fn acting_order(combatants: &[Combatant]) -> Vec<usize> {
    let mut idx: Vec<usize> = (0..combatants.len())
        .filter(|&i| combatants[i].alive)
        .collect();
    idx.sort_by_key(|&i| {
        let c = &combatants[i];
        (c.zone, c.unit.side, c.unit.instance_id)
    });
    idx
}

/// Count living combatants on a side.
fn survivors(combatants: &[Combatant], side: Side) -> u8 {
    combatants
        .iter()
        .filter(|c| c.unit.side == side && c.alive)
        .count() as u8
}

/// Ground-zone adjacency for support range (`Front↔Middle↔Rear`; Air is not support-adjacent).
fn support_zones(range: SupportRange, from: ZoneId) -> Vec<ZoneId> {
    match range {
        SupportRange::OwnZone => vec![from],
        SupportRange::OwnPlusAdjacent => match from {
            ZoneId::Front => vec![ZoneId::Front, ZoneId::Middle],
            ZoneId::Middle => vec![ZoneId::Front, ZoneId::Middle, ZoneId::Rear],
            ZoneId::Rear => vec![ZoneId::Middle, ZoneId::Rear],
            ZoneId::Air => vec![ZoneId::Air],
        },
    }
}

/// Snapshot all combatants (stable index order) for the current tick.
fn snapshot(combatants: &[Combatant]) -> Vec<MachineSnapshot> {
    combatants
        .iter()
        .map(|c| MachineSnapshot {
            unit: c.unit,
            hull: c.hull.max_zero(),
            shield: c.shield.max_zero(),
            zone: c.zone,
            alive: c.alive,
        })
        .collect()
}

/// Build combatants, run one game, and return the replay **plus the final combatant state** (so the
/// match loop can read damage dealt, survivors, and fates). One game of a Bo3 (US4).
pub(crate) fn play_game(
    armies: &[Army; 2],
    ruleset: &Ruleset,
    seed: u64,
    config: &MatchConfig,
) -> Result<(GameReplay, Vec<Combatant>), DerivationError> {
    let mut combatants = build_combatants(armies, ruleset)?;
    let mut rng = Rng::from_seed(seed);
    let game = run_game(&mut combatants, ruleset, &mut rng, config);
    Ok((game, combatants))
}

/// Run one game to termination and return its replay. The single-seed [`Rng`] threads through the
/// whole game; the caller advances the seed per game for a Bo3 (US4).
pub(crate) fn run_game(
    combatants: &mut [Combatant],
    ruleset: &Ruleset,
    rng: &mut Rng,
    config: &MatchConfig,
) -> GameReplay {
    let tick_cap = ruleset.globals.tick_cap;
    let mut ticks: Vec<Tick> = Vec::new();

    let mut game_over: Option<GameResult> = None;
    for tick in 0..tick_cap {
        let mut events: Vec<TickEvent> = Vec::new();

        // 1. Per-tick upkeep: cooldowns tick down, shields regen after their delay.
        for c in combatants.iter_mut().filter(|c| c.alive) {
            c.cooldown = c.cooldown.saturating_sub(1);
            c.ticks_since_hit = c.ticks_since_hit.saturating_add(1);
            if c.shield < c.stats.shield_cap
                && c.ticks_since_hit >= c.stats.shield_delay
                && c.stats.shield_regen.milli() > 0
            {
                c.shield = c
                    .shield
                    .saturating_add(c.stats.shield_regen)
                    .min(c.stats.shield_cap);
            }
        }

        // 2. Behavior: Plan-B latches, then movement (both deterministic, no RNG).
        behavior::apply_behavior(combatants, tick, &mut events);

        // 3. Support heals (no RNG; before offense so a heal can save a unit this tick).
        resolve_support(combatants, &mut events);

        // 4. Offense: each ready combatant fires once, in acting order, using current state.
        for i in acting_order(combatants) {
            if !combatants[i].alive || combatants[i].cooldown > 0 {
                continue;
            }
            // Support machines heal (handled above), they do not fire a weapon.
            if combatants[i].stats.family == crate::model::types::DamageFamily::Support {
                continue;
            }
            if let Some(target_idx) = target::select_target(combatants, i) {
                damage::resolve_attack(combatants, i, target_idx, tick, ruleset, rng, &mut events);
                combatants[i].cooldown = cooldown_ticks(&combatants[i].stats, ruleset);
            }
        }

        // 5. Record the tick.
        ticks.push(Tick {
            index: tick,
            snapshot: snapshot(combatants),
            events,
        });

        // 6. Termination: a side wiped → Conquest.
        let a_alive = survivors(combatants, Side::A);
        let b_alive = survivors(combatants, Side::B);
        if a_alive == 0 || b_alive == 0 {
            game_over = Some(outcome::conquest_result(combatants, tick + 1));
            break;
        }
    }

    let game_result = game_over
        .unwrap_or_else(|| outcome::time_result(combatants, tick_cap, config.defender_side));

    GameReplay { ticks, game_result }
}

/// Each living support machine heals the most-wounded ally in range by its support power.
fn resolve_support(combatants: &mut [Combatant], events: &mut Vec<TickEvent>) {
    let n = combatants.len();
    for i in 0..n {
        let (power, range, side, zone, actor) = {
            let c = &combatants[i];
            match (c.alive, c.stats.support_power) {
                (true, Some(p)) if p.milli() > 0 => (
                    p,
                    c.stats.support_range.unwrap_or(SupportRange::OwnZone),
                    c.unit.side,
                    c.zone,
                    c.unit,
                ),
                _ => continue,
            }
        };
        let zones = support_zones(range, zone);

        // Pick the most-wounded living ally in range (tie: zone, instance_id).
        let mut best: Option<usize> = None;
        for j in 0..n {
            let a = &combatants[j];
            if !a.alive || a.unit.side != side || j == i {
                continue;
            }
            if a.hull >= a.max_hull || !zones.contains(&a.zone) {
                continue;
            }
            best = match best {
                None => Some(j),
                Some(b) => {
                    let cur = &combatants[b];
                    let better = a.hull_pct() < cur.hull_pct()
                        || (a.hull_pct() == cur.hull_pct()
                            && (a.zone, a.unit.instance_id) < (cur.zone, cur.unit.instance_id));
                    if better {
                        Some(j)
                    } else {
                        Some(b)
                    }
                }
            };
        }

        if let Some(j) = best {
            let target = combatants[j].unit;
            let missing = combatants[j].max_hull.saturating_sub(combatants[j].hull);
            let heal = power.min(missing);
            combatants[j].hull = combatants[j].hull.saturating_add(heal);
            events.push(TickEvent::Support {
                actor,
                target,
                amount: heal,
                kind: SupportKind::Heal,
            });
        }
    }
}
