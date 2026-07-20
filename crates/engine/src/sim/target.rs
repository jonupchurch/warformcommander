//! Targeting (US1, T021) — row-based reach + the Target Row / Target Rule dial sub-picks, with
//! fully deterministic tie-breaks (`zone order → instance_id`, FR-014, §4/§8.1).
//!
//! Reach is governed by the **firing unit's row** (stat block §4): Front → nearest occupied enemy
//! ground row (collapsing forward); Middle → enemy Front+Middle (Rear only once both clear); Rear →
//! nothing unless the unit fires indirectly (Artillery / Rocket-Artillery). Special weapon reach
//! tags override: `AnyGround`/`Deep` reach any ground row from any row; `Air` reaches only air.

use crate::model::types::{ReachTag, TargetRow, TargetRule, ZoneId};

use super::Combatant;

/// Pick the target index for combatant `att_idx`, or `None` if nothing is reachable.
pub(crate) fn select_target(combatants: &[Combatant], att_idx: usize) -> Option<usize> {
    let att = &combatants[att_idx];
    let enemy_side = att.unit.side.other();

    // 1. Reachable living enemies (by reach rules).
    let reachable = reachable_enemies(combatants, att_idx, enemy_side);
    if reachable.is_empty() {
        return None;
    }

    // 2. Target Row (a): narrow to one row.
    let row = pick_row(combatants, &reachable, att.dials.target_row);

    // 3. Target Rule (b): pick the unit within that row.
    Some(pick_unit(combatants, &row, att))
}

/// Which enemy ground zones (and whether air) this attacker can reach from its current row.
fn reach_zones(att: &Combatant, occupied: &Occupancy) -> (Vec<ZoneId>, bool) {
    let can_air = att.stats.can_target_air;
    let ground = [ZoneId::Front, ZoneId::Middle, ZoneId::Rear];
    let occ = |z: ZoneId| occupied.has(z);

    match att.stats.reach {
        // AA / air-only weapon: air targets only.
        ReachTag::Air => (vec![], true),
        // Indirect / long: any occupied ground row from any row.
        ReachTag::AnyGround | ReachTag::Deep => {
            (ground.into_iter().filter(|&z| occ(z)).collect(), can_air)
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
            (zones, can_air)
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
) -> Vec<usize> {
    let enemies: Vec<usize> = (0..combatants.len())
        .filter(|&j| combatants[j].alive && combatants[j].unit.side == enemy_side)
        .collect();

    let occ = Occupancy {
        air: enemies.iter().any(|&j| combatants[j].zone == ZoneId::Air),
        front: enemies.iter().any(|&j| combatants[j].zone == ZoneId::Front),
        middle: enemies.iter().any(|&j| combatants[j].zone == ZoneId::Middle),
        rear: enemies.iter().any(|&j| combatants[j].zone == ZoneId::Rear),
    };

    let (ground_zones, can_air) = reach_zones(&combatants[att_idx], &occ);
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
            .max_by_key(|&&j| (combatants[j].stats.threat.milli(), std::cmp::Reverse(tiebreak(j))))
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
                (counter_score, std::cmp::Reverse(combatants[j].hull.milli()), std::cmp::Reverse(tiebreak(j)))
            })
            .unwrap(),
    }
}
