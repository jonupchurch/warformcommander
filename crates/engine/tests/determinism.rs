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

use engine::fixed::Fixed;
use engine::model::army::Army;
use engine::model::ruleset::RulesetHash;
use engine::model::types::ZoneId;
use engine::replay::{
    Adaptation, DamageLayer, GameReplay, GameResult, MachineFate, MachineSnapshot, MatchConfig,
    MatchResult, Replay, RewardTier, Side, SideSummary, Fate, Tick, TickEvent, UnitRef,
    WinCondition, CURRENT_FORMAT_VERSION,
};

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
            TickEvent::Shot { actor: a, target: b },
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
