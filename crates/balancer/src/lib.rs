//! Warform Commander — Monte-Carlo auto-balancer library (Feature 2).
//!
//! The reusable core the `balancer` binary and the integration tests both link. It reuses the
//! **one** Feature 1 `engine` crate (`resolve`/`validate`/`Ruleset`) natively — never a second
//! engine (P6/P4, FR-001) — and adds only the aggregation/statistics/flagging/reporting around it:
//!
//! - [`seed`] — deterministic per-match seed derivation (the reproducibility spine, research A1).
//! - [`stats`] — integer win-count tally + Wilson 95% CI + outcome breakdown (research B1).
//! - [`batch`] — `run_batch`: resolve a matchup N× in parallel **across matches only**, reduced to
//!   integer counts, so the aggregate is thread-count-independent (FR-004, SC-001).
//! - [`archetypes`] — the curated candidate pool / reference field + invariant fixtures.
//! - [`sweep`] — evaluate each candidate across the field (both roles), interval-gated.
//! - [`flags`] — dominant / degenerate / underpowered classification, severity-sorted.
//! - [`invariants`] — the four balance-invariant numeric checks.
//! - [`fixtures`] — deliberately-perturbed rulesets (the balancer's own golden tests).
//! - [`report`] — the `BalanceReport` model + JSON/markdown renderers.
//! - [`run`] — compose the above into a provenance-stamped report per mode.
//!
//! Everything decision-bearing (win counts, flags, verdicts) is integer and deterministic; floats
//! appear only in derived presentation statistics, computed once and rendered at fixed precision
//! (plan Complexity Tracking).

pub mod archetypes;
pub mod batch;
pub mod fixtures;
pub mod flags;
pub mod invariants;
pub mod report;
pub mod run;
pub mod seed;
pub mod stats;
pub mod sweep;
