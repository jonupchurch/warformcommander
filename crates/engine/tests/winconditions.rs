//! US4 (T040/T041): win conditions + the best-of-three match wrapper.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::ruleset::Ruleset;
use engine::model::types::{MachineTypeId, ZoneId};
use engine::replay::{Adaptation, MatchConfig, RewardTier, Side, WinCondition};
use engine::{resolve, BattleInput};

fn config() -> MatchConfig {
    MatchConfig {
        adaptation: Adaptation::Locked,
        defender_side: Side::B,
        best_of: 3,
    }
}

/// A decisive mixed squad (attacker A) vs a weaker one (B) — resolves by Conquest.
fn strong_vs_weak() -> (Army, Army) {
    let rs = seed_ruleset();
    let a = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::Mech, "Striker", ZoneId::Front, 2),
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                3,
            ),
            stock_instance(&rs, MachineTypeId::Artillery, "Siege", ZoneId::Rear, 4),
        ],
    };
    let b = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::LightTank, "Outrider", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Middle, 3),
            stock_instance(&rs, MachineTypeId::LightTank, "Outrider", ZoneId::Middle, 4),
        ],
    };
    (a, b)
}

/// Five healers per side — no offense at all → every game runs to the tick cap.
fn all_support() -> (Army, Army) {
    let rs = seed_ruleset();
    let make = || Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::RearSupport, "Warden", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Middle, 2),
            stock_instance(&rs, MachineTypeId::RearSupport, "Warden", ZoneId::Middle, 3),
            stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    };
    (make(), make())
}

fn input(rs: &Ruleset, a: Army, b: Army, seed: u64) -> BattleInput {
    BattleInput {
        armies: [a, b],
        ruleset: rs.clone(),
        seed,
        match_config: config(),
    }
}

/// T040: a decisive game ends by Conquest at Full reward.
#[test]
fn conquest_pays_full_reward() {
    let rs = seed_ruleset();
    let (a, b) = strong_vs_weak();
    let out = resolve(&input(&rs, a, b, 7)).unwrap();
    let g0 = &out.replay.games[0].game_result;
    assert_eq!(g0.condition, WinCondition::Conquest);
    assert_eq!(g0.reward_tier, RewardTier::Full);
}

/// T040: with no offense on either side, the **stalemate guard** resolves the game via the Time
/// tiebreak — a 0–0 damage tie to the defender (Side B) at Lesser reward. The guard ends it at once
/// rather than idling to the 1000-tick cap (all-support = nobody can ever deal damage).
#[test]
fn time_limit_tie_goes_to_defender_at_lesser_reward() {
    let rs = seed_ruleset();
    let (a, b) = all_support();
    let out = resolve(&input(&rs, a, b, 3)).unwrap();
    let g0 = &out.replay.games[0].game_result;
    assert_eq!(
        g0.condition,
        WinCondition::Time,
        "no offense possible → Time tiebreak, not Conquest"
    );
    assert_eq!(g0.reward_tier, RewardTier::Lesser);
    assert_eq!(g0.winner, Some(Side::B), "0–0 tie → defender");
    assert_eq!(out.result.winner, Side::B, "and the match");
    // The stalemate guard fires immediately (tick 0) instead of running the full cap.
    assert_eq!(g0.duration_ticks, 1, "stalemate guard resolves at once, no idling to the cap");
}

/// T041: a Bo3 is first-to-two — the match winner takes at least two games, in ≤3 games.
#[test]
fn best_of_three_is_first_to_two() {
    let rs = seed_ruleset();
    let (a, b) = strong_vs_weak();
    let out = resolve(&input(&rs, a, b, 11)).unwrap();
    let games = out.replay.games.len();
    assert!(
        (2..=3).contains(&games),
        "a decided Bo3 plays 2 or 3 games (got {games})"
    );

    let winner = out.result.winner;
    let winner_games = out
        .replay
        .games
        .iter()
        .filter(|g| g.game_result.winner == Some(winner))
        .count();
    assert!(
        winner_games >= 2,
        "the match winner took ≥2 games (got {winner_games})"
    );
    // The match stops as soon as someone reaches two — no extra games are played.
    assert_eq!(games, out.result.games.len());
}
