//! US2 T015/T016 — the flag rules beyond the planted-dominant headline: underpowered flagging
//! (FR-009), the structural free-turtle degenerate (FR-008, §8.2), **interval-gating** so a wide
//! small-sample interval that straddles the band is NOT flagged (FR-011, no noise flags), and
//! worst-first severity ordering (FR-010).

use balancer::archetypes::default_field;
use balancer::flags::{classify, classify_all};
use balancer::report::model::{FairBand, FlagKind};
use balancer::stats::wilson;
use balancer::sweep::{run_sweep, CandidateResult, SweepConfig};

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::types::{
    DialKey, DialValue, MachineTypeId, MovementMode, PlanBSlot, PlanBTrigger, Stance,
    TriggerCondition, ZoneId,
};

fn stock_army() -> Army {
    let rs = seed_ruleset();
    Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                3,
            ),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 4),
        ],
    }
}

fn candidate(
    label: &str,
    army: Army,
    wins: u32,
    samples: u32,
    clean_sweep: bool,
) -> CandidateResult {
    CandidateResult {
        label: label.into(),
        army,
        across_field_win_rate: wins as f64 / samples as f64,
        ci95: wilson(wins, samples),
        wins,
        samples,
        clean_sweep,
    }
}

const BAND: FairBand = FairBand {
    floor: 0.40,
    ceiling: 0.60,
};

#[test]
fn a_free_turtle_is_flagged_degenerate() {
    let mut army = stock_army();
    army.machines[0].dials.stance = Stance::Aggressive;
    army.machines[0].plan_b = vec![PlanBTrigger {
        slot: PlanBSlot::Slot1,
        condition: TriggerCondition::HullBelowPct(5_000),
        dial: DialKey::Movement,
        plan_b_value: DialValue::Movement(MovementMode::FallBack),
    }];
    // A mid win rate (would not itself be flagged) — the structural free-turtle is what flags it.
    let flag = classify(&candidate("turtle", army, 500, 1000, false), &BAND).expect("must flag");
    assert_eq!(flag.kind, FlagKind::Degenerate);
    assert!(flag.reason.contains("free-turtle"));
}

#[test]
fn an_underpowered_combo_is_flagged() {
    // Interval entirely below the floor (0.20 over a large sample).
    let flag =
        classify(&candidate("weak", stock_army(), 200, 1000, false), &BAND).expect("must flag");
    assert_eq!(flag.kind, FlagKind::Underpowered);
}

#[test]
fn a_straddling_small_sample_interval_is_not_flagged() {
    // Point estimate 0.62 (above the ceiling) but a wide small-sample interval that straddles 0.60
    // → NOT flagged (interval-gated, FR-011): a flag needs the interval, not the point, to clear.
    let c = candidate("noisy", stock_army(), 31, 50, false);
    assert!(
        c.ci95.low < BAND.ceiling,
        "interval should straddle the ceiling"
    );
    assert!(
        classify(&c, &BAND).is_none(),
        "must not flag on a straddling small-sample interval"
    );
}

#[test]
fn flags_are_sorted_worst_first() {
    let rs = seed_ruleset();
    let sweep = run_sweep(
        &default_field(),
        &rs,
        &SweepConfig {
            base_seed: 1,
            samples_per_matchup: 80,
            threads: None,
            ..Default::default()
        },
    );
    let flags = classify_all(&sweep, &BAND);
    assert!(
        flags.len() >= 2,
        "baseline field has multiple out-of-band archetypes"
    );
    for w in flags.windows(2) {
        assert!(
            w[0].severity >= w[1].severity,
            "flags must be sorted by severity descending"
        );
    }
}
