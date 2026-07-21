//! Human-readable report (T028, FR-021) — a committable markdown document rendering the same
//! findings as the JSON: the provenance stamp, the matchup win-rate table with CIs, the
//! severity-sorted flag list with reasons, the four invariant pass/fails with margins, and the
//! honest coverage note. No tooling required to read it.

use std::fmt::Write as _;

use crate::report::model::{BalanceReport, FlagKind, InvariantName};

/// Render the report as markdown.
pub fn to_markdown(report: &BalanceReport) -> String {
    let mut s = String::new();

    writeln!(s, "# Warform Commander — Balance Report").unwrap();
    writeln!(s).unwrap();
    let p = &report.provenance;
    writeln!(s, "- **Ruleset hash:** `{}`", p.ruleset_hash).unwrap();
    writeln!(s, "- **Engine version:** {}", p.engine_version).unwrap();
    writeln!(s, "- **Replay format:** v{}", p.replay_format_version).unwrap();
    if let Some(at) = &p.generated_at {
        writeln!(s, "- **Generated:** {at}").unwrap();
    }
    let rc = &report.run_config;
    writeln!(
        s,
        "- **Run:** seed `{}`, {} samples/matchup, fair band [{:.2}, {:.2}]",
        rc.base_seed, rc.samples_per_matchup, rc.fair_band.floor, rc.fair_band.ceiling
    )
    .unwrap();
    writeln!(s).unwrap();

    // --- Matchups ---
    writeln!(s, "## Matchups").unwrap();
    writeln!(s).unwrap();
    if report.matchups.is_empty() {
        writeln!(s, "_none_").unwrap();
    } else {
        writeln!(
            s,
            "| Matchup | Win rate A | 95% CI | Samples | 2-0 / 2-1 | Avg ticks |"
        )
        .unwrap();
        writeln!(s, "|---|---:|---|---:|---|---:|").unwrap();
        for m in &report.matchups {
            let e = &m.estimate;
            writeln!(
                s,
                "| {} | {:.1}% | [{:.1}%, {:.1}%] | {} | {} / {} | {:.1} |",
                m.label,
                e.win_rate_a * 100.0,
                e.ci95.low * 100.0,
                e.ci95.high * 100.0,
                e.samples,
                e.outcome.match_split.two_zero,
                e.outcome.match_split.two_one,
                e.outcome.avg_duration_ticks,
            )
            .unwrap();
        }
    }
    writeln!(s).unwrap();

    // --- Flagged combos ---
    writeln!(s, "## Flagged combos (worst first)").unwrap();
    writeln!(s).unwrap();
    if report.flagged.is_empty() {
        writeln!(s, "_none — no combo's interval cleared the fair band._").unwrap();
    } else {
        writeln!(
            s,
            "| Combo | Kind | Win rate | 95% CI | Severity | Reason |"
        )
        .unwrap();
        writeln!(s, "|---|---|---:|---|---:|---|").unwrap();
        for f in &report.flagged {
            writeln!(
                s,
                "| {} | {} | {:.1}% | [{:.1}%, {:.1}%] | {:.3} | {} |",
                f.combo.label,
                flag_kind_label(f.kind),
                f.across_field_win_rate * 100.0,
                f.ci95.low * 100.0,
                f.ci95.high * 100.0,
                f.severity,
                f.reason,
            )
            .unwrap();
        }
    }
    writeln!(s).unwrap();

    // --- Invariants ---
    writeln!(s, "## Balance invariants").unwrap();
    writeln!(s).unwrap();
    writeln!(s, "| Invariant | Band | Measured | Margin | Verdict |").unwrap();
    writeln!(s, "|---|---|---:|---:|---|").unwrap();
    for inv in &report.invariants {
        writeln!(
            s,
            "| {} | [{:.3}, {:.3}] | {:.3} | {:+.3} | {} |",
            invariant_label(inv.name),
            inv.band.low,
            inv.band.high,
            inv.measured,
            inv.margin,
            if inv.pass { "✅ pass" } else { "❌ FAIL" },
        )
        .unwrap();
    }
    writeln!(s).unwrap();

    // --- Coverage ---
    let c = &report.coverage;
    writeln!(s, "## Coverage").unwrap();
    writeln!(s).unwrap();
    writeln!(
        s,
        "- **Candidates evaluated:** {} of ~{} in the sampled space",
        c.candidates_evaluated, c.candidate_space_estimated
    )
    .unwrap();
    writeln!(s, "- **Reference field size:** {}", c.field_size).unwrap();
    writeln!(
        s,
        "- **Total resolutions:** {} ({} samples/matchup)",
        c.total_resolutions, c.samples_per_matchup
    )
    .unwrap();
    writeln!(s, "- **Skipped (invalid):** {}", c.skipped_invalid).unwrap();
    writeln!(s).unwrap();
    writeln!(
        s,
        "_Advisory only — this report names what to tune; the human locks the shape (P1)._"
    )
    .unwrap();

    s
}

fn flag_kind_label(kind: FlagKind) -> &'static str {
    match kind {
        FlagKind::Dominant => "Dominant",
        FlagKind::Degenerate => "Degenerate",
        FlagKind::Underpowered => "Underpowered",
    }
}

fn invariant_label(name: InvariantName) -> &'static str {
    match name {
        InvariantName::FamilyBonusBand => "Native-family bonus band",
        InvariantName::PowerGapCap => "Power-gap cap",
        InvariantName::NoDominantUnit => "No dominant unit",
        InvariantName::SkillBeatsGear => "Skill beats gear",
    }
}
