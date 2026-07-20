//! Warform Commander — deterministic battle-simulation core.
//!
//! A pure `resolve(armies, ruleset, seed) -> Replay`: seeded, fixed-tick, and
//! **byte-identical across native and wasm32** (constitution P6). It runs
//! server-side via WASM (authoritative) and natively for the balancer; the
//! client never simulates — it only replays the emitted tick stream.
//!
//! Design + task order: `specs/001-battle-sim-core/` (plan.md, data-model.md,
//! contracts/, tasks.md). Modules land Foundational-first: `fixed` -> `rng` ->
//! `model` -> `sim` -> `replay`.

pub mod content;
pub mod fixed;
pub mod model;
pub mod replay;
pub mod rng;
mod sim;
pub mod validate;

use serde::{Deserialize, Serialize};

use crate::model::army::{Army, DerivationError};
use crate::model::ruleset::Ruleset;
use crate::replay::{MatchConfig, MatchResult, Replay, CURRENT_FORMAT_VERSION};
use crate::validate::ValidationError;

/// Crate version, surfaced so the balancer/host can confirm they linked the expected engine build.
pub fn engine_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// The engine's input (engine-api contract). Two fully-specified squads, the balance table, a
/// single seed, and the match configuration.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleInput {
    /// Index 0 = attacker (Side A); index 1 = defender (Side B).
    pub armies: [Army; 2],
    pub ruleset: Ruleset,
    pub seed: u64,
    pub match_config: MatchConfig,
}

/// The engine's output — the tick stream + its summary (the summary is also embedded in `replay`).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleOutput {
    pub replay: Replay,
    pub result: MatchResult,
}

/// Why a battle could not be resolved. US1 surfaces structural [`DerivationError`]s; the V1–V8
/// legality errors are added in US2 (`validate`).
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum ResolveError {
    /// One or both armies failed validation (V1–V8) — the engine refuses to simulate illegal input.
    Invalid(Vec<ValidationError>),
    /// A machine's build could not be reduced to effective stats (unknown id / wrong slot kind).
    Derivation(DerivationError),
}

impl From<DerivationError> for ResolveError {
    fn from(e: DerivationError) -> Self {
        ResolveError::Derivation(e)
    }
}

/// Per-game seed derivation: distinct, deterministic seeds for each game of a match, all reproducible
/// from the single match seed (P6). Uses the SplitMix64 golden-ratio increment.
fn game_seed(base: u64, game_index: usize) -> u64 {
    base.wrapping_add((game_index as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
}

/// Resolve a **best-of-three ranked match** (adaptation = `Locked`): pure and total — same input →
/// byte-identical output (SC-001), no I/O, no ambient randomness, no panics on well-formed input.
/// The **same armies + placement** are used for all games (FR-020); the match ends first-to-two.
pub fn resolve(input: &BattleInput) -> Result<BattleOutput, ResolveError> {
    validate_both(&input.armies, &input.ruleset)?;

    let best_of = input.match_config.best_of.max(1) as usize;
    let need = best_of / 2 + 1;

    let mut games: Vec<crate::replay::GameReplay> = Vec::new();
    let mut game_results = Vec::new();
    let (mut a_wins, mut b_wins) = (0usize, 0usize);
    let mut total_ticks: u16 = 0;
    let (mut cum_a, mut cum_b) = (fixed::Fixed::ZERO, fixed::Fixed::ZERO);
    let mut final_combatants = None;

    for g in 0..best_of {
        if a_wins >= need || b_wins >= need {
            break;
        }
        let (game, combatants) = sim::play_game(
            &input.armies,
            &input.ruleset,
            game_seed(input.seed, g),
            &input.match_config,
        )?;
        match game.game_result.winner {
            Some(crate::replay::Side::A) => a_wins += 1,
            Some(crate::replay::Side::B) => b_wins += 1,
            None => {}
        }
        total_ticks = total_ticks.saturating_add(game.game_result.duration_ticks);
        cum_a = cum_a.saturating_add(sim::outcome::side_damage(
            &combatants,
            crate::replay::Side::A,
        ));
        cum_b = cum_b.saturating_add(sim::outcome::side_damage(
            &combatants,
            crate::replay::Side::B,
        ));
        game_results.push(game.game_result);
        games.push(game);
        final_combatants = Some(combatants);
    }

    let final_combatants = final_combatants.expect("a match always plays at least one game");
    let result = sim::outcome::build_match_result(
        &final_combatants,
        game_results,
        total_ticks,
        cum_a,
        cum_b,
    );

    let replay = Replay {
        format_version: CURRENT_FORMAT_VERSION,
        seed: input.seed,
        ruleset_hash: input.ruleset.hash(),
        match_config: input.match_config,
        armies: input.armies.clone(),
        games,
        result: result.clone(),
    };
    Ok(BattleOutput { replay, result })
}

/// Resolve a **Free-adaptation match** where the inputs may change between games (practice /
/// balancer, FR-020, SC-007): game *i* uses `per_game[i]`'s armies + seed. The shared ruleset,
/// match config, and stored replay armies come from `base`; the match ends first-to-two. Every
/// per-game army is validated. Falls back to `base.armies` for any game beyond `per_game`'s length.
pub fn resolve_series(
    base: &BattleInput,
    per_game: &[[Army; 2]],
) -> Result<BattleOutput, ResolveError> {
    validate_both(&base.armies, &base.ruleset)?;
    for armies in per_game {
        validate_both(armies, &base.ruleset)?;
    }

    let best_of = base.match_config.best_of.max(1) as usize;
    let need = best_of / 2 + 1;

    let mut games: Vec<crate::replay::GameReplay> = Vec::new();
    let mut game_results = Vec::new();
    let (mut a_wins, mut b_wins) = (0usize, 0usize);
    let mut total_ticks: u16 = 0;
    let (mut cum_a, mut cum_b) = (fixed::Fixed::ZERO, fixed::Fixed::ZERO);
    let mut final_combatants = None;

    for g in 0..best_of {
        if a_wins >= need || b_wins >= need {
            break;
        }
        let armies = per_game.get(g).unwrap_or(&base.armies);
        let (game, combatants) = sim::play_game(
            armies,
            &base.ruleset,
            game_seed(base.seed, g),
            &base.match_config,
        )?;
        match game.game_result.winner {
            Some(crate::replay::Side::A) => a_wins += 1,
            Some(crate::replay::Side::B) => b_wins += 1,
            None => {}
        }
        total_ticks = total_ticks.saturating_add(game.game_result.duration_ticks);
        cum_a = cum_a.saturating_add(sim::outcome::side_damage(
            &combatants,
            crate::replay::Side::A,
        ));
        cum_b = cum_b.saturating_add(sim::outcome::side_damage(
            &combatants,
            crate::replay::Side::B,
        ));
        game_results.push(game.game_result);
        games.push(game);
        final_combatants = Some(combatants);
    }

    let final_combatants = final_combatants.expect("a match always plays at least one game");
    let result = sim::outcome::build_match_result(
        &final_combatants,
        game_results,
        total_ticks,
        cum_a,
        cum_b,
    );

    let replay = Replay {
        format_version: CURRENT_FORMAT_VERSION,
        seed: base.seed,
        ruleset_hash: base.ruleset.hash(),
        match_config: base.match_config,
        armies: base.armies.clone(),
        games,
        result: result.clone(),
    };
    Ok(BattleOutput { replay, result })
}

/// Validate both armies, surfacing every violation across both sides together (never trust client
/// state — FR-009). Shared by [`resolve`] and [`resolve_series`].
fn validate_both(armies: &[Army; 2], ruleset: &Ruleset) -> Result<(), ResolveError> {
    let mut invalid = Vec::new();
    for army in armies {
        if let Err(mut errs) = validate::validate(army, ruleset) {
            invalid.append(&mut errs);
        }
    }
    if invalid.is_empty() {
        Ok(())
    } else {
        Err(ResolveError::Invalid(invalid))
    }
}

/// The response shape of the byte boundary — a self-describing tagged union so the host can tell a
/// successful resolve from an input-parse failure or a resolve error without a second channel.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
enum ResolveResponse {
    // Boxed: a `WireReplay` (a whole tick stream) dwarfs the error variants; boxing keeps it small.
    Ok(Box<crate::replay::format::WireReplay>),
    Error(ResolveError),
    ParseError { message: String },
}

/// The thin JS↔WASM boundary (engine-api §JS↔WASM): JSON bytes in ([`BattleInput`]), JSON bytes out.
/// The success payload is the **compact wire replay** (positional/columnar, seekable) the client
/// consumes — see [`replay::format`]. Never panics — a bad input becomes a `parseError` response;
/// Rust owns both buffers, the host copies across the boundary.
pub fn resolve_bytes(input: &[u8]) -> Vec<u8> {
    let response = match serde_json::from_slice::<BattleInput>(input) {
        Ok(inp) => match resolve(&inp) {
            Ok(out) => {
                ResolveResponse::Ok(Box::new(replay::format::to_wire(&out.replay, &inp.ruleset)))
            }
            Err(e) => ResolveResponse::Error(e),
        },
        Err(e) => ResolveResponse::ParseError {
            message: e.to_string(),
        },
    };
    serde_json::to_vec(&response).unwrap_or_else(|_| b"{\"status\":\"parseError\"}".to_vec())
}

/// The input to the standalone legality check ([`validate_bytes`]): one army + the balance table.
/// Run by the Garage at edit time and by the persistence layer before a squad is stored — the **same
/// V1–V8** the engine runs before a battle, so the DB rejects exactly the builds the engine would (P8).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateInput {
    pub army: Army,
    pub ruleset: Ruleset,
}

/// The response of the [`validate_bytes`] boundary — a self-describing tagged union (`status`
/// = `ok` | `invalid` | `parseError`). On `ok` it also carries the army's derived matchmaking
/// **power rating** (whole units), so the persistence layer validates and derives in one call.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
enum ValidateResponse {
    Ok {
        // enum-level `rename_all` renames variants, not struct-variant fields — rename explicitly.
        #[serde(rename = "powerRating")]
        power_rating: i64,
    },
    Invalid {
        errors: Vec<ValidationError>,
    },
    ParseError {
        message: String,
    },
}

/// Sum the per-machine matchmaking power rating across an army (whole units). `None` if a machine
/// fails derivation (won't happen once `validate` passes). Matchmaking-only — never combat (FR-006).
fn army_power_rating(army: &Army, ruleset: &Ruleset) -> Option<i64> {
    let mut total = crate::fixed::Fixed::ZERO;
    for m in &army.machines {
        let stats = crate::model::army::derive_effective_stats(m, ruleset).ok()?;
        total = total.saturating_add(crate::model::army::power_rating(&stats));
    }
    Some(total.to_int())
}

/// Byte boundary for the standalone army-legality check (JSON [`ValidateInput`] in, JSON
/// [`ValidateResponse`] out). Never panics — malformed input becomes a `parseError` response.
pub fn validate_bytes(input: &[u8]) -> Vec<u8> {
    let response = match serde_json::from_slice::<ValidateInput>(input) {
        Ok(inp) => match validate::validate(&inp.army, &inp.ruleset) {
            Ok(()) => ValidateResponse::Ok {
                power_rating: army_power_rating(&inp.army, &inp.ruleset).unwrap_or(0),
            },
            Err(errors) => ValidateResponse::Invalid { errors },
        },
        Err(e) => ValidateResponse::ParseError {
            message: e.to_string(),
        },
    };
    serde_json::to_vec(&response).unwrap_or_else(|_| b"{\"status\":\"parseError\"}".to_vec())
}

/// The engine's canonical **default balance table** as JSON — the ruleset the server validates and
/// simulates against until Feature 12 makes it DB-editable. Emitting it from the engine keeps a single
/// source of truth (no committed ruleset fixture that could drift from the Rust content).
pub fn default_ruleset_bytes() -> Vec<u8> {
    serde_json::to_vec(&crate::content::seed_ruleset()).unwrap_or_else(|_| b"{}".to_vec())
}

/// The wasm-bindgen exports (only compiled for the wasm32 target, so native/the balancer never pull
/// in wasm-bindgen). Each delegates to the corresponding `*_bytes` boundary.
#[cfg(target_arch = "wasm32")]
mod wasm_exports {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub fn resolve(input: &[u8]) -> Vec<u8> {
        super::resolve_bytes(input)
    }

    #[wasm_bindgen]
    pub fn validate(input: &[u8]) -> Vec<u8> {
        super::validate_bytes(input)
    }

    #[wasm_bindgen]
    pub fn default_ruleset() -> Vec<u8> {
        super::default_ruleset_bytes()
    }
}
