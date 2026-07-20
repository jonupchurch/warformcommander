//! The typed game-data model — the shared source of truth the engine, Garage,
//! Battle Playback, Arena, and balancer all bind to (constitution P8, data-model).
//!
//! Three tiers, kept apart so the engine stays a pure `resolve(armies, ruleset, seed)`:
//! - [`types`] — Tier 1 content/configuration (*what a player builds*).
//! - [`ruleset`] — Tier 2 the balance table (every tunable number; admin-editable).
//! - [`army`] — configured instances + the shared effective-stat derivation.

pub mod army;
pub mod ruleset;
pub mod types;

pub use army::*;
pub use ruleset::*;
pub use types::*;
