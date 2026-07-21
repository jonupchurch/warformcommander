//! Canonical machine-readable report (T027, FR-020).
//!
//! `serde_json` over an integer-sourced report is byte-stable (the win **counts** are integer; the
//! derived floats are pre-rounded to fixed precision in the model), so two runs over the same
//! `(Ruleset, runConfig)` diff cleanly (SC-001). `generatedAt` is the one non-reproducible field —
//! [`reproducible_json`] clears it for the SC-001 comparison.

use crate::report::model::BalanceReport;

/// Pretty canonical JSON — the artifact tooling (and Feature 12) consumes.
pub fn to_json(report: &BalanceReport) -> String {
    serde_json::to_string_pretty(report).expect("BalanceReport is always serializable")
}

/// The report body used for the SC-001 reproducibility diff: identical to [`to_json`] but with the
/// wall-clock `generatedAt` cleared, so only the deterministic content is compared.
pub fn reproducible_json(report: &BalanceReport) -> String {
    let mut r = report.clone();
    r.provenance.generated_at = None;
    to_json(&r)
}
