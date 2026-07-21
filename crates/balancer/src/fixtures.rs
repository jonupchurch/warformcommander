//! Deliberately-perturbed rulesets — the balancer's **golden fixtures** (T014/T019–T022).
//!
//! Each is the engine's canonical [`seed_ruleset`] with **one number cranked out of band**, so the
//! balancer's own tests can prove it *catches what it must*: a planted dominant unit (SC-003) and
//! each of the four invariant violations (SC-004). The balancer authors no balance content — these
//! are perturbations of the one canonical table, clearly labeled as test fixtures (FR-017 spirit).

use engine::content::seed_ruleset;
use engine::fixed::Fixed;
use engine::model::ruleset::Ruleset;
use engine::model::types::{EquipmentId, EquipmentSpec, VariantId};

/// The fair baseline — the engine's canonical first-pass table, unperturbed.
pub fn fair_baseline() -> Ruleset {
    seed_ruleset()
}

/// Multiply a `Fixed` quantity by an integer factor (milli-space).
fn scale(v: Fixed, factor: i64) -> Fixed {
    Fixed::from_milli(v.milli().saturating_mul(factor))
}

/// Plant a **dominant unit**: crank one variant's per-shot damage and hull far above the field, so
/// an army built around it sweeps every matchup (SC-003 / FR-014 violation). Also raises its threat
/// so it isn't ignored. Panics if the variant id is unknown (callers pass ids from the seed table).
pub fn planted_dominant(variant: &str, damage_mult: i64, hull_mult: i64) -> Ruleset {
    planted_dominant_variants(&[(variant, damage_mult, hull_mult)])
}

/// Crank several variants at once — used to make a whole **archetype** dominant enough to clean-sweep
/// the field (an archetype's edge is spread across its units, so cranking one unit is often absorbed
/// by a structural counter; cranking all of an archetype's variants breaks the counter-web → a clean
/// sweep, the sharpest FR-014 violation).
pub fn planted_dominant_variants(specs: &[(&str, i64, i64)]) -> Ruleset {
    let mut rs = seed_ruleset();
    for (variant, damage_mult, hull_mult) in specs {
        let base = rs
            .variants
            .get_mut(&VariantId::new(*variant))
            .unwrap_or_else(|| panic!("unknown variant {variant}"));
        base.damage = scale(base.damage, *damage_mult);
        base.hull = scale(base.hull, *hull_mult);
        base.threat = scale(base.threat, *damage_mult);
    }
    rs
}

/// A **no-dominant-unit violation**: crank the helicopter variants' (Gunship + Warhog) **hull** so
/// they survive the one thing that counters them — AA rocket fire — while keeping their structural
/// immunity to all ground weapons. An unkillable air alpha then sweeps a clean win across the whole
/// field (FR-014 violation): ground archetypes can never touch it, and the AA line can no longer
/// kill it in time. The counter-web is otherwise so robust that only breaking air's single hard
/// counter produces a clean sweeper.
pub fn dominant_unit_violation() -> Ruleset {
    planted_dominant_variants(&[("Gunship", 6, 60), ("Warhog", 6, 60)])
}

/// **Family-bonus violation**: set the native-family bonus far above the ~10–15% band (FR-012).
pub fn family_bonus_violation() -> Ruleset {
    let mut rs = seed_ruleset();
    rs.globals.native_bonus = 8_000; // +80% instead of +12%
    rs
}

/// **Gear-overwhelms violation**: crank the premium gear (the Railgun's damage + Composite Armor's
/// armor) so a max-gear army blows past the moderate power-gap cap and overwhelms skilled base gear
/// (FR-013 / FR-015 violation, shared).
pub fn gear_overwhelms() -> Ruleset {
    let mut rs = seed_ruleset();
    if let Some(module) = rs.equipment.get_mut(&EquipmentId::new("Railgun")) {
        if let EquipmentSpec::Weapon(w) = &mut module.spec {
            // Base Railgun delta is +25; +400 makes gear, not the plan, decide the fight.
            w.stat_deltas.damage = Fixed::from_int(400);
        }
    }
    if let Some(module) = rs.equipment.get_mut(&EquipmentId::new("CompositeArmor")) {
        if let EquipmentSpec::Defense(d) = &mut module.spec {
            d.armor_pct_delta = 5_500; // +55% armor (clamps high) atop the chassis base
        }
    }
    rs
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A perturbed fixture is structurally still a legal ruleset (only numbers changed), and its
    /// hash differs from the baseline (provenance can tell them apart — SC-007).
    #[test]
    fn fixtures_differ_from_baseline_by_hash() {
        let base = fair_baseline();
        assert_ne!(base.hash(), family_bonus_violation().hash());
        assert_ne!(base.hash(), gear_overwhelms().hash());
        assert_ne!(base.hash(), planted_dominant("Grizzly", 20, 5).hash());
    }

    /// The planted crank actually raised the target variant's damage.
    #[test]
    fn planted_dominant_cranks_the_variant() {
        let rs = planted_dominant("Grizzly", 20, 5);
        let base = seed_ruleset();
        let planted = rs.base_stats(&VariantId::new("Grizzly")).unwrap().damage;
        let orig = base.base_stats(&VariantId::new("Grizzly")).unwrap().damage;
        assert_eq!(planted.milli(), orig.milli() * 20);
    }
}
