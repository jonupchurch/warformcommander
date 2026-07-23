//! Flagging (T018, research C1) — turn across-field standings into severity-sorted flags.
//!
//! **Interval-gated, never point-gated** (FR-011): a combo is `Dominant` only when its Wilson
//! interval lies **entirely above** the band ceiling, `Underpowered` only when entirely below the
//! floor — so a flag means "95% confident this is out of band," not noise. `Degenerate` is the
//! no-counterplay finding: a combo that **wins every field matchup** (FR-014 at combo granularity)
//! **or** a structural **free-turtle** — a Plan-B build that flips to a pure-defense posture with no
//! offsetting trade-off (GDD §8.2). Flags sort **worst-first** by severity (FR-010).

use engine::model::army::Army;
use engine::model::types::{DialValue, MovementMode, Stance};

use crate::report::model::{ComboRef, FairBand, FlagKind, FlaggedCombo};
use crate::sweep::{CandidateResult, SweepResult};

/// The purely-defensive dial values a "turtle" Plan-B latches to (fall back / hunker / defend).
fn is_defensive_value(v: DialValue) -> bool {
    matches!(
        v,
        DialValue::Movement(MovementMode::FallBack) | DialValue::Stance(Stance::Defensive)
    )
}

/// A **free-turtle** build (GDD §8.2): a machine that plays a full-aggression base posture (extracting
/// the offensive upside) yet carries a Plan-B that flips it to a **pure-defense** dial when
/// threatened — the turtle costs nothing up front (no defensive dial/utility paid for), so it is a
/// no-trade-off degenerate. A structural check (needs no simulation), so it flags deterministically.
pub fn is_free_turtle(army: &Army) -> bool {
    army.machines.iter().any(|m| {
        let aggressive =
            m.dials.stance == Stance::Aggressive || m.dials.movement == MovementMode::Advance;
        aggressive && m.plan_b.iter().any(|t| is_defensive_value(t.plan_b_value))
    })
}

/// Classify one candidate against the fair band, or `None` if it sits fairly within it.
pub fn classify(candidate: &CandidateResult, band: &FairBand) -> Option<FlaggedCombo> {
    let combo = ComboRef {
        label: candidate.label.clone(),
        army: candidate.army.clone(),
    };
    let rate = candidate.across_field_win_rate;
    let ci = candidate.ci95;

    // 1. Structural free-turtle (degenerate, no trade-off) — highest-priority, simulation-free.
    if is_free_turtle(&candidate.army) {
        return Some(FlaggedCombo {
            combo,
            across_field_win_rate: rate,
            ci95: ci,
            kind: FlagKind::Degenerate,
            reason: "Plan-B build with no offsetting trade-off (GDD §8.2 free-turtle)".into(),
            severity: crate::stats::round4(0.20),
        });
    }

    // 2. Wins EVERY field matchup — no counterplay (degenerate).
    if candidate.clean_sweep {
        return Some(FlaggedCombo {
            combo,
            across_field_win_rate: rate,
            ci95: ci,
            kind: FlagKind::Degenerate,
            reason: "wins every field matchup (no counter exists)".into(),
            severity: crate::stats::round4((rate - 0.5).max(0.0)),
        });
    }

    // 3. Interval entirely above the ceiling → Dominant (interval-gated, FR-011).
    if ci.low > band.ceiling {
        return Some(FlaggedCombo {
            combo,
            across_field_win_rate: rate,
            ci95: ci,
            kind: FlagKind::Dominant,
            reason: format!(
                "Wilson interval [{:.3},{:.3}] lies entirely above ceiling {:.2}",
                ci.low, ci.high, band.ceiling
            ),
            severity: crate::stats::round4(ci.low - band.ceiling),
        });
    }

    // 4. Interval entirely below the floor → Underpowered.
    if ci.high < band.floor {
        return Some(FlaggedCombo {
            combo,
            across_field_win_rate: rate,
            ci95: ci,
            kind: FlagKind::Underpowered,
            reason: format!(
                "Wilson interval [{:.3},{:.3}] lies entirely below floor {:.2}",
                ci.low, ci.high, band.floor
            ),
            severity: crate::stats::round4(band.floor - ci.high),
        });
    }

    None
}

/// Classify the whole sweep and return the flags **sorted worst-first** by severity (FR-010).
pub fn classify_all(sweep: &SweepResult, band: &FairBand) -> Vec<FlaggedCombo> {
    let mut flags: Vec<FlaggedCombo> = sweep
        .candidates
        .iter()
        .filter_map(|c| classify(c, band))
        .collect();
    // Descending severity; a stable tie-break on the label keeps the order deterministic.
    flags.sort_by(|a, b| {
        b.severity
            .partial_cmp(&a.severity)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.combo.label.cmp(&b.combo.label))
    });
    flags
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine::content::{seed_ruleset, stock_instance};
    use engine::model::types::{
        DialKey, MachineTypeId, MovementMode, PlanBSlot, PlanBTrigger, Stance, TriggerCondition,
        ZoneId,
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

    /// A stock army (Neutral stance, Hold movement, no Plan-B) is not a free-turtle.
    #[test]
    fn stock_army_is_not_a_free_turtle() {
        assert!(!is_free_turtle(&stock_army()));
    }

    /// An aggressive machine with a "fall back when hurt" Plan-B and no trade-off IS a free-turtle.
    #[test]
    fn aggressive_plus_defensive_planb_is_a_free_turtle() {
        let mut army = stock_army();
        army.machines[0].dials.stance = Stance::Aggressive;
        army.machines[0].plan_b = vec![PlanBTrigger {
            slot: PlanBSlot::Slot1,
            condition: TriggerCondition::HullBelowPct(5_000),
            dial: DialKey::Movement,
            plan_b_value: DialValue::Movement(MovementMode::FallBack),
        }];
        assert!(is_free_turtle(&army));
    }
}
