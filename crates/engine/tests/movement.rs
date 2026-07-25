//! v3 movement (spec 015, US2) — the four self-terminating modes (Hold / Advance / Kite / FallBack).
//!
//! These exercise the two behaviours that distinguish v3 from the v2 stub: Advance **idles once it has
//! a target in reach** (rather than marching into the enemy backline), and FallBack **ducks one zone,
//! holds, then returns home** (rather than fleeing and rotting). Observed through the public `resolve`
//! by tracking each unit's zone across the replay snapshots.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::{Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{
    DialKey, DialValue, MachineTypeId, MovementMode, PlanBSlot, PlanBTrigger, TriggerCondition,
    VariantId, ZoneId,
};
use engine::replay::{Adaptation, MatchConfig, Side, TickEvent, UnitRef};
use engine::{resolve, BattleInput, BattleOutput};

fn config() -> MatchConfig {
    MatchConfig {
        adaptation: Adaptation::Locked,
        defender_side: Side::B,
        best_of: 1,
    }
}

fn run(rs: &Ruleset, a: Army, b: Army, seed: u64) -> BattleOutput {
    resolve(&BattleInput {
        armies: [a, b],
        ruleset: rs.clone(),
        seed,
        match_config: config(),
    })
    .expect("curated squads are legal")
}

fn tank(rs: &Ruleset, variant: &str, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::HeavyTank, variant, zone, id)
}

fn with_move(mut m: MachineInstance, mode: MovementMode) -> MachineInstance {
    m.dials.movement = mode;
    m
}

/// The zone of side-A unit `id` at each tick of game 0 (one entry per recorded tick).
fn zones_over_time(out: &BattleOutput, id: u8) -> Vec<ZoneId> {
    let u = UnitRef {
        side: Side::A,
        instance_id: id,
    };
    out.replay.games[0]
        .ticks
        .iter()
        .filter_map(|t| t.snapshot.iter().find(|s| s.unit == u).map(|s| s.zone))
        .collect()
}

/// Harmless, effectively-unkillable enemies so the measured side survives long enough to observe a
/// full duck-and-return without the battle ending first (huge hull, trivial damage).
fn anvil_rs() -> Ruleset {
    use engine::fixed::Fixed;
    let mut rs = seed_ruleset();
    let b = rs.variants.get_mut(&VariantId::new("Bulwark")).unwrap();
    b.hull = Fixed::from_int(500_000);
    b.damage = Fixed::from_int(1);
    rs
}

fn anvils(rs: &Ruleset) -> Army {
    Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                tank(rs, "Bulwark", zone, i)
            })
            .collect(),
    }
}

/// Whether a Plan-B trigger latched for side-A unit `id` anywhere in the battle.
fn plan_b_fired(out: &BattleOutput, id: u8) -> bool {
    let u = UnitRef {
        side: Side::A,
        instance_id: id,
    };
    out.replay.games[0]
        .ticks
        .iter()
        .flat_map(|t| &t.events)
        .any(|e| matches!(e, TickEvent::PlanB { unit, .. } if *unit == u))
}

/// The `NoTargetsReachable` Plan-B trigger (v3 §15.4, own-state): a Rear tank on `Hold` that can reach
/// nobody latches its "advance when cut off" order and starts closing — proof the trigger reads the
/// unit's own reachability, replacing the dropped enemy-reactive triggers.
#[test]
fn no_targets_reachable_latches_the_advance_order() {
    let rs = anvil_rs();
    // id0: Rear, Hold, with a Plan-B that flips to Advance when it has no reachable target.
    let mut cutoff = tank(&rs, "Grizzly", ZoneId::Rear, 0);
    cutoff.dials.movement = MovementMode::Hold;
    cutoff.plan_b = vec![PlanBTrigger {
        slot: PlanBSlot::Slot1,
        condition: TriggerCondition::NoTargetsReachable,
        dial: DialKey::Movement,
        plan_b_value: DialValue::Movement(MovementMode::Advance),
    }];
    let attacker = Army {
        machines: vec![
            cutoff,
            tank(&rs, "Grizzly", ZoneId::Rear, 1),
            tank(&rs, "Grizzly", ZoneId::Rear, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };
    // Enemies only up front → the Rear tank reaches nothing, so the trigger must fire and it advances.
    let enemy = anvils(&rs);
    let out = run(&rs, attacker, enemy, 0x0C07);
    assert!(
        plan_b_fired(&out, 0),
        "NoTargetsReachable must latch for a cut-off Rear unit"
    );
    let zones = zones_over_time(&out, 0);
    assert!(
        zones.iter().any(|&z| z == ZoneId::Middle || z == ZoneId::Front),
        "after latching Advance the cut-off unit must close toward contact: {zones:?}"
    );
}

/// Advance **self-terminates**: a unit that already has a target in reach holds its ground instead of
/// marching forward. A Middle tank facing a Front enemy (which Middle reaches) never steps to Front.
#[test]
fn advance_idles_once_a_target_is_in_reach() {
    let rs = anvil_rs();
    // Side A: an Advance tank parked in Middle (its own home), padding spread within the zone caps.
    let attacker = Army {
        machines: vec![
            with_move(tank(&rs, "Grizzly", ZoneId::Middle, 0), MovementMode::Advance),
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Front, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    let zones = zones_over_time(&run(&rs, attacker, anvils(&rs), 0x0AD5), 0);
    assert!(
        zones.iter().all(|&z| z == ZoneId::Middle),
        "an Advance unit with a reachable target must idle (stay in Middle), not march to Front: {zones:?}"
    );
}

/// A stranded Advance unit (no reachable enemy) still closes the distance — it only idles *because* it
/// has a target, so with the enemy out of its starting reach it steps forward to make contact.
#[test]
fn advance_closes_when_stranded() {
    let rs = anvil_rs();
    // Rear tank, all enemies up front: from Rear it reaches nothing, so it must advance toward contact.
    let attacker = Army {
        machines: vec![
            with_move(tank(&rs, "Grizzly", ZoneId::Rear, 0), MovementMode::Advance),
            tank(&rs, "Grizzly", ZoneId::Rear, 1),
            tank(&rs, "Grizzly", ZoneId::Rear, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };
    let enemy = anvils(&rs);
    // Placed in Rear; the tick-0 snapshot is post-movement, so it has already begun closing. It must
    // reach the contact line (Middle, from where it can engage the Front enemies) rather than sit idle.
    let zones = zones_over_time(&run(&rs, attacker, enemy, 0x0AD5), 0);
    assert!(
        zones.iter().any(|&z| z == ZoneId::Middle || z == ZoneId::Front),
        "a stranded Advance unit must close the distance from Rear toward contact: {zones:?}"
    );
}

/// FallBack **ducks then returns**: a Front tank ordered to fall back gives up one zone (Front→Middle),
/// holds the duck, then returns to its home zone (Front) — it never flees and rots in the rear.
#[test]
fn fallback_ducks_then_returns_home() {
    let rs = anvil_rs();
    // A lone Front tank (home = Front) on FallBack, with room to return (nobody else in Front).
    let attacker = Army {
        machines: vec![
            with_move(tank(&rs, "Grizzly", ZoneId::Front, 0), MovementMode::FallBack),
            tank(&rs, "Grizzly", ZoneId::Middle, 1),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    // The tick-0 snapshot is recorded *after* movement, so the duck (Front→Middle) has already begun.
    let zones = zones_over_time(&run(&rs, attacker, anvils(&rs), 0x0FB1), 0);
    assert!(
        zones.iter().any(|&z| z == ZoneId::Middle),
        "FallBack must duck one zone back (Front→Middle): {zones:?}"
    );
    // After the duck it returns home and stays there — the last zone observed is the home zone.
    assert_eq!(
        zones.last(),
        Some(&ZoneId::Front),
        "FallBack must return to its home zone, not rot in the rear: {zones:?}"
    );
}

/// Kite **oscillates around the contact line**: a Rear-home kite has no target from Rear, so it closes to
/// Middle to make contact; with a target in reach it gives ground back toward home (Middle→Rear); out of
/// reach again it re-closes. So — unlike Advance (which idles once in reach) or Hold (which never moves) —
/// it both reaches contact *and* steps back from it. It never retreats behind its home zone.
#[test]
fn kite_gives_ground_around_the_contact_line() {
    let rs = anvil_rs();
    // A Rear-home kite (home = Rear): from Rear it reaches nothing, from Middle it reaches the front
    // anvils. Padding fills the other slots; nobody else is a kite.
    let attacker = Army {
        machines: vec![
            with_move(tank(&rs, "Grizzly", ZoneId::Rear, 0), MovementMode::Kite),
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Front, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    let zones = zones_over_time(&run(&rs, attacker, anvils(&rs), 0x0C17E), 0);
    // It closes to the contact line ...
    assert!(
        zones.iter().any(|&z| z == ZoneId::Middle),
        "a kite must close from Rear to contact (Middle): {zones:?}"
    );
    // ... and gives ground back toward home at least once (a Middle→Rear step), which Advance never does.
    let gives_ground = zones.windows(2).any(|w| w == [ZoneId::Middle, ZoneId::Rear]);
    assert!(
        gives_ground,
        "a kite must give ground (Middle→Rear) once it has a target, not idle in reach: {zones:?}"
    );
    // It never over-retreats behind its home zone (Rear is the deepest ground it ever occupies).
    assert!(
        !zones.iter().any(|&z| z == ZoneId::Air),
        "a ground kite must never leave the ground: {zones:?}"
    );
}
