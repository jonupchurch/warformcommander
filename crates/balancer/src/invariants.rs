//! The four balance-invariant checks (T023, research C2) — each a **numeric assertion against the
//! engine's distributions**, reported with the measured number + margin (never a bare boolean,
//! FR-016). The bands are the design-doc defaults, configurable.
//!
//! - **FamilyBonusBand** — the mean-damage lift the native bonus grants an all-native army over the
//!   *same army with the bonus zeroed* (the purest read of "a native weapon's edge over an
//!   off-family one," which earns no bonus). Isolates the +12% from matrix confounds (FR-012).
//! - **PowerGapCap** — a max-gear army's win rate over the **same composition** in base gear, over
//!   both roles (cancels the first-strike bias). Advantaged, not a blowout (FR-013).
//! - **NoDominantUnit** — how many archetypes swept a clean win across *every* field matchup; 0 =
//!   pass (FR-014, the counter-web's teeth).
//! - **SkillBeatsGear** — a well-composed base-gear army's win rate over a sloppy max-gear one; a
//!   majority means plan beat gear (P2 / §10, FR-015).

use engine::model::ruleset::Ruleset;

use crate::archetypes::{
    base_gear, durable_reference, max_gear, native_heavies, skilled_base_gear, sloppy_max_gear,
    Archetype,
};
use crate::batch::{mean_first_hit_damage, mean_survivors, BatchConfig, MatchupSpec};
use crate::report::model::{Band, InvariantCheck, InvariantName};
use crate::sweep::{run_sweep, SweepConfig, SweepResult};

/// How to run the invariant checks (sample budget + reproducibility root).
#[derive(Clone, Copy, Debug)]
pub struct InvariantConfig {
    pub base_seed: u64,
    pub samples: u32,
    pub threads: Option<u32>,
}

impl Default for InvariantConfig {
    fn default() -> Self {
        InvariantConfig {
            base_seed: 1,
            samples: 400,
            threads: None,
        }
    }
}

impl InvariantConfig {
    fn batch(&self, seed_salt: u64) -> BatchConfig {
        BatchConfig {
            base_seed: self.base_seed ^ seed_salt,
            samples: self.samples,
            threads: self.threads,
        }
    }
}

/// FR-012 — the native-family bonus edge, isolated as the mean **first-hit** damage lift of an
/// all-native army over the identical army with the bonus zeroed (an off-family weapon earns no
/// bonus — the bonus-off run *is* the off-family baseline, minus the matrix confound). Band
/// [0.10, 0.15] (+12% default).
pub fn family_bonus_band(ruleset: &Ruleset, cfg: &InvariantConfig) -> InvariantCheck {
    let attacker = native_heavies(ruleset);
    let reference = durable_reference(ruleset);

    let with = MatchupSpec::new(attacker.clone(), reference.clone(), "native (bonus on)");
    let d_with = mean_first_hit_damage(&with, ruleset, &cfg.batch(0x31));

    let mut no_bonus = ruleset.clone();
    no_bonus.globals.native_bonus = 0;
    let d_without = mean_first_hit_damage(&with, &no_bonus, &cfg.batch(0x31));

    let measured = if d_without <= 0.0 {
        0.0
    } else {
        (d_with - d_without) / d_without
    };
    InvariantCheck::new(
        InvariantName::FamilyBonusBand,
        Band {
            low: 0.10,
            high: 0.15,
        },
        measured,
        vec![
            "all-native heavies vs durable reference (bonus on)".into(),
            "identical army with native_bonus zeroed".into(),
        ],
    )
}

/// FR-013 — the power-gap cap, measured as the max-gear side's **survivor margin** over the same
/// composition in base gear (fraction of the 5-squad), averaged over both roles. Survivor margin is
/// used rather than a win rate because the near-deterministic engine saturates any mono-vs-mono win
/// rate to 0/1; the margin scales smoothly with the gear edge, so a "moderate" gap is measurable.
/// Band [0, 0.5] — max gear may keep up to ~half the squad more alive; beyond that is a blowout.
pub fn power_gap_cap(ruleset: &Ruleset, cfg: &InvariantConfig) -> InvariantCheck {
    let (max_army, base_army) = (max_gear(ruleset), base_gear(ruleset));
    // max-gear as attacker vs base, and as defender when base attacks — average the survivor margin.
    let (s_max_atk, s_base_def) = mean_survivors(
        &MatchupSpec::new(max_army.clone(), base_army.clone(), "max-atk"),
        ruleset,
        &cfg.batch(0x41),
    );
    let (s_base_atk, s_max_def) = mean_survivors(
        &MatchupSpec::new(base_army.clone(), max_army.clone(), "base-atk"),
        ruleset,
        &cfg.batch(0x42),
    );
    let max_surv = (s_max_atk + s_max_def) / 2.0;
    let base_surv = (s_base_def + s_base_atk) / 2.0;
    let measured = (max_surv - base_surv) / engine::model::army::SQUAD_SIZE as f64;
    InvariantCheck::new(
        InvariantName::PowerGapCap,
        Band {
            low: 0.0,
            high: 0.5,
        },
        measured,
        vec!["max-gear vs equal-composition base-gear survivor margin (both roles)".into()],
    )
}

/// FR-014 — no dominant unit: the number of archetypes that swept a clean win across *every* field
/// matchup. Band [0, 0] (any clean-sweeper fails the counter-web).
pub fn no_dominant_unit(sweep: &SweepResult) -> InvariantCheck {
    let sweepers: Vec<String> = sweep
        .candidates
        .iter()
        .filter(|c| c.clean_sweep)
        .map(|c| c.label.clone())
        .collect();
    let evidence = if sweepers.is_empty() {
        vec!["no archetype swept a clean win across all its field matchups".into()]
    } else {
        sweepers
            .iter()
            .map(|s| format!("{s} won every field matchup"))
            .collect()
    };
    InvariantCheck::new(
        InvariantName::NoDominantUnit,
        Band {
            low: 0.0,
            high: 0.0,
        },
        sweepers.len() as f64,
        evidence,
    )
}

/// FR-015 — skill beats gear: the **survivor margin** of a well-composed base-gear army over a
/// sloppy max-gear one (fraction of the 5-squad), averaged over both roles. Survivor margin (not a
/// win rate, which saturates) so a moderate skill edge is measurable and a gear crank can flip it.
/// Band [0, 1] — a non-negative margin means the plan out-survived the gear (skill won, P2 / §10);
/// a gear crank drives it negative (gear overwhelmed skill → fail).
pub fn skill_beats_gear(ruleset: &Ruleset, cfg: &InvariantConfig) -> InvariantCheck {
    let (skilled, sloppy) = (skilled_base_gear(ruleset), sloppy_max_gear(ruleset));
    let (s_skill_atk, s_sloppy_def) = mean_survivors(
        &MatchupSpec::new(skilled.clone(), sloppy.clone(), "skill-atk"),
        ruleset,
        &cfg.batch(0x51),
    );
    let (s_sloppy_atk, s_skill_def) = mean_survivors(
        &MatchupSpec::new(sloppy.clone(), skilled.clone(), "sloppy-atk"),
        ruleset,
        &cfg.batch(0x52),
    );
    let skill_surv = (s_skill_atk + s_skill_def) / 2.0;
    let sloppy_surv = (s_sloppy_def + s_sloppy_atk) / 2.0;
    let measured = (skill_surv - sloppy_surv) / engine::model::army::SQUAD_SIZE as f64;
    InvariantCheck::new(
        InvariantName::SkillBeatsGear,
        Band {
            low: 0.0,
            high: 1.0,
        },
        measured,
        vec!["well-composed base-gear vs sloppy max-gear survivor margin (both roles)".into()],
    )
}

/// Run all four invariant checks against a ruleset. The `NoDominantUnit` check reads the same sweep
/// the report's flagged section uses (one sweep, two consumers — no duplicated resolutions).
pub fn verify(
    field: &[Archetype],
    ruleset: &Ruleset,
    cfg: &InvariantConfig,
) -> Vec<InvariantCheck> {
    let sweep = run_sweep(
        field,
        ruleset,
        &SweepConfig {
            base_seed: cfg.base_seed,
            samples_per_matchup: cfg.samples,
            threads: cfg.threads,
            ..Default::default()
        },
    );
    verify_with_sweep(&sweep, ruleset, cfg)
}

/// The four checks, reusing a precomputed sweep for the no-dominant-unit measurement.
pub fn verify_with_sweep(
    sweep: &SweepResult,
    ruleset: &Ruleset,
    cfg: &InvariantConfig,
) -> Vec<InvariantCheck> {
    vec![
        family_bonus_band(ruleset, cfg),
        power_gap_cap(ruleset, cfg),
        no_dominant_unit(sweep),
        skill_beats_gear(ruleset, cfg),
    ]
}
