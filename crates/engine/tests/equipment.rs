//! v3 equipment engine hooks (spec 015, US3) — the pieces the sim's core loop reads.
//!
//! Two hooks are exercised through the public `resolve`: the **target-draw** offset (Decoy +2 pulls
//! fire, ECM −2 sheds it — feeding the priority-score chain from US2b) and the **Paint** on-hit rider
//! (a marked target takes extra damage from further fire). Magnitudes are start-values.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::{Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{Capability, EquipmentId, MachineTypeId, ZoneId};
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

fn tank(rs: &Ruleset, variant: &str, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::HeavyTank, variant, zone, id)
}

/// Put an equipment id in a machine's first utility slot (its stock loadout has ≥1).
fn with_util(mut m: MachineInstance, util: &str) -> MachineInstance {
    m.loadout.utilities[0] = EquipmentId::new(util);
    m
}

fn death_tick(out: &BattleOutput, id: u8) -> u16 {
    let u = UnitRef {
        side: Side::B,
        instance_id: id,
    };
    match out.result.machine_fates.iter().find(|f| f.unit == u).map(|f| f.fate) {
        Some(Fate::DestroyedAtTick(t)) => t,
        _ => u16::MAX,
    }
}

/// **Decoy** (+2 draw) pulls fire: with two equal enemies in one reachable zone, the Decoy-equipped one
/// (id 0) is picked over its plain rowmate (id 1) by the priority score, so it dies first. **ECM** (−2)
/// does the reverse — the ECM unit is shed and its rowmate dies first.
#[test]
fn decoy_draws_fire_and_ecm_sheds_it() {
    let rs = seed_ruleset();
    // Attackers in Middle (default chain, no filters → everyone base 0, so the ±2 draw decides).
    let attackers = || Army {
        machines: vec![
            tank(&rs, "Grizzly", ZoneId::Middle, 0),
            tank(&rs, "Grizzly", ZoneId::Middle, 1),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    // Side B: two rowmates in Middle (ids 0,1) — one carries the draw module — plus Rear padding.
    let defender = |util0: Option<&str>| Army {
        machines: vec![
            match util0 {
                Some(u) => with_util(tank(&rs, "Grizzly", ZoneId::Middle, 0), u),
                None => tank(&rs, "Grizzly", ZoneId::Middle, 0),
            },
            tank(&rs, "Grizzly", ZoneId::Middle, 1),
            tank(&rs, "Grizzly", ZoneId::Rear, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Grizzly", ZoneId::Front, 4),
        ],
    };

    // Decoy on id 0 → id 0 is targeted first → dies before its rowmate id 1.
    let decoy = run(&rs, attackers(), defender(Some("Decoy")), 0xDEC0);
    assert!(
        death_tick(&decoy, 0) < death_tick(&decoy, 1),
        "a Decoy unit must draw fire and fall first: decoy@{} rowmate@{}",
        death_tick(&decoy, 0),
        death_tick(&decoy, 1)
    );
    // ECM on id 0 → id 0 is shed → its rowmate id 1 falls first instead.
    let ecm = run(&rs, attackers(), defender(Some("ECMSuite")), 0xDEC0);
    assert!(
        death_tick(&ecm, 1) < death_tick(&ecm, 0),
        "an ECM unit must shed fire so its rowmate falls first: ecm@{} rowmate@{}",
        death_tick(&ecm, 0),
        death_tick(&ecm, 1)
    );
}

/// The **Paint** on-hit rider amplifies further fire: a target focused by a Spotter-equipped attacker
/// (whose hits mark it) dies sooner than the same target faced by an identical attacker without the
/// Spotter. Measured against an otherwise-fixed setup so only the mark differs.
#[test]
fn paint_rider_amplifies_incoming_damage() {
    let rs = seed_ruleset();
    // A single fragile target (id 0), the only reachable enemy, plus out-of-reach padding.
    let defender = || Army {
        machines: vec![
            tank(&rs, "Cavalier", ZoneId::Front, 0),
            tank(&rs, "Grizzly", ZoneId::Rear, 1),
            tank(&rs, "Grizzly", ZoneId::Rear, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Bulwark", ZoneId::Middle, 4),
        ],
    };
    // Side A: three Front attackers; the lead one optionally carries the Spotter (Paint).
    let attackers = |painter: bool| Army {
        machines: vec![
            {
                let m = tank(&rs, "Grizzly", ZoneId::Front, 0);
                if painter {
                    with_util(m, "Spotter")
                } else {
                    m
                }
            },
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Front, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };

    let painted = death_tick(&run(&rs, attackers(true), defender(), 0x9A17), 0);
    let plain = death_tick(&run(&rs, attackers(false), defender(), 0x9A17), 0);
    assert!(
        painted < plain,
        "a Paint mark must hasten the target's death: painted@{painted} plain@{plain}"
    );
}

/// Sanity: equipping the draw modules keeps the build legal and the derived `target_draw` reads back
/// (+2 Decoy, −2 ECM, 0 default) — the value the priority-score chain consumes.
#[test]
fn target_draw_derives_from_equipment() {
    use engine::model::army::derive_effective_stats;
    let rs = seed_ruleset();
    let base = tank(&rs, "Grizzly", ZoneId::Front, 0);
    let draw = |util: Option<&str>| {
        let m = match util {
            Some(u) => with_util(base.clone(), u),
            None => base.clone(),
        };
        derive_effective_stats(&m, &rs).unwrap().target_draw
    };
    assert_eq!(draw(None), 0, "no draw module → 0");
    assert_eq!(draw(Some("Decoy")), 2, "Decoy → +2");
    assert_eq!(draw(Some("ECMSuite")), -2, "ECM → −2");
}

// ---------------------------------------------------------------------------
// v3 US3 on-hit riders (EMP / Suppress / Snare) — the graded soft counters.
// ---------------------------------------------------------------------------

fn death_tick_side(out: &BattleOutput, side: Side, id: u8) -> u16 {
    let u = UnitRef {
        side,
        instance_id: id,
    };
    match out.result.machine_fates.iter().find(|f| f.unit == u).map(|f| f.fate) {
        Some(Fate::DestroyedAtTick(t)) => t,
        _ => u16::MAX,
    }
}

/// The three rider utilities each unlock their capability (the sim reads it on the attacker's hits).
#[test]
fn rider_utilities_unlock_capabilities() {
    use engine::model::army::derive_effective_stats;
    let rs = seed_ruleset();
    let base = tank(&rs, "Grizzly", ZoneId::Front, 0);
    let caps = |util: &str| {
        derive_effective_stats(&with_util(base.clone(), util), &rs)
            .unwrap()
            .capabilities
    };
    assert!(caps("EMPAmmo").contains(&Capability::OnHitEmp), "EMP Ammo → OnHitEmp");
    assert!(
        caps("SuppressingFire").contains(&Capability::OnHitSuppress),
        "Suppressing Fire → OnHitSuppress"
    );
    assert!(caps("SnareShot").contains(&Capability::OnHitSnare), "Snare Shot → OnHitSnare");
}

/// **EMP** (anti-sustain) blocks incoming heals: a focused target kept alive by a WholeArmy Medic dies
/// **sooner** when the attacking lead carries EMP Ammo (its heals are cut) than when it does not. Only
/// the EMP module differs between the two runs.
#[test]
fn emp_rider_blocks_healing() {
    let rs = seed_ruleset();
    // Side B: one fragile focused target (id 0, the only reachable enemy) sustained by a Medic
    // (WholeArmy heal) in Rear; the rest padded out of reach so all fire lands on id 0.
    let defender = || Army {
        machines: vec![
            tank(&rs, "Cavalier", ZoneId::Front, 0),
            tank(&rs, "Grizzly", ZoneId::Rear, 1),
            tank(&rs, "Grizzly", ZoneId::Rear, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    };
    // Side A: two Front attackers; the lead one optionally carries EMP Ammo.
    let attackers = |emp: bool| Army {
        machines: vec![
            {
                let m = tank(&rs, "Grizzly", ZoneId::Front, 0);
                if emp {
                    with_util(m, "EMPAmmo")
                } else {
                    m
                }
            },
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    let emp = death_tick_side(&run(&rs, attackers(true), defender(), 0xE43), Side::B, 0);
    let plain = death_tick_side(&run(&rs, attackers(false), defender(), 0xE43), Side::B, 0);
    assert!(
        emp < plain,
        "EMP must cut the target's heals so it falls sooner: emp@{emp} healed@{plain}"
    );
}

/// **Suppress** cuts the hit target's own output: an army whose lead carries Suppressing Fire drives the
/// enemy's total damage **down** (the suppressed enemies deal less) versus the same setup without it.
#[test]
fn suppress_rider_cuts_enemy_output() {
    let rs = seed_ruleset();
    // A durable 5v5 mirror so both sides trade fire for many ticks (suppression accumulates).
    let side_a = |suppress: bool| Army {
        machines: vec![
            {
                let m = tank(&rs, "Grizzly", ZoneId::Front, 0);
                if suppress {
                    with_util(m, "SuppressingFire")
                } else {
                    m
                }
            },
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Front, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };
    let side_b = || Army {
        machines: vec![
            tank(&rs, "Grizzly", ZoneId::Front, 0),
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Front, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            tank(&rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };
    let dmg_b = |suppress: bool| {
        run(&rs, side_a(suppress), side_b(), 0x50FF)
            .result
            .side(Side::B)
            .damage_dealt
            .milli()
    };
    let suppressed = dmg_b(true);
    let plain = dmg_b(false);
    assert!(
        suppressed < plain,
        "Suppress must reduce the enemy's cumulative damage: suppressed={suppressed} plain={plain}"
    );
}

// ---------------------------------------------------------------------------
// v3 US1c — cadence welded to damage type + chassis (design §D6).
// ---------------------------------------------------------------------------

/// Cadence derives from the damage TYPE (+ chassis), overriding the weapon's own tier: Energy Fast,
/// Kinetic Medium, Explosive Slow; heavy-platform chassis (Heavy Tank, Mech) fire one tier slower,
/// Artillery one tier slower (Explosive → Siege).
#[test]
fn cadence_welds_to_type_and_chassis() {
    use engine::model::army::derive_effective_stats;
    use engine::model::types::CadenceTier;
    let rs = seed_ruleset();
    let cad = |t: MachineTypeId, variant: &str, weapon: &str| {
        let mut m = stock_instance(&rs, t, variant, ZoneId::Front, 0);
        m.loadout.weapon = EquipmentId::new(weapon);
        m.loadout.utilities.clear(); // drop the stock Autoloader so we read the raw welded tier
        derive_effective_stats(&m, &rs).unwrap().cadence
    };
    // Kinetic = Medium; a Light tank (not a heavy platform) keeps Medium.
    assert_eq!(cad(MachineTypeId::LightTank, "Scout", "Autocannon"), CadenceTier::Medium);
    // Energy = Fast (Light tank, no chassis modifier).
    assert_eq!(cad(MachineTypeId::LightTank, "Scout", "ArcRepeater"), CadenceTier::Fast);
    // Heavy platform: Kinetic Medium → one tier slower → Slow.
    assert_eq!(cad(MachineTypeId::HeavyTank, "Grizzly", "HeavyCannon"), CadenceTier::Slow);
    // Derive WINS over the weapon's own tier: the Railgun authors CadenceTier::Siege, but a heavy
    // platform firing Kinetic welds to Medium → Slow, not Siege.
    assert_eq!(cad(MachineTypeId::HeavyTank, "Grizzly", "Railgun"), CadenceTier::Slow);
    // Artillery firing its native Explosive: Slow → one tier slower → Siege.
    assert_eq!(cad(MachineTypeId::Artillery, "Longbow", "Howitzer"), CadenceTier::Siege);
}
