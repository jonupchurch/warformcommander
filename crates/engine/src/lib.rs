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

use serde::{Deserialize, Serialize};

use crate::model::army::{Army, DerivationError};
use crate::model::ruleset::Ruleset;
use crate::replay::{MatchConfig, MatchResult, Replay, CURRENT_FORMAT_VERSION};

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
    /// A machine's build could not be reduced to effective stats (unknown id / wrong slot kind).
    Derivation(DerivationError),
}

impl From<DerivationError> for ResolveError {
    fn from(e: DerivationError) -> Self {
        ResolveError::Derivation(e)
    }
}

/// Resolve a battle: pure and total — same input → byte-identical output (SC-001), no I/O, no
/// ambient randomness, no panics on well-formed input. US1 runs a **single game**; the Bo3 wrapper
/// lands in US4.
pub fn resolve(input: &BattleInput) -> Result<BattleOutput, ResolveError> {
    let mut combatants = sim::build_combatants(&input.armies, &input.ruleset)?;
    let mut rng = crate::rng::Rng::from_seed(input.seed);

    let game = sim::run_game(&mut combatants, &input.ruleset, &mut rng, &input.match_config);
    let total_ticks = game.ticks.len() as u16;
    let result = sim::outcome::build_match_result(&combatants, vec![game.game_result], total_ticks);

    let replay = Replay {
        format_version: CURRENT_FORMAT_VERSION,
        seed: input.seed,
        ruleset_hash: input.ruleset.hash(),
        match_config: input.match_config,
        armies: input.armies.clone(),
        games: vec![game],
        result: result.clone(),
    };

    Ok(BattleOutput { replay, result })
}

/// The response shape of the byte boundary — a self-describing tagged union so the host can tell a
/// successful resolve from an input-parse failure or a resolve error without a second channel.
#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
enum ResolveResponse {
    // Boxed: a `BattleOutput` (a whole Replay) dwarfs the error variants; boxing keeps the enum small.
    Ok(Box<BattleOutput>),
    Error(ResolveError),
    ParseError { message: String },
}

/// The thin JS↔WASM boundary (engine-api §JS↔WASM): JSON bytes in ([`BattleInput`]), JSON bytes out
/// ([`ResolveResponse`]). Never panics — a bad input becomes a `ParseError` response. Rust owns both
/// buffers; the host copies across the boundary.
pub fn resolve_bytes(input: &[u8]) -> Vec<u8> {
    let response = match serde_json::from_slice::<BattleInput>(input) {
        Ok(inp) => match resolve(&inp) {
            Ok(out) => ResolveResponse::Ok(Box::new(out)),
            Err(e) => ResolveResponse::Error(e),
        },
        Err(e) => ResolveResponse::ParseError {
            message: e.to_string(),
        },
    };
    serde_json::to_vec(&response).unwrap_or_else(|_| b"{\"status\":\"parseError\"}".to_vec())
}

/// The wasm-bindgen export (only compiled for the wasm32 target, so native/the balancer never pull
/// in wasm-bindgen). Delegates to [`resolve_bytes`].
#[cfg(target_arch = "wasm32")]
mod wasm_exports {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub fn resolve(input: &[u8]) -> Vec<u8> {
        super::resolve_bytes(input)
    }
}
