//! Win-rate statistics (T006, research B1) — the **honest** layer over the deterministic engine.
//!
//! A batch of N seeded Bo3s is a **binomial** experiment (each match is a win/not-win Bernoulli
//! trial), so the right interval is the **Wilson score** interval — it beats the naive Wald
//! interval near 0/1 (exactly where dominant/underpowered combos live) and always stays in [0,1].
//!
//! **The determinism rule (plan Complexity Tracking):** every *decision-bearing* number here is an
//! integer counter reduced with an associative/commutative op ([`Tally::merge`]), so the aggregate
//! is identical regardless of how rayon schedules the batch (SC-001). Floats — win rate, CI bounds,
//! mean duration — are derived **once at the end** and **rendered at fixed precision** ([`round4`]/
//! [`round1`]), so report bytes stay stable and a float never swings a flag except through a
//! fixed-precision interval comparison.

use serde::{Deserialize, Serialize};

use engine::replay::{MatchResult, Side, WinCondition};

/// The z-score for a 95% two-sided confidence interval.
const Z95: f64 = 1.96;

/// A closed interval on a proportion (win rate). Floats, rendered at fixed precision.
#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Interval {
    pub low: f64,
    pub high: f64,
}

impl Interval {
    /// Half-width of the interval — the ± error bar (SC-002's ≤±2.5% target reads this).
    pub fn half_width(&self) -> f64 {
        (self.high - self.low) / 2.0
    }
}

/// Point win rate `wins / n` (0.0 when `n == 0`).
pub fn win_rate(wins: u32, n: u32) -> f64 {
    if n == 0 {
        0.0
    } else {
        wins as f64 / n as f64
    }
}

/// The **Wilson score** 95% confidence interval on a binomial proportion `wins/n` (research B1).
/// `n == 0` → the maximally-uncertain `[0, 1]`. Bounds are clamped into `[0, 1]` and rounded to
/// fixed precision so the report is byte-stable (SC-001).
pub fn wilson(wins: u32, n: u32) -> Interval {
    if n == 0 {
        return Interval {
            low: 0.0,
            high: 1.0,
        };
    }
    let n = n as f64;
    let p = wins as f64 / n;
    let z2 = Z95 * Z95;
    let denom = 1.0 + z2 / n;
    let center = (p + z2 / (2.0 * n)) / denom;
    let margin = (Z95 / denom) * ((p * (1.0 - p) / n) + (z2 / (4.0 * n * n))).sqrt();
    Interval {
        low: round4((center - margin).clamp(0.0, 1.0)),
        high: round4((center + margin).clamp(0.0, 1.0)),
    }
}

/// Round to 4 decimals — the fixed precision for win rates / CI bounds (byte-stable via ryu).
pub fn round4(x: f64) -> f64 {
    (x * 10_000.0).round() / 10_000.0
}

/// Round to 1 decimal — the fixed precision for mean durations.
pub fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

/// The **integer** aggregate of a matchup batch — the deterministic, order-independent core.
/// [`merge`](Tally::merge) is associative + commutative, so rayon's reduction order cannot change
/// it. Everything a flag or verdict reads comes from here; floats are derived downstream.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Tally {
    /// Matches actually resolved (excludes skipped-invalid, FR-005).
    pub samples: u32,
    pub wins_a: u32,
    pub wins_b: u32,
    /// Games won by a full wipe (Conquest), per side.
    pub conquest_a: u32,
    pub conquest_b: u32,
    /// Games won on the damage-dealt tiebreak (Time), per side (§9.3).
    pub time_a: u32,
    pub time_b: u32,
    /// Matches decided 2-0 vs 2-1.
    pub two_zero: u32,
    pub two_one: u32,
    /// Sum of match durations (integer → order-independent); the mean is derived at the end.
    pub total_duration_ticks: u64,
}

impl Tally {
    /// Fold one match's outcome into the tally (side A = attacker/index 0).
    pub fn record(&mut self, result: &MatchResult) {
        self.samples += 1;
        match result.winner {
            Side::A => self.wins_a += 1,
            Side::B => self.wins_b += 1,
        }
        // Bo3 game-count split: first-to-two ends in 2 games (2-0) or 3 games (2-1).
        if result.games.len() >= 3 {
            self.two_one += 1;
        } else {
            self.two_zero += 1;
        }
        // Per-game win condition, attributed to the game's winner.
        for g in &result.games {
            match (g.winner, g.condition) {
                (Some(Side::A), WinCondition::Conquest) => self.conquest_a += 1,
                (Some(Side::A), WinCondition::Time) => self.time_a += 1,
                (Some(Side::B), WinCondition::Conquest) => self.conquest_b += 1,
                (Some(Side::B), WinCondition::Time) => self.time_b += 1,
                (None, _) => {}
            }
        }
        self.total_duration_ticks += result.duration_ticks as u64;
    }

    /// Combine two partial tallies — associative + commutative (integer field-wise add). This is
    /// what makes the parallel reduction reproducible regardless of thread count (SC-001).
    pub fn merge(self, other: Tally) -> Tally {
        Tally {
            samples: self.samples + other.samples,
            wins_a: self.wins_a + other.wins_a,
            wins_b: self.wins_b + other.wins_b,
            conquest_a: self.conquest_a + other.conquest_a,
            conquest_b: self.conquest_b + other.conquest_b,
            time_a: self.time_a + other.time_a,
            time_b: self.time_b + other.time_b,
            two_zero: self.two_zero + other.two_zero,
            two_one: self.two_one + other.two_one,
            total_duration_ticks: self.total_duration_ticks + other.total_duration_ticks,
        }
    }

    /// The derived, presentation-ready outcome breakdown (floats rendered fixed-precision).
    pub fn breakdown(&self) -> OutcomeBreakdown {
        let avg = if self.samples == 0 {
            0.0
        } else {
            round1(self.total_duration_ticks as f64 / self.samples as f64)
        };
        OutcomeBreakdown {
            conquest_a: self.conquest_a,
            conquest_b: self.conquest_b,
            time_tiebreak_a: self.time_a,
            time_tiebreak_b: self.time_b,
            match_split: MatchSplit {
                two_zero: self.two_zero,
                two_one: self.two_one,
            },
            avg_duration_ticks: avg,
        }
    }
}

/// *How* a matchup was won — not just *who* (data-model OutcomeBreakdown).
#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutcomeBreakdown {
    pub conquest_a: u32,
    pub conquest_b: u32,
    pub time_tiebreak_a: u32,
    pub time_tiebreak_b: u32,
    pub match_split: MatchSplit,
    /// Mean match length in ticks (a low value + all-Time signals a degenerate turtle).
    pub avg_duration_ticks: f64,
}

/// The Bo3 game-count distribution.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchSplit {
    pub two_zero: u32,
    pub two_one: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The Wilson formula against a hand-computed value (50/100 → center ≈ 0.5, half-width ≈ 0.098).
    #[test]
    fn wilson_matches_known_value() {
        let ci = wilson(50, 100);
        // Wilson for p=0.5, n=100: [0.4038, 0.5962] (standard reference).
        assert!((ci.low - 0.4038).abs() < 0.001, "low = {}", ci.low);
        assert!((ci.high - 0.5962).abs() < 0.001, "high = {}", ci.high);
    }

    /// The interval narrows ~1/√n: quadrupling N roughly halves the half-width (SC-002 shape).
    #[test]
    fn interval_narrows_with_sample_size() {
        let small = wilson(500, 1000).half_width();
        let large = wilson(2000, 4000).half_width();
        assert!(large < small);
        let ratio = small / large;
        assert!((1.7..=2.3).contains(&ratio), "≈2× narrower, got {ratio}");
    }

    /// Stays in [0,1] even at the extremes where Wald would overflow.
    #[test]
    fn wilson_stays_in_unit_interval() {
        let all = wilson(200, 200);
        assert!(all.low >= 0.0 && all.high <= 1.0);
        let none = wilson(0, 200);
        assert!(none.low >= 0.0 && none.high <= 1.0);
        // n = 0 → maximal uncertainty.
        assert_eq!(
            wilson(0, 0),
            Interval {
                low: 0.0,
                high: 1.0
            }
        );
    }

    /// `merge` is commutative + associative on the integer fields (the reproducibility guarantee).
    #[test]
    fn merge_is_order_independent() {
        let a = Tally {
            samples: 3,
            wins_a: 2,
            wins_b: 1,
            total_duration_ticks: 30,
            ..Default::default()
        };
        let b = Tally {
            samples: 5,
            wins_a: 1,
            wins_b: 4,
            total_duration_ticks: 50,
            ..Default::default()
        };
        let c = Tally {
            samples: 2,
            wins_a: 2,
            wins_b: 0,
            total_duration_ticks: 20,
            ..Default::default()
        };
        let left = a.merge(b).merge(c);
        let right = c.merge(b.merge(a));
        assert_eq!(left, right);
        assert_eq!(left.samples, 10);
        assert_eq!(left.wins_a, 5);
    }
}
