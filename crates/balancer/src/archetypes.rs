//! Curated army builders — the sweep's **candidate pool + reference field** and the invariant
//! **fixtures** (research A2). Each is a labeled `fn(&Ruleset) -> Army` (the counter-web test's
//! pattern), legal against the seed ruleset and against any fixture that only perturbs *numbers*
//! (structure is unchanged, so legality holds). These build armies from the ruleset's **existing**
//! equipment — the balancer authors no balance content of its own (FR-017).

use engine::content::stock_instance;
use engine::model::army::{Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{EquipmentId, MachineTypeId, ZoneId};

/// A labeled army builder — a candidate combo / field opponent (data-model MatchupSpec source).
#[derive(Clone, Copy)]
pub struct Archetype {
    pub label: &'static str,
    pub build: fn(&Ruleset) -> Army,
}

/// Place a stock machine.
fn place(rs: &Ruleset, t: MachineTypeId, v: &str, z: ZoneId, i: u8) -> MachineInstance {
    stock_instance(rs, t, v, z, i)
}

/// Swap a machine's weapon (a legal same-mount crossover, e.g. the Energy PulseLaser on a mech).
fn with_weapon(mut m: MachineInstance, weapon: &str) -> MachineInstance {
    m.loadout.weapon = EquipmentId::new(weapon);
    m
}

// ---------------------------------------------------------------------------
// The reference field / candidate pool (a bounded, counter-web-spanning set)
// ---------------------------------------------------------------------------

/// Heavy + light kinetic tanks — the armored spearhead.
pub fn kinetic_tanks(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            place(rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 1),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            place(rs, MachineTypeId::LightTank, "Scout", ZoneId::Middle, 3),
            place(rs, MachineTypeId::LightTank, "Hunter", ZoneId::Middle, 4),
        ],
    }
}

/// Energy mechs (Pulse Laser crossover) — armor-melting bruisers.
pub fn energy_mechs(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            with_weapon(
                place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 0),
                "PulseLaser",
            ),
            with_weapon(
                place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 1),
                "PulseLaser",
            ),
            with_weapon(
                place(rs, MachineTypeId::Mech, "Striker", ZoneId::Front, 2),
                "PulseLaser",
            ),
            with_weapon(
                place(rs, MachineTypeId::Mech, "Sentinel", ZoneId::Middle, 3),
                "PulseLaser",
            ),
            with_weapon(
                place(rs, MachineTypeId::Mech, "Striker", ZoneId::Middle, 4),
                "PulseLaser",
            ),
        ],
    }
}

/// AA rocket-artillery + a tank screen — the air hard-counter.
pub fn aa_rocket(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(
                rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                0,
            ),
            place(
                rs,
                MachineTypeId::RocketArtillery,
                "Aegis",
                ZoneId::Middle,
                1,
            ),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 3),
            place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 4),
        ],
    }
}

/// Air alpha — two helis + a light ground screen. Beats non-AA, folds to AA.
pub fn air_alpha(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 0),
            place(rs, MachineTypeId::AttackHeli, "Warhog", ZoneId::Air, 1),
            place(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 2),
            place(rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 3),
            place(rs, MachineTypeId::LightTank, "Hunter", ZoneId::Front, 4),
        ],
    }
}

/// Artillery line — siege backfield + a tank screen (indirect, no air).
pub fn artillery_line(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 0),
            place(rs, MachineTypeId::Artillery, "Siege", ZoneId::Rear, 1),
            place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 2),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 3),
            place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 4),
        ],
    }
}

/// Support ball — a healed tank core (force-multiplier, tests the support path).
pub fn support_ball(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 0),
            place(rs, MachineTypeId::RearSupport, "Warden", ZoneId::Middle, 1),
            place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 2),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 3),
            place(rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 4),
        ],
    }
}

/// The default reference field / candidate pool — six counter-web-spanning archetypes (bounded per
/// research A2). Includes AA so no single archetype clean-sweeps the field on the baseline ruleset.
pub fn default_field() -> Vec<Archetype> {
    vec![
        Archetype {
            label: "kinetic-tanks",
            build: kinetic_tanks,
        },
        Archetype {
            label: "energy-mechs",
            build: energy_mechs,
        },
        Archetype {
            label: "aa-rocket",
            build: aa_rocket,
        },
        Archetype {
            label: "air-alpha",
            build: air_alpha,
        },
        Archetype {
            label: "artillery-line",
            build: artillery_line,
        },
        Archetype {
            label: "support-ball",
            build: support_ball,
        },
    ]
}

// ---------------------------------------------------------------------------
// Invariant fixtures (native/off-family · gear tiers · skilled/sloppy)
// ---------------------------------------------------------------------------

/// Five native-Kinetic heavy tanks (Heavy Cannon) — every shot earns the native bonus (FR-012).
pub fn native_heavies(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 3),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 4),
        ],
    }
}

/// A durable mixed reference that survives to soak damage — the fixed opponent the family-bonus
/// edge is measured against (so cumulative damage reflects per-shot output, not an early wipe).
pub fn durable_reference(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 0),
            place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 1),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 2),
            place(rs, MachineTypeId::RearSupport, "Warden", ZoneId::Middle, 3),
            place(rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    }
}

/// A base-gear heavy company: base weapon + standard hull + basic utilities (FR-013 base tier).
pub fn base_gear(rs: &Ruleset) -> Army {
    native_heavies(rs) // stock_instance already yields base weapon + StandardHull + basic utils
}

/// The **same composition** as [`base_gear`] but max-geared: Composite Armor over the standard hull
/// (same base weapon). Isolates *gear* (composition held constant) for the power-gap cap — a
/// **moderate** edge on the baseline (advantaged, not a blowout), which a gear crank pushes over the
/// cap (FR-013). Weapon held constant so the crank lever is the armor, not a second-order gun swap.
pub fn max_gear(rs: &Ruleset) -> Army {
    let mut army = native_heavies(rs);
    for m in &mut army.machines {
        m.loadout.defense = EquipmentId::new("CompositeArmor");
    }
    army
}

/// A **well-composed** base-gear army: a compact **energy** anti-armor brawler (Siege-Laser heavies
/// with Pulse-Laser mechs) — the deliberate counter-pick to a kinetic-armored wall, since energy
/// melts armor (×1.25). Base gear only; skill = choosing the countering composition (P2, FR-015). On
/// the baseline this out-plays the armored-tank sloppy side; a gear crank (huge armor) lets raw gear
/// overwhelm the counter, flipping the check.
pub fn skilled_base_gear(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            with_weapon(
                place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
                "SiegeLaser",
            ),
            with_weapon(
                place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
                "SiegeLaser",
            ),
            with_weapon(
                place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 2),
                "PulseLaser",
            ),
            with_weapon(
                place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 3),
                "PulseLaser",
            ),
            with_weapon(
                place(rs, MachineTypeId::Mech, "Striker", ZoneId::Middle, 4),
                "PulseLaser",
            ),
        ],
    }
}

/// A **sloppy** max-gear army: gear on zero plan — five identical Composite-Armor heavy tanks,
/// mono-kinetic, no diversity, no AA, no backline. On the baseline the skilled side's better plan
/// wins despite the armor edge; the gear-crank fixture (Composite Armor cranked) lets this steamroll
/// the skilled side, so the check flips (FR-015). Armor-only gear keeps it a *moderate* edge, not an
/// unbeatable Railgun blowout — the point is that *plan*, not gear, should decide the baseline.
pub fn sloppy_max_gear(rs: &Ruleset) -> Army {
    let mut army = Army {
        machines: vec![
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 3),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Middle, 4),
        ],
    };
    for m in &mut army.machines {
        m.loadout.defense = EquipmentId::new("CompositeArmor");
    }
    army
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine::content::seed_ruleset;
    use engine::validate::validate;

    /// Every archetype + fixture is a legal army on the seed ruleset (the sweep never feeds the
    /// engine an illegal candidate for these curated builds).
    #[test]
    fn all_builders_are_legal() {
        let rs = seed_ruleset();
        let mut builds: Vec<(&str, Army)> = default_field()
            .into_iter()
            .map(|a| (a.label, (a.build)(&rs)))
            .collect();
        builds.push(("native-heavies", native_heavies(&rs)));
        builds.push(("durable-reference", durable_reference(&rs)));
        builds.push(("base-gear", base_gear(&rs)));
        builds.push(("max-gear", max_gear(&rs)));
        builds.push(("skilled-base-gear", skilled_base_gear(&rs)));
        builds.push(("sloppy-max-gear", sloppy_max_gear(&rs)));
        for (label, army) in builds {
            assert_eq!(validate(&army, &rs), Ok(()), "{label} must be a legal army");
        }
    }
}
