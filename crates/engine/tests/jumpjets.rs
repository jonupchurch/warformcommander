//! v3 US3-C — Jump Jets: the temporary ground⇄air duty cycle, exercised through the **public** API.
//!
//! Jump Jets grant a ground chassis a periodic leap into the Air layer — full air-to-air fire and
//! whole-battlefield reach — paid for by AA exposure and a ground cooldown (~50% duty). The duty-cycle
//! state machine is sim-internal; here we assert the observable consequences: the capability derives,
//! and a jumper actually reaches the Air zone and lands back home, deterministically.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::{derive_effective_stats, Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{Capability, EquipmentId, MachineTypeId, ZoneId};
use engine::replay::{Adaptation, MatchConfig, Side, TickEvent, UnitRef};
use engine::validate::validate;
use engine::{resolve, BattleInput, BattleOutput};

/// A stock Mech fitted with Jump Jets as its sole utility (cost 3 fits the Mech's utility budget).
fn jump_mech(rs: &Ruleset, zone: ZoneId, instance_id: u8) -> MachineInstance {
    let mut m = stock_instance(rs, MachineTypeId::Mech, "Vanguard", zone, instance_id);
    m.loadout.utilities = vec![EquipmentId::new("JumpJets")];
    m
}

/// Four durable heavy tanks in the rear zones — padding that fills a legal 5-unit army. Being air-blind
/// they never threaten the jumper while it is airborne, so a full leap cycle always completes.
fn heavy_padding(rs: &Ruleset, first_id: u8) -> Vec<MachineInstance> {
    let z = |k: u8| if k < 2 { ZoneId::Middle } else { ZoneId::Rear };
    (0..4)
        .map(|k| stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", z(k), first_id + k))
        .collect()
}

/// The jumper's `Move` events, in order, as `(from, to)` zone pairs.
fn jumper_moves(out: &BattleOutput, unit: UnitRef) -> Vec<(ZoneId, ZoneId)> {
    out.replay.games[0]
        .ticks
        .iter()
        .flat_map(|t| &t.events)
        .filter_map(|e| match e {
            TickEvent::Move {
                unit: u, from, to, ..
            } if *u == unit => Some((*from, *to)),
            _ => None,
        })
        .collect()
}

/// A jump-jet Mech (Front, Side B) plus air-blind padding, versus a stock heavy-tank squad.
fn jump_battle(rs: &Ruleset) -> BattleOutput {
    let mut defender = vec![jump_mech(rs, ZoneId::Front, 0)];
    defender.extend(heavy_padding(rs, 1));
    let attacker: Vec<MachineInstance> = (0..5)
        .map(|i| {
            let z = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
            stock_instance(rs, MachineTypeId::HeavyTank, "Cavalier", z, i)
        })
        .collect();
    let armies = [Army { machines: attacker }, Army { machines: defender }];
    // The loadout must be legal — JumpJets (cost 3) fits within the Mech's utility budget.
    assert!(
        validate(&armies[1], rs).is_ok(),
        "the jump-mech army must be legal: {:?}",
        validate(&armies[1], rs)
    );
    resolve(&BattleInput {
        armies,
        ruleset: rs.clone(),
        seed: 0x1EAF,
        match_config: MatchConfig {
            adaptation: Adaptation::Locked,
            defender_side: Side::B,
            best_of: 1,
        },
    })
    .expect("legal squads")
}

/// The Jump Jets utility derives the `JumpJets` capability (and a stock Mech, without it, does not).
#[test]
fn jump_jets_capability_derives() {
    let rs = seed_ruleset();
    let jumper = derive_effective_stats(&jump_mech(&rs, ZoneId::Front, 0), &rs).unwrap();
    assert!(
        jumper.capabilities.contains(&Capability::JumpJets),
        "the Jump Jets utility must derive the JumpJets capability"
    );
    let plain = derive_effective_stats(
        &stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 0),
        &rs,
    )
    .unwrap();
    assert!(
        !plain.capabilities.contains(&Capability::JumpJets),
        "a Mech without Jump Jets must not carry the capability"
    );
}

/// A jumper leaps into the Air zone and later lands back at its home (Front) row — the duty cycle
/// repositions it and never strands it aloft. Behavior resolves before attacks, so the tick-1 takeoff
/// is guaranteed, and the air-blind opponents cannot shoot it down mid-leap before it lands.
#[test]
fn jump_jets_leaps_to_air_and_returns_home() {
    let rs = seed_ruleset();
    let jumper = UnitRef {
        side: Side::B,
        instance_id: 0,
    };
    let moves = jumper_moves(&jump_battle(&rs), jumper);

    let first_air = moves
        .iter()
        .position(|(_, to)| *to == ZoneId::Air)
        .unwrap_or_else(|| panic!("a jumper must leap into the Air zone: moves={moves:?}"));
    assert!(
        moves[first_air + 1..]
            .iter()
            .any(|(from, to)| *from == ZoneId::Air && *to == ZoneId::Front),
        "after leaping, the jumper must land back home (Front): moves={moves:?}"
    );
}

/// A Jump-Jet battle reproduces byte-identically on replay — the duty-cycle state machine is fully
/// deterministic (no RNG, a pure function of tick state).
#[test]
fn jump_jets_battle_is_deterministic() {
    let rs = seed_ruleset();
    assert_eq!(
        jump_battle(&rs).replay.digest(),
        jump_battle(&rs).replay.digest(),
        "a Jump-Jet battle must reproduce byte-identically"
    );
}
