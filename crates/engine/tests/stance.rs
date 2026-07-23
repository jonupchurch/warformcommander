//! v3 stance dial (spec 015, US4) — stance as a **two-sided magnitude** axis, not the v2
//! fire-allocation axis it replaced.
//!
//! There are three universal postures now (Aggressive / Neutral / Defensive). A machine's stance
//! scales its own **output** (weapon damage or a support projection) and accuracy on the way out, and
//! its **incoming** damage and evasion on the way in — read live from the current dials, so a Plan-B
//! flip takes effect at once. These tests assert the ordering of both sides through the public
//! `resolve`, and that a Neutral field is the identity baseline (all magnitudes are start-values).

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::{Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{MachineTypeId, Stance, VariantId, ZoneId};
use engine::replay::{Adaptation, MatchConfig, Side, SupportKind, TickEvent, UnitRef};
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

fn with_stance(mut m: MachineInstance, stance: Stance) -> MachineInstance {
    m.dials.stance = stance;
    m
}

fn tank(rs: &Ruleset, variant: &str, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::HeavyTank, variant, zone, id)
}

/// A ruleset whose "Bulwark" heavy is an effectively-unkillable, near-harmless anvil: enormous hull
/// (so no side can wipe the other before the tick cap) and trivial damage (so the measuring side
/// survives the whole battle). This isolates the stance magnitude from attrition/kill-race noise, so
/// cumulative `damage_dealt` over the full battle reflects per-hit output, not who died first.
fn anvil_rs() -> Ruleset {
    use engine::fixed::Fixed;
    let mut rs = seed_ruleset();
    let bulwark = rs.variants.get_mut(&VariantId::new("Bulwark")).unwrap();
    bulwark.hull = Fixed::from_int(500_000);
    bulwark.damage = Fixed::from_int(1);
    rs
}

/// A legal five-heavy line (3 Front / 2 Middle), every machine holding `stance`.
fn line(rs: &Ruleset, variant: &str, stance: Stance) -> Army {
    Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                with_stance(tank(rs, variant, zone, i), stance)
            })
            .collect(),
    }
}

/// Five same-stance Grizzly attackers.
fn attackers(rs: &Ruleset, stance: Stance) -> Army {
    line(rs, "Grizzly", stance)
}

/// Five same-stance Bulwark anvils.
fn anvils(rs: &Ruleset, stance: Stance) -> Army {
    line(rs, "Bulwark", stance)
}

/// Total hull side A dealt across the battle.
fn damage_dealt_a(out: &BattleOutput) -> i64 {
    out.result.side(Side::A).damage_dealt.milli()
}

/// An **attacker's** stance scales its outgoing output (FR: stance is a magnitude axis): against a
/// fixed Neutral anvil, an Aggressive attacker out-damages Neutral, which out-damages Defensive
/// (−20% output). Anvils are unkillable and harmless, so this compares per-hit output cleanly.
#[test]
fn attacker_stance_orders_outgoing_output() {
    let rs = anvil_rs();
    let dealt = |st: Stance| damage_dealt_a(&run(&rs, attackers(&rs, st), anvils(&rs, Stance::Neutral), 0x0A66));

    let aggressive = dealt(Stance::Aggressive);
    let neutral = dealt(Stance::Neutral);
    let defensive = dealt(Stance::Defensive);
    assert!(
        aggressive > neutral && neutral > defensive,
        "attacker output must order Aggressive > Neutral > Defensive: agg={aggressive} neu={neutral} def={defensive}"
    );
}

/// A **target's** stance scales the damage it takes: a fixed Neutral attacker deals MORE to an
/// Aggressive anvil (+10% taken) than to a Neutral one, and LESS to a Defensive one (−taken + evasion).
#[test]
fn target_stance_orders_incoming_damage() {
    let rs = anvil_rs();
    let dealt = |st: Stance| damage_dealt_a(&run(&rs, attackers(&rs, Stance::Neutral), anvils(&rs, st), 0x0A66));

    let vs_aggressive = dealt(Stance::Aggressive);
    let vs_neutral = dealt(Stance::Neutral);
    let vs_defensive = dealt(Stance::Defensive);
    assert!(
        vs_aggressive > vs_neutral && vs_neutral > vs_defensive,
        "incoming damage must order Aggressive > Neutral > Defensive target: agg={vs_aggressive} neu={vs_neutral} def={vs_defensive}"
    );
}

/// An all-Neutral field is the identity baseline: applying Neutral stance changes nothing versus the
/// engine's default posture (the whole stance table is a no-op at Neutral, so goldens are unmoved).
#[test]
fn neutral_stance_is_the_identity_baseline() {
    let rs = seed_ruleset();
    let stream = |o: &BattleOutput| serde_json::to_vec(&o.replay.games).unwrap();
    // A stock army (default dials already Neutral) vs an explicitly-Neutral-set copy: byte-identical.
    let stock = || Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                tank(&rs, "Grizzly", zone, i)
            })
            .collect(),
    };
    let neutralised = || Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                with_stance(tank(&rs, "Grizzly", zone, i), Stance::Neutral)
            })
            .collect(),
    };
    let enemy = || Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                tank(&rs, "Cavalier", zone, i)
            })
            .collect(),
    };
    assert_eq!(
        stream(&run(&rs, stock(), enemy(), 0x5A5A)),
        stream(&run(&rs, neutralised(), enemy(), 0x5A5A)),
        "explicitly setting Neutral must be identical to the default posture"
    );
}

/// The largest single heal a support machine projected in one tick — its per-tick projection ceiling.
/// While an ally is missing more hull than the per-tick amount (true under sustained fire), the heal
/// equals the full projected `support_power`, so this isolates the stance **output** scale from how
/// long anyone survived (which a Defensive medic, taking less, would otherwise inflate).
fn max_heal_from(out: &BattleOutput, actor: UnitRef) -> i64 {
    let mut best = 0i64;
    for t in &out.replay.games[0].ticks {
        for e in &t.events {
            if let TickEvent::Support {
                actor: a,
                amount,
                kind: SupportKind::Heal,
                ..
            } = e
            {
                if *a == actor {
                    best = best.max(amount.milli());
                }
            }
        }
    }
    best
}

/// Stance scales a support **projection** the same way it scales a weapon (the "output = weapon damage
/// OR projection" rule): a Defensive medic repairs less total hull than a Neutral one over the battle.
#[test]
fn defensive_support_projects_less_than_neutral() {
    let rs = seed_ruleset();
    let medic_ref = UnitRef {
        side: Side::A,
        instance_id: 4,
    };
    // Two wounded fronts the medic can service, under fire so there is always a repair target.
    let army = |st: Stance| Army {
        machines: vec![
            tank(&rs, "Grizzly", ZoneId::Front, 0),
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Middle, 3),
            with_stance(
                stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
                st,
            ),
        ],
    };
    let enemy = || Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                tank(&rs, "Bulwark", zone, i)
            })
            .collect(),
    };

    let neutral = max_heal_from(&run(&rs, army(Stance::Neutral), enemy(), 0x5011), medic_ref);
    let defensive = max_heal_from(&run(&rs, army(Stance::Defensive), enemy(), 0x5011), medic_ref);
    assert!(
        neutral > 0 && defensive < neutral,
        "a Defensive support must project a smaller per-tick heal than a Neutral one: neutral={neutral} defensive={defensive}"
    );
}
