//! Behavior resolution (US1, T023) — the per-tick Plan-B latch and discrete zone movement. No RNG:
//! behavior is a pure function of battle state.
//!
//! **Plan-B determinism law (§8.2, FR-016):** a trigger *latches* (fires once, stays flipped). The
//! active dial state depends only on *which slots have fired* + **Slot-1 > Slot-2** precedence —
//! never on firing order. We enforce this by recomputing active dials from the base each tick:
//! apply Slot-2's latched value first, then Slot-1's, so Slot-1 always wins a shared dial.

use crate::model::ruleset::Ruleset;
use crate::model::types::{
    BehaviorDials, DialValue, MovementMode, PlanBSlot, TriggerCondition, ZoneId,
};
use crate::replay::TickEvent;

use super::{target, Combatant, FallbackPhase};

/// Ticks a machine holds its ducked position before turning for home (v3 US2, start-value).
const FALLBACK_DUCK_TICKS: u16 = 10;

/// The most ground machines one side may hold in a single zone (mirrors the `validate.rs` cap). A
/// `FallBack` return only re-enters the home zone while it is below this, so a return never overfills.
const GROUND_ZONE_CAP: usize = 3;

/// Latch Plan-B triggers and resolve movement for every living combatant this tick.
pub(crate) fn apply_behavior(
    combatants: &mut [Combatant],
    tick: u16,
    ruleset: &Ruleset,
    events: &mut Vec<TickEvent>,
) {
    latch_plan_b(combatants, tick, events);
    resolve_movement(combatants, ruleset, events);
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
// Movement (discrete zone transitions) — v3 US2: four self-terminating modes.
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

/// One zone from `z` toward `home` (may be forward or backward); `z` itself once already home.
fn toward(z: ZoneId, home: ZoneId) -> ZoneId {
    use ZoneId::{Front, Middle, Rear};
    let rank = |zone: ZoneId| match zone {
        Front => 2,
        Middle => 1,
        Rear => 0,
        ZoneId::Air => return 3, // air never steps toward a ground home
    };
    match rank(z).cmp(&rank(home)) {
        std::cmp::Ordering::Less => forward(z),
        std::cmp::Ordering::Greater => backward(z),
        std::cmp::Ordering::Equal => z,
    }
}

/// Ticks between zone steps for a given move speed (faster units reposition more often).
fn move_interval(speed: u8) -> u16 {
    (12u16).saturating_sub(speed as u16).max(2)
}

/// The intended destination zone for one machine this tick, given whether it currently has a target in
/// reach. `None` = stay put. Advances self-terminate (idle in reach); Kite oscillates; FallBack runs
/// its duck-then-return state machine. The `FallBack` phase/timer are mutated here (they advance every
/// tick regardless of the step cooldown); the actual step is still gated by `move_cooldown` at the
/// call site.
fn movement_intent(c: &mut Combatant, has_target: bool, home_has_room: bool) -> ZoneId {
    let from = c.zone;
    match c.dials.movement {
        MovementMode::Hold => from,
        // Close to contact, then idle once something is in reach; re-close if stranded (no target).
        MovementMode::Advance => {
            if has_target {
                from
            } else {
                forward(from)
            }
        }
        // Oscillate: give ground while it can still shoot, close back up when it cannot reach anyone.
        // Never retreat behind the home zone (that is `FallBack`'s job, not the kite's).
        MovementMode::Kite => {
            if has_target {
                let back = backward(from);
                // Give ground, but never retreat *behind* the home zone (retreating to it is fine).
                if is_behind(back, c.home_zone) {
                    from
                } else {
                    back
                }
            } else {
                forward(from)
            }
        }
        // Duck one zone, hold the duck for a spell, then return home and stay.
        MovementMode::FallBack => fallback_intent(c, home_has_room),
    }
}

/// Whether `z` is strictly further from the front than `home` (i.e. the kite would over-retreat).
fn is_behind(z: ZoneId, home: ZoneId) -> bool {
    use ZoneId::{Front, Middle, Rear};
    let rank = |zone: ZoneId| match zone {
        Front => 2,
        Middle => 1,
        Rear => 0,
        ZoneId::Air => 3,
    };
    rank(z) < rank(home)
}

/// The **step-producing** half of the `FallBack` state machine (called past the move cooldown gate, so
/// a step is never skipped). The time-based `Ducking → Returning` countdown lives in `resolve_movement`
/// (it must tick every frame, not only on a move opportunity).
fn fallback_intent(c: &mut Combatant, home_has_room: bool) -> ZoneId {
    match c.fallback {
        FallbackPhase::Inactive => {
            // Begin the duck: one zone back, then hold for the timer (counted in resolve_movement).
            c.fallback = FallbackPhase::Ducking;
            c.fallback_timer = FALLBACK_DUCK_TICKS;
            backward(c.zone)
        }
        FallbackPhase::Ducking => c.zone, // hold the ducked position while the timer runs
        FallbackPhase::Returning => {
            let next = toward(c.zone, c.home_zone);
            if next == c.zone {
                c.fallback = FallbackPhase::Home;
                c.zone
            } else if next == c.home_zone && !home_has_room {
                // Home is full — wait one tick just short of it rather than overfilling the zone.
                c.zone
            } else {
                next
            }
        }
        FallbackPhase::Home => c.zone,
    }
}

fn resolve_movement(combatants: &mut [Combatant], ruleset: &Ruleset, events: &mut Vec<TickEvent>) {
    let n = combatants.len();
    // Reach probe (immutable): does each machine have an enemy in reach right now? Drives the
    // self-termination of Advance/Kite. Computed up front so the mutable step loop can borrow freely.
    let has_target: Vec<bool> = (0..n)
        .map(|i| combatants[i].alive && target::select_target(combatants, i, ruleset, None).is_some())
        .collect();

    for i in 0..n {
        if !combatants[i].alive {
            continue;
        }
        // Air-locked (move_speed None) and immobile (Some(0)) never move — but a FallBack order still
        // has no effect on them, so we simply skip: they cannot duck or return.
        let speed = match combatants[i].stats.move_speed {
            Some(s) if s > 0 => s,
            _ => continue,
        };

        // Home-zone room for a FallBack return (own-side ground occupancy, excluding self).
        let home = combatants[i].home_zone;
        let side = combatants[i].unit.side;
        let home_occupancy = (0..n)
            .filter(|&j| {
                j != i
                    && combatants[j].alive
                    && combatants[j].unit.side == side
                    && combatants[j].zone == home
            })
            .count();
        let home_has_room = home_occupancy < GROUND_ZONE_CAP;

        // Time-based half of FallBack: the duck timer counts down every tick (not only on a step
        // opportunity); when it runs out the machine turns for home.
        if matches!(combatants[i].dials.movement, MovementMode::FallBack)
            && combatants[i].fallback == FallbackPhase::Ducking
        {
            combatants[i].fallback_timer = combatants[i].fallback_timer.saturating_sub(1);
            if combatants[i].fallback_timer == 0 {
                combatants[i].fallback = FallbackPhase::Returning;
            }
        }

        // The *step* is cooldown-gated; the step-producing phase transitions live past this gate so a
        // duck/return step is never silently dropped.
        if combatants[i].move_cooldown > 0 {
            combatants[i].move_cooldown -= 1;
            continue;
        }
        let to = movement_intent(&mut combatants[i], has_target[i], home_has_room);
        let from = combatants[i].zone;
        if to != from {
            combatants[i].zone = to;
            combatants[i].move_cooldown = move_interval(speed);
            events.push(TickEvent::Move {
                unit: combatants[i].unit,
                from,
                to,
            });
        }
    }
}
