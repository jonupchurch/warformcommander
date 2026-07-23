//! Coordination (spec 014, US1) — diminishing returns on stacking identical units, exercised through
//! the **public** API. The mechanism flattens the field's super-linear composition power by taxing the
//! Nth identical unit; here we assert (a) the curve lookup, (b) the identity default is a true no-op
//! (hash-stable — no golden re-bless), (c) a later same-type copy deals visibly less, and (d) it is
//! deterministic. The field-level effect (near-ties appear) is a balancer measurement, not a unit test.

use engine::content::{seed_ruleset, stock_instance};
use engine::model::army::Army;
use engine::model::ruleset::{Coordination, CoordinationGrain, CoordinationScales, Ruleset};
use engine::model::types::{MachineTypeId, TargetRule, ZoneId};
use engine::replay::{Adaptation, MatchConfig, Side, TickEvent};
use engine::{resolve, BattleInput, BattleOutput};

/// Ground zones cap at 3, so spread a squad across Front (0..3) then Middle (3..5).
fn zone(i: u8) -> ZoneId {
    if i < 3 {
        ZoneId::Front
    } else {
        ZoneId::Middle
    }
}

/// Resolve one best-of-1 battle, attacker = Side A, at a fixed seed.
fn resolve_battle(rs: &Ruleset, attacker: Army, defender: Army) -> BattleOutput {
    resolve(&BattleInput {
        armies: [attacker, defender],
        ruleset: rs.clone(),
        seed: 0x00C0_07D1,
        match_config: MatchConfig {
            adaptation: Adaptation::Locked,
            defender_side: Side::B,
            best_of: 1,
        },
    })
    .expect("legal squads")
}

/// Total `Hit` damage dealt by Side A across the **first `n` ticks** — an early window before any unit
/// dies, so it measures raw army output (Σ per-unit damage) without the overkill-capping / kill-order
/// confounds that make per-actor attribution unreliable under focus fire.
fn side_a_output_first_ticks(out: &BattleOutput, n: usize) -> i64 {
    out.replay.games[0]
        .ticks
        .iter()
        .take(n)
        .flat_map(|t| &t.events)
        .filter_map(|e| match e {
            TickEvent::Hit { actor, dmg, .. } if actor.side == Side::A => Some(dmg.milli()),
            _ => None,
        })
        .sum()
}

/// Every `Hit`'s damage across the whole battle (both sides) — an outcome fingerprint.
fn total_damage(out: &BattleOutput) -> i64 {
    out.replay.games[0]
        .ticks
        .iter()
        .flat_map(|t| &t.events)
        .filter_map(|e| match e {
            TickEvent::Hit { dmg, .. } => Some(dmg.milli()),
            _ => None,
        })
        .sum()
}

/// A squad of `n` identical HeavyTanks that all concentrate fire (so ranks are exercised cleanly).
fn stacked_heavies(rs: &Ruleset, variant: &str, n: u8) -> Army {
    Army {
        machines: (0..n)
            .map(|i| {
                let mut m = stock_instance(rs, MachineTypeId::HeavyTank, variant, zone(i), i);
                m.dials.target_rule = TargetRule::FocusFire;
                m
            })
            .collect(),
    }
}

// ---------------------------------------------------------------------------
// T003 — the curve
// ---------------------------------------------------------------------------

#[test]
fn coordination_factor_diminishes_and_clamps_past_the_end() {
    let c = Coordination {
        returns: vec![10_000, 7_000, 5_000],
        grain: CoordinationGrain::Type,
        scales: CoordinationScales::Offense,
    };
    assert_eq!(c.factor(0), 10_000, "the first copy is always full");
    assert_eq!(c.factor(1), 7_000);
    assert_eq!(c.factor(2), 5_000);
    // Past the end clamps to the last entry (a 4th/5th copy is no worse than the 3rd).
    assert_eq!(c.factor(3), 5_000);
    assert_eq!(c.factor(99), 5_000);
    // The identity default is every-copy-full and is treated as a no-op for serialization.
    assert!(Coordination::default().is_default());
    assert!(Coordination {
        returns: vec![10_000, 10_000],
        ..Coordination::default()
    }
    .is_default());
    assert!(!c.is_default());
}

// ---------------------------------------------------------------------------
// T004 — the identity curve is a true no-op (hash-stable, no golden re-bless)
// ---------------------------------------------------------------------------

#[test]
fn the_identity_curve_changes_nothing() {
    let base = seed_ruleset();
    let mut explicit_identity = base.clone();
    // An explicit all-full curve of a different length must still produce a byte-identical battle.
    explicit_identity.coordination = Coordination {
        returns: vec![10_000, 10_000, 10_000, 10_000, 10_000],
        grain: CoordinationGrain::Type,
        scales: CoordinationScales::Offense,
    };

    let attacker = stacked_heavies(&base, "Grizzly", 5);
    let defender = stacked_heavies(&base, "Bulwark", 5);

    let a = resolve_battle(&base, attacker.clone(), defender.clone());
    let b = resolve_battle(&explicit_identity, attacker, defender);

    assert_eq!(
        total_damage(&a),
        total_damage(&b),
        "the identity curve must not change any damage"
    );
    assert_eq!(
        a.result.duration_ticks, b.result.duration_ticks,
        "the identity curve must not change battle length"
    );
    assert_eq!(
        a.result.side(Side::A).survivors,
        b.result.side(Side::A).survivors
    );
}

// ---------------------------------------------------------------------------
// T003/T005 — a later same-type copy deals visibly less, deterministically
// ---------------------------------------------------------------------------

#[test]
fn stacking_the_same_type_diminishes_army_output() {
    // Same stacked army + durable wall, two rulesets differing ONLY in the coordination curve. The
    // steep curve taxes copies 2..5, so Side A's early-window output is strictly lower — the direct,
    // confound-free signature that stacking one type now yields diminishing returns.
    let identity = seed_ruleset();
    let mut steep = seed_ruleset();
    steep.coordination = Coordination {
        returns: vec![10_000, 6_000, 3_000], // 1st full, 2nd ×0.6, 3rd+ ×0.3
        grain: CoordinationGrain::Type,
        scales: CoordinationScales::Offense,
    };
    let attacker = stacked_heavies(&identity, "Grizzly", 5);
    let defender = stacked_heavies(&identity, "Bulwark", 5); // tankiest wall → no kills in the window

    let out_id = resolve_battle(&identity, attacker.clone(), defender.clone());
    let out_steep = resolve_battle(&steep, attacker, defender);

    let base = side_a_output_first_ticks(&out_id, 40);
    let taxed = side_a_output_first_ticks(&out_steep, 40);
    assert!(base > 0, "the identity army should deal damage: {base}");
    assert!(
        taxed < base,
        "coordination must lower a mono-stack's output: taxed {taxed} vs identity {base}"
    );
}

#[test]
fn coordination_is_deterministic() {
    let mut rs = seed_ruleset();
    rs.coordination = Coordination {
        returns: vec![10_000, 6_000, 3_000],
        grain: CoordinationGrain::Type,
        scales: CoordinationScales::Offense,
    };
    let attacker = stacked_heavies(&rs, "Grizzly", 5);
    let defender = stacked_heavies(&rs, "Bulwark", 5);
    let a = resolve_battle(&rs, attacker.clone(), defender.clone());
    let b = resolve_battle(&rs, attacker, defender);
    assert_eq!(total_damage(&a), total_damage(&b));
    assert_eq!(a.result.duration_ticks, b.result.duration_ticks);
}

// ---------------------------------------------------------------------------
// Grain — TypeVariant counts only exact duplicates
// ---------------------------------------------------------------------------

#[test]
fn type_variant_grain_taxes_less_than_type_grain() {
    // The SAME mixed army (2 Grizzly + 3 Cavalier, all HeavyTank) under two grains. Under `Type` all
    // five share the tax ladder (ranks 0..4); under `TypeVariant` the Grizzlies and Cavaliers count
    // separately (Grizzly 0,1 · Cavalier 0,1,2), so two units sit at a fresh rank-0 and pay no tax —
    // the army therefore deals MORE. Isolates the grain as the cause.
    let curve = vec![10_000, 3_000, 3_000, 3_000, 3_000]; // a steep tax on every copy past the first
    let mut by_type = seed_ruleset();
    by_type.coordination = Coordination {
        returns: curve.clone(),
        grain: CoordinationGrain::Type,
        scales: CoordinationScales::Offense,
    };
    let mut by_variant = seed_ruleset();
    by_variant.coordination = Coordination {
        returns: curve,
        grain: CoordinationGrain::TypeVariant,
        scales: CoordinationScales::Offense,
    };
    let heavy = |rs: &Ruleset, v: &str, i: u8| {
        let mut m = stock_instance(rs, MachineTypeId::HeavyTank, v, zone(i), i);
        m.dials.target_rule = TargetRule::FocusFire;
        m
    };
    let army = |rs: &Ruleset| Army {
        machines: vec![
            heavy(rs, "Grizzly", 0),
            heavy(rs, "Grizzly", 1),
            heavy(rs, "Cavalier", 2),
            heavy(rs, "Cavalier", 3),
            heavy(rs, "Cavalier", 4),
        ],
    };
    let defender = |rs: &Ruleset| stacked_heavies(rs, "Bulwark", 5);

    let out_type = resolve_battle(&by_type, army(&by_type), defender(&by_type));
    let out_variant = resolve_battle(&by_variant, army(&by_variant), defender(&by_variant));

    let type_out = side_a_output_first_ticks(&out_type, 40);
    let variant_out = side_a_output_first_ticks(&out_variant, 40);
    assert!(
        variant_out > type_out,
        "TypeVariant grain spares a different variant, so it taxes less: variant {variant_out} vs type {type_out}"
    );
}
