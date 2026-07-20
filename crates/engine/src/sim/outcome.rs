//! Win conditions + result assembly (US1 T024; extended by US4 T043–T045).
//!
//! US1 implements single-game termination — **Conquest** (a side wiped → full reward) and **Time**
//! (tick cap reached → most cumulative damage wins at lesser reward; **exact tie → defender**, §9.3).
//! The Bo3 match loop + richer reward logic land in US4.

use crate::fixed::Fixed;

use crate::replay::{
    Fate, GameResult, MachineFate, MatchResult, RewardTier, Side, SideSummary, WinCondition,
};

use super::Combatant;

/// A Conquest result at `duration` ticks — the side still standing wins at full reward.
pub(crate) fn conquest_result(combatants: &[Combatant], duration: u16) -> GameResult {
    let a = super::survivors(combatants, Side::A) > 0;
    let winner = if a { Some(Side::A) } else { Some(Side::B) };
    GameResult {
        winner,
        condition: WinCondition::Conquest,
        reward_tier: RewardTier::Full,
        duration_ticks: duration,
    }
}

/// A Time result at the tick cap — most cumulative damage wins (lesser reward); exact tie → defender.
pub(crate) fn time_result(combatants: &[Combatant], duration: u16, defender: Side) -> GameResult {
    let da = side_damage(combatants, Side::A);
    let db = side_damage(combatants, Side::B);
    let winner = match da.milli().cmp(&db.milli()) {
        std::cmp::Ordering::Greater => Side::A,
        std::cmp::Ordering::Less => Side::B,
        std::cmp::Ordering::Equal => defender, // exact-damage tie → defender (§9.3)
    };
    GameResult {
        winner: Some(winner),
        condition: WinCondition::Time,
        reward_tier: RewardTier::Lesser,
        duration_ticks: duration,
    }
}

/// Total cumulative damage dealt by a side.
pub(crate) fn side_damage(combatants: &[Combatant], side: Side) -> Fixed {
    combatants
        .iter()
        .filter(|c| c.unit.side == side)
        .fold(Fixed::ZERO, |acc, c| acc.saturating_add(c.damage_dealt))
}

/// Assemble the [`MatchResult`] from the final combatant state + the games played.
pub(crate) fn build_match_result(
    combatants: &[Combatant],
    games: Vec<GameResult>,
    total_ticks: u16,
) -> MatchResult {
    // Match winner = whoever won the majority of games (US1: exactly one game).
    let a_wins = games.iter().filter(|g| g.winner == Some(Side::A)).count();
    let b_wins = games.iter().filter(|g| g.winner == Some(Side::B)).count();
    let winner = if a_wins >= b_wins { Side::A } else { Side::B };

    let machine_fates: Vec<MachineFate> = combatants
        .iter()
        .map(|c| MachineFate {
            unit: c.unit,
            fate: match c.destroyed_at {
                Some(t) => Fate::DestroyedAtTick(t),
                None => Fate::SurvivedWithHullPct(c.hull_pct()),
            },
        })
        .collect();

    MatchResult {
        winner,
        games,
        machine_fates,
        side_a: SideSummary {
            damage_dealt: side_damage(combatants, Side::A),
            survivors: super::survivors(combatants, Side::A),
        },
        side_b: SideSummary {
            damage_dealt: side_damage(combatants, Side::B),
            survivors: super::survivors(combatants, Side::B),
        },
        duration_ticks: total_ticks,
    }
}
