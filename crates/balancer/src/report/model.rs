//! The `BalanceReport` wire shape (T007, data-model + [contract](../../../specs/002-auto-balancer/contracts/balance-report.md)).
//!
//! Reuses the engine's `Army` and the balancer's [`WinRateEstimate`](crate::batch::WinRateEstimate)
//! / [`Interval`](crate::stats::Interval) — it **adds no game-model field** (P6/P8). Integer win
//! counts are the source of truth; win rates / CI bounds / margins are derived and rendered at
//! fixed precision, so the report body is byte-stable across runs (SC-001).

use serde::{Deserialize, Serialize};

use engine::model::army::Army;

use crate::batch::WinRateEstimate;
use crate::stats::Interval;

/// The report schema version a consumer gates on (the report is regenerated, never migrated).
pub const REPORT_VERSION: u16 = 1;

/// The aggregate artifact the designer reads (data-model BalanceReport).
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceReport {
    pub report_version: u16,
    pub provenance: Provenance,
    pub run_config: RunConfig,
    pub matchups: Vec<MatchupResult>,
    /// Severity-sorted, worst first (FR-010).
    pub flagged: Vec<FlaggedCombo>,
    pub invariants: Vec<InvariantCheck>,
    pub coverage: Coverage,
}

/// The traceability stamp binding a report to the exact balance table + engine it evaluated (SC-007).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub ruleset_hash: String,
    pub engine_version: String,
    pub replay_format_version: u16,
    /// Wall-clock stamp — provenance for humans, **excluded** from the reproducibility diff
    /// (SC-001). `None` in the pure library output; the CLI stamps it at write time.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub generated_at: Option<String>,
}

/// The run parameters — the report is self-describing / reproducible from this + the Ruleset.
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunConfig {
    /// u64 as a string (JSON-safe — a bare u64 can exceed a JS number's safe integer range).
    pub base_seed: String,
    pub samples_per_matchup: u32,
    /// Recorded for the perf note only — it must NOT affect results (SC-001).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub threads: Option<u32>,
    pub fair_band: FairBand,
}

/// The fair band a flag's Wilson interval must clear (research C1) — **configurable policy**.
#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FairBand {
    pub floor: f64,
    pub ceiling: f64,
}

impl Default for FairBand {
    /// The design-doc default `[40%, 60%]` (research C1).
    fn default() -> Self {
        FairBand {
            floor: 0.40,
            ceiling: 0.60,
        }
    }
}

/// One matchup's estimate + its human label (data-model MatchupResult).
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchupResult {
    pub label: String,
    /// Flattened: `samples`, `winsA`, `winsB`, `winRateA`, `ci95`, `outcome` sit at this level.
    #[serde(flatten)]
    pub estimate: WinRateEstimate,
}

/// A reference to a flagged configuration (data-model FlaggedCombo → combo).
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComboRef {
    pub label: String,
    /// The full army config, so the report is self-contained + auditable.
    pub army: Army,
}

/// The flag class (research C1).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum FlagKind {
    Dominant,
    Degenerate,
    Underpowered,
}

/// One outlier the sweep surfaced (data-model FlaggedCombo). Interval-gated (FR-011),
/// severity-sorted (FR-010).
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlaggedCombo {
    pub combo: ComboRef,
    pub across_field_win_rate: f64,
    pub ci95: Interval,
    pub kind: FlagKind,
    pub reason: String,
    /// Distance of the interval from the nearest band edge — sorts the list worst-first.
    pub severity: f64,
}

/// The four balance claims (FR-012–015).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum InvariantName {
    FamilyBonusBand,
    PowerGapCap,
    NoDominantUnit,
    SkillBeatsGear,
}

/// An intended band `[low, high]` for an invariant's measured number.
#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Band {
    pub low: f64,
    pub high: f64,
}

impl Band {
    /// Signed distance of `measured` from the nearest edge — **negative when out of band** (the
    /// margin, FR-016). Inside the band → the distance to the nearest edge (positive).
    pub fn margin(&self, measured: f64) -> f64 {
        if measured < self.low {
            measured - self.low
        } else if measured > self.high {
            self.high - measured
        } else {
            (measured - self.low).min(self.high - measured)
        }
    }

    /// Whether `measured` sits within `[low, high]`.
    pub fn contains(&self, measured: f64) -> bool {
        measured >= self.low && measured <= self.high
    }
}

/// One invariant result — reports the **measured number + margin**, never a bare boolean (FR-016).
#[derive(Clone, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvariantCheck {
    pub name: InvariantName,
    pub band: Band,
    pub measured: f64,
    pub margin: f64,
    pub pass: bool,
    /// The matchups the measurement came from (auditability).
    pub evidence: Vec<String>,
}

impl InvariantCheck {
    /// Build a check from a name, band, measured value, and evidence — deriving `margin` + `pass`.
    pub fn new(
        name: InvariantName,
        band: Band,
        measured: f64,
        evidence: Vec<String>,
    ) -> InvariantCheck {
        InvariantCheck {
            name,
            band,
            measured: crate::stats::round4(measured),
            margin: crate::stats::round4(band.margin(measured)),
            pass: band.contains(measured),
            evidence,
        }
    }
}

/// Honest coverage — the sweep is bounded/sampled; the report never implies exhaustiveness (FR-006).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub candidates_evaluated: u32,
    pub candidate_space_estimated: u32,
    pub field_size: u32,
    pub samples_per_matchup: u32,
    pub total_resolutions: u64,
    /// engine `validate()`-rejected candidates that were skipped (FR-005).
    pub skipped_invalid: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn margin_is_negative_out_of_band_positive_inside() {
        let b = Band {
            low: 0.10,
            high: 0.15,
        };
        assert!(b.margin(0.05) < 0.0, "below floor → negative");
        assert!(b.margin(0.20) < 0.0, "above ceiling → negative");
        assert!(b.margin(0.12) > 0.0, "inside → positive");
        assert!(b.contains(0.12) && !b.contains(0.05));
    }

    #[test]
    fn invariant_check_derives_margin_and_pass() {
        let c = InvariantCheck::new(
            InvariantName::FamilyBonusBand,
            Band {
                low: 0.10,
                high: 0.15,
            },
            0.121,
            vec!["native vs off-family".into()],
        );
        assert!(c.pass);
        assert!(c.margin > 0.0);

        let fail = InvariantCheck::new(
            InvariantName::FamilyBonusBand,
            Band {
                low: 0.10,
                high: 0.15,
            },
            0.42,
            vec![],
        );
        assert!(!fail.pass);
        assert!(fail.margin < 0.0);
    }
}
