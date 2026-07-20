//! The per-hit damage pipeline (US1, T022) — the fixed, deterministic order from stat block §9.2:
//! `acc − evasion` clamp → seeded hit roll → `D0 × native × crit × air × variance` → **shields
//! (×shieldMult, penetration bypass)** → **hull (×armorMult × (1−armorPct), min-floor)** → **splash
//! (≤ cap, in-row)**. All arithmetic is fixed-point (`mul_bp`/`div_bp`); the RNG draw order is fixed
//! (hit, then crit, then variance) so both build targets consume the stream identically.

use crate::fixed::{Bp, Fixed, BP_ONE};
use crate::model::ruleset::Ruleset;
use crate::model::types::{DamageFamily, DamageType, ReachTag, ZoneId};
use crate::replay::{DamageLayer, TickEvent, UnitRef};
use crate::rng::Rng;

use super::{behavior, AttackProfile, Combatant};

/// Build the `Copy` attack profile from the attacker's current effective stats + active energy dial.
fn profile(att: &Combatant) -> AttackProfile {
    AttackProfile {
        actor: att.unit,
        damage: att.stats.damage,
        damage_type: att.stats.damage_type,
        native_match: att.stats.native_match,
        crit_chance: att.stats.crit_chance,
        crit_mult: att.stats.crit_mult,
        accuracy: att.stats.accuracy,
        penetration: att.stats.penetration,
        splash: att.stats.splash,
        reach: att.stats.reach,
        energy_mult: behavior::energy_damage_mult(att.dials.energy),
    }
}

/// Resolve one attacker's shot against `target_idx`, mutating the target(s) and pushing events.
/// Consumes RNG in a fixed order regardless of the miss/hit branch structure (still deterministic).
pub(crate) fn resolve_attack(
    combatants: &mut [Combatant],
    att_idx: usize,
    target_idx: usize,
    tick: u16,
    ruleset: &Ruleset,
    rng: &mut Rng,
    events: &mut Vec<TickEvent>,
) {
    let prof = profile(&combatants[att_idx]);
    let g = &ruleset.globals;
    let target_air = combatants[target_idx].zone == ZoneId::Air;

    // --- Hit chance: accuracy − evasion, with air modifiers, clamped. ---
    let mut acc = prof.accuracy;
    let mut air_dmg_mult = BP_ONE;
    if target_air {
        if prof.reach == ReachTag::Air {
            acc += ruleset.air_mods.aa_acc_bonus; // AA bonus
            air_dmg_mult = ruleset.air_mods.aa_dmg_mult;
        } else {
            acc += ruleset.air_mods.plink_acc_penalty; // direct-fire "plink"
            air_dmg_mult = ruleset.air_mods.plink_dmg_mult;
        }
    }
    let hit_chance = (acc - combatants[target_idx].stats.evasion).clamp(g.hit_clamp_min, g.hit_clamp_max);

    let target_ref = combatants[target_idx].unit;
    if rng.roll_bp() >= hit_chance {
        events.push(TickEvent::Miss {
            actor: prof.actor,
            target: target_ref,
        });
        return;
    }

    // --- Damage build: crit, native bonus, air, variance (fixed draw order). ---
    let crit = rng.roll_bp() < prof.crit_chance;
    let variance = rng.variance_bp(g.damage_variance);

    let mut d0 = prof.damage;
    if prof.native_match {
        d0 = d0.mul_bp(BP_ONE + g.native_bonus);
    }
    if crit {
        d0 = d0.mul_bp(prof.crit_mult);
    }
    d0 = d0.mul_bp(prof.energy_mult);
    if target_air {
        d0 = d0.mul_bp(air_dmg_mult);
    }
    d0 = d0.mul_bp(BP_ONE + variance);

    // --- Primary hit: shields then hull. ---
    let (sh, hu, died) = apply_damage(&mut combatants[target_idx], d0, prof.damage_type, prof.penetration, ruleset);
    emit_hit(events, prof.actor, target_ref, sh, hu, crit, false);
    let mut dealt = sh.saturating_add(hu);
    if died {
        kill(&mut combatants[target_idx], tick);
        events.push(TickEvent::Death {
            unit: target_ref,
            killer: Some(prof.actor),
        });
    }

    // --- Splash: a reduced hit on OTHER enemies in the target's zone (≤ cap). ---
    if prof.splash > 0 {
        let splash_d0 = d0.mul_bp(prof.splash);
        let zone = combatants[target_idx].zone;
        let enemy_side = target_ref.side;
        let splash_targets: Vec<usize> = (0..combatants.len())
            .filter(|&j| {
                j != target_idx
                    && combatants[j].alive
                    && combatants[j].unit.side == enemy_side
                    && combatants[j].zone == zone
            })
            .collect();
        for j in splash_targets {
            // Blast Plating and friends reduce splash of a matching damage type taken.
            let mut sd0 = splash_d0;
            if let Some(m) = combatants[j].stats.special_mitigation {
                if m.against == prof.damage_type {
                    sd0 = sd0.mul_bp(m.splash_taken_mult);
                }
            }
            let sunit = combatants[j].unit;
            let (s2, h2, died2) = apply_damage(&mut combatants[j], sd0, prof.damage_type, prof.penetration, ruleset);
            emit_hit(events, prof.actor, sunit, s2, h2, false, true);
            dealt = dealt.saturating_add(s2).saturating_add(h2);
            if died2 {
                kill(&mut combatants[j], tick);
                events.push(TickEvent::Death {
                    unit: sunit,
                    killer: Some(prof.actor),
                });
            }
        }
    }

    combatants[att_idx].damage_dealt = combatants[att_idx].damage_dealt.saturating_add(dealt);
}

/// Apply an incoming `d0` (already fully modified) through shields then hull, mutating the target.
/// Returns `(shield_damage, hull_damage, died)`.
fn apply_damage(
    target: &mut Combatant,
    d0: Fixed,
    dtype: DamageType,
    penetration: Bp,
    ruleset: &Ruleset,
) -> (Fixed, Fixed, bool) {
    let (shield_dealt, hull_dealt) = mitigate(
        d0,
        dtype,
        penetration,
        target.shield,
        target.hull,
        target.stats.armor_pct,
        ruleset,
    );
    target.shield = target.shield.saturating_sub(shield_dealt).max_zero();
    target.hull = target.hull.saturating_sub(hull_dealt).max_zero();
    target.ticks_since_hit = 0;
    let died = target.alive && target.hull.is_zero_or_less();
    (shield_dealt, hull_dealt, died)
}

/// **Pure** mitigation math (stat block §9.2) — the counter-web's core. Given an incoming `d0` and
/// the target's current `shield`/`hull`/`armor_pct`, returns the damage actually applied to each
/// layer (each capped at what's available). Penetration bypasses shields straight to hull; the rest
/// hits shields first (`× shieldMult`), overflow converts back through the multiplier; hull then
/// takes `× armorMult × (1 − armorPct)` with the min-damage floor.
pub(crate) fn mitigate(
    d0: Fixed,
    dtype: DamageType,
    penetration: Bp,
    shield: Fixed,
    hull: Fixed,
    armor_pct: Bp,
    ruleset: &Ruleset,
) -> (Fixed, Fixed) {
    let mult = ruleset.damage_matrix.for_type(dtype);

    let pen_part = d0.mul_bp(penetration);
    let shield_part = d0.saturating_sub(pen_part);
    let mut hull_in = pen_part;
    let mut shield_dealt = Fixed::ZERO;

    if shield.milli() > 0 && shield_part.milli() > 0 {
        let shield_dmg = shield_part.mul_bp(mult.vs_shields);
        if shield_dmg <= shield {
            shield_dealt = shield_dmg;
        } else {
            shield_dealt = shield;
            let overflow = shield_dmg.saturating_sub(shield);
            hull_in = hull_in.saturating_add(overflow.div_bp(mult.vs_shields));
        }
    } else {
        hull_in = hull_in.saturating_add(shield_part);
    }

    let mut hull_dealt = Fixed::ZERO;
    if hull_in.milli() > 0 {
        let mitigated = hull_in.mul_bp(mult.vs_armor).mul_bp(BP_ONE - armor_pct);
        let floor = hull_in.mul_bp(ruleset.globals.min_damage_floor);
        hull_dealt = mitigated.max(floor).min(hull); // cap at remaining hull
    }

    (shield_dealt, hull_dealt)
}

fn kill(c: &mut Combatant, tick: u16) {
    c.alive = false;
    c.hull = Fixed::ZERO;
    if c.destroyed_at.is_none() {
        c.destroyed_at = Some(tick);
    }
}

/// Emit a `Shot` implied hit as `Hit` events per non-zero layer (shield/hull).
fn emit_hit(
    events: &mut Vec<TickEvent>,
    actor: UnitRef,
    target: UnitRef,
    shield: Fixed,
    hull: Fixed,
    crit: bool,
    splash: bool,
) {
    if shield.milli() > 0 {
        events.push(TickEvent::Hit {
            actor,
            target,
            dmg: shield,
            layer: DamageLayer::Shield,
            crit,
            splash,
        });
    }
    if hull.milli() > 0 {
        events.push(TickEvent::Hit {
            actor,
            target,
            dmg: hull,
            layer: DamageLayer::Hull,
            crit,
            splash,
        });
    }
}

/// True if the family deals matrix damage (support "attacks" never reach this path).
#[allow(dead_code)]
fn deals_damage(family: DamageFamily) -> bool {
    family != DamageFamily::Support
}

#[cfg(test)]
mod counterweb_tests {
    //! US3 (T034/T035): the damage-matrix counter-web, tested against the pure [`mitigate`] math.
    use super::mitigate;
    use crate::content::seed_ruleset;
    use crate::fixed::Fixed;
    use crate::model::ruleset::Ruleset;
    use crate::model::types::DamageType;

    const BIG_HULL: Fixed = Fixed(2_000_000); // 2000 units — effectively unkillable for shield tests

    /// Shots to strip `shield0` with a `d0`-per-hit weapon of `dtype` (no penetration, no armor).
    fn shots_to_strip_shield(rs: &Ruleset, dtype: DamageType, d0: Fixed, shield0: Fixed) -> u32 {
        let mut shield = shield0;
        let mut n = 0;
        while shield.milli() > 0 && n < 100_000 {
            let (s, _) = mitigate(d0, dtype, 0, shield, BIG_HULL, 0, rs);
            shield = shield.saturating_sub(s);
            n += 1;
        }
        n
    }

    /// Shots to destroy `hull0` behind `armor_pct` (no shield) with a `d0`-per-hit `dtype` weapon.
    fn shots_to_kill_hull(rs: &Ruleset, dtype: DamageType, d0: Fixed, hull0: Fixed, armor_pct: i64) -> u32 {
        let mut hull = hull0;
        let mut n = 0;
        while hull.milli() > 0 && n < 100_000 {
            let (_, h) = mitigate(d0, dtype, 0, Fixed::ZERO, hull, armor_pct, rs);
            hull = hull.saturating_sub(h);
            n += 1;
        }
        n
    }

    /// T034 (AS1, stat block G): Kinetic shreds shields — it strips a shield pool ~2× faster than
    /// Energy does, and for Kinetic the shield folds faster than armor.
    #[test]
    fn kinetic_shreds_shields_about_twice_as_fast_as_energy() {
        let rs = seed_ruleset();
        let d0 = Fixed::from_int(35);
        let shield = Fixed::from_int(250);

        let kin = shots_to_strip_shield(&rs, DamageType::Kinetic, d0, shield);
        let energy = shots_to_strip_shield(&rs, DamageType::Energy, d0, shield);
        // ×1.4 vs ×0.6 ⇒ ~2.33× the shots for energy; assert it is at least ~2× slower.
        assert!(
            energy >= kin * 2,
            "energy should strip shields ≥2× slower: kinetic={kin} energy={energy}"
        );

        // Kinetic vs a 30%-armor hull is much slower than Kinetic vs a shield (folds to armor).
        let kin_hull = shots_to_kill_hull(&rs, DamageType::Kinetic, d0, Fixed::from_int(250), 3_000);
        assert!(
            kin_hull > kin,
            "kinetic folds to armor: shield strip {kin} < armor kill {kin_hull}"
        );
    }

    /// T035 (stat block B vs C): Energy melts armor — it kills a heavy armored hull ~30% faster
    /// than Kinetic (matrix ×1.25 vs ×0.85 ⇒ TTK ratio ≈ 0.68).
    #[test]
    fn energy_melts_armor_about_30pct_faster_than_kinetic() {
        let rs = seed_ruleset();
        let d0 = Fixed::from_int(35);
        let hull = Fixed::from_int(1700);
        let armor = 3_000; // 30%

        let kin = shots_to_kill_hull(&rs, DamageType::Kinetic, d0, hull, armor);
        let energy = shots_to_kill_hull(&rs, DamageType::Energy, d0, hull, armor);
        assert!(energy < kin, "energy must out-DPS kinetic vs armor: kin={kin} energy={energy}");
        // ~30% faster ⇒ energy ≈ 0.62–0.75 × kinetic shots.
        let ratio_pct = energy * 100 / kin;
        assert!(
            (60..=78).contains(&ratio_pct),
            "energy TTK should be ~30% shorter (got {ratio_pct}% of kinetic: kin={kin} energy={energy})"
        );
    }

    /// Penetration bypasses shields (Railgun): a 50%-pen hit leaks straight to hull even at full shield.
    #[test]
    fn penetration_leaks_past_shields() {
        let rs = seed_ruleset();
        let (shield_dmg, hull_dmg) = mitigate(
            Fixed::from_int(60),
            DamageType::Kinetic,
            5_000, // 50% penetration
            Fixed::from_int(250),
            Fixed::from_int(1000),
            0,
            &rs,
        );
        assert!(shield_dmg.milli() > 0, "part still hits the shield");
        assert!(hull_dmg.milli() > 0, "penetration leaks to hull despite a full shield");
    }
}
