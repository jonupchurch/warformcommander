//! US4 T025/T026 — the report is a provenance-stamped, machine- + human-readable **data artifact**
//! that never mutates the Ruleset. Checks: the JSON matches the contract shape and carries the
//! `rulesetHash` + engine/format versions (SC-007); two runs over different Rulesets are
//! distinguishable by provenance; the markdown renders every section; the input Ruleset is
//! byte-identical after a full run (SC-006); and the report body is reproducible (SC-001).

use balancer::archetypes::default_field;
use balancer::fixtures;
use balancer::report::json::{reproducible_json, to_json};
use balancer::report::markdown::to_markdown;
use balancer::run::{sweep_report, verify_report};
use balancer::sweep::SweepConfig;

fn small_cfg() -> SweepConfig {
    SweepConfig {
        base_seed: 1,
        samples_per_matchup: 50,
        threads: None,
        ..Default::default()
    }
}

#[test]
fn json_matches_the_contract_shape_and_carries_provenance() {
    let rs = fixtures::fair_baseline();
    let report = verify_report(&default_field(), &rs, &small_cfg());
    let v: serde_json::Value = serde_json::from_str(&to_json(&report)).unwrap();

    assert_eq!(v["reportVersion"], 1);
    assert_eq!(v["provenance"]["rulesetHash"], rs.hash().0);
    assert_eq!(v["provenance"]["engineVersion"], engine::engine_version());
    assert!(v["provenance"]["replayFormatVersion"].is_number());
    assert!(
        v["runConfig"]["baseSeed"].is_string(),
        "u64 seed serialized as a string"
    );
    assert!(v["matchups"].is_array());
    assert!(v["flagged"].is_array());
    assert_eq!(v["invariants"].as_array().unwrap().len(), 4);
    assert!(v["coverage"]["totalResolutions"].is_number());

    // winsA/winsB are the integer source; winRateA is derived and consistent with them.
    let m0 = &v["matchups"][0];
    let wins_a = m0["winsA"].as_u64().unwrap();
    let samples = m0["samples"].as_u64().unwrap();
    let rate = m0["winRateA"].as_f64().unwrap();
    assert!(
        (rate - wins_a as f64 / samples as f64).abs() < 0.001,
        "winRateA must equal winsA/samples"
    );
}

#[test]
fn two_rulesets_are_distinguishable_by_provenance() {
    let base = verify_report(&default_field(), &fixtures::fair_baseline(), &small_cfg());
    let planted = verify_report(
        &default_field(),
        &fixtures::family_bonus_violation(),
        &small_cfg(),
    );
    assert_ne!(
        base.provenance.ruleset_hash, planted.provenance.ruleset_hash,
        "reports over different Rulesets must have different provenance (no silent mixing)"
    );
}

#[test]
fn markdown_renders_every_section() {
    let rs = fixtures::fair_baseline();
    let md = to_markdown(&verify_report(&default_field(), &rs, &small_cfg()));
    for section in [
        "# Warform Commander — Balance Report",
        "## Matchups",
        "## Flagged combos",
        "## Balance invariants",
        "## Coverage",
    ] {
        assert!(md.contains(section), "markdown missing section: {section}");
    }
    assert!(
        md.contains(&rs.hash().0),
        "markdown must carry the ruleset hash"
    );
    assert!(
        md.contains("Advisory only"),
        "markdown must state the advisory-only boundary"
    );
}

#[test]
fn a_full_run_never_mutates_the_ruleset() {
    let rs = fixtures::fair_baseline();
    let before = serde_json::to_vec(&rs).unwrap();
    let _ = verify_report(&default_field(), &rs, &small_cfg());
    let after = serde_json::to_vec(&rs).unwrap();
    assert_eq!(
        before, after,
        "SC-006: the balancer is advisory — the Ruleset is byte-identical after a run"
    );
}

#[test]
fn the_report_body_is_reproducible() {
    let rs = fixtures::fair_baseline();
    let a = sweep_report(&default_field(), &rs, &small_cfg());
    let b = sweep_report(&default_field(), &rs, &small_cfg());
    assert_eq!(
        reproducible_json(&a),
        reproducible_json(&b),
        "SC-001: same inputs → identical report body"
    );
}
