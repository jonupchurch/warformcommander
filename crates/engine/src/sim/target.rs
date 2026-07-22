//! Targeting (US1, T021) — row-based reach + the Target Row / Target Rule dial sub-picks, with
//! fully deterministic tie-breaks (`zone order → instance_id`, FR-014, §4/§8.1).
//!
//! Reach is governed by the **firing unit's row** (stat block §4): Front → nearest occupied enemy
//! ground row (collapsing forward); Middle → enemy Front+Middle (Rear only once both clear); Rear →
//! nothing unless the unit fires indirectly (Artillery / Rocket-Artillery). Special weapon reach
//! tags override: `AnyGround`/`Deep` reach any ground row from any row; `Air` (a SAM) reaches enemy
//! air while any is present, and bombards ground once the skies are clear (never idles).
//!
//! An **air-capable** unit (heli, SAM rocket-artillery) additionally reaches enemy air whenever any is
//! present; because `ZoneId::Air` sorts frontmost, the default Target Row engages air **before** ground
//! (air-first — clear the skies, then bomb) — a non-AA weapon hitting air only at the plink rate.

use crate::model::ruleset::Ruleset;
use crate::model::types::{ReachTag, TargetRow, TargetRule, ZoneId};
use crate::replay::Side;

use super::Combatant;

/// Per-tick **anti-air fire discipline**. Air-first targeting is right when the skies hold a real
/// threat, but without a cap a *single* cheap aircraft monopolises an entire air-defence network:
/// every SAM is locked onto it ([`ReachTag::Air`] engages air exclusively) and every flak platform is
/// pulled off the ground fight, so bringing more AA made an army *weaker* against a one-aircraft
/// splash. This budgets air engagements at `aa_focus_per_air` attackers per living enemy aircraft;
/// attackers past the budget treat air as unreachable and fight on the ground as usual.
pub(crate) struct AirFocus {
    per_air: u32,
    /// Attackers already committed to an air target this tick, indexed by attacking side.
    committed: [u32; 2],
}

impl AirFocus {
    pub(crate) fn new(per_air: u32) -> Self {
        AirFocus {
            per_air,
            committed: [0, 0],
        }
    }

    fn slot(side: Side) -> usize {
        match side {
            Side::A => 0,
            Side::B => 1,
        }
    }

    /// Is there budget left for `side` to engage the air above `enemy_side`? Budget tracks the
    /// *living* enemy air count, so it shrinks as aircraft are shot down within the tick.
    fn has_budget(&self, combatants: &[Combatant], side: Side, enemy_side: Side) -> bool {
        let enemy_air = combatants
            .iter()
            .filter(|c| c.alive && c.unit.side == enemy_side && c.zone == ZoneId::Air)
            .count() as u32;
        self.committed[Self::slot(side)] < enemy_air.saturating_mul(self.per_air)
    }

    fn commit(&mut self, side: Side) {
        self.committed[Self::slot(side)] += 1;
    }
}

/// Pick the target index for combatant `att_idx`, or `None` if nothing is reachable.
///
/// `focus` applies the per-tick anti-air engagement budget and records this attacker's commitment;
/// pass `None` for a read-only probe (e.g. the stalemate check), which neither caps nor consumes.
pub(crate) fn select_target(
    combatants: &[Combatant],
    att_idx: usize,
    ruleset: &Ruleset,
    focus: Option<&mut AirFocus>,
) -> Option<usize> {
    let att = &combatants[att_idx];
    let side = att.unit.side;
    let enemy_side = side.other();

    let air_allowed = match &focus {
        Some(f) => f.has_budget(combatants, side, enemy_side),
        None => true,
    };

    // 1. Reachable living enemies (by reach rules, and the air budget).
    let reachable = reachable_enemies(combatants, att_idx, enemy_side, air_allowed);
    if reachable.is_empty() {
        return None;
    }

    // 2. Target Row (a): narrow to one row.
    let row = pick_row(combatants, &reachable, att.dials.target_row);

    // 2b. Stance aggro tiers (v2): narrow the row to the units drawn first — Aggressive/Protector
    // ahead of Neutral, Defensive last — and let a Protector in an adjacent zone intercept. Applied
    // *before* the Target Rule so it works with all eight rules (research R5).
    let row = narrow_by_stance(combatants, &reachable, &row, att, ruleset);

    // 3. Target Rule (b): pick the unit within that row.
    let chosen = pick_unit(combatants, &row, att);

    // 4. Spend a slot of the air budget if this attacker actually engaged the skies.
    if combatants[chosen].zone == ZoneId::Air {
        if let Some(f) = focus {
            f.commit(side);
        }
    }
    Some(chosen)
}

/// Which enemy ground zones (and whether air) this attacker can reach from its current row.
fn reach_zones(att: &Combatant, occupied: &Occupancy, air_allowed: bool) -> (Vec<ZoneId>, bool) {
    // `air_allowed` folds in the per-tick anti-air budget (see [`AirFocus`]): once the skies are
    // already covered by enough friendly fire, this attacker treats air as out of reach and fights on
    // the ground, rather than piling onto an aircraft that is already being handled.
    let can_air = att.stats.can_target_air && air_allowed;
    let ground = [ZoneId::Front, ZoneId::Middle, ZoneId::Rear];
    let occ = |z: ZoneId| occupied.has(z);

    match att.stats.reach {
        // AA weapon (SAM rocket-artillery): engages enemy air *exclusively* while any is present — true
        // air-first, independent of the Target Row dial. Once the skies are clear (or its share of the
        // air budget is spent) it depresses its launchers and bombards ground rather than sitting idle.
        ReachTag::Air => {
            if occ(ZoneId::Air) && can_air {
                (vec![], true)
            } else {
                (ground.into_iter().filter(|&z| occ(z)).collect(), false)
            }
        }
        // Indirect / long: any occupied ground row from any row.
        ReachTag::AnyGround | ReachTag::Deep => {
            let zones: Vec<ZoneId> = ground.into_iter().filter(|&z| occ(z)).collect();
            // Air-FIRST for an air-capable weapon: air is always a candidate when enemy air is present,
            // and since `ZoneId::Air` sorts frontmost the default Target Row (FrontReachable) picks it
            // ahead of any ground row — so the unit clears the skies first, then turns to ground. A
            // non-AA weapon still hits air only at the "plink" rate (air_mods); a ground unit
            // (`can_air == false`) never reaches air. With no enemy air present, air contributes
            // nothing and the unit engages ground as before.
            let air = can_air;
            (zones, air)
        }
        // Direct fire: the firing row governs.
        ReachTag::Nearest | ReachTag::FrontMid => {
            let zones = match att.zone {
                // A unit in the air with a direct weapon (unusual) engages any ground row.
                ZoneId::Air => ground.into_iter().filter(|&z| occ(z)).collect(),
                ZoneId::Front => nearest_occupied(occupied).into_iter().collect(),
                ZoneId::Middle => {
                    let fm: Vec<ZoneId> = [ZoneId::Front, ZoneId::Middle]
                        .into_iter()
                        .filter(|&z| occ(z))
                        .collect();
                    if !fm.is_empty() {
                        fm
                    } else if occ(ZoneId::Rear) {
                        vec![ZoneId::Rear]
                    } else {
                        vec![]
                    }
                }
                ZoneId::Rear => {
                    if att.can_fire_from_rear {
                        ground.into_iter().filter(|&z| occ(z)).collect()
                    } else {
                        vec![]
                    }
                }
            };
            // Same air-first rule as the AnyGround arm: air is always a candidate for an air-capable
            // direct-fire unit, and (sorting frontmost) is engaged before ground.
            let air = can_air;
            (zones, air)
        }
    }
}

/// The single frontmost occupied enemy ground row (the Front-row collapse).
fn nearest_occupied(occ: &Occupancy) -> Option<ZoneId> {
    [ZoneId::Front, ZoneId::Middle, ZoneId::Rear]
        .into_iter()
        .find(|&z| occ.has(z))
}

/// Living-enemy occupancy of the four zones.
struct Occupancy {
    air: bool,
    front: bool,
    middle: bool,
    rear: bool,
}

impl Occupancy {
    fn has(&self, z: ZoneId) -> bool {
        match z {
            ZoneId::Air => self.air,
            ZoneId::Front => self.front,
            ZoneId::Middle => self.middle,
            ZoneId::Rear => self.rear,
        }
    }
}

fn reachable_enemies(
    combatants: &[Combatant],
    att_idx: usize,
    enemy_side: crate::replay::Side,
    air_allowed: bool,
) -> Vec<usize> {
    let enemies: Vec<usize> = (0..combatants.len())
        .filter(|&j| combatants[j].alive && combatants[j].unit.side == enemy_side)
        .collect();

    let occ = Occupancy {
        air: enemies.iter().any(|&j| combatants[j].zone == ZoneId::Air),
        front: enemies.iter().any(|&j| combatants[j].zone == ZoneId::Front),
        middle: enemies
            .iter()
            .any(|&j| combatants[j].zone == ZoneId::Middle),
        rear: enemies.iter().any(|&j| combatants[j].zone == ZoneId::Rear),
    };

    let (ground_zones, can_air) = reach_zones(&combatants[att_idx], &occ, air_allowed);
    enemies
        .into_iter()
        .filter(|&j| {
            let z = combatants[j].zone;
            if z == ZoneId::Air {
                can_air
            } else {
                ground_zones.contains(&z)
            }
        })
        .collect()
}

/// Narrow the reachable set to one row per the Target Row sub-pick.
fn pick_row(combatants: &[Combatant], reachable: &[usize], row: TargetRow) -> Vec<usize> {
    // The distinct zones present among reachable enemies, in zone order.
    let mut zones: Vec<ZoneId> = reachable.iter().map(|&j| combatants[j].zone).collect();
    zones.sort();
    zones.dedup();
    if zones.is_empty() {
        return vec![];
    }

    let chosen = match row {
        TargetRow::FrontReachable => *zones.first().unwrap(), // frontmost (lowest zone order)
        TargetRow::LastReachable => *zones.last().unwrap(),   // deepest
        TargetRow::FullestRow => *zones
            .iter()
            .max_by_key(|&&z| {
                (
                    reachable
                        .iter()
                        .filter(|&&j| combatants[j].zone == z)
                        .count(),
                    // tie-break: prefer the frontmost row (smaller zone order wins → negate)
                    std::cmp::Reverse(z),
                )
            })
            .unwrap(),
        TargetRow::WeakestRow => *zones
            .iter()
            .min_by_key(|&&z| {
                let total: i128 = reachable
                    .iter()
                    .filter(|&&j| combatants[j].zone == z)
                    .map(|&j| combatants[j].hull.milli() as i128)
                    .sum();
                (total, z)
            })
            .unwrap(),
    };

    reachable
        .iter()
        .copied()
        .filter(|&j| combatants[j].zone == chosen)
        .collect()
}

/// Two ground zones adjacent for Protector interception (`Front↔Middle↔Rear`; Air is not adjacent).
fn ground_adjacent(a: ZoneId, b: ZoneId) -> bool {
    matches!(
        (a, b),
        (ZoneId::Front, ZoneId::Middle)
            | (ZoneId::Middle, ZoneId::Front)
            | (ZoneId::Middle, ZoneId::Rear)
            | (ZoneId::Rear, ZoneId::Middle)
    )
}

/// Narrow the chosen row to the enemies drawn first by their stance tier (v2). Lower `stance_aggro`
/// offset = targeted sooner, so Aggressive/Protector (−1) shield Neutral (0), which shields Defensive
/// (+1). A **Protector** in a ground-adjacent zone is pulled into the candidate set, so it intercepts
/// fire aimed at its neighbours (FR-016). An **Aggressive** attacker ignores the whole thing — its
/// targeting cannot be baited or hidden from (FR-014). A uniform set of stances is a no-op: every
/// candidate shares one offset, so all survive and the Target Rule chooses exactly as before (FR-017).
fn narrow_by_stance(
    combatants: &[Combatant],
    reachable: &[usize],
    row: &[usize],
    att: &Combatant,
    ruleset: &Ruleset,
) -> Vec<usize> {
    use crate::model::types::Stance;
    if att.dials.stance == Stance::Aggressive {
        return row.to_vec();
    }
    let aggro = &ruleset.stance_aggro;
    // Aggro tiers belong to combat machines. A support machine contributes a neutral offset and never
    // intercepts as a Protector, so an out-of-role combat stance on a support unit degrades to neutral
    // targeting rather than letting it bait fire (v2 role split, FR-019).
    let is_support = |j: usize| {
        combatants[j]
            .stats
            .support_power
            .is_some_and(|p| p.milli() > 0)
    };
    let off = |j: usize| {
        if is_support(j) {
            0
        } else {
            aggro.offset(combatants[j].dials.stance)
        }
    };

    // Candidate set: the chosen row, plus any reachable Protector guarding an adjacent ground zone.
    let chosen_zone = combatants[row[0]].zone;
    let mut candidates = row.to_vec();
    for &j in reachable {
        if combatants[j].dials.stance == Stance::Protector
            && !is_support(j)
            && ground_adjacent(combatants[j].zone, chosen_zone)
            && !candidates.contains(&j)
        {
            candidates.push(j);
        }
    }

    // Keep only the minimum-offset (drawn-first) candidates.
    let min_off = candidates.iter().map(|&j| off(j)).min().unwrap();
    candidates
        .into_iter()
        .filter(|&j| off(j) == min_off)
        .collect()
}

/// Pick the single target within the chosen row per the Target Rule sub-pick.
fn pick_unit(combatants: &[Combatant], row: &[usize], att: &Combatant) -> usize {
    let tiebreak = |j: usize| (combatants[j].zone, combatants[j].unit.instance_id);

    match att.dials.target_rule {
        // Concentrate fire to secure a kill → the lowest current hull.
        TargetRule::FocusFire | TargetRule::Weakest => *row
            .iter()
            .min_by_key(|&&j| (combatants[j].hull.milli(), tiebreak(j)))
            .unwrap(),
        // Spread damage → the freshest (highest hull) target.
        TargetRule::DisperseFire => *row
            .iter()
            .max_by_key(|&&j| (combatants[j].hull.milli(), std::cmp::Reverse(tiebreak(j))))
            .unwrap(),
        // Nearest by zone, then placement.
        TargetRule::Nearest => *row.iter().min_by_key(|&&j| tiebreak(j)).unwrap(),
        // Highest aggro weight.
        TargetRule::BiggestThreat => *row
            .iter()
            .max_by_key(|&&j| {
                (
                    combatants[j].stats.threat.milli(),
                    std::cmp::Reverse(tiebreak(j)),
                )
            })
            .unwrap(),
        // Prefer support machines; else fall back to weakest.
        TargetRule::TargetSupport => row
            .iter()
            .filter(|&&j| combatants[j].stats.support_power.is_some())
            .min_by_key(|&&j| (combatants[j].hull.milli(), tiebreak(j)))
            .copied()
            .unwrap_or_else(|| {
                *row.iter()
                    .min_by_key(|&&j| (combatants[j].hull.milli(), tiebreak(j)))
                    .unwrap()
            }),
        // Prefer air targets; else weakest.
        TargetRule::TargetAir => row
            .iter()
            .filter(|&&j| combatants[j].zone == ZoneId::Air)
            .min_by_key(|&&j| (combatants[j].hull.milli(), tiebreak(j)))
            .copied()
            .unwrap_or_else(|| {
                *row.iter()
                    .min_by_key(|&&j| (combatants[j].hull.milli(), tiebreak(j)))
                    .unwrap()
            }),
        // First-pass: pick the target our damage type most punishes (highest matrix multiplier),
        // approximated by whether the target relies on shields vs armor. Falls back to weakest.
        TargetRule::SmartCounter => *row
            .iter()
            .max_by_key(|&&j| {
                // Prefer targets whose surviving layer we counter: shields up → kinetic-favored, etc.
                let has_shield = combatants[j].shield.milli() > 0;
                let counter_score = match (att.stats.damage_type, has_shield) {
                    (crate::model::types::DamageType::Kinetic, true) => 2,
                    (crate::model::types::DamageType::Energy, false) => 2,
                    _ => 1,
                };
                (
                    counter_score,
                    std::cmp::Reverse(combatants[j].hull.milli()),
                    std::cmp::Reverse(tiebreak(j)),
                )
            })
            .unwrap(),
    }
}
