# Research: Battle Summary

**Feature**: `006-battle-summary` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

This is a **presentation/reporting screen**, so the research is deliberately short: the hard problems
(determinism, the result shape) are already solved in Feature 1, and the visual system in Feature 3. What
remains is a handful of **seam** and **layout** decisions. Each is recorded as Decision / Rationale /
Alternatives.

---

## D1 — How the summary hands off to the replay (Feature 5)

**Decision.** The summary route keys on **`matchId`** (`app/(app)/matches/[matchId]/summary/`). The stored
replay (Feature 7) is addressable by that same match, so the **Watch Full Replay** action is a plain
navigation to the **Battle Playback** route (Feature 5) for that match/replay — e.g. a `next/link` to
`…/matches/[matchId]/replay` (final path owned by Feature 5). The summary **never mounts a replay player or
plays the tick stream**; it only holds the reference and links out.

**Rationale.** Feature 1's replay is O(1)-seekable and Feature 5 is the dedicated player
([replay-format](../001-battle-sim-core/contracts/replay-format.md), Feature 1 SC-002). Keeping the summary
a pure reader honors scope discipline (Principle IV) and P6 (the client that renders the summary is not a
simulator). The mockup's action row (`Watch Full Replay` → `Warform Commander Battle Playback.dc.html`)
already models exactly this hand-off.

**Alternatives rejected.** Embedding a mini-scrubber/preview in the summary — rejected: that *is* Feature 5,
and duplicating even a lightweight player invites the re-simulation/seek bugs Feature 1 was designed to
avoid, and it blurs the feature boundary. Passing the full replay blob into the summary render — rejected:
unnecessary payload; the summary needs only the result (+ `unitOrder` for identity, and, optionally, the
event stream *once* for MVP — see D3).

---

## D2 — The ranking change: net victories vs the mockup's MMR

**Decision.** Render the **net-victory standing delta** (§13) — `+delta` with `before → after` (e.g. `+1
NET VICTORY · 47 → 48`) — sourced from **Feature 7's ladder-standing update** (Feature 7 FR-021/US5). Do
**not** render MMR/tier in this feature. A **practice** match shows **no** standing change and is labeled
**UNRANKED** (Feature 7 FR-019, §16.1).

**Rationale.** The design doc is explicit that the **v1 stake is net victories, no MMR/ELO** (§13), and
Feature 3's data-model already flags the mockup's `MMR`/`GOLD III` labels as **forward-looking** chrome that
**Feature 9** (Ladder: seasons/tiers/MMR) owns. The standing is computed and persisted server-side (P6,
Feature 7), so the summary **reads** the delta rather than computing it — this also correctly captures the
asymmetric §13 rule (attack win = +1; attack loss = 0; a defense loss = −1) without the summary re-deriving
ladder logic.

**Alternatives rejected.** Showing `+24 MMR · 1486 → 1510` as in the mockup — rejected: there is no MMR
system in v1; rendering one would fabricate a stake that doesn't exist and pre-empt Feature 9. Computing the
delta on the client from the match outcome — rejected: violates server-authority (P6) and would duplicate
the §13 rule that lives in Feature 7.

---

## D3 — Sourcing the MVP + per-machine damage without re-simulating

**Decision.** Treat per-machine **damage dealt / absorbed / kills** (and therefore the **MVP**) as an
**optional enhancement** (FR-010, MAY). Source it from **either** (a) an extended per-machine field on the
result if Feature 1 provides one, **or** (b) a **single O(events) reduction over the linked replay's event
stream** (sum `dmg` by actor/target from the `events` arrays) — performed **once**, never a re-simulation.
When neither is available, the MVP card is **omitted gracefully** and the rest of the screen is unaffected.

**Rationale.** Feature 1's summarized `BattleResult`/`MatchResult` carries **per-side** damage totals and
**per-machine fates** (`DestroyedAtTick | SurvivedWithHullPct`), but not per-machine *damage dealt/absorbed*
([data-model Tier 3](../001-battle-sim-core/data-model.md)). Feature 1 SC-002 guarantees `Σ events.dmg`
equals the result totals, so a per-actor reduction over the events is a **faithful, cheap, deterministic**
aggregation — it is reading, not simulating. Keeping MVP optional means the P1/P2 outcome + fates + totals
never depend on it.

**Alternatives rejected.** Re-running the engine to obtain per-machine numbers — rejected outright: this
screen is a reader, not a simulator (P6, Principle IV). Requiring Feature 1 to add per-machine damage now —
noted as a possible small enhancement to Feature 1's result, but not made a hard dependency; the reduction
path lets this feature ship against the current result shape.

> **Cross-feature note (surfaced on paper, per Principle VII):** if the MVP proves valuable, adding a
> per-machine `damageDealt/absorbed/kills` rollup to Feature 1's `MatchResult` would let the summary avoid
> touching the replay events entirely. Recorded here for the Feature 1 backlog; not required for this
> feature.

---

## D4 — Responsive both-orientation layout for a dense results screen (P7)

**Decision.** One content model, two chromes (mirroring Feature 3's shell approach):

| Region | Desktop landscape (`lg:` and up) | Mobile portrait (default) |
|---|---|---|
| **Outcome hero** | horizontal: verdict + opponent on the left, series pips + standing delta on the right | stacked: verdict, then opponent, then series pips, then standing delta — all full-width |
| **Match totals** | you-vs-them dual bars in a `1fr / label / 1fr` grid (mockup) | the **same** dual-bar rows, full-width — they already collapse cleanly (label centered, bars mirror) |
| **Game breakdown + MVP** | two columns: game cards (`1fr`) beside the MVP card (fixed ~320px) | single column: game cards stacked, then the MVP card |
| **Per-machine fates** | a two-side grid (viewer column / opponent column) | stacked per side, or a compact two-up that never overflows |
| **Actions** | centered horizontal row, primary CTA emphasized | full-width stacked buttons in thumb reach |

The whole page is a **single vertical scroll in portrait**; landscape uses columns only where they aid
scanning (game breakdown ⋮ MVP). No horizontal page scroll at any width 320px→ultra-wide; content is
constrained by Feature 3's `--container-shell` max-width and centered on ultra-wide (Feature 3 FR-009).

**Rationale.** The mockup is desktop-landscape; **P7 requires the portrait treatment be designed *for* the
phone, not inherited**. The comparison bars and per-game cards are already vertical-stack-friendly, so the
portrait layout is a genuine first-class target with minimal bespoke work. Using Feature 3's breakpoint
token keeps the switch consistent with the shell's nav switch.

**Alternatives rejected.** A landscape-only screen with a naive mobile shrink — rejected: violates P7. Tabs
to hide sections on mobile — rejected as over-engineering for a screen that reads well as a single scroll;
revisit only if the per-machine grid proves too tall in practice.

---

## D5 — Win-condition + reward-tier legibility (a11y, not color-only)

**Decision.** Encode win condition and reward tier as **text labels + `Chip` tone**, never color alone: a
Conquest game reads **`CONQUEST` / `FULL`**; a Time game reads **`TIME · DMG` / `LESSER`** (per the mockup's
per-game cards). The verdict is the word **VICTORY**/**DEFEAT**, not merely a color. The exact-tie→defender
game carries an explicit "exact tie → defender" affordance so the outcome never reads as arbitrary.

**Rationale.** Feature 3's reduced-motion + contrast baseline and constitution P7/Principle V demand the
outcome be legible without relying on color or motion (SC-002, SC-008). Chips already carry a `tone` for
family/faction/zone; reusing that vocabulary keeps it token-driven.

**Alternatives rejected.** Distinguishing Conquest vs Time by border/fill color only — rejected: fails the
color-independence bar and the "Time-tiebreak-win-never-reads-as-Conquest" requirement (FR-005).

---

## Summary of decisions

| # | Decision | Drives |
|---|---|---|
| D1 | Summary keys on `matchId`; **links** to Battle Playback (Feature 5), never plays the replay | FR-012, SC-007 |
| D2 | Render the **net-victory** delta from Feature 7; MMR/tiers are Feature 9's | FR-011, SC-006 |
| D3 | MVP/per-machine damage = optional, from an **event reduction** (not a re-sim), degrade gracefully | FR-010 |
| D4 | Portrait single-scroll / landscape multi-column, both grounded in the mockup | FR-015, SC-004 |
| D5 | Win-condition + tier as **text/label**, never color-only | FR-005/016, SC-002/008 |
