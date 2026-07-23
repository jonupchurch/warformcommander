//! The per-hit damage pipeline (US1, T022) — the fixed, deterministic order from stat block §9.2:
//! `acc − evasion` clamp → seeded hit roll → `D0 × native × crit × air × variance` → **shields
//! (×shieldMult, penetration bypass)** → **hull (×armorMult × (1−armorPct), min-floor)** → **splash
//! (≤ cap, in-row)**. All arithmetic is fixed-point (`mul_bp`/`div_bp`); the RNG draw order is fixed
//! (hit, then crit, then variance) so both build targets consume the stream identically.

use crate::fixed::{Bp, Fixed, BP_ONE};
use crate::model::ruleset::Ruleset;
use crate::model::types::{
    AuraKind, AuraScope, Capability, DamageFamily, DamageType, MachineTypeId, ReachTag, ZoneId,
};
use crate::replay::{DamageLayer, TickEvent, UnitRef};
use crate::rng::Rng;

use super::{AttackProfile, Combatant};

/// Paint on-hit rider (v3 US3, design §13.2): extra incoming damage a **painted** target takes, and
/// how long the mark lasts. Start-values held as consts here (like the targeting armour threshold);
/// they move to the ruleset in the balance pass.
const PAINT_TAKEN_BONUS: Bp = 2_500; // +25% damage taken while painted
const PAINT_DURATION_TICKS: u16 = 30;

/// The incoming-damage multiplier from an active Paint mark (`BP_ONE` when the target is not painted).
fn paint_mult(target: &Combatant, tick: u16) -> Bp {
    if target.painted_until > tick {
        BP_ONE + PAINT_TAKEN_BONUS
    } else {
        BP_ONE
    }
}

/// Product of the `(BP_ONE + magnitude)` multipliers from every **living** same-side machine whose
/// passive aura matches one of `kinds` and whose scope reaches `subject_idx`'s zone (v3 US5). Because
/// only living sources count, an aura vanishes the tick its source dies — so a Commander's army-wide
/// boost is revoked on assassination with no extra bookkeeping.
fn aura_mult(combatants: &[Combatant], subject_idx: usize, kinds: &[AuraKind]) -> Bp {
    let side = combatants[subject_idx].unit.side;
    let zone = combatants[subject_idx].zone;
    let mut mult = BP_ONE;
    for c in combatants.iter().filter(|c| c.alive && c.unit.side == side) {
        if let Some(a) = c.passive_aura {
            let in_scope = match a.scope {
                AuraScope::AllAllies => true,
                AuraScope::ZoneAllies => c.zone == zone,
            };
            if in_scope && kinds.contains(&a.kind) {
                // Compose bp multipliers: (mult × (1 + magnitude)) at bp scale, widened to avoid overflow.
                mult = ((mult as i128 * (BP_ONE + a.magnitude) as i128) / BP_ONE as i128) as Bp;
            }
        }
    }
    mult
}

/// Build the `Copy` attack profile from the attacker's current effective stats.
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
        anti_air: att.stats.capabilities.contains(&Capability::AntiAir),
        rocket_pack: att.stats.capabilities.contains(&Capability::RocketPack),
    }
}

/// The **reactive plating** damage multiplier (v2, Mech). A reactive machine that has already absorbed
/// hull damage from a family mitigates further hits of that *currently dominant* family at the ruleset
/// `reactive` rate; every other case is `BP_ONE`. Computed per victim from its **pre-hit** absorbed
/// state, so the bias reflects what has hit it so far, not the shot landing now (data-model §5.2).
fn reactive_mult(target: &Combatant, dtype: DamageType, ruleset: &Ruleset) -> Bp {
    if !target.stats.reactive {
        return BP_ONE;
    }
    let idx = dtype_index(dtype);
    if target.absorbed[idx].milli() > 0 && dominant_family(&target.absorbed) == idx {
        ruleset.reactive_mods.rate
    } else {
        BP_ONE
    }
}

/// The `absorbed`/`DamageType` index for a family (declaration order: Kinetic, Energy, Explosive).
fn dtype_index(t: DamageType) -> usize {
    match t {
        DamageType::Kinetic => 0,
        DamageType::Energy => 1,
        DamageType::Explosive => 2,
    }
}

/// Index of the family absorbed most. Ties resolve to the **lowest** index, so an even split is
/// deterministic and reproduces on replay (research R9, FR-024).
fn dominant_family(absorbed: &[Fixed; 3]) -> usize {
    let mut best = 0;
    for i in 1..3 {
        if absorbed[i].milli() > absorbed[best].milli() {
            best = i;
        }
    }
    best
}

/// Record the `hull_dealt` from a hit against the victim's reactive-plating history. Tracked for every
/// combatant (cheap, branch-free) but only ever *read* for a reactive machine, so it costs a non-Mech
/// nothing observable and keeps the battle byte-identical for the stock field.
fn absorb_family(target: &mut Combatant, dtype: DamageType, hull_dealt: Fixed) {
    let idx = dtype_index(dtype);
    target.absorbed[idx] = target.absorbed[idx].saturating_add(hull_dealt);
}

/// The attacker's role-counter damage multiplier vs a `target` type — `BP_ONE` when none applies.
/// Lets a machine class hit specific target types harder (e.g. light tanks vs the fragile backline);
/// the bonus set is a ruleset table, so it is balance-tunable without an engine change.
fn role_mult(ruleset: &Ruleset, attacker: MachineTypeId, target: MachineTypeId) -> Bp {
    ruleset
        .role_damage_bonuses
        .get(&attacker)
        .filter(|rb| rb.vs.contains(&target))
        .map(|rb| BP_ONE + rb.mult)
        .unwrap_or(BP_ONE)
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
    // Attacker/target classes drive the "role counter" bonus (e.g. light tanks vs the backline),
    // applied per target at impact so a splash into a different type is scaled by *its* type.
    let att_type = combatants[att_idx].type_id;
    let target_type = combatants[target_idx].type_id;
    // Stance (v3, US4) is a two-sided magnitude read live from the current dials: the attacker's stance
    // adjusts its outgoing output + accuracy, each target's stance its incoming damage + evasion.
    let att_stance = combatants[att_idx].dials.stance;
    let sm = &ruleset.stance_mods;
    // Whether this attacker carries the Paint on-hit rider (v3 US3) — captured before any mutation.
    let att_paints = combatants[att_idx]
        .stats
        .capabilities
        .contains(&Capability::OnHitPaint);

    // --- Hit chance: accuracy − evasion, with off-domain modifiers, clamped. ---
    // `domain_mult` scales damage for a weapon firing outside its element: AA vs air gets the bonus;
    // a non-AA weapon plinking air takes the `plink` penalty; a SAM bombarding ground once the skies
    // are clear takes the plink *accuracy* penalty but its own `sam_ground` damage multiplier — so
    // air-to-air lethality and ground suppression tune independently. Same-domain fire is BP_ONE.
    let mut acc = prof.accuracy + sm.accuracy_add(att_stance);
    let mut domain_mult = BP_ONE;
    if target_air {
        if prof.reach == ReachTag::Air {
            acc += ruleset.air_mods.aa_acc_bonus; // AA bonus
            domain_mult = ruleset.air_mods.aa_dmg_mult;
        } else if prof.anti_air || prof.rocket_pack {
            // Flak platform (Flak Battery) OR the Mech's Rocket Pack: full anti-air firepower — the flak
            // damage rate, accurate (no plink penalty). They differ only in reach (the Rocket Pack is
            // front-line-only, enforced in targeting), not in damage rate (FR-026/029).
            acc += ruleset.air_mods.aa_acc_bonus;
            domain_mult = ruleset.air_mods.flak_dmg_mult;
        } else if prof.damage_type == DamageType::Energy && ruleset.air_mods.energy_air_dmg_mult > 0
        {
            // Improvised energy weapon contesting air (v2, staged US4): still improvised accuracy (the
            // plink penalty), but a damage rate strictly between plink and flak (FR-028).
            acc += ruleset.air_mods.plink_acc_penalty;
            domain_mult = ruleset.air_mods.energy_air_dmg_mult;
        } else {
            acc += ruleset.air_mods.plink_acc_penalty; // direct-fire "plink" (incl. dogfights)
            domain_mult = ruleset.air_mods.plink_dmg_mult;
        }
    } else if prof.reach == ReachTag::Air {
        // SAM suppressing ground: keep the plink accuracy penalty, but its own damage multiplier.
        acc += ruleset.air_mods.plink_acc_penalty;
        domain_mult = ruleset.air_mods.sam_ground_dmg_mult;
    }
    let target_evasion = combatants[target_idx].stats.evasion
        + sm.evasion_add(combatants[target_idx].dials.stance);
    let hit_chance = (acc - target_evasion).clamp(g.hit_clamp_min, g.hit_clamp_max);

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
    d0 = d0.mul_bp(domain_mult); // BP_ONE for ordinary same-domain fire
    d0 = d0.mul_bp(BP_ONE + variance);
    d0 = d0.mul_bp(sm.output_mult(att_stance)); // stance output (applies to splash too, via d0)
    // Army C2 boost (US5): a living Commander lifts every ally's outgoing damage; folded into d0 so it
    // reaches splash too, and gone the tick the Commander dies (aura reads only living sources).
    d0 = d0.mul_bp(aura_mult(
        combatants,
        att_idx,
        &[AuraKind::DamageDealt, AuraKind::CommandBoost],
    ));

    // --- Primary hit: shields then hull (role-counter bonus applied vs the primary target's type). ---
    let save = roll_ablative_save(&combatants[target_idx], ruleset, rng);
    // The target's stance scales the damage it takes (Aggressive +, Defensive −), computed per victim.
    let taken = sm.taken_mult(combatants[target_idx].dials.stance);
    // A living protector/Commander projection on the target's side reduces the damage it takes (US5).
    let taken_aura = aura_mult(combatants, target_idx, &[AuraKind::DamageTaken]);
    // A Paint mark from earlier fire raises this target's incoming damage (US3); read before we re-mark.
    let paint = paint_mult(&combatants[target_idx], tick);
    // Reactive plating reads the target's absorbed history *before* this hit, then the hull damage this
    // hit deals is folded back into that history below.
    let reactive = reactive_mult(&combatants[target_idx], prof.damage_type, ruleset);
    let (sh, ab, hu, died) = apply_damage(
        &mut combatants[target_idx],
        d0.mul_bp(role_mult(ruleset, att_type, target_type))
            .mul_bp(taken)
            .mul_bp(taken_aura)
            .mul_bp(paint)
            .mul_bp(reactive),
        prof.damage_type,
        prof.penetration,
        save,
        ruleset,
    );
    absorb_family(&mut combatants[target_idx], prof.damage_type, hu);
    emit_hit(events, prof.actor, target_ref, sh, ab, hu, crit, false);
    // Paint the aimed target after this hit lands (so the painting shot itself doesn't self-benefit);
    // the mark amplifies further fire on it until it expires.
    if att_paints && !died {
        combatants[target_idx].painted_until = tick.saturating_add(PAINT_DURATION_TICKS);
    }
    let mut dealt = sh.saturating_add(ab).saturating_add(hu);
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
            let mut sd0 = splash_d0
                .mul_bp(role_mult(ruleset, att_type, combatants[j].type_id))
                .mul_bp(sm.taken_mult(combatants[j].dials.stance))
                .mul_bp(aura_mult(combatants, j, &[AuraKind::DamageTaken]))
                .mul_bp(paint_mult(&combatants[j], tick));
            if let Some(m) = combatants[j].stats.special_mitigation {
                if m.against == prof.damage_type {
                    sd0 = sd0.mul_bp(m.splash_taken_mult);
                }
            }
            let sunit = combatants[j].unit;
            let save = roll_ablative_save(&combatants[j], ruleset, rng);
            let reactive = reactive_mult(&combatants[j], prof.damage_type, ruleset);
            let (s2, a2, h2, died2) = apply_damage(
                &mut combatants[j],
                sd0.mul_bp(reactive),
                prof.damage_type,
                prof.penetration,
                save,
                ruleset,
            );
            absorb_family(&mut combatants[j], prof.damage_type, h2);
            emit_hit(events, prof.actor, sunit, s2, a2, h2, false, true);
            dealt = dealt
                .saturating_add(s2)
                .saturating_add(a2)
                .saturating_add(h2);
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

/// Roll whether an incoming hit spares the target's ablative pool (a "save" — the pool absorbs the
/// damage but is not consumed). **Drawn only when a pool exists**, so battles with no ablative machine
/// consume the RNG stream byte-identically to before v2 (research R3). One draw per absorbing victim.
fn roll_ablative_save(target: &Combatant, ruleset: &Ruleset, rng: &mut Rng) -> bool {
    target.ablative.milli() > 0 && rng.roll_bp() < ruleset.ablative_mods.save_chance
}

/// Apply an incoming `d0` (already fully modified) through shields → ablative → hull, mutating the
/// target. `ablative_save` (a pre-rolled outcome, so this stays a pure function of state + one bool)
/// decides only whether the ablative *pool* is consumed by what it absorbs — the absorbed amount and
/// the hull leak-through are identical either way (research R4). Returns
/// `(shield_damage, ablative_damage, hull_damage, died)`.
// The arguments are the mitigation pipeline itself (target, damage, type, penetration, save,
// ruleset); a wrapper struct would hide the layering these tests exercise directly.
#[allow(clippy::too_many_arguments)]
fn apply_damage(
    target: &mut Combatant,
    d0: Fixed,
    dtype: DamageType,
    penetration: Bp,
    ablative_save: bool,
    ruleset: &Ruleset,
) -> (Fixed, Fixed, Fixed, bool) {
    let (shield_dealt, ablative_dealt, hull_dealt) = mitigate(
        d0,
        dtype,
        penetration,
        target.shield,
        target.ablative,
        target.hull,
        target.stats.armor_pct,
        ruleset,
    );
    target.shield = target.shield.saturating_sub(shield_dealt).max_zero();
    // The pool absorbs `ablative_dealt` regardless, but is only *consumed* on a non-save — a save
    // blocks the damage without spending capacity. The pool never regenerates, so once spent it is
    // gone for the rest of the battle.
    if !ablative_save {
        target.ablative = target.ablative.saturating_sub(ablative_dealt).max_zero();
    }
    target.hull = target.hull.saturating_sub(hull_dealt).max_zero();
    target.ticks_since_hit = 0;
    let died = target.alive && target.hull.is_zero_or_less();
    (shield_dealt, ablative_dealt, hull_dealt, died)
}

/// **Pure** mitigation math (stat block §9.2) — the counter-web's core. Given an incoming `d0` and
/// the target's current `shield`/`ablative`/`hull`/`armor_pct`, returns the damage actually applied to
/// each layer (each capped at what's available). Penetration bypasses **shields** straight past them;
/// the rest hits shields first (`× shieldMult`), overflow converts back through the multiplier. The
/// **ablative** pool then absorbs raw, flat (no matrix multiplier — the layer indifferent to *what* is
/// shooting it), and penetration does **not** bypass it (research R2). Hull finally takes
/// `× armorMult × (1 − armorPct)` with the min-damage floor.
#[allow(clippy::too_many_arguments)]
pub(crate) fn mitigate(
    d0: Fixed,
    dtype: DamageType,
    penetration: Bp,
    shield: Fixed,
    ablative: Fixed,
    hull: Fixed,
    armor_pct: Bp,
    ruleset: &Ruleset,
) -> (Fixed, Fixed, Fixed) {
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

    // Ablative pool: absorbs raw damage flat, between shields and hull. `hull_in` already carries the
    // penetrating fraction (penetration does not bypass ablative), so the pool sees everything still
    // heading for hull. Absorption is capped at the remaining pool, so a saved hit can never block
    // more than the pool holds (R4).
    let mut ablative_dealt = Fixed::ZERO;
    if ablative.milli() > 0 && hull_in.milli() > 0 {
        ablative_dealt = hull_in.min(ablative);
        hull_in = hull_in.saturating_sub(ablative_dealt);
    }

    let mut hull_dealt = Fixed::ZERO;
    if hull_in.milli() > 0 {
        let mitigated = hull_in.mul_bp(mult.vs_armor).mul_bp(BP_ONE - armor_pct);
        let floor = hull_in.mul_bp(ruleset.globals.min_damage_floor);
        hull_dealt = mitigated.max(floor).min(hull); // cap at remaining hull
    }

    (shield_dealt, ablative_dealt, hull_dealt)
}

fn kill(c: &mut Combatant, tick: u16) {
    c.alive = false;
    c.hull = Fixed::ZERO;
    if c.destroyed_at.is_none() {
        c.destroyed_at = Some(tick);
    }
}

/// Emit a `Shot` implied hit as `Hit` events per non-zero layer (shield/ablative/hull).
// One argument per layer plus the hit's flags; splitting it would not simplify the call site.
#[allow(clippy::too_many_arguments)]
fn emit_hit(
    events: &mut Vec<TickEvent>,
    actor: UnitRef,
    target: UnitRef,
    shield: Fixed,
    ablative: Fixed,
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
    if ablative.milli() > 0 {
        events.push(TickEvent::Hit {
            actor,
            target,
            dmg: ablative,
            layer: DamageLayer::Ablative,
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

    /// The `role_damage_bonus` table multiplies an attacker class's damage only vs the listed target
    /// types (a "role counter" — e.g. light tanks vs the backline), and only for the listed attacker.
    #[test]
    fn role_bonus_applies_only_to_listed_attacker_and_targets() {
        use super::role_mult;
        use crate::fixed::BP_ONE;
        use crate::model::types::{MachineTypeId, RoleDamageBonus};

        let mut rs = seed_ruleset();
        rs.role_damage_bonuses.insert(
            MachineTypeId::LightTank,
            RoleDamageBonus {
                vs: vec![MachineTypeId::Artillery, MachineTypeId::RearSupport],
                mult: 5_000, // +50%
            },
        );
        // Light tank vs a listed backline type → +50%; vs an unlisted type → nothing.
        assert_eq!(
            role_mult(&rs, MachineTypeId::LightTank, MachineTypeId::Artillery),
            BP_ONE + 5_000
        );
        assert_eq!(
            role_mult(&rs, MachineTypeId::LightTank, MachineTypeId::RearSupport),
            BP_ONE + 5_000
        );
        assert_eq!(
            role_mult(&rs, MachineTypeId::LightTank, MachineTypeId::HeavyTank),
            BP_ONE
        );
        // A different attacker (no table entry) → no bonus.
        assert_eq!(
            role_mult(&rs, MachineTypeId::HeavyTank, MachineTypeId::Artillery),
            BP_ONE
        );
    }

    /// Shots to strip `shield0` with a `d0`-per-hit weapon of `dtype` (no penetration, no armor).
    fn shots_to_strip_shield(rs: &Ruleset, dtype: DamageType, d0: Fixed, shield0: Fixed) -> u32 {
        let mut shield = shield0;
        let mut n = 0;
        while shield.milli() > 0 && n < 100_000 {
            let (s, _, _) = mitigate(d0, dtype, 0, shield, Fixed::ZERO, BIG_HULL, 0, rs);
            shield = shield.saturating_sub(s);
            n += 1;
        }
        n
    }

    /// Shots to destroy `hull0` behind `armor_pct` (no shield) with a `d0`-per-hit `dtype` weapon.
    fn shots_to_kill_hull(
        rs: &Ruleset,
        dtype: DamageType,
        d0: Fixed,
        hull0: Fixed,
        armor_pct: i64,
    ) -> u32 {
        let mut hull = hull0;
        let mut n = 0;
        while hull.milli() > 0 && n < 100_000 {
            let (_, _, h) = mitigate(d0, dtype, 0, Fixed::ZERO, Fixed::ZERO, hull, armor_pct, rs);
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
        let kin_hull =
            shots_to_kill_hull(&rs, DamageType::Kinetic, d0, Fixed::from_int(250), 3_000);
        assert!(
            kin_hull > kin,
            "kinetic folds to armor: shield strip {kin} < armor kill {kin_hull}"
        );
    }

    /// T006 (spec 015 US1, stat block B vs C): Energy melts armor — with the v3 sharpen (matrix
    /// ×1.6 vs armor for Energy, ×0.7 for Kinetic) Energy kills a heavy armored hull **much** faster
    /// than Kinetic: per-shot armor damage ratio ≈ 1.6/0.7 ≈ 2.3×, so Energy's TTK is ≈ 0.44× Kinetic's.
    #[test]
    fn energy_melts_armor_much_faster_than_kinetic() {
        let rs = seed_ruleset();
        let d0 = Fixed::from_int(35);
        let hull = Fixed::from_int(1700);
        let armor = 3_000; // 30%

        let kin = shots_to_kill_hull(&rs, DamageType::Kinetic, d0, hull, armor);
        let energy = shots_to_kill_hull(&rs, DamageType::Energy, d0, hull, armor);
        assert!(
            energy < kin,
            "energy must out-DPS kinetic vs armor: kin={kin} energy={energy}"
        );
        // v3 ×1.6 vs ×0.7 ⇒ energy ≈ 0.44 × kinetic shots (the counter is sharp, not a nudge).
        let ratio_pct = energy * 100 / kin;
        assert!(
            (38..=52).contains(&ratio_pct),
            "energy TTK should be ~0.44× kinetic (got {ratio_pct}% of kinetic: kin={kin} energy={energy})"
        );
    }

    /// Penetration bypasses shields (Railgun): a 50%-pen hit leaks straight to hull even at full shield.
    #[test]
    fn penetration_leaks_past_shields() {
        let rs = seed_ruleset();
        let (shield_dmg, _ablative_dmg, hull_dmg) = mitigate(
            Fixed::from_int(60),
            DamageType::Kinetic,
            5_000, // 50% penetration
            Fixed::from_int(250),
            Fixed::ZERO,
            Fixed::from_int(1000),
            0,
            &rs,
        );
        assert!(shield_dmg.milli() > 0, "part still hits the shield");
        assert!(
            hull_dmg.milli() > 0,
            "penetration leaks to hull despite a full shield"
        );
    }

    /// v2 ablative: penetration does NOT bypass the pool (research R2). A fully-penetrating hit is
    /// absorbed by ablative and never reaches hull while the pool holds.
    #[test]
    fn penetration_does_not_bypass_ablative() {
        let rs = seed_ruleset();
        let (shield_dmg, ablative_dmg, hull_dmg) = mitigate(
            Fixed::from_int(60),
            DamageType::Kinetic,
            10_000, // 100% penetration — bypasses shields entirely
            Fixed::from_int(250),
            Fixed::from_int(500), // ablative pool
            Fixed::from_int(1000),
            0,
            &rs,
        );
        assert_eq!(shield_dmg.milli(), 0, "full penetration skips the shield");
        assert!(ablative_dmg.milli() > 0, "but ablative still absorbs it");
        assert_eq!(
            hull_dmg.milli(),
            0,
            "and the hull is untouched while the pool holds"
        );
    }

    /// v2 ablative: absorbs raw and flat, capped at the pool. A hit larger than the pool spills the
    /// remainder to hull (overflow), and the pool never absorbs more than it holds (R4).
    #[test]
    fn ablative_absorbs_up_to_the_pool_then_overflows_to_hull() {
        let rs = seed_ruleset();
        let (_s, ablative_dmg, hull_dmg) = mitigate(
            Fixed::from_int(300),
            DamageType::Kinetic,
            0,
            Fixed::ZERO,
            Fixed::from_int(100), // small pool
            Fixed::from_int(1000),
            0,
            &rs,
        );
        assert_eq!(
            ablative_dmg,
            Fixed::from_int(100),
            "absorbs exactly the pool"
        );
        assert!(hull_dmg.milli() > 0, "the excess spills to hull");
    }
}

#[cfg(test)]
mod reactive_tests {
    //! US3: the pure reactive-plating helpers — family indexing and the tie-broken dominant family.
    use super::{dominant_family, dtype_index};
    use crate::fixed::Fixed;
    use crate::model::types::DamageType;

    #[test]
    fn family_index_follows_damage_type_declaration_order() {
        assert_eq!(dtype_index(DamageType::Kinetic), 0);
        assert_eq!(dtype_index(DamageType::Energy), 1);
        assert_eq!(dtype_index(DamageType::Explosive), 2);
    }

    #[test]
    fn dominant_family_is_argmax_with_ties_to_the_lowest_index() {
        let f = Fixed::from_int;
        // A clear winner.
        assert_eq!(dominant_family(&[f(10), f(30), f(20)]), 1);
        // Nothing absorbed → lowest index (neutral baseline).
        assert_eq!(dominant_family(&[Fixed::ZERO; 3]), 0);
        // An exact tie between two families resolves to the lower index, deterministically (R9).
        assert_eq!(dominant_family(&[f(50), f(50), f(10)]), 0);
        assert_eq!(dominant_family(&[f(10), f(50), f(50)]), 1);
        assert_eq!(dominant_family(&[f(50), f(10), f(50)]), 0);
    }
}
