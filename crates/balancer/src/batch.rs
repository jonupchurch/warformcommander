//! The reproducible batch primitive (T008/T013, research A1) — the balancer's atom.
//!
//! [`run_batch`] resolves one matchup **N times** through the **one** Feature 1 engine
//! (`engine::resolve`), each match with its own per-index seed ([`crate::seed::derive`]), and
//! reduces the outcomes into **integer counts** ([`crate::stats::Tally`]). Parallelism is
//! `rayon` **across independent matches only** — never inside a `resolve()`, which stays
//! single-threaded and deterministic (FR-001/002/004). Because the reduction is associative +
//! commutative over integers, the aggregate is **identical** regardless of thread count (SC-001):
//! `--threads` changes wall-clock, never the numbers.

use std::sync::Once;

use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use engine::model::army::Army;
use engine::model::ruleset::Ruleset;
use engine::replay::{Adaptation, MatchConfig, Side, TickEvent};
use engine::{resolve, BattleInput};

use crate::seed;
use crate::stats::{wilson, win_rate, Interval, OutcomeBreakdown, Tally};

/// One pairing to evaluate — the atom US1 operates on (data-model MatchupSpec). Side A (index 0)
/// is the attacker; side B is the defender (the exact-damage-tie winner, §9.3).
#[derive(Clone, Debug)]
pub struct MatchupSpec {
    pub side_a: Army,
    pub side_b: Army,
    pub match_config: MatchConfig,
    /// Human tag for reports (e.g. "Energy-Mech vs Grizzly").
    pub label: Option<String>,
}

impl MatchupSpec {
    /// A matchup with the balancer's standard config (`Free` adaptation, defender = B, best-of-3).
    /// The balancer supplies both full armies with no between-game adaptation, so `Free` and
    /// `Locked` resolve identically here; `Free` matches the data-model's stated policy.
    pub fn new(side_a: Army, side_b: Army, label: impl Into<String>) -> Self {
        MatchupSpec {
            side_a,
            side_b,
            match_config: balancer_config(),
            label: Some(label.into()),
        }
    }
}

/// A generous rayon **worker** stack. Each `resolve()` allocates a full Bo3 tick stream on the
/// stack path; when many batches run concurrently (e.g. the whole test suite in parallel), the
/// default worker stack can hit its guard page → an access violation on Windows. Sizing the pool's
/// worker stack up front closes that footgun. (`RUST_MIN_STACK` only sizes the main/spawned-thread
/// stacks, not rayon's workers — this is the knob that matters here.)
const WORKER_STACK: usize = 32 * 1024 * 1024;

static GLOBAL_POOL: Once = Once::new();

/// Initialize the rayon **global** pool with a large worker stack, once, before first use. Best
/// effort: if the global pool was already built elsewhere, `build_global` errors and we ignore it.
fn ensure_global_pool() {
    GLOBAL_POOL.call_once(|| {
        let _ = rayon::ThreadPoolBuilder::new()
            .stack_size(WORKER_STACK)
            .build_global();
    });
}

/// The balancer's canonical match configuration (data-model: `Free`, defender B, best-of-3).
pub fn balancer_config() -> MatchConfig {
    MatchConfig {
        adaptation: Adaptation::Free,
        defender_side: Side::B,
        best_of: 3,
    }
}

/// How to sample one matchup (data-model BatchConfig).
#[derive(Clone, Copy, Debug)]
pub struct BatchConfig {
    /// The single seed the batch is reproducible from (FR-002).
    pub base_seed: u64,
    /// N = number of seeded Bo3 resolutions.
    pub samples: u32,
    /// rayon worker count; **must not change the aggregate** (FR-004, SC-001). `None` = global pool.
    pub threads: Option<u32>,
}

impl Default for BatchConfig {
    fn default() -> Self {
        // ~2000 samples hits the SC-002 ≤±2.5% half-width at p̂ = 0.5 (research B1).
        BatchConfig {
            base_seed: 1,
            samples: 2000,
            threads: None,
        }
    }
}

/// The aggregated result of one matchup batch (data-model WinRateEstimate). Counts are integer +
/// deterministic; the rate/interval are derived once and rendered fixed-precision.
#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WinRateEstimate {
    /// N actually resolved (excludes skipped-invalid, FR-005).
    pub samples: u32,
    pub wins_a: u32,
    pub wins_b: u32,
    pub win_rate_a: f64,
    pub ci95: Interval,
    #[serde(rename = "outcome")]
    pub outcome: OutcomeBreakdown,
}

impl WinRateEstimate {
    fn from_tally(t: Tally) -> Self {
        WinRateEstimate {
            samples: t.samples,
            wins_a: t.wins_a,
            wins_b: t.wins_b,
            win_rate_a: crate::stats::round4(win_rate(t.wins_a, t.samples)),
            ci95: wilson(t.wins_a, t.samples),
            outcome: t.breakdown(),
        }
    }
}

/// Resolve `matchup` `cfg.samples` times over the `ruleset` and aggregate into a
/// [`WinRateEstimate`]. Parallel **across matches only**; a candidate the engine's `validate()`
/// rejects yields skipped samples (never a crash, FR-005) — for a fixed matchup that is all-or-
/// nothing (validity is seed-independent), so `samples == 0` marks an illegal matchup.
pub fn run_batch(matchup: &MatchupSpec, ruleset: &Ruleset, cfg: &BatchConfig) -> WinRateEstimate {
    ensure_global_pool();
    let armies = [matchup.side_a.clone(), matchup.side_b.clone()];
    let config = matchup.match_config;

    let run = || {
        (0..cfg.samples)
            .into_par_iter()
            .filter_map(|i| {
                let input = BattleInput {
                    armies: armies.clone(),
                    ruleset: ruleset.clone(),
                    seed: seed::derive(cfg.base_seed, i as u64),
                    match_config: config,
                };
                // The entire engine surface: one call, read the result. No combat logic here.
                resolve(&input).ok().map(|out| out.result)
            })
            .fold(Tally::default, |mut t, r| {
                t.record(&r);
                t
            })
            .reduce(Tally::default, Tally::merge)
    };

    // `--threads` builds a local pool; the aggregate is identical either way (that is the point).
    let tally = match cfg.threads {
        Some(n) if n >= 1 => rayon::ThreadPoolBuilder::new()
            .num_threads(n as usize)
            .stack_size(WORKER_STACK)
            .build()
            .expect("valid thread pool")
            .install(run),
        _ => run(),
    };

    WinRateEstimate::from_tally(tally)
}

/// Mean **first-hit** damage dealt by side A across the batch (whole units) — the family-bonus
/// primitive (FR-012). The first landed hit precedes any death, so its damage is **uncapped** by
/// target HP (unlike cumulative damage, which caps at the enemy pool once they die). For a fixed
/// seed the native bonus scales *only* damage — targeting, hit/miss, crit, and variance are
/// identical with or without it — so the with/without ratio isolates the bonus cleanly. The
/// milli-unit **sum** is integer (order-independent, SC-001); the mean is derived once. `0.0` if no
/// side-A hit ever lands (or the matchup is invalid).
pub fn mean_first_hit_damage(matchup: &MatchupSpec, ruleset: &Ruleset, cfg: &BatchConfig) -> f64 {
    ensure_global_pool();
    let armies = [matchup.side_a.clone(), matchup.side_b.clone()];
    let config = matchup.match_config;

    let run = || {
        (0..cfg.samples)
            .into_par_iter()
            .filter_map(|i| {
                let input = BattleInput {
                    armies: armies.clone(),
                    ruleset: ruleset.clone(),
                    seed: seed::derive(cfg.base_seed, i as u64),
                    match_config: config,
                };
                let out = resolve(&input).ok()?;
                // The first landed hit by a side-A actor in the first game.
                let game = out.replay.games.first()?;
                for tick in &game.ticks {
                    for ev in &tick.events {
                        if let TickEvent::Hit { actor, dmg, .. } = ev {
                            if actor.side == Side::A {
                                return Some((dmg.milli() as i128, 1u64));
                            }
                        }
                    }
                }
                None
            })
            .reduce(|| (0i128, 0u64), |(sa, na), (sb, nb)| (sa + sb, na + nb))
    };

    let (sum, n) = match cfg.threads {
        Some(t) if t >= 1 => rayon::ThreadPoolBuilder::new()
            .num_threads(t as usize)
            .stack_size(WORKER_STACK)
            .build()
            .expect("valid thread pool")
            .install(run),
        _ => run(),
    };

    if n == 0 {
        0.0
    } else {
        (sum as f64 / 1000.0) / n as f64
    }
}

/// Mean surviving machines each side ends the match with (0..5), across the batch — the power-gap
/// primitive. Unlike a win rate (which saturates at 0/1 in this near-deterministic engine), the
/// **survivor margin** scales smoothly with a gear edge: a bigger advantage leaves more of the
/// advantaged side standing. Integer survivor **sums** are order-independent (SC-001); means derived
/// once. `(0.0, 0.0)` for an all-invalid matchup.
pub fn mean_survivors(matchup: &MatchupSpec, ruleset: &Ruleset, cfg: &BatchConfig) -> (f64, f64) {
    ensure_global_pool();
    let armies = [matchup.side_a.clone(), matchup.side_b.clone()];
    let config = matchup.match_config;

    let run = || {
        (0..cfg.samples)
            .into_par_iter()
            .filter_map(|i| {
                let input = BattleInput {
                    armies: armies.clone(),
                    ruleset: ruleset.clone(),
                    seed: seed::derive(cfg.base_seed, i as u64),
                    match_config: config,
                };
                resolve(&input).ok().map(|out| {
                    (
                        out.result.side_a.survivors as u64,
                        out.result.side_b.survivors as u64,
                        1u64,
                    )
                })
            })
            .reduce(
                || (0u64, 0u64, 0u64),
                |(aa, ab, an), (ba, bb, bn)| (aa + ba, ab + bb, an + bn),
            )
    };

    let (sum_a, sum_b, n) = match cfg.threads {
        Some(t) if t >= 1 => rayon::ThreadPoolBuilder::new()
            .num_threads(t as usize)
            .stack_size(WORKER_STACK)
            .build()
            .expect("valid thread pool")
            .install(run),
        _ => run(),
    };

    if n == 0 {
        return (0.0, 0.0);
    }
    (sum_a as f64 / n as f64, sum_b as f64 / n as f64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine::content::{seed_ruleset, stock_instance};
    use engine::model::types::{MachineTypeId, ZoneId};

    /// A diverse, counter-web-spanning squad — the composition whose mirror sits closest to 50%.
    fn diverse(rs: &Ruleset) -> Army {
        Army {
            machines: vec![
                stock_instance(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
                stock_instance(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
                stock_instance(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
                stock_instance(
                    rs,
                    MachineTypeId::RocketArtillery,
                    "Sentry",
                    ZoneId::Middle,
                    3,
                ),
                stock_instance(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 4),
            ],
        }
    }

    /// A mirror matchup (identical armies) lands near 50% — the calibration anchor (US1 AS3).
    ///
    /// It is not *exactly* 50%: the engine's deterministic acting order sorts by
    /// `(zone, side, instance)`, so the attacker (Side A) fires **before** the defender in every
    /// shared zone — an explainable **first-strike premium**, not a bug (spec edge case). The armies are
    /// symmetric, so any deviation is pure acting-order advantage. In the **untuned v3 counter-web** the
    /// premium is inflated (~11% for this diverse squad): the innate Spotter accuracy aura makes Side A's
    /// opening volley land harder, and the swingy start-value field lets first-strike snowball. The wide
    /// band tracks that reality; the balance pass tightens it back toward the classic ~2-3%.
    #[test]
    fn mirror_matchup_is_near_fifty() {
        let rs = seed_ruleset();
        let m = MatchupSpec::new(diverse(&rs), diverse(&rs), "mirror");
        let est = run_batch(
            &m,
            &rs,
            &BatchConfig {
                base_seed: 7,
                samples: 600,
                threads: None,
            },
        );
        assert_eq!(est.samples, 600);
        assert!(
            (0.45..=0.64).contains(&est.win_rate_a),
            "mirror ≈ 50% + first-strike premium (untuned field), got {}",
            est.win_rate_a
        );
    }

    /// SC-001: the aggregate is **identical** single-threaded vs multi-threaded (per-match seeding
    /// + integer reduction → thread-count-independent). The load-bearing reproducibility check.
    #[test]
    fn aggregate_is_thread_count_independent() {
        let rs = seed_ruleset();
        let m = MatchupSpec::new(diverse(&rs), diverse(&rs), "repro");
        let one = run_batch(
            &m,
            &rs,
            &BatchConfig {
                base_seed: 42,
                samples: 300,
                threads: Some(1),
            },
        );
        let many = run_batch(
            &m,
            &rs,
            &BatchConfig {
                base_seed: 42,
                samples: 300,
                threads: Some(8),
            },
        );
        assert_eq!(
            one, many,
            "1-thread and 8-thread aggregates must be byte-identical"
        );
    }

    /// An illegal matchup (wrong squad size) is skipped, never a crash → samples == 0 (FR-005).
    #[test]
    fn illegal_matchup_yields_zero_samples() {
        let rs = seed_ruleset();
        let bad = Army { machines: vec![] };
        let m = MatchupSpec::new(bad, diverse(&rs), "illegal");
        let est = run_batch(
            &m,
            &rs,
            &BatchConfig {
                base_seed: 1,
                samples: 50,
                threads: None,
            },
        );
        assert_eq!(est.samples, 0);
    }
}
