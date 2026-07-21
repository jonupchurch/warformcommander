//! The balance report — the balancer's primary output (FR-019/020/021).
//!
//! [`model`] holds the `serde`-derived shapes (the [balance-report contract](../../../specs/002-auto-balancer/contracts/balance-report.md));
//! [`json`] emits the canonical machine-readable artifact and [`markdown`] the human read. The
//! report is a **pure data artifact** — advisory only, it never encodes a change to the Ruleset
//! (FR-018, SC-006).

pub mod json;
pub mod markdown;
pub mod model;

pub use model::*;
