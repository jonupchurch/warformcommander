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
    GameResult {
        winner: Some(decide_time(da, db, defender)),
        condition: WinCondition::Time,
        reward_tier: RewardTier::Lesser,
        duration_ticks: duration,
    }
}

/// The Time-win tiebreak (pure): most cumulative damage wins; an **exact** tie goes to the defender
/// (§9.3).
fn decide_time(da: Fixed, db: Fixed, defender: Side) -> Side {
    match da.milli().cmp(&db.milli()) {
        std::cmp::Ordering::Greater => Side::A,
        std::cmp::Ordering::Less => Side::B,
        std::cmp::Ordering::Equal => defender,
    }
}

/// Total cumulative damage dealt by a side.
pub(crate) fn side_damage(combatants: &[Combatant], side: Side) -> Fixed {
    combatants
        .iter()
        .filter(|c| c.unit.side == side)
        .fold(Fixed::ZERO, |acc, c| acc.saturating_add(c.damage_dealt))
}

/// Assemble the [`MatchResult`]. Per-machine fates + survivor counts come from the **deciding
/// (final) game**'s combatants; damage totals are **summed across all games** (`cum_a`/`cum_b`);
/// the winner is whoever took the majority of games (first-to-two in a Bo3).
pub(crate) fn build_match_result(
    final_combatants: &[Combatant],
    games: Vec<GameResult>,
    total_ticks: u16,
    cum_a: Fixed,
    cum_b: Fixed,
) -> MatchResult {
    let a_wins = games.iter().filter(|g| g.winner == Some(Side::A)).count();
    let b_wins = games.iter().filter(|g| g.winner == Some(Side::B)).count();
    let winner = if a_wins >= b_wins { Side::A } else { Side::B };

    let machine_fates: Vec<MachineFate> = final_combatants
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
            damage_dealt: cum_a,
            survivors: super::survivors(final_combatants, Side::A),
        },
        side_b: SideSummary {
            damage_dealt: cum_b,
            survivors: super::survivors(final_combatants, Side::B),
        },
        duration_ticks: total_ticks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixed::Fixed;

    #[test]
    fn time_tiebreak_favors_most_damage_then_defender() {
        let a = Fixed::from_int(500);
        let b = Fixed::from_int(300);
        assert_eq!(decide_time(a, b, Side::B), Side::A, "more damage wins");
        assert_eq!(decide_time(b, a, Side::A), Side::B, "more damage wins (B)");
        // Exact tie → the defender, whichever side that is.
        assert_eq!(decide_time(a, a, Side::B), Side::B);
        assert_eq!(decide_time(a, a, Side::A), Side::A);
    }
}
