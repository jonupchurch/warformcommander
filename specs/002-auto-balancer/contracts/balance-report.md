# Contract: Balance Report (wire schema)

**Feature**: `002-auto-balancer` | **Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

The serialized shape of a **BalanceReport** — the balancer's primary output (**FR-019/020**),
produced by the native `crates/balancer` binary (`serde`) and read by **a human** (the markdown
rendering) and by **tooling** (the JSON). It is a **pure data artifact**: an offline report a
designer commits alongside the balance table, not a live datastore. It is designed to be the clean
seam a future admin view (**Feature 12**) can consume without rework — but this feature emits files
only; it does not talk to a server or DB.

## Decisions (from [research.md](../research.md))

| # | Decision | Rationale |
|---|---|---|
| 1 | **Two artifacts: canonical JSON + rendered markdown** | JSON is the machine-readable source of truth (diffable across runs, consumable by Feature 12); markdown is the human read. Both from one in-memory `BalanceReport`. |
| 2 | **`rulesetHash` + engine/format-version stamp** on every report | Traceability (SC-007): a report is bound to the exact balance table and engine build it evaluated, so no one tunes off a stale run. |
| 3 | **Integer win counts are the source; win rates/CIs are derived** | Decision-bearing values stay deterministic (SC-001); floats are rendered at fixed precision so report bytes are stable. |
| 4 | **Flagged combos carry reason + severity, severity-sorted** | The report is *actionable* — worst offenders first, each with *why* it was flagged (FR-008/010). |
| 5 | **Invariants report measured number + margin, not a bare boolean** | A designer needs to know *how far* out of band a claim is, to tune proportionally (FR-016). |
| 6 | **`coverage` block stated explicitly** | The sweep is bounded/sampled (research A2); the report must say what it actually covered, never imply exhaustiveness (FR-006, edge case). |

## Top-level shape

```jsonc
{
  "reportVersion": 1,                       // integer; a consumer gates on a supported range
  "provenance": {
    "rulesetHash": "…",                     // the exact balance table evaluated (SC-007)
    "engineVersion": "…",                   // Feature 1 engine build/crate version
    "replayFormatVersion": 1,               // the format the underlying resolves emitted
    "generatedAt": "2026-07-19T…Z"          // wall-clock stamp (excluded from the reproducibility diff, SC-001)
  },
  "runConfig": {                            // self-describing: the run is reproducible from this + the Ruleset
    "baseSeed": "1234567890",               // u64 as string (JSON-safe)
    "samplesPerMatchup": 2000,
    "threads": 8,                           // must not affect results (SC-001) — recorded for the perf note only
    "fairBand": { "floor": 0.40, "ceiling": 0.60 }
  },
  "matchups": [                             // per-matchup estimates (US1)
    {
      "label": "Energy-Mech vs Grizzly",
      "samples": 2000,
      "winsA": 1310, "winsB": 690,          // integer counts — the deterministic aggregate
      "winRateA": 0.6550,                   // derived, fixed precision
      "ci95": { "low": 0.6337, "high": 0.6756 },   // Wilson 95% (research B1)
      "outcome": {
        "conquestA": 1180, "conquestB": 610,
        "timeTiebreakA": 130, "timeTiebreakB": 80,
        "matchSplit": { "twoZero": 900, "twoOne": 1100 },
        "avgDurationTicks": 372.4
      }
    }
  ],
  "flagged": [                              // severity-sorted, worst first (US2)
    {
      "combo": { /* Army (or a ComboRef into the sweep) */ },
      "acrossFieldWinRate": 0.78,
      "ci95": { "low": 0.755, "high": 0.803 },
      "kind": "Dominant",                   // Dominant | Degenerate | Underpowered
      "reason": "Wilson interval [0.755,0.803] lies entirely above ceiling 0.60",
      "severity": 0.155                     // distance of the interval from the nearest band edge
    },
    {
      "combo": { /* … */ },
      "kind": "Degenerate",
      "reason": "Plan-B build with no offsetting trade-off (GDD §8.2 free-turtle)",
      "severity": 0.20
    }
  ],
  "invariants": [                           // the four claims (US3), each with measured + margin
    { "name": "FamilyBonusBand", "band": { "low": 0.10, "high": 0.15 }, "measured": 0.121, "margin": 0.021, "pass": true,
      "evidence": ["Mech-Pulse(Energy) vs Grizzly", "Mech-Assault(Kinetic) vs Grizzly"] },
    { "name": "PowerGapCap",    "band": { "low": 0.0,  "high": 0.625 }, "measured": 0.59,  "margin": 0.035, "pass": true,
      "evidence": ["max-gear vs equal-skill base-gear"] },
    { "name": "NoDominantUnit", "band": { "low": 0.0,  "high": 1.0 },   "measured": 0.0,   "margin": 0.0,   "pass": true,
      "evidence": ["no type/variant swept a clean win across all its field matchups"] },
    { "name": "SkillBeatsGear", "band": { "low": 0.50, "high": 1.0 },   "measured": 0.63,  "margin": 0.13,  "pass": true,
      "evidence": ["well-composed base-gear vs sloppy max-gear"] }
  ],
  "coverage": {                             // honest coverage (FR-006, research A2)
    "candidatesEvaluated": 240,
    "candidateSpaceEstimated": 240,         // or a sampled subset of a larger space
    "fieldSize": 12,
    "samplesPerMatchup": 2000,
    "totalResolutions": 5760000,
    "skippedInvalid": 3                     // engine validate()-rejected candidates (FR-005)
  }
}
```

### Field notes

- **`winsA`/`winsB` are the truth; `winRateA`/`ci95` are derived.** A consumer that recomputes the
  rate from the counts must get the reported rate (modulo fixed-precision rounding). This is what
  makes the report reproducible (SC-001) despite carrying floats.
- **`ci95` uses the Wilson score interval** (research B1). A flag (`Dominant`/`Underpowered`) is
  only emitted when the **interval** — not the point estimate — clears the `fairBand` (FR-011),
  which is why every flagged combo carries its `ci95`.
- **`severity`** is the interval's distance from the nearest band edge; the `flagged` array is
  sorted by it, descending (FR-010).
- **`generatedAt`** is provenance for humans but is **excluded** from the reproducibility comparison
  (SC-001 diffs the report body, not the timestamp).

## Consumer contract

**Human (markdown, this feature):** the markdown rendering presents the same data — a matchup
win-rate table with CIs, the severity-sorted flag list with reasons, and the four invariant
pass/fails with measured numbers and margins — legibly, no tooling required (FR-021).

**Tooling / future admin view (Feature 12, downstream):** the JSON is the stable seam. A future
admin console that surfaces balance findings reads `reportVersion` + `provenance` + `flagged` +
`invariants` directly. **This feature does not implement that consumer** — it emits the file; the
seam exists so Feature 12 needs no balancer change to consume it (Principle IV — scope discipline).

## What this contract is NOT

- **Not a mutation surface.** The report describes imbalance; it never encodes a change to the
  Ruleset. Rebalancing is a human editing the balance table (later, via Feature 12) — the balancer
  is advisory only (FR-018, SC-006, constitution P1).
- **Not a DB schema.** Reports are committed files in v1 (`balance-reports/`), not Postgres rows.
  Persisting reports and rendering them live is **Feature 12's** concern.
- **Not versioned like the replay.** `reportVersion` gates tooling compatibility, but reports are
  regenerated on demand from `(Ruleset, runConfig)` — there is no long-lived report migration story
  (unlike the replay, a report is cheap to re-emit).
