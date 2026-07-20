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

/// Apply an incoming `d0` (already fully modified) through shields then hull. Returns
/// `(shield_damage, hull_damage, died)`. Pure mitigation math (stat block §9.2).
fn apply_damage(
    target: &mut Combatant,
    d0: Fixed,
    dtype: DamageType,
    penetration: Bp,
    ruleset: &Ruleset,
) -> (Fixed, Fixed, bool) {
    let mult = ruleset.damage_matrix.for_type(dtype);

    // Penetration bypasses shields straight to hull; the rest hits shields first.
    let pen_part = d0.mul_bp(penetration);
    let shield_part = d0.saturating_sub(pen_part);
    let mut hull_in = pen_part;
    let mut shield_dealt = Fixed::ZERO;

    if target.shield.milli() > 0 && shield_part.milli() > 0 {
        let shield_dmg = shield_part.mul_bp(mult.vs_shields);
        if shield_dmg <= target.shield {
            target.shield = target.shield.saturating_sub(shield_dmg);
            shield_dealt = shield_dmg;
        } else {
            shield_dealt = target.shield;
            let overflow = shield_dmg.saturating_sub(target.shield);
            target.shield = Fixed::ZERO;
            // Convert the overflow back through the shield multiplier → raw hull damage.
            hull_in = hull_in.saturating_add(overflow.div_bp(mult.vs_shields));
        }
    } else {
        hull_in = hull_in.saturating_add(shield_part);
    }

    let mut hull_dealt = Fixed::ZERO;
    if hull_in.milli() > 0 {
        let mitigated = hull_in
            .mul_bp(mult.vs_armor)
            .mul_bp(BP_ONE - target.stats.armor_pct);
        let floor = hull_in.mul_bp(ruleset.globals.min_damage_floor);
        let hull_dmg = mitigated.max(floor);
        let before = target.hull;
        target.hull = target.hull.saturating_sub(hull_dmg).max_zero();
        hull_dealt = before.saturating_sub(target.hull);
    }

    target.ticks_since_hit = 0;
    let died = target.alive && target.hull.is_zero_or_less();
    (shield_dealt, hull_dealt, died)
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
