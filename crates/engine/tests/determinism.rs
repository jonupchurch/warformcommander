//! Golden-hash determinism harness (research A5, T015).
//!
//! The determinism *contract* is a committed hash: for a fixed `(armies, ruleset, seed)`, the
//! serialized [`Replay`] must hash to the exact bytes recorded in `tests/golden/manifest.json`.
//! [`assert_golden`] compares against that manifest; a mismatch means the engine's output shifted
//! and must be investigated — **never re-blessed to make a red test green** unless the change was
//! intended (then run with `BLESS_GOLDEN=1`).
//!
//! `resolve()` (US1) does not exist yet, so this file stands up the *mechanism* and pins one
//! hand-built fixed replay. The real per-battery goldens (native == wasm) land in T026/US1, each
//! just another [`assert_golden`] case.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use engine::content::{seed_ruleset, stock_instance};
use engine::fixed::Fixed;
use engine::model::army::Army;
use engine::model::ruleset::RulesetHash;
use engine::model::types::{MachineTypeId, Stance, ZoneId};
use engine::replay::{
    Adaptation, DamageLayer, Fate, GameReplay, GameResult, MachineFate, MachineSnapshot,
    MatchConfig, MatchResult, Replay, RewardTier, Side, SideSummary, Tick, TickEvent, UnitRef,
    WinCondition, CURRENT_FORMAT_VERSION,
};
use engine::{resolve, BattleInput};

// ---------------------------------------------------------------------------
// Golden manifest machinery
// ---------------------------------------------------------------------------

fn manifest_path() -> PathBuf {
    // Resolved against this crate's root so the harness works from any CWD / on CI.
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("golden")
        .join("manifest.json")
}

fn load_manifest(path: &Path) -> BTreeMap<String, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).expect("golden manifest is valid JSON"),
        Err(_) => BTreeMap::new(), // absent → treat as empty (first bless creates it)
    }
}

fn save_manifest(path: &Path, map: &BTreeMap<String, String>) {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).expect("create golden dir");
    }
    // Pretty + sorted (BTreeMap) → a stable, reviewable diff when a golden is (intentionally) blessed.
    let json = serde_json::to_string_pretty(map).expect("serialize manifest");
    std::fs::write(path, json).expect("write golden manifest");
}

/// Assert `actual` matches the committed golden for `case`. With `BLESS_GOLDEN=1`, records/updates
/// it instead of asserting (use *only* for an intended output change).
fn assert_golden(case: &str, actual: &str) {
    let path = manifest_path();
    let mut map = load_manifest(&path);
    let bless = std::env::var("BLESS_GOLDEN").is_ok();

    match map.get(case) {
        Some(expected) if expected == actual => {}
        Some(expected) => {
            if bless {
                map.insert(case.to_string(), actual.to_string());
                save_manifest(&path, &map);
            } else {
                panic!(
                    "golden mismatch for '{case}':\n  expected {expected}\n  actual   {actual}\n\
                     The engine's deterministic output changed. Investigate; only re-bless \
                     (BLESS_GOLDEN=1) if the change was intended."
                );
            }
        }
        None => {
            if bless {
                map.insert(case.to_string(), actual.to_string());
                save_manifest(&path, &map);
            } else {
                panic!(
                    "no committed golden for '{case}'. If this is a new case, bless it with \
                     BLESS_GOLDEN=1 and commit tests/golden/manifest.json."
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// A fixed, hand-built replay — stable regardless of seed content, so its golden never churns.
// ---------------------------------------------------------------------------

fn unit(side: Side, id: u8) -> UnitRef {
    UnitRef {
        side,
        instance_id: id,
    }
}

fn fixed_replay() -> Replay {
    let a = unit(Side::A, 0);
    let b = unit(Side::B, 0);
    let tick0 = Tick {
        index: 0,
        snapshot: vec![
            MachineSnapshot {
                unit: a,
                hull: Fixed::from_int(1700),
                shield: Fixed::ZERO,
                zone: ZoneId::Front,
                alive: true,
            },
            MachineSnapshot {
                unit: b,
                hull: Fixed::from_int(650),
                shield: Fixed::ZERO,
                zone: ZoneId::Front,
                alive: true,
            },
        ],
        events: vec![
            TickEvent::Shot {
                actor: a,
                target: b,
            },
            TickEvent::Hit {
                actor: a,
                target: b,
                dmg: Fixed::from_int(650),
                layer: DamageLayer::Hull,
                crit: false,
                splash: false,
            },
            TickEvent::Death {
                unit: b,
                killer: Some(a),
            },
        ],
    };
    let game_result = GameResult {
        winner: Some(Side::A),
        condition: WinCondition::Conquest,
        reward_tier: RewardTier::Full,
        duration_ticks: 1,
    };
    Replay {
        format_version: CURRENT_FORMAT_VERSION,
        seed: 0x1234_5678_9ABC_DEF0,
        ruleset_hash: RulesetHash("golden-fixture".into()),
        match_config: MatchConfig {
            adaptation: Adaptation::Locked,
            defender_side: Side::B,
            best_of: 3,
        },
        armies: [Army { machines: vec![] }, Army { machines: vec![] }],
        games: vec![GameReplay {
            ticks: vec![tick0],
            game_result,
        }],
        result: MatchResult {
            winner: Side::A,
            games: vec![game_result],
            machine_fates: vec![
                MachineFate {
                    unit: a,
                    fate: Fate::SurvivedWithHullPct(10_000),
                },
                MachineFate {
                    unit: b,
                    fate: Fate::DestroyedAtTick(1),
                },
            ],
            side_a: SideSummary {
                damage_dealt: Fixed::from_int(650),
                survivors: 1,
            },
            side_b: SideSummary {
                damage_dealt: Fixed::ZERO,
                survivors: 0,
            },
            duration_ticks: 1,
        },
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// The digest mechanism is stable: hashing the same replay twice yields the same bytes.
#[test]
fn digest_is_recompute_stable() {
    let r = fixed_replay();
    assert_eq!(r.digest(), r.digest());
    assert_eq!(r.digest().len(), 64, "BLAKE3 hex");
}

/// The end-to-end golden path: the fixed replay's digest equals the committed manifest value.
/// (This is the template every US1 resolve-battery case will follow.)
#[test]
fn fixed_replay_matches_golden() {
    assert_golden("fixed_replay_v1", &fixed_replay().digest());
}

/// Reconciliation smoke (SC-002 shape): summed Hit damage equals the side's result total.
#[test]
fn hit_damage_reconciles() {
    let r = fixed_replay();
    assert_eq!(
        r.total_hit_damage_by(Side::A),
        r.result.side(Side::A).damage_dealt
    );
}

// ---------------------------------------------------------------------------
// US1 — a real 5v5 battle resolved by the engine
// ---------------------------------------------------------------------------

/// A fixed, legal 5v5 exercising the counter-web: heli vs SAM (AA), tanks trading, artillery
/// splash, a healer. Two armies within zone caps (Air ≤ 2, ground ≤ 3).
fn fixed_battle_input(seed: u64) -> BattleInput {
    let rs = seed_ruleset();
    let army_a = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Grizzly", ZoneId::Front, 0),
            stock_instance(&rs, MachineTypeId::LightTank, "Scout", ZoneId::Front, 1),
            stock_instance(&rs, MachineTypeId::Mech, "Vanguard", ZoneId::Middle, 2),
            stock_instance(&rs, MachineTypeId::AttackHeli, "Gunship", ZoneId::Air, 3),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 4),
        ],
    };
    let army_b = Army {
        machines: vec![
            stock_instance(&rs, MachineTypeId::HeavyTank, "Cavalier", ZoneId::Front, 0),
            stock_instance(
                &rs,
                MachineTypeId::RocketArtillery,
                "Sentry",
                ZoneId::Middle,
                1,
            ),
            stock_instance(&rs, MachineTypeId::Mech, "Striker", ZoneId::Front, 2),
            stock_instance(&rs, MachineTypeId::Artillery, "Longbow", ZoneId::Rear, 3),
            stock_instance(&rs, MachineTypeId::Commander, "CommandPost", ZoneId::Rear, 4),
        ],
    };
    BattleInput {
        armies: [army_a, army_b],
        ruleset: rs,
        seed,
        match_config: MatchConfig {
            adaptation: Adaptation::Locked,
            defender_side: Side::B,
            best_of: 3,
        },
    }
}

/// A real battle resolves: it terminates with a tick stream and a winner.
#[test]
fn battle_resolves_and_terminates() {
    let out = resolve(&fixed_battle_input(0xC0FFEE)).expect("valid armies resolve");
    assert!(
        (1..=3).contains(&out.replay.games.len()),
        "a Bo3 plays 1–3 games (first to two)"
    );
    for game in &out.replay.games {
        assert!(!game.ticks.is_empty(), "each game produced ticks");
        assert!(
            game.ticks.len() <= 1000,
            "each game terminates within the hard tick cap"
        );
    }
    // The reconciliation invariant (SC-002): summed Hit damage equals the result totals.
    assert_eq!(
        out.replay.total_hit_damage_by(Side::A),
        out.result.side(Side::A).damage_dealt
    );
    assert_eq!(
        out.replay.total_hit_damage_by(Side::B),
        out.result.side(Side::B).damage_dealt
    );
}

/// SC-001 (intra-run): the same input resolved many times is byte-identical every time.
#[test]
fn same_input_hashes_equal_many_times() {
    let input = fixed_battle_input(0xABCD_1234);
    let baseline = resolve(&input).unwrap().replay.digest();
    for _ in 0..1000 {
        assert_eq!(resolve(&input).unwrap().replay.digest(), baseline);
    }
}

/// AS3 sensitivity: flipping the seed, a dial, or a placement changes the output hash.
#[test]
fn input_changes_change_the_hash() {
    let base = fixed_battle_input(1);
    let h0 = resolve(&base).unwrap().replay.digest();

    // (a) a different seed.
    let h_seed = resolve(&fixed_battle_input(2)).unwrap().replay.digest();
    assert_ne!(h0, h_seed, "seed change must change the outcome");

    // (b) a dial change on one machine (stance is a two-sided damage magnitude, so it moves outcomes).
    let mut dial = fixed_battle_input(1);
    dial.armies[0].machines[0].dials.stance = Stance::Aggressive;
    assert_ne!(
        h0,
        resolve(&dial).unwrap().replay.digest(),
        "dial change matters"
    );

    // (c) a placement change.
    let mut placed = fixed_battle_input(1);
    placed.armies[0].machines[1].zone = ZoneId::Middle;
    assert_ne!(
        h0,
        resolve(&placed).unwrap().replay.digest(),
        "placement matters"
    );
}

/// SC-001 (run-twice invariant) swept across many seeds — resolve(x) == resolve(x) for all x.
/// (A deterministic seed sweep gives the same signal as a proptest for a pure, total function.)
#[test]
fn run_twice_invariant_across_seeds() {
    for seed in 0..64u64 {
        let input = fixed_battle_input(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15));
        assert_eq!(
            resolve(&input).unwrap().replay.digest(),
            resolve(&input).unwrap().replay.digest(),
            "seed {seed} must be reproducible"
        );
    }
}

/// The trust boundary end-to-end (SC-005): `resolve` refuses an illegal army rather than
/// simulating it, returning the validation errors.
#[test]
fn resolve_rejects_an_illegal_army() {
    use engine::ResolveError;
    let mut input = fixed_battle_input(1);
    input.armies[0].machines.pop(); // now a 4-machine squad (V1 violation)
    match resolve(&input) {
        Err(ResolveError::Invalid(errs)) => assert!(!errs.is_empty()),
        other => panic!("expected Invalid, got {other:?}"),
    }
}

/// The committed golden battery (T026): a handful of fixed battles pinned to exact hashes — the
/// real determinism contract. The wasm build asserts these same hashes (T017) to prove native ==
/// wasm. Re-bless (BLESS_GOLDEN=1) only for an intended engine change.
#[test]
fn battle_battery_matches_golden() {
    for seed in [1u64, 42, 0xDEAD_BEEF, 0x1234_5678] {
        let digest = resolve(&fixed_battle_input(seed)).unwrap().replay.digest();
        assert_golden(&format!("battle_seed_{seed:016x}"), &digest);
    }
}
