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

pub mod fixed;
pub mod model;
pub mod rng;

/// Crate version, surfaced so the balancer/host can confirm they linked the
/// expected engine build. Replaced by the real public API (`resolve`/`validate`)
/// as the Foundational and US1 modules land.
pub fn engine_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
