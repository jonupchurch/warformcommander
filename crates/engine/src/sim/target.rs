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
use crate::model::types::{ReachTag, TargetFilter, TargetSelector, ZoneId};
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

    // 1. Reachable living enemies (by reach rules, and the air budget) — the priority chain's pool.
    let reachable = reachable_enemies(combatants, att_idx, enemy_side, air_allowed);
    if reachable.is_empty() {
        return None;
    }

    // 2. Priority-score chain (design §12): score each reachable enemy, highest wins, fallback breaks ties.
    let chosen = pick_by_priority(combatants, att_idx, ruleset, &reachable);

    // 3. Spend a slot of the air budget if this attacker actually engaged the skies.
    if combatants[chosen].zone == ZoneId::Air {
        if let Some(f) = focus {
            f.commit(side);
        }
    }
    Some(chosen)
}

/// Armour fraction (bp) at or above which a target counts as "armoured" for the `TargetArmor` filter
/// (design §12.6 Q1 — the energy-weapon partner). A start-value line, tunable in the balance pass.
const TARGET_ARMOR_THRESHOLD_BP: crate::fixed::Bp = 2_500; // 25%

/// Base priority scores by tier (design §12.8): a Priority-1 match scores 5, a Priority-2 match 3, an
/// unmatched candidate 0. The ±2 draw offsets stay strictly inside this spread, so declared priorities
/// dominate — a dedicated hunter (5) still shoots through an ECM'd target (3), while a Decoy (0+2=2)
/// beats only unranked fire. Start-values.
const SCORE_PRIORITY_1: i32 = 5;
const SCORE_PRIORITY_2: i32 = 3;

/// Resolve the priority-score chain to one target index among the (non-empty) `reachable` pool.
fn pick_by_priority(
    combatants: &[Combatant],
    att_idx: usize,
    ruleset: &Ruleset,
    reachable: &[usize],
) -> usize {
    let chain = combatants[att_idx].dials.targeting;
    // Follow is dynamic: resolve the anchor's target once (a non-following zone ally's pick), then a
    // Follow tier matches only that one index. `None` if there is no valid anchor → the tier is inert.
    let follow_target = if chain.is_following() {
        resolve_follow_anchor(combatants, att_idx, ruleset, reachable)
    } else {
        None
    };

    let score = |j: usize| -> i32 {
        let base = if filter_matches(combatants, j, chain.priority1, follow_target) {
            SCORE_PRIORITY_1
        } else if filter_matches(combatants, j, chain.priority2, follow_target) {
            SCORE_PRIORITY_2
        } else {
            0
        };
        base + combatants[j].stats.target_draw as i32
    };

    let best = reachable.iter().map(|&j| score(j)).max().unwrap();
    // Break score ties with the positional fallback selector, then the fully-deterministic
    // (zone, instance_id) order so selection is reproducible on replay (FR-014).
    reachable
        .iter()
        .copied()
        .filter(|&j| score(j) == best)
        .min_by_key(|&j| selector_key(combatants, j, chain.fallback))
        .unwrap()
}

/// The sort key that realises a [`TargetSelector`] among equally-scored candidates. `Closest` sweeps
/// from the contact line (air sorts frontmost, then Front→Rear); `Furthest` sweeps from the backline.
/// The trailing `instance_id` is the final deterministic tiebreak in both directions.
fn selector_key(combatants: &[Combatant], j: usize, sel: TargetSelector) -> (i32, u8) {
    // Zone order: Air(0) < Front(1) < Middle(2) < Rear(3) — the enemy-facing distance from contact.
    let zrank = match combatants[j].zone {
        ZoneId::Air => 0,
        ZoneId::Front => 1,
        ZoneId::Middle => 2,
        ZoneId::Rear => 3,
    };
    let id = combatants[j].unit.instance_id;
    match sel {
        TargetSelector::Closest => (zrank, id),
        TargetSelector::Furthest => (-zrank, id),
    }
}

/// Whether candidate `j` matches `filter`. `Follow` matches only the pre-resolved anchor target.
fn filter_matches(
    combatants: &[Combatant],
    j: usize,
    filter: Option<TargetFilter>,
    follow_target: Option<usize>,
) -> bool {
    match filter {
        None => false,
        Some(TargetFilter::TargetAir) => combatants[j].zone == ZoneId::Air,
        Some(TargetFilter::TargetArmor) => combatants[j].stats.armor_pct >= TARGET_ARMOR_THRESHOLD_BP,
        Some(TargetFilter::TargetSupport) => combatants[j]
            .stats
            .support_power
            .is_some_and(|p| p.milli() > 0),
        // Indirect-fire enemies (counter-battery): artillery / rocket-artillery fire from the rear.
        Some(TargetFilter::TargetIndirect) => combatants[j].can_fire_from_rear,
        Some(TargetFilter::Follow) => follow_target == Some(j),
    }
}

/// Resolve a `Follow` unit's anchor target (design §12.6 Q2): the target chosen by an **independently
/// choosing** (non-following) zone ally, so followers focus-fire without chaining or circularity. Picks
/// the lowest-instance-id such ally whose own pick is also reachable by the follower; `None` if none.
fn resolve_follow_anchor(
    combatants: &[Combatant],
    att_idx: usize,
    ruleset: &Ruleset,
    reachable: &[usize],
) -> Option<usize> {
    let side = combatants[att_idx].unit.side;
    let zone = combatants[att_idx].zone;
    let mut anchors: Vec<usize> = (0..combatants.len())
        .filter(|&k| {
            k != att_idx
                && combatants[k].alive
                && combatants[k].unit.side == side
                && combatants[k].zone == zone
                && !combatants[k].dials.targeting.is_following() // independent only → no chaining
        })
        .collect();
    anchors.sort_by_key(|&k| combatants[k].unit.instance_id);
    for k in anchors {
        // The anchor is non-following, so this recursion terminates without re-entering Follow.
        if let Some(t) = select_target(combatants, k, ruleset, None) {
            if reachable.contains(&t) {
                return Some(t);
            }
        }
    }
    None
}

/// Which enemy ground zones (and whether air) this attacker can reach from its current row.
fn reach_zones(att: &Combatant, occupied: &Occupancy, air_allowed: bool) -> (Vec<ZoneId>, bool) {
    // `air_allowed` folds in the per-tick anti-air budget (see [`AirFocus`]): once the skies are
    // already covered by enough friendly fire, this attacker treats air as out of reach and fights on
    // the ground, rather than piling onto an aircraft that is already being handled.
    // A unit currently in the Air can always contest air (v3 US3-C): a Jump-Jet machine mid-leap fights
    // the air layer directly even if its weapon isn't innately air-capable, so being airborne itself
    // grants air reach (still subject to the per-tick anti-air budget).
    // Air reach follows the AA *unlock*, not zone position (v3 revision): any air-capable unit — a
    // dedicated AA platform (SAM `Air` reach / `AntiAir` / innately air-capable), the Mech's Rocket
    // Pack, or an energy weapon contesting air — reaches enemy air from ANY row. The old "improvised
    // air is Front-row-only" reach advantage (v2 FR-029) is dropped: what still separates a real AA
    // answer from an improvised one is the DAMAGE RATE + accuracy (damage.rs: flak vs energy-air vs
    // plink), not reach. A plain unit with no air answer still can't touch air at all (`can_air`), and
    // air is still subject to the per-tick anti-air budget. Being airborne (`zone == Air`) grants air
    // reach on its own for a Jump-Jet mid-leap, as before.
    let can_air = (att.stats.can_target_air || att.zone == ZoneId::Air) && air_allowed;
    let air_reachable = can_air;
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
            (zones, air_reachable)
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
            // Same air-first rule as the AnyGround arm: air is a candidate for any air-capable direct-fire
            // unit (from any row now — reach follows the AA unlock, not zone) and, sorting frontmost, is
            // engaged first.
            //
            // LAST-RESORT improvised AA (FRONT row): a plain ground unit with no air answer
            // (`can_target_air == false`) can still plink at enemy air — but only from the Front row and
            // only once it has NO reachable ground target left. This breaks the otherwise-unwinnable
            // "enemy air, no AA" endgame (you cleared their ground but can't finish their aircraft)
            // WITHOUT pulling the front line off the ground fight while ground targets remain (the
            // `zones.is_empty()` guard). Damage/accuracy fall to the plink rate in damage.rs; still
            // subject to the per-tick anti-air budget via `air_allowed`.
            let improvised_front_air =
                att.zone == ZoneId::Front && air_allowed && occ(ZoneId::Air) && zones.is_empty();
            (zones, air_reachable || improvised_front_air)
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
