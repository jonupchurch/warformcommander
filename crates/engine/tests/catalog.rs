//! v3 US3 catalog mechanics (Slice F) — the bespoke §14 kit effects, exercised through the public API:
//! the Spotter Network accuracy aura, the stationary brace (Siege/Bulwark/Entrench), Rally's control
//! cleanse, and Ambush's full-health alpha. The kit items exist in the catalog; here we prove the
//! mechanics they unlock actually bite. (Innate-chassis attachment is Slice G content authoring.)

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::{Army, MachineInstance};
use engine::model::ruleset::Ruleset;
use engine::model::types::{AuraEffect, AuraKind, AuraScope, EquipmentId, MachineTypeId, VariantId, ZoneId};
use engine::replay::{Adaptation, Fate, MatchConfig, Side, TickEvent, UnitRef};
use engine::{resolve, BattleInput, BattleOutput};

fn cfg() -> MatchConfig {
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
        match_config: cfg(),
    })
    .expect("curated squads are legal")
}

fn tank(rs: &Ruleset, variant: &str, zone: ZoneId, id: u8) -> MachineInstance {
    stock_instance(rs, MachineTypeId::HeavyTank, variant, zone, id)
}

fn ground_zone(i: u8) -> ZoneId {
    if i < 3 {
        ZoneId::Front
    } else {
        ZoneId::Middle
    }
}

/// The tick `unit` was destroyed, or `u16::MAX` if it survived the battle.
fn death_tick(out: &BattleOutput, unit: UnitRef) -> u16 {
    out.result
        .machine_fates
        .iter()
        .find(|f| f.unit == unit)
        .and_then(|f| match f.fate {
            Fate::DestroyedAtTick(t) => Some(t),
            _ => None,
        })
        .unwrap_or(u16::MAX)
}

// ---------------------------------------------------------------------------
// Spotter Network — the zone accuracy aura (AuraKind::Accuracy)
// ---------------------------------------------------------------------------

/// A `+Accuracy` zone aura lifts its zone allies' to-hit: an attacking squad whose chassis carries the
/// aura whiffs measurably less against evasive defenders than the same squad without it. (Injected onto
/// the chassis here; the Light's innate Spotter Network is authored in Slice G.)
#[test]
fn accuracy_aura_reduces_misses() {
    let attacker_misses = |with_aura: bool| -> usize {
        let mut rs = seed_ruleset();
        // Evasive defenders so misses are frequent in *both* runs — the aura is the only variable.
        rs.variants.get_mut(&VariantId::new("Cavalier")).unwrap().evasion = 5_000;
        if with_aura {
            rs.chassis.get_mut(&VariantId::new("Grizzly")).unwrap().passive_aura = Some(AuraEffect {
                kind: AuraKind::Accuracy,
                magnitude: 4_000, // +40% to-hit to zone allies
                scope: AuraScope::ZoneAllies,
            });
        }
        let squad = |v: &str| Army {
            machines: (0..5).map(|i| tank(&rs, v, ground_zone(i), i)).collect(),
        };
        run(&rs, squad("Grizzly"), squad("Cavalier"), 0xACC)
            .replay
            .games[0]
            .ticks
            .iter()
            .flat_map(|t| &t.events)
            .filter(|e| matches!(e, TickEvent::Miss { actor, .. } if actor.side == Side::A))
            .count()
    };
    assert!(
        attacker_misses(true) < attacker_misses(false),
        "the accuracy aura must reduce the aura'd army's misses: aura={} none={}",
        attacker_misses(true),
        attacker_misses(false)
    );
}

// ---------------------------------------------------------------------------
// Stationary brace — Siege / Bulwark / Entrench
// ---------------------------------------------------------------------------

/// A settled bracing machine takes less per hit, so under identical focused fire it survives strictly
/// longer than the same machine without the brace. Stock dials are Hold, so the front unit is stationary
/// from the start and the brace engages after its settle threshold.
#[test]
fn siege_brace_extends_survival() {
    let front_death = |braced: bool| -> u16 {
        let rs = seed_ruleset();
        let mut front = tank(&rs, "Cavalier", ZoneId::Front, 0);
        if braced {
            front.loadout.utilities = vec![EquipmentId::new("SiegeMode")];
        }
        let defender = Army {
            machines: vec![
                front,
                tank(&rs, "Grizzly", ZoneId::Middle, 1),
                tank(&rs, "Grizzly", ZoneId::Middle, 2),
                tank(&rs, "Grizzly", ZoneId::Rear, 3),
                tank(&rs, "Grizzly", ZoneId::Rear, 4),
            ],
        };
        let attacker = Army {
            machines: (0..5).map(|i| tank(&rs, "Grizzly", ground_zone(i), i)).collect(),
        };
        death_tick(
            &run(&rs, attacker, defender, 0x51E6E),
            UnitRef {
                side: Side::B,
                instance_id: 0,
            },
        )
    };
    assert!(
        front_death(true) > front_death(false),
        "the stationary brace must extend the front unit's life: braced@{} plain@{}",
        front_death(true),
        front_death(false)
    );
}

// ---------------------------------------------------------------------------
// Rally — cleanse EMP / Suppress / Snare off allies
// ---------------------------------------------------------------------------

/// Rally cleanses EMP off allies, so a Medic can heal an ally that EMP fire would otherwise lock out of
/// healing. With a Rally unit present, the focused (EMP'd) front ally receives Heal projections; without
/// one, the EMP blocks every heal, so it receives none.
#[test]
fn rally_cleanse_lets_allies_be_healed_through_emp() {
    let heals_on_front = |with_rally: bool| -> usize {
        let rs = seed_ruleset();
        // Middle slot: a Rally carrier, or plain padding.
        let mut middle = tank(&rs, "Grizzly", ZoneId::Middle, 2);
        if with_rally {
            middle.loadout.utilities = vec![EquipmentId::new("Rally")];
        }
        let defender = Army {
            machines: vec![
                tank(&rs, "Cavalier", ZoneId::Front, 0), // focused → EMP'd + wounded
                stock_instance(&rs, MachineTypeId::RearSupport, "Medic", ZoneId::Rear, 1),
                middle,
                tank(&rs, "Grizzly", ZoneId::Rear, 3),
                tank(&rs, "Grizzly", ZoneId::Rear, 4),
            ],
        };
        // EMP attackers focus the front, applying EMP + hull damage to the Cavalier.
        let attacker = Army {
            machines: (0..5)
                .map(|i| {
                    let mut m = tank(&rs, "Grizzly", ground_zone(i), i);
                    m.loadout.utilities = vec![EquipmentId::new("EMPAmmo")];
                    m
                })
                .collect(),
        };
        let front = UnitRef {
            side: Side::B,
            instance_id: 0,
        };
        run(&rs, attacker, defender, 0x9A11)
            .replay
            .games[0]
            .ticks
            .iter()
            .flat_map(|t| &t.events)
            .filter(|e| matches!(e, TickEvent::Support { target, .. } if *target == front))
            .count()
    };
    assert!(
        heals_on_front(false) == 0,
        "without Rally, the EMP'd front ally can never be healed"
    );
    assert!(
        heals_on_front(true) > 0,
        "with Rally, cleansing the EMP lets the Medic heal the front ally"
    );
}

// ---------------------------------------------------------------------------
// Ambush — the full-health alpha bonus
// ---------------------------------------------------------------------------

/// An Ambush attacker hits a **full-health** target harder. A large shield on the target keeps its
/// *hull* full through the opening exchange, so whenever the ambusher lands its first hit the target
/// still counts as full-health (Ambush's trigger) — regardless of firing order or a first-shot miss.
/// The only variable is the capability itself: `[Ambush]` vs an empty utility slot (same base stats).
#[test]
fn ambush_hits_a_full_health_target_harder() {
    let ambusher_first_hit = |with_ambush: bool| -> i64 {
        let mut rs = seed_ruleset();
        // A deep shield keeps the target's hull at full through the opening hits (so `hull == max_hull`).
        rs.variants.get_mut(&VariantId::new("Cavalier")).unwrap().shield_cap =
            engine::fixed::Fixed::from_int(4000);
        let mut ambusher = tank(&rs, "Grizzly", ZoneId::Front, 0);
        ambusher.loadout.utilities = if with_ambush {
            vec![EquipmentId::new("Ambush")]
        } else {
            vec![] // same base stats as the ambush build minus the capability — the clean control
        };
        let attacker = Army {
            machines: vec![
                ambusher,
                tank(&rs, "Grizzly", ZoneId::Rear, 1),
                tank(&rs, "Grizzly", ZoneId::Rear, 2),
                tank(&rs, "Grizzly", ZoneId::Rear, 3),
                tank(&rs, "Grizzly", ZoneId::Middle, 4),
            ],
        };
        let defender = Army {
            machines: (0..5).map(|i| tank(&rs, "Cavalier", ground_zone(i), i)).collect(),
        };
        let out = run(&rs, attacker, defender, 0xA11B);
        let ambusher_ref = UnitRef {
            side: Side::A,
            instance_id: 0,
        };
        let target = UnitRef {
            side: Side::B,
            instance_id: 0,
        };
        out.replay.games[0]
            .ticks
            .iter()
            .flat_map(|t| &t.events)
            .find_map(|e| match e {
                TickEvent::Hit {
                    actor,
                    target: tg,
                    dmg,
                    ..
                } if *actor == ambusher_ref && *tg == target => Some(dmg.milli()),
                _ => None,
            })
            .expect("the ambusher lands a hit on the full-health target")
    };
    assert!(
        ambusher_first_hit(true) > ambusher_first_hit(false),
        "Ambush must hit a full-health target harder: ambush={} plain={}",
        ambusher_first_hit(true),
        ambusher_first_hit(false)
    );
}
