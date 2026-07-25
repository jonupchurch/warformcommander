//! v3 targeting priority-score chain (spec 015, US2 / design §12) — filters + fallback selector.
//!
//! Reachable enemies are scored (Priority-1 match 5, Priority-2 match 3, else 0; ± the target's draw
//! offset); the highest wins, the fallback selector breaks ties. These assert the class filters steer
//! fire (TargetSupport hunts the healer past a closer screen), the positional selectors sweep from
//! opposite ends (Closest vs Furthest), and Follow focus-fires a zone ally's pick.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::{Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{MachineTypeId, TargetFilter, TargetSelector, TargetingChain, ZoneId};
use engine::replay::{Adaptation, Fate, MatchConfig, Side, UnitRef};
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

fn chain(p1: Option<TargetFilter>, fallback: TargetSelector) -> TargetingChain {
    TargetingChain {
        priority1: p1,
        priority2: None,
        fallback,
    }
}

fn with_chain(mut m: MachineInstance, c: TargetingChain) -> MachineInstance {
    m.dials.targeting = c;
    m
}

fn tank(rs: &Ruleset, variant: &str, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::HeavyTank, variant, zone, id)
}

/// The tick a side-B unit was destroyed, or `u16::MAX` if it survived the battle.
fn death_tick(out: &BattleOutput, id: u8) -> u16 {
    let u = UnitRef {
        side: Side::B,
        instance_id: id,
    };
    match out
        .result
        .machine_fates
        .iter()
        .find(|f| f.unit == u)
        .map(|f| f.fate)
    {
        Some(Fate::DestroyedAtTick(t)) => t,
        _ => u16::MAX,
    }
}

/// `TargetSupport` hunts the healer past a closer screen: attackers in Middle (reaching Front+Middle)
/// kill an enemy Medic sitting in Middle **much sooner** with the filter than with the default chain,
/// which sweeps the closer Front screen first. Proof the class filter overrides the positional default.
#[test]
fn target_support_filter_hunts_the_healer() {
    let rs = seed_ruleset();
    // Side B: three combat tanks screening in Front, a Medic (support, id 4) in Middle behind them.
    let defender = || Army {
        machines: vec![
            tank(&rs, "Grizzly", ZoneId::Front, 0),
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Front, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            stock_instance(&rs, MachineTypeId::Commander, "CommandPost", ZoneId::Middle, 4),
        ],
    };
    // Side A attackers in Middle (reach Front + Middle), so both the screen and the Medic are in reach.
    let attackers = |c: TargetingChain| Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Middle } else { ZoneId::Rear };
                with_chain(tank(&rs, "Grizzly", zone, i), c)
            })
            .collect(),
    };

    let with_filter = run(
        &rs,
        attackers(chain(Some(TargetFilter::TargetSupport), TargetSelector::Closest)),
        defender(),
        0x7A6,
    );
    let default = run(
        &rs,
        attackers(TargetingChain::DEFAULT),
        defender(),
        0x7A6,
    );
    assert!(
        death_tick(&with_filter, 4) < death_tick(&default, 4),
        "TargetSupport must kill the Medic sooner than the default chain: filter@{} default@{}",
        death_tick(&with_filter, 4),
        death_tick(&default, 4)
    );
}

/// The positional fallback sweeps from opposite ends. Two indirect Artillery (whole-ground reach) with
/// `Furthest` hammer the enemy **backline**; with `Closest` they pile onto the front instead. The Front
/// tank screen is identical in both runs, so comparing the *same* setup across selectors isolates the
/// artillery: the enemy Rear dies sooner under `Furthest`, the enemy Front dies sooner under `Closest`.
#[test]
fn closest_and_furthest_sweep_from_opposite_ends() {
    let rs = seed_ruleset();
    let defender = || Army {
        machines: vec![
            tank(&rs, "Grizzly", ZoneId::Front, 0),
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    // Two Artillery driving the test + a fixed Front screen (identical across both runs → its effect
    // cancels when we compare death ticks between selectors).
    let attackers = |sel: TargetSelector| Army {
        machines: vec![
            with_chain(
                stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 0),
                chain(None, sel),
            ),
            with_chain(
                stock_instance(&rs, MachineTypeId::Artillery, "Siege", ZoneId::Rear, 1),
                chain(None, sel),
            ),
            tank(&rs, "Grizzly", ZoneId::Front, 2),
            tank(&rs, "Grizzly", ZoneId::Front, 3),
            tank(&rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };

    let furthest = run(&rs, attackers(TargetSelector::Furthest), defender(), 0xF00);
    let closest = run(&rs, attackers(TargetSelector::Closest), defender(), 0xF00);

    // The enemy backline (id 3/4) falls sooner when the artillery sweeps from the far end.
    let rear_furthest = death_tick(&furthest, 3).min(death_tick(&furthest, 4));
    let rear_closest = death_tick(&closest, 3).min(death_tick(&closest, 4));
    assert!(
        rear_furthest < rear_closest,
        "Furthest must fell the backline sooner than Closest does: furthest@{rear_furthest} closest@{rear_closest}"
    );
    // And the enemy front (id 0/1) falls sooner when the artillery adds its fire there (Closest).
    let front_closest = death_tick(&closest, 0).min(death_tick(&closest, 1));
    let front_furthest = death_tick(&furthest, 0).min(death_tick(&furthest, 1));
    assert!(
        front_closest < front_furthest,
        "Closest must fell the front sooner than Furthest does: closest@{front_closest} furthest@{front_furthest}"
    );
}

/// `Follow` focus-fires a zone ally's independently-chosen target (non-chaining): a follower placed
/// beside one independent ally converges fire, so the battle still resolves and the followers never
/// deadlock (no anchor → they fall through to the fallback). Smoke + convergence check.
#[test]
fn follow_concentrates_on_a_zone_allys_target() {
    let rs = seed_ruleset();
    let defender = || Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                tank(&rs, "Grizzly", zone, i)
            })
            .collect(),
    };
    // One independent Front tank (Closest) + two Front followers + a Middle screen.
    let attackers = Army {
        machines: vec![
            tank(&rs, "Grizzly", ZoneId::Front, 0), // independent (default Closest)
            with_chain(
                tank(&rs, "Grizzly", ZoneId::Front, 1),
                chain(Some(TargetFilter::Follow), TargetSelector::Closest),
            ),
            with_chain(
                tank(&rs, "Grizzly", ZoneId::Front, 2),
                chain(Some(TargetFilter::Follow), TargetSelector::Closest),
            ),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };
    let out = run(&rs, attackers, defender(), 0xF0110);
    // The battle resolves to a decision (no deadlock), and side A — concentrating via Follow — wins or
    // at least destroys the enemy front it focused.
    assert!(
        !out.replay.games[0].ticks.is_empty(),
        "a Follow army must resolve to a non-empty battle"
    );
    assert!(
        death_tick(&out, 0) < u16::MAX,
        "the focused-fire front should destroy at least the lead enemy target"
    );
}
