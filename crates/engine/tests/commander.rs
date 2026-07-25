//! v3 Commander + auras (spec 015, US5) — the per-tick, while-alive aura system.
//!
//! Two aura kinds are exercised through the public `resolve`: the Commander's army-wide **Command**
//! boost (`CommandBoost`, +10% outgoing to every ally while the Commander lives — so assassinating it
//! costs the army its edge) and a **protector** projection (`DamageTaken`, −8% incoming to the
//! projector's zone allies). All magnitudes are start-values.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::{Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{
    DialKey, DialValue, EquipmentId, MachineTypeId, PlanBSlot, PlanBTrigger, Stance,
    TriggerCondition, VariantId, ZoneId,
};
use engine::replay::{Adaptation, Fate, MatchConfig, Side, SupportKind, TickEvent, UnitRef};
use engine::{resolve, BattleInput, BattleOutput};

fn config() -> MatchConfig {
    MatchConfig {
        adaptation: Adaptation::Locked,
        defender_side: Side::B,
        best_of: 1,
    }
}

fn run(rs: &Ruleset, a: Army, b: Army, seed: u64) -> BattleOutput {
    resolve(&BattleInput {
        armies: [a, b],
        ruleset: rs.clone(),
        seed,
        match_config: config(),
    })
    .expect("curated squads are legal")
}

fn tank(rs: &Ruleset, variant: &str, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::HeavyTank, variant, zone, id)
}

/// Harmless, effectively-unkillable anvils so the measured side survives and its cumulative
/// `damage_dealt` reflects the per-hit multipliers, not who died first.
fn anvil_rs() -> Ruleset {
    use engine::fixed::Fixed;
    let mut rs = seed_ruleset();
    let b = rs.variants.get_mut(&VariantId::new("Bulwark")).unwrap();
    b.hull = Fixed::from_int(500_000);
    b.damage = Fixed::from_int(1);
    rs
}

fn anvils(rs: &Ruleset) -> Army {
    Army {
        machines: (0..5)
            .map(|i| {
                let zone = if i < 3 { ZoneId::Front } else { ZoneId::Middle };
                tank(rs, "Bulwark", zone, i)
            })
            .collect(),
    }
}

fn damage_dealt_a(out: &BattleOutput) -> i64 {
    out.result.side(Side::A).damage_dealt.milli()
}

/// The Commander's **Command** aura lifts the whole army's output while it lives: the same army
/// (four Grizzlies + a CommandPost) out-damages itself once the CommandPost's Command aura is zeroed
/// (the no-aura baseline), measured over a long battle against unkillable anvils so the +10%
/// accumulates rather than capping at a kill.
#[test]
fn command_aura_raises_army_damage() {
    let rs = anvil_rs();
    // The no-aura baseline: the same ruleset with the CommandPost's Command aura magnitude set to 0.
    let mut no_aura = anvil_rs();
    if let Some(aura) = no_aura
        .chassis
        .get_mut(&VariantId::new("CommandPost"))
        .and_then(|c| c.passive_aura.as_mut())
    {
        aura.magnitude = 0;
    }
    // Four Grizzly attackers + a CommandPost support, built against whichever ruleset is under test.
    let army = |r: &Ruleset| Army {
        machines: vec![
            tank(r, "Grizzly", ZoneId::Front, 0),
            tank(r, "Grizzly", ZoneId::Front, 1),
            tank(r, "Grizzly", ZoneId::Middle, 2),
            tank(r, "Grizzly", ZoneId::Middle, 3),
            stock_instance(r, MachineTypeId::Commander, "CommandPost", ZoneId::Rear, 4),
        ],
    };
    let with_aura = damage_dealt_a(&run(&rs, army(&rs), anvils(&rs), 0xC0DE));
    let without_aura = damage_dealt_a(&run(&no_aura, army(&no_aura), anvils(&no_aura), 0xC0DE));
    assert!(
        with_aura > without_aura,
        "a live Commander's Command aura must raise the army's cumulative damage: with={with_aura} without={without_aura}"
    );
}

/// A **protector** projection (`DamageTaken`, the Bulwark) shields its **zone** allies: a focused
/// target in the protector's zone survives longer than the same target with the protector pulled back
/// to another zone (out of aura scope). Same attackers, same target, only the protection differs.
#[test]
fn damage_taken_aura_protects_zone_allies() {
    let rs = seed_ruleset();
    // Attackers sit in Middle (reach Front+Middle); the enemy Front is empty so they focus the Middle
    // target (id 0, the lowest instance in Middle) in both runs.
    let attackers = || Army {
        machines: vec![
            tank(&rs, "Grizzly", ZoneId::Middle, 0),
            tank(&rs, "Grizzly", ZoneId::Middle, 1),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Grizzly", ZoneId::Rear, 4),
        ],
    };
    // id 0 is the focused target (a fragile Cavalier), always in Middle. A Bulwark (protector) sits
    // either in Middle with it (protected) or back in Rear (out of the target's zone → no protection).
    let defender = |bulwark_zone: ZoneId| Army {
        machines: vec![
            tank(&rs, "Cavalier", ZoneId::Middle, 0),
            tank(&rs, "Bulwark", bulwark_zone, 1),
            tank(&rs, "Grizzly", ZoneId::Rear, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            tank(&rs, "Grizzly", ZoneId::Front, 4),
        ],
    };

    let death = |bulwark_zone: ZoneId| -> u16 {
        let out = run(&rs, attackers(), defender(bulwark_zone), 0x9AA);
        let u = UnitRef {
            side: Side::B,
            instance_id: 0,
        };
        match out.result.machine_fates.iter().find(|f| f.unit == u).map(|f| f.fate) {
            Some(Fate::DestroyedAtTick(t)) => t,
            _ => u16::MAX,
        }
    };

    let protected = death(ZoneId::Middle); // Bulwark shares the target's zone → −8% taken
    let unprotected = death(ZoneId::Rear); // Bulwark elsewhere → target unshielded
    assert!(
        protected > unprotected,
        "a zone protector must extend its ally's life: protected@{protected} unprotected@{unprotected}"
    );
}

// ---------------------------------------------------------------------------
// US5 — the Commander's weapon-driven projectors + survival-gated Plan-B
// ---------------------------------------------------------------------------

/// Every support event kind the Commander (Side B) emitted across a battle where its front-line allies
/// take fire (so hull/shield actually need topping up). The Commander's weapon is the given projector.
fn commander_projection_kinds(rs: &Ruleset, projector: &str) -> Vec<SupportKind> {
    let mut cmdr = stock_instance(rs, MachineTypeId::Commander, "CommandPost", ZoneId::Rear, 0);
    cmdr.loadout.weapon = EquipmentId::new(projector); // counter-pick: Heal / Shield / Ablation
    let defender = Army {
        machines: vec![
            cmdr,
            tank(rs, "Cavalier", ZoneId::Front, 1),
            tank(rs, "Cavalier", ZoneId::Front, 2),
            tank(rs, "Cavalier", ZoneId::Front, 3),
            tank(rs, "Grizzly", ZoneId::Middle, 4),
        ],
    };
    // Grizzlies pound the front, stripping shields then hull — so a Heal/Shield projector has real work,
    // and an Ablation projector (bounded by hull size) grants its buffer from the first tick.
    let attacker = Army {
        machines: (0..5)
            .map(|i| tank(rs, "Grizzly", if i < 3 { ZoneId::Front } else { ZoneId::Middle }, i))
            .collect(),
    };
    run(rs, attacker, defender, 0xC0FFEE)
        .replay
        .games[0]
        .ticks
        .iter()
        .flat_map(|t| &t.events)
        .filter_map(|e| match e {
            TickEvent::Support { actor, kind, .. } if actor.side == Side::B => Some(*kind),
            _ => None,
        })
        .collect()
}

/// The Commander's projector is **weapon-driven** (US5, the counter-pick): equipping the Heal / Shield /
/// Ablation projector makes it project onto the ally's hull / shield / ablative pool respectively — each
/// weapon emits its own `SupportKind`, proving the weapon slot chooses what the Commander projects.
#[test]
fn commander_projector_projects_its_weapon_kind() {
    let rs = seed_ruleset();
    assert!(
        commander_projection_kinds(&rs, "HealProjector").contains(&SupportKind::Heal),
        "the Heal projector must heal hull"
    );
    assert!(
        commander_projection_kinds(&rs, "ShieldProjector").contains(&SupportKind::ShieldBoost),
        "the Shield projector must restore shields"
    );
    assert!(
        commander_projection_kinds(&rs, "AblationProjector").contains(&SupportKind::Ablation),
        "the Ablation projector must grant an ablative buffer"
    );
    // (The v2 non-projector Repair Beam fallback is gone with the Rear Support removal — every
    // Support-mount weapon is now a projector, so the kind always lives on the weapon.)
}

/// A friendly Commander grants the army a survival-gated bonus Plan-B slot (US5): a plain machine (no
/// Combat AI) may both declare **and** fire a Slot-2 trigger while a Commander lives — proven by the
/// `PlanB` latch event appearing for its Slot-2 in a Commander army.
#[test]
fn commander_grants_a_firing_second_plan_b_slot() {
    let rs = seed_ruleset();
    // A plain Grizzly (1 native slot) carrying a single Slot-2 trigger — legal only with a Commander.
    let mut grizzly = tank(&rs, "Grizzly", ZoneId::Front, 0);
    grizzly.plan_b = vec![PlanBTrigger {
        slot: PlanBSlot::Slot2,
        condition: TriggerCondition::AfterTick(2),
        dial: DialKey::Stance,
        plan_b_value: DialValue::Stance(Stance::Aggressive),
    }];
    let defender = Army {
        machines: vec![
            grizzly,
            tank(&rs, "Grizzly", ZoneId::Front, 1),
            tank(&rs, "Grizzly", ZoneId::Middle, 2),
            tank(&rs, "Grizzly", ZoneId::Rear, 3),
            // The immobile backline Commander that grants (and keeps alive) the bonus slot.
            stock_instance(&rs, MachineTypeId::Commander, "CommandPost", ZoneId::Rear, 4),
        ],
    };
    let attacker = Army {
        machines: (0..5)
            .map(|i| tank(&rs, "Cavalier", if i < 3 { ZoneId::Front } else { ZoneId::Middle }, i))
            .collect(),
    };
    let out = run(&rs, attacker, defender, 0x5107);
    let fired_slot2 = out.replay.games[0].ticks.iter().flat_map(|t| &t.events).any(|e| {
        matches!(e, TickEvent::PlanB { unit, slot, .. }
            if *unit == UnitRef { side: Side::B, instance_id: 0 } && *slot == PlanBSlot::Slot2)
    });
    assert!(
        fired_slot2,
        "the Commander-granted Slot-2 must latch while the Commander lives"
    );
}
