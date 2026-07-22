//! Behavior resolution (US1, T023) — the per-tick Plan-B latch, discrete zone movement, and the
//! energy-dial damage modifier. No RNG: behavior is a pure function of battle state.
//!
//! **Plan-B determinism law (§8.2, FR-016):** a trigger *latches* (fires once, stays flipped). The
//! active dial state depends only on *which slots have fired* + **Slot-1 > Slot-2** precedence —
//! never on firing order. We enforce this by recomputing active dials from the base each tick:
//! apply Slot-2's latched value first, then Slot-1's, so Slot-1 always wins a shared dial.

use crate::fixed::Bp;
use crate::model::ruleset::Ruleset;
use crate::model::types::{
    BehaviorDials, DialValue, EnergyMode, MovementMode, PlanBSlot, TriggerCondition, ZoneId,
};
use crate::replay::TickEvent;

use super::Combatant;

/// Outgoing-damage multiplier for an energy mode (bp), from the ruleset's tunable table.
pub(crate) fn energy_damage_mult(energy: EnergyMode, ruleset: &Ruleset) -> Bp {
    ruleset.energy_modes.profile(energy).damage_dealt
}

/// **Incoming**-damage multiplier for a machine *being hit* while in an energy mode (bp).
///
/// This is the other half of the dial's trade. Without it the defensive modes only ever subtracted
/// damage — Fortify cost 15% offense and returned nothing — so Overdrive strictly dominated every
/// other option and the Garage's "every choice is a trade-off, never a strict upgrade" was untrue for
/// the energy dial. Reading the *target's* mode here makes the posture mean something.
pub(crate) fn energy_damage_taken_mult(energy: EnergyMode, ruleset: &Ruleset) -> Bp {
    ruleset.energy_modes.profile(energy).damage_taken
}

/// Latch Plan-B triggers and resolve movement for every living combatant this tick.
pub(crate) fn apply_behavior(combatants: &mut [Combatant], tick: u16, events: &mut Vec<TickEvent>) {
    latch_plan_b(combatants, tick, events);
    resolve_movement(combatants, events);
}

// ---------------------------------------------------------------------------
// Plan-B
// ---------------------------------------------------------------------------

fn latch_plan_b(combatants: &mut [Combatant], tick: u16, events: &mut Vec<TickEvent>) {
    let n = combatants.len();
    for i in 0..n {
        if !combatants[i].alive || combatants[i].plan_b.is_empty() {
            continue;
        }
        // Evaluate each not-yet-fired trigger against current state; latch those whose condition holds.
        let triggers = combatants[i].plan_b.clone();
        for trig in &triggers {
            if combatants[i].fired.contains(&trig.slot) {
                continue;
            }
            if condition_met(combatants, i, trig.condition, tick) {
                combatants[i].fired.insert(trig.slot);
                events.push(TickEvent::PlanB {
                    unit: combatants[i].unit,
                    slot: trig.slot,
                    dial: trig.dial,
                });
            }
        }
        // Recompute active dials from base + the fired set (Slot-2 then Slot-1 → Slot-1 wins).
        combatants[i].dials =
            active_dials(&combatants[i].base_dials, &triggers, &combatants[i].fired);
    }
}

/// Rebuild active dials: start from base, apply latched Slot-2 values, then latched Slot-1 (so a
/// Slot-1 trigger overrides a Slot-2 one on the same dial). Order-independent given the fired set.
fn active_dials(
    base: &BehaviorDials,
    triggers: &[crate::model::types::PlanBTrigger],
    fired: &std::collections::BTreeSet<PlanBSlot>,
) -> BehaviorDials {
    let mut dials = *base;
    for slot in [PlanBSlot::Slot2, PlanBSlot::Slot1] {
        if !fired.contains(&slot) {
            continue;
        }
        for trig in triggers.iter().filter(|t| t.slot == slot) {
            apply_dial(&mut dials, trig.plan_b_value);
        }
    }
    dials
}

fn apply_dial(dials: &mut BehaviorDials, value: DialValue) {
    match value {
        DialValue::TargetRow(v) => dials.target_row = v,
        DialValue::TargetRule(v) => dials.target_rule = v,
        DialValue::Energy(v) => dials.energy = v,
        DialValue::Movement(v) => dials.movement = v,
        DialValue::Stance(v) => dials.stance = v,
    }
}

fn condition_met(combatants: &[Combatant], i: usize, cond: TriggerCondition, tick: u16) -> bool {
    let c = &combatants[i];
    match cond {
        TriggerCondition::HullBelowPct(bp) => c.hull_pct() < bp,
        TriggerCondition::ShieldDown => c.stats.shield_cap.milli() > 0 && c.shield.milli() <= 0,
        TriggerCondition::AfterTick(t) => tick >= t,
        TriggerCondition::AllyLostInZone => combatants.iter().any(|a| {
            a.unit.side == c.unit.side
                && a.zone == c.zone
                && a.destroyed_at.is_some()
                && a.unit != c.unit
        }),
        TriggerCondition::AirEnemyExists => combatants
            .iter()
            .any(|e| e.unit.side != c.unit.side && e.alive && e.zone == ZoneId::Air),
        TriggerCondition::EnemyInZone(z) => combatants
            .iter()
            .any(|e| e.unit.side != c.unit.side && e.alive && e.zone == z),
    }
}

// ---------------------------------------------------------------------------
// Movement (discrete zone transitions)
// ---------------------------------------------------------------------------

/// One zone toward the enemy contact line (`Rear → Middle → Front`); Front is the ground limit.
fn forward(z: ZoneId) -> ZoneId {
    match z {
        ZoneId::Rear => ZoneId::Middle,
        ZoneId::Middle => ZoneId::Front,
        other => other,
    }
}

/// One zone back (`Front → Middle → Rear`); Rear is the ground limit.
fn backward(z: ZoneId) -> ZoneId {
    match z {
        ZoneId::Front => ZoneId::Middle,
        ZoneId::Middle => ZoneId::Rear,
        other => other,
    }
}

/// Ticks between zone steps for a given move speed (faster units reposition more often).
fn move_interval(speed: u8) -> u16 {
    (12u16).saturating_sub(speed as u16).max(2)
}

fn resolve_movement(combatants: &mut [Combatant], events: &mut Vec<TickEvent>) {
    for c in combatants.iter_mut().filter(|c| c.alive) {
        // Air-locked (move_speed None) and immobile (Some(0)) never move.
        let speed = match c.stats.move_speed {
            Some(s) if s > 0 => s,
            _ => continue,
        };
        if c.move_cooldown > 0 {
            c.move_cooldown -= 1;
            continue;
        }
        let from = c.zone;
        let to = match c.dials.movement {
            MovementMode::Advance => forward(from),
            MovementMode::FallBack => backward(from),
            // Kite/Reposition/Escort/Hold: no autonomous stepping in the first-pass MVP.
            _ => from,
        };
        if to != from {
            c.zone = to;
            c.move_cooldown = move_interval(speed);
            events.push(TickEvent::Move {
                unit: c.unit,
                from,
                to,
            });
        }
    }
}
