//! Curated army builders — the sweep's **candidate pool + reference field** and the invariant
//! **fixtures** (research A2). Each is a labeled `fn(&Ruleset) -> Army` (the counter-web test's
//! pattern), legal against the seed ruleset and against any fixture that only perturbs *numbers*
//! (structure is unchanged, so legality holds). These build armies from the ruleset's **existing**
//! equipment — the balancer authors no balance content of its own (FR-017).

use engine::content::stock_instance;
use engine::model::army::{Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{EquipmentId, MachineTypeId, Stance, TargetRow, ZoneId};

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

/// Override a machine's Target Row dial (e.g. `LastReachable` for a backline raider).
fn with_target_row(mut m: MachineInstance, row: TargetRow) -> MachineInstance {
    m.dials.target_row = row;
    m
}

/// Fit a Flak Battery (unlocks `AntiAir`) into a ground unit's first utility slot when the ruleset
/// carries it — turning it into an anti-air platform that can contest the Air zone. A no-op (stock
/// unit) when the utility is absent, so the archetype stays legal against `seed_ruleset()` and the
/// A/B (flak on / off) is a pure ruleset swap.
fn with_flak(mut m: MachineInstance, rs: &Ruleset) -> MachineInstance {
    if rs.equipment.contains_key(&EquipmentId::new("FlakBattery"))
        && !m.loadout.utilities.is_empty()
    {
        m.loadout.utilities[0] = EquipmentId::new("FlakBattery");
    }
    m
}

// ---------------------------------------------------------------------------
// The reference field / candidate pool (a bounded, counter-web-spanning set)
// ---------------------------------------------------------------------------

/// Heavy + light kinetic tanks — the armored spearhead.
///
/// The two light tanks become **backline raiders** whenever the loaded ruleset carries the raider
/// weapon (`SkirmishCannon`, AnyGround reach): they mount it and switch to `LastReachable` so they
/// snipe the enemy rear (artillery / support), where the LightTank role-damage bonus applies. When
/// the weapon is absent (e.g. the canonical seed) they fall back to stock light tanks, so the
/// archetype stays legal against `seed_ruleset()` and the A/B is a pure ruleset swap.
pub fn kinetic_tanks(rs: &Ruleset) -> Army {
    let light = |v: &str, i: u8| -> MachineInstance {
        let m = place(rs, MachineTypeId::LightTank, v, ZoneId::Middle, i);
        if rs
            .equipment
            .contains_key(&EquipmentId::new("SkirmishCannon"))
        {
            with_target_row(with_weapon(m, "SkirmishCannon"), TargetRow::LastReachable)
        } else {
            m
        }
    };
    Army {
        machines: vec![
            with_flak(
                place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
                rs,
            ),
            place(rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 1),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 2),
            light("Scout", 3),
            light("Hunter", 4),
        ],
    }
}

/// Energy mechs (Pulse Laser crossover) — armor-melting bruisers.
pub fn energy_mechs(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            with_flak(
                with_weapon(
                    place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 0),
                    "PulseLaser",
                ),
                rs,
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
            with_flak(
                place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 2),
                rs,
            ),
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
            with_flak(
                place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 2),
                rs,
            ),
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
// The combined-arms field (a diagnostic second opinion on the reference field)
// ---------------------------------------------------------------------------
//
// The reference field above is six **mono** builds — five near-identical machines, one idea each —
// deliberately extreme so they span the counter-web. That makes them a poor model of a real player
// army, and it matters here because most matchups are decided by **binary engagement rules** (a unit
// can target the Air zone or it cannot; it can reach the rear row or it cannot) rather than by
// damage. A mono build that loses the engagement rule loses every game, which is why the reference
// sweep resolves ~24/30 matchups at 0% or 100%.
//
// These six are plausible **combined-arms** builds: each fields a front screen, a damage source, and
// an answer to air. Running the same sweep over them measures whether the field's decisiveness is a
// property of the *game* or an artifact of the mono fixtures — the question that decides whether
// balance numbers are meaningful at all.

/// A light tank kitted as a backline raider when the ruleset carries the raider weapon (see
/// [`kinetic_tanks`]); a stock light tank otherwise, so these stay legal against `seed_ruleset()`.
fn raider(rs: &Ruleset, v: &str, z: ZoneId, i: u8) -> MachineInstance {
    let m = place(rs, MachineTypeId::LightTank, v, z, i);
    if rs
        .equipment
        .contains_key(&EquipmentId::new("SkirmishCannon"))
    {
        with_target_row(with_weapon(m, "SkirmishCannon"), TargetRow::LastReachable)
    } else {
        m
    }
}

/// Combined line — armor screen, mech damage, indirect fire, a medic, and flak for air.
pub fn ca_line(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            with_flak(
                place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
                rs,
            ),
            place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 1),
            place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            place(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            place(rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    }
}

/// Mobile strike — a thin screen, raiders working the enemy backline, mech damage, forward support.
pub fn ca_mobile(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            with_flak(
                place(rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 0),
                rs,
            ),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            raider(rs, "Scout", ZoneId::Middle, 2),
            with_weapon(
                place(rs, MachineTypeId::Mech, "Striker", ZoneId::Middle, 3),
                "PulseLaser",
            ),
            place(rs, MachineTypeId::RearSupport, "Warden", ZoneId::Middle, 4),
        ],
    }
}

/// Air-supported line — one gunship over a conventional screen, plus flak so the mirror is winnable.
pub fn ca_air(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 0),
            with_flak(
                place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
                rs,
            ),
            place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 2),
            place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 3),
            place(rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    }
}

/// Siege — two tubes behind a flak-equipped armor screen, with sustain to hold the line.
pub fn ca_siege(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            with_flak(
                place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 0),
                rs,
            ),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            place(rs, MachineTypeId::RearSupport, "Warden", ZoneId::Middle, 2),
            place(rs, MachineTypeId::Artillery, "Siege", ZoneId::Rear, 3),
            place(rs, MachineTypeId::Artillery, "Marksman", ZoneId::Rear, 4),
        ],
    }
}

/// Air-denial — SAM rocket artillery *and* flak *and* a gunship of its own; the anti-air specialist
/// rebuilt as a combined-arms list rather than a one-trick counter.
pub fn ca_aa(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 0),
            with_flak(
                place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
                rs,
            ),
            place(rs, MachineTypeId::Mech, "Vanguard", ZoneId::Front, 2),
            place(
                rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                3,
            ),
            place(rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    }
}

/// Attrition — double support behind an armor screen, trading burst for staying power.
pub fn ca_attrition(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            with_flak(
                place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 0),
                rs,
            ),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            place(rs, MachineTypeId::RearSupport, "Warden", ZoneId::Middle, 2),
            place(rs, MachineTypeId::Mech, "Sentinel", ZoneId::Middle, 3),
            place(rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
        ],
    }
}

/// The combined-arms diagnostic field — six mixed builds, each with a screen, damage, and an answer
/// to air (contrast [`default_field`], which is six mono builds).
pub fn combined_arms_field() -> Vec<Archetype> {
    vec![
        Archetype {
            label: "ca-line",
            build: ca_line,
        },
        Archetype {
            label: "ca-mobile",
            build: ca_mobile,
        },
        Archetype {
            label: "ca-air",
            build: ca_air,
        },
        Archetype {
            label: "ca-siege",
            build: ca_siege,
        },
        Archetype {
            label: "ca-aa",
            build: ca_aa,
        },
        Archetype {
            label: "ca-attrition",
            build: ca_attrition,
        },
    ]
}

/// Assign a **role-based stance** to a placed machine (v2 stance diagnostic): front-zone units become
/// Protectors that soak for the line, the fragile Rear backline goes Defensive to hide, and the middle
/// holds Neutral. This is the deliberate, sensible use of the dial the balancer needs to *see* stance
/// at all — every archetype otherwise carries stock `Neutral`, and a uniform-stance army is by design
/// identical to all-Neutral (research R8), so without this the dial reads as inert no matter how well
/// it works.
fn stance_by_role(mut m: MachineInstance) -> MachineInstance {
    m.dials.stance = match m.zone {
        ZoneId::Front => Stance::Protector,
        ZoneId::Rear => Stance::Defensive,
        ZoneId::Middle | ZoneId::Air => Stance::Neutral,
    };
    m
}

/// A combined-arms archetype with the role-based stance layer applied — same composition, stanced.
fn stanced(build: fn(&Ruleset) -> Army) -> impl Fn(&Ruleset) -> Army {
    move |rs: &Ruleset| Army {
        machines: build(rs).machines.into_iter().map(stance_by_role).collect(),
    }
}

/// The stance-diagnostic field: the combined-arms archetypes, each with the role-based stance layer.
/// Swept against the plain `combined` field, a difference in standings is the measurable proof that
/// stance changes outcomes (SC-006), which no uniform-stance field can show.
pub fn stance_field() -> Vec<Archetype> {
    // The `build` fn pointers must be 'static, so we route through named wrappers per archetype.
    vec![
        Archetype {
            label: "ca-line-stanced",
            build: |rs| stanced(ca_line)(rs),
        },
        Archetype {
            label: "ca-mobile-stanced",
            build: |rs| stanced(ca_mobile)(rs),
        },
        Archetype {
            label: "ca-air-stanced",
            build: |rs| stanced(ca_air)(rs),
        },
        Archetype {
            label: "ca-siege-stanced",
            build: |rs| stanced(ca_siege)(rs),
        },
        Archetype {
            label: "ca-aa-stanced",
            build: |rs| stanced(ca_aa)(rs),
        },
        Archetype {
            label: "ca-attrition-stanced",
            build: |rs| stanced(ca_attrition)(rs),
        },
    ]
}

/// Resolve a `--field` selector to a field. `mono` is the canonical reference field (the default);
/// `combined` is the combined-arms diagnostic; `all` sweeps both together (12 archetypes, 132
/// matchups); `stance` is the role-stanced combined-arms field (the v2 stance measurement).
pub fn field_by_name(name: &str) -> Vec<Archetype> {
    match name {
        "combined" => combined_arms_field(),
        "stance" => stance_field(),
        "all" => default_field()
            .into_iter()
            .chain(combined_arms_field())
            .collect(),
        _ => default_field(),
    }
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

/// A **well-composed** base-gear army — a combined-arms *siege + sustain* list: a durable two-heavy
/// screen, two artillery tubes working the enemy from range, and a Medic keeping the line up. Its edge
/// over the sloppy stack is meant to be **composition quality** — reach + sustain + a screen
/// out-attritioning a naive brawler blob — *not* a damage-type matchup.
///
/// This is the S0 re-fixture (FR-030). The old fixture was a pure **energy** anti-armor brawler, so its
/// entire skilled edge was the matrix's Energy-vs-armor multiplier — meaning **any** structural matrix
/// change moved SkillBeatsGear by construction, making it useless as a gate on a counter-web redesign
/// (research D0). This army deals **no energy damage**, so perturbing the energy matrix row leaves the
/// check byte-identical (see `skill_beats_gear_is_matrix_energy_invariant`) — the gate now measures
/// *plan* (P2/FR-015), not a single damage type.
///
/// **This gate reads RED on the v2 baseline by design.** On the degenerate v2 field, composition does
/// not yet beat max gear (measured survivor margin ≈ −0.41): reach/kiting is half-built, so the
/// screen+reach+sustain plan cannot out-attrition a max-armor blob. That is the exact disease v3 exists
/// to cure — the gate is expected to flip green as US2 makes reach/positioning a real counter. Base
/// gear only; the crank fixture (`fixtures::gear_overwhelms`) drives it further negative, so the
/// "gear can overwhelm skill" violation test still holds.
pub fn skilled_base_gear(rs: &Ruleset) -> Army {
    Army {
        machines: vec![
            place(rs, MachineTypeId::HeavyTank, "Bulwark", ZoneId::Front, 0),
            place(rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 1),
            place(rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 2),
            place(rs, MachineTypeId::Artillery, "Siege", ZoneId::Rear, 3),
            place(rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 4),
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
    use engine::model::ruleset::LayerMultipliers;
    use engine::validate::validate;

    use crate::invariants::{skill_beats_gear, InvariantConfig};

    /// Every archetype + fixture is a legal army on the seed ruleset (the sweep never feeds the
    /// engine an illegal candidate for these curated builds).
    #[test]
    fn all_builders_are_legal() {
        let rs = seed_ruleset();
        let mut builds: Vec<(&str, Army)> = field_by_name("all")
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

    /// **S0 / FR-030** — the re-fixtured `SkillBeatsGear` must NOT move when only the damage matrix
    /// changes. The well-composed skilled fixture deals no energy damage, so the matrix's **energy
    /// row is never consulted**; perturbing it (here to the exact US1 sharpen, `{7_000, 16_000}`, and
    /// again to an absurd value) must leave the measured margin **byte-identical**. The old
    /// energy-brawler fixture failed this by construction — its whole edge was that row. This is also
    /// self-validating: it would fail the instant any fixture unit dealt energy damage.
    #[test]
    fn skill_beats_gear_is_matrix_energy_invariant() {
        let cfg = InvariantConfig {
            base_seed: 1,
            samples: 128,
            threads: Some(1),
        };
        let rs = seed_ruleset();
        let before = skill_beats_gear(&rs, &cfg).measured;

        // The exact US1 energy sharpen (12_500 → 16_000 vs armor, 6_000 → 7_000 vs shields).
        let mut sharp = rs.clone();
        sharp.damage_matrix.energy = LayerMultipliers {
            vs_shields: 7_000,
            vs_armor: 16_000,
        };
        assert_eq!(
            before,
            skill_beats_gear(&sharp, &cfg).measured,
            "SkillBeatsGear moved when only the energy matrix row changed — the fixture is not \
             composition-quality (it deals energy damage), so it still fails matrix edits by construction"
        );

        // And an absurd energy row — still no effect, because energy is never dealt here.
        let mut absurd = rs.clone();
        absurd.damage_matrix.energy = LayerMultipliers {
            vs_shields: 30_000,
            vs_armor: 30_000,
        };
        assert_eq!(
            before,
            skill_beats_gear(&absurd, &cfg).measured,
            "SkillBeatsGear must be independent of the energy matrix row"
        );
    }
}
