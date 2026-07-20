# Feature Specification: Battle Summary

**Feature Branch**: `006-battle-summary`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Battle Summary — the post-battle / post-Bo3-match summary screen. After a
match resolves, show the outcome legibly: the Bo3 result (which side won, 2-0 / 2-1, per-game win
conditions + reward tiers), per-machine fates, per-side damage totals, survivor counts, duration, and the
resulting ranking change (net-victory delta) — with a clear path to watch the replay and return to
Arena/Garage. Responsive, both orientations first-class."

## Overview

This is the **results/reporting screen** the player lands on the moment a match finishes. It is not an
engine and not a replay player — it is a **legible read-out of an already-resolved outcome**. Feature 1
(the deterministic sim) has done all the hard work: it resolved a best-of-three into a `MatchResult` plus a
random-access `Replay`, both persisted by Feature 7. This screen *consumes* that result and turns it into a
scannable story: **did I win, why, how, and what did it cost the ladder** — with one tap to re-watch the
whole thing or line up the next opponent.

Everything here is presentation over data that already exists. The result is authoritative (resolved
server-side, constitution **P6**) and reconcilable from the tick stream (Feature 1 **SC-002**); this screen
reads the **summarized result**, never the raw ticks and never the engine. It renders inside the Feature 3
app shell and design system, and — per constitution **P7** — is designed *for* both mobile portrait and
desktop landscape, not adapted from one to the other.

The value it delivers: **a player instantly understands the outcome of a match and can act on it** — the
verdict (VICTORY / DEFEAT), the series score (2-0 / 2-1), each game's win condition (Conquest vs Time) and
reward tier (Full vs Lesser), the fate of every machine, the damage exchange, and the net-victory swing
(§13) — then watches the replay (hand off to Feature 5) or returns to the Arena (Feature 8) / Garage.

The visual language, layout, and hierarchy are **derived from the committed mockup**
[`reference/Warform Commander Battle Summary.dc.html`](../../reference/Warform%20Commander%20Battle%20Summary.dc.html)
(the outcome hero, the match-totals comparison bars, the per-game breakdown cards, the MVP card, and the
action row), rendered with the Feature 3 tokens/primitives rather than the mockup's inline styles.

## User Scenarios & Testing *(mandatory)*

The "user" is a **player** who just finished a match and wants to know what happened, across both
orientations. Stories are prioritized so that US1 alone is a shippable, meaningful summary.

### User Story 1 - See who won the match and why (Priority: P1)

A player finishes a best-of-three match and is shown, at a glance, the **outcome from their perspective**
(VICTORY or DEFEAT), the **series score** (e.g. 2-1), a **per-game W/L** indicator, and for each game its
**win condition** (Conquest vs Time) and **reward tier** (Full vs Lesser). A Time-tiebreak win reads
distinctly from a Conquest win; a 2-0 sweep reads distinctly from a 2-1 grind.

**Why this priority**: This is the reason the screen exists — the single question every player asks after a
match is *"did I win, and how?"*. It is the MVP: even with nothing else on the screen, a correct,
unambiguous outcome + score + per-game condition/tier is a complete, valuable result screen. Everything
else enriches this.

**Independent Test**: Feed the screen a battery of `MatchResult` fixtures (a 2-0 Conquest sweep, a 2-1 with
a middle-game Time loss, a defeat, a match won on a Time tiebreak, an exact-tie-to-defender game) and assert
the rendered verdict, series score, per-game W/L, win condition, and reward tier each match the result —
with no engine, no replay, no persistence needed (the ViewModel derivation is pure).

**Acceptance Scenarios**:

1. **Given** a `MatchResult` the viewer's side won 2-0, **When** the summary renders, **Then** it shows a
   **VICTORY** verdict, a **2 – 0** series score, two per-game **W** indicators, and no third-game row.
2. **Given** a `MatchResult` the viewer won 2-1, **When** it renders, **Then** it shows **VICTORY**, **2 –
   1**, three per-game indicators (two W, one L), and each game's win condition + reward tier.
3. **Given** a `GameResult` with `condition = Conquest`, **When** its per-game card renders, **Then** it is
   labeled **CONQUEST** at the **FULL** reward tier, visually distinct from a Time game.
4. **Given** a `GameResult` with `condition = Time` (both sides alive at the cap), **When** it renders,
   **Then** it is labeled as a **TIME / most-damage** result at the **LESSER** reward tier, unmistakably
   different from a Conquest result.
5. **Given** a `MatchResult` the viewer's side lost, **When** it renders, **Then** it shows **DEFEAT** and
   the opponent as the match winner, with the same per-game breakdown.

---

### User Story 2 - Per-machine fates and the damage breakdown (Priority: P2)

The player drills into *how* the match went: **per-side match totals** (damage dealt, units killed, units
lost, average hull remaining), each game's **survivor counts** (`4 vs 0`) and **duration** (seconds), and
the **fate of every machine** — destroyed-at-tick or survived-with-hull-percent. Where the data is
available, a **Match MVP** highlights the standout machine (top damage dealt / kills / damage absorbed).

**Why this priority**: This is the analytical payload that makes a summary worth studying — the difference
between "I won" and "I won because my Bulwark tanked 5,880 and my line held at 41% hull." It layers on top
of the P1 outcome and is independently testable, but the outcome must exist first. P2.

**Independent Test**: Given a `MatchResult` with populated `perSideDamageTotals`, `survivorCounts`, and
per-machine fates, assert the rendered totals equal the result's totals (zero drift), that each machine
shows the correct destroyed-at-tick or survived-hull% fate keyed to the right unit (via `unitOrder`
type/variant/side), and that a total wipe (0 survivors, 0% avg hull) and an all-survivors game both render
correctly.

**Acceptance Scenarios**:

1. **Given** `perSideDamageTotals` of `9,850` (viewer) vs `7,420` (opponent), **When** the totals panel
   renders, **Then** both values are shown against each other and **equal** the result's totals exactly.
2. **Given** `survivorCounts`, **When** the totals render, **Then** units-killed and units-lost per side
   are derived correctly (killed = 5 − enemy survivors; lost = 5 − own survivors) and shown per side.
3. **Given** a game's `GameResult.durationTicks`, **When** its card renders, **Then** the duration is shown
   in seconds at the ruleset tick rate (e.g. 82 ticks → **8.2s**) and its survivor counts (`4 vs 0`) are
   shown.
4. **Given** per-machine fates, **When** a machine that was destroyed at tick T renders, **Then** it shows
   **destroyed** (at T / its second); a surviving machine shows **survived at N% hull**; each is keyed to
   the correct machine identity (type + variant + side) from the replay `unitOrder`.
5. **Given** per-machine damage data (from the result or a single reduction over the linked replay's
   events), **When** the MVP card renders, **Then** it names the top machine and its damage dealt / kills /
   damage absorbed; **and** when that per-machine damage data is unavailable, the MVP card is omitted
   without breaking the screen.

---

### User Story 3 - Watch the replay, rematch, or return (Priority: P2)

From the summary the player can **watch the full replay** (hand off to Feature 5, Battle Playback), **find
the next opponent / rematch** (→ Arena, Feature 8), and **return** to the Arena or Garage. The summary
itself performs no playback — the "watch replay" action navigates to the Battle Playback screen keyed to
this match's stored replay.

**Why this priority**: A results screen a player can't leave (or can't act on) is a dead end. These are the
exits and the loop-closers — reasonably P2 because the outcome (US1) is the reason to be here, and the shell
nav (Feature 3) already provides a baseline way out; this story makes the *contextual* actions first-class
and wires the replay hand-off seam.

**Independent Test**: Render the action row and assert (a) the "watch replay" control targets the Battle
Playback route for *this match's* replay reference, (b) the "find next opponent" control targets the Arena,
(c) a "back to Arena/Garage" control exists, and (d) the summary triggers no simulation and mounts no replay
player.

**Acceptance Scenarios**:

1. **Given** a resolved match with a stored replay, **When** the player activates **Watch Full Replay**,
   **Then** they are taken to the Battle Playback screen (Feature 5) for that match's replay — the summary
   does not itself play the tick stream.
2. **Given** the summary, **When** the player activates **Find Next Opponent**, **Then** they are taken to
   the Arena (Feature 8) to line up a new match.
3. **Given** the summary, **When** the player activates **Back to Arena** (or navigates via the shell),
   **Then** they return to the Arena/Garage without losing the recorded result.
4. **Given** the summary on either orientation, **When** the action controls render, **Then** they are
   reachable and operable by keyboard with visible focus (Feature 3 baseline), and the primary action is
   the emphasized CTA.

---

### User Story 4 - See the ranking change (Priority: P3)

For a **ranked** match, the summary shows the **net-victory standing change** (§13) — the delta and the
before→after standing (e.g. `+1 NET VICTORY · 47 → 48`). For a **practice-sandbox** match nothing moves:
the summary labels it unranked and shows no standing change (and keeps the opponent's identity hidden,
§16.1).

**Why this priority**: The ladder swing is the stake that gives a ranked match weight, and it is a headline
element of the mockup's outcome hero. But it *layers a delta on top of* the already-complete outcome, it
depends on Feature 7's standing-update seam, and the screen is fully meaningful without it (a practice match
shows none at all). P3 — it hardens the screen rather than defining it.

**Independent Test**: Given a ranked `MatchResult` plus a standing delta from Feature 7, assert the delta,
sign, and before→after render correctly for a win (`+1`) and are absent (or zero) for the cases the §13 rule
defines; given a `practice` match, assert no standing change is shown and the match is labeled unranked.

**Acceptance Scenarios**:

1. **Given** a ranked match the viewing attacker won, **When** the summary renders, **Then** it shows a
   **+1 net victory** change with the correct **before → after** standing, sourced from Feature 7's ladder
   update (not computed on the client).
2. **Given** a ranked match the viewing attacker lost, **When** it renders, **Then** it shows the standing
   change the §13 rule dictates (an attack loss does not subtract) — i.e. **no decrease** — without
   implying a penalty the ladder did not apply.
3. **Given** a **practice-sandbox** match, **When** it renders, **Then** it is labeled **unranked**, shows
   **no** standing change, and the opponent's identity is **hidden** (§16.1).
4. **Given** the mockup's MMR/tier chrome (`+24 MMR · 1486 → 1510`), **When** this feature renders in v1,
   **Then** it shows the **net-victory** delta (the v1 stake) — MMR/tiers/seasons are Feature 9's
   forward-looking layer, not rendered here.

---

### Edge Cases

- **Time-tiebreak win vs Conquest win**: rendered distinctly — a Conquest game is labeled CONQUEST / FULL
  reward; a Time game is labeled TIME (most-damage) / LESSER reward. Never conflated (FR-005, SC-002).
- **Exact damage tie → defender** (§9.3): a Time game with equal damage shows the **defender** as the game
  winner, the damage bars equal, and an explicit "exact tie → defender" affordance so the outcome does not
  read as arbitrary.
- **2-0 vs 2-1 series**: a 2-0 shows exactly two game rows (no phantom third); a 2-1 shows three, one of
  which is a loss for the match winner. The series-score pips reflect the actual games played.
- **All-survivors game vs total wipe**: a Time game where both sides stay largely intact (high avg hull,
  many survivors) and a Conquest wipe (loser at 0 survivors / 0% avg hull) both render without missing or
  placeholder fields.
- **Machine destroyed at the first tick vs survived at 100% hull**: both fate extremes render (destroyed-at-
  tick with a tiny time; survived-with-100%-hull) keyed to the right machine.
- **Viewer is side B (defender's perspective)**: the verdict and all "you vs them" framing derive from the
  **viewer's side**, never hard-coded to side A; a defense-loss view shows DEFEAT with the −1 standing the
  §13 rule applies.
- **Both orientations (P7)**: portrait (360px) is a single vertical scroll of stacked panels; landscape
  (1440px) uses multi-column where it helps (game breakdown beside the MVP). No horizontal page scroll
  320px→ultra-wide.
- **Reduced motion**: decorative reveal/glow/pulse animations are suppressed under
  `prefers-reduced-motion`; every outcome fact remains conveyed by text/label, never by color or motion
  alone.
- **Long opponent commander name**: truncates with ellipsis; never forces horizontal scroll.
- **MVP data unavailable**: the MVP card is omitted gracefully (US2-AS5) rather than rendering a blank/zero
  card.
- **Practice opponent hidden**: a practice match anonymizes the opponent (no name/link) per §16.1.

## Requirements *(mandatory)*

### Functional Requirements

**Data consumption & derivation (P6, P8)**

- **FR-001**: The screen MUST render from a resolved **`MatchResult`** (Feature 1, [data-model Tier 3
  `MatchResult`/`GameResult`/`BattleResult`](../001-battle-sim-core/data-model.md)) fetched via Feature 7
  persistence ([Accounts & Persistence](../007-accounts-persistence/spec.md)); it MUST NOT run the engine,
  re-simulate, or read the raw per-tick stream to render — it reads the **summarized** result.
- **FR-002**: The screen MUST derive a display **ViewModel** from the `MatchResult` (plus the replay
  `meta.unitOrder` for machine identity and the ruleset tick rate for durations) such that **every field of
  the `MatchResult`** — `winner`, each `GameResult`'s `winner`/`condition`/`rewardTier`/`durationTicks`,
  per-machine fates, `perSideDamageTotals`, and `survivorCounts` — is represented in the rendered output.
  The derivation MUST be a **pure, total** function of its inputs (reusing Feature 1's types, not
  redefining them).

**Outcome, series, and per-game (US1)**

- **FR-003**: The screen MUST render the **match verdict from the viewer's side** — VICTORY or DEFEAT —
  derived from `MatchResult.winner` and the viewer's side (never hard-coded to a side).
- **FR-004**: The screen MUST render the **series score** (games won – games lost, e.g. 2-0 / 2-1) and a
  **per-game W/L** indicator for each game actually played (1–3), from `MatchResult.games`.
- **FR-005**: For each game the screen MUST render its **win condition** (Conquest vs Time) and **reward
  tier** (Full vs Lesser) **unambiguously**, from `GameResult.condition` + `GameResult.rewardTier`, such
  that a **Time-tiebreak win is visually and textually distinct from a Conquest win** and the tier is never
  implied by color alone.
- **FR-006**: For each game the screen MUST render its **per-side survivor counts** and its **duration**,
  converting `durationTicks` to seconds at the ruleset tick rate (10 t/s, §9).

**Match totals & per-machine breakdown (US2)**

- **FR-007**: The screen MUST render the **per-side damage totals** from `MatchResult.perSideDamageTotals`,
  and the totals shown MUST **equal** the result's totals with zero drift.
- **FR-008**: The screen MUST render **survivor counts** and the derived **units-killed / units-lost** per
  side (killed = 5 − enemy survivors; lost = 5 − own survivors, within the fixed 5-unit army) and a derived
  **average hull remaining** per side (from surviving machines' `SurvivedWithHullPct`).
- **FR-009**: The screen MUST render **per-machine fates** — for each machine, either **destroyed at tick
  T** (shown with its time) or **survived with N% hull** — from the `MatchResult` per-machine fates
  (`DestroyedAtTick(t) | SurvivedWithHullPct(p)`), keyed to the machine's identity (type + variant + side)
  via the replay `meta.unitOrder`.
- **FR-010**: The screen MAY render a **Match MVP** (the standout machine by damage dealt / kills / damage
  absorbed). Per-machine damage/kills/absorbed is **either** an extended per-machine result field **or**
  derived by a **single reduction over the linked replay's events** (O(events), never a re-simulation),
  consistent with Feature 1 SC-002 reconciliation; when unavailable, the MVP MUST be omitted gracefully.

**Ranking change (US4, §13)**

- **FR-011**: For a **ranked** match, the screen MUST render the viewer's **net-victory standing change**
  (delta + before→after), sourced from **Feature 7's ladder-standing update** (§13, FR-021 there) — read
  from the server, not computed on the client. For a **practice** match the screen MUST show **no** standing
  change and MUST label the match **unranked**. The v1 stake is **net victories**, not MMR (the mockup's MMR
  chrome is Feature 9's forward-looking layer).

**Actions & seams (US3)**

- **FR-012**: The screen MUST provide a **Watch Full Replay** action that hands off to **Battle Playback
  (Feature 5)** keyed to this match's stored replay reference; the summary MUST NOT itself mount a replay
  player or play the tick stream.
- **FR-013**: The screen MUST provide actions to **find the next opponent / rematch** (→ **Arena, Feature
  8**) and to **return** to the Arena/Garage, composing the Feature 3 shell nav; the primary action is the
  emphasized CTA per the mockup.

**Design system, responsiveness & accessibility (P7, Feature 3)**

- **FR-014**: The screen MUST render inside the **Feature 3 app shell** and compose only its **design tokens
  and primitives** ([design-tokens](../003-app-shell/contracts/design-tokens.md),
  [components](../003-app-shell/contracts/components.md)) — `Panel`, `StatBar`, `Stat`, `Chip`, `Button`,
  `SectionLabel`, `UnitIcon`, faction/zone tints — and MUST NOT reference raw brand hex.
- **FR-015**: The screen MUST be **first-class in both orientations (P7)**: a single-scroll stacked layout
  in **mobile portrait** (verified at 360px) and a multi-column layout in **desktop landscape** (verified at
  1440px), with **no horizontal page scroll** from 320px through ultra-wide.
- **FR-016**: The screen MUST honor **`prefers-reduced-motion`** (suppressing decorative reveal/glow/pulse
  animation) inheriting the Feature 3 baseline, and MUST convey every outcome fact (win/loss, condition,
  tier) by **text/label**, never by color or motion alone.
- **FR-017**: The screen MUST apply the **faction tints** consistently — viewer = friendly (cyan), opponent
  = enemy — and MUST show the opponent's identity (name/link) for a ranked match, **anonymizing** it for a
  practice-sandbox match (§16.1).

**Robustness (Principle V)**

- **FR-018**: The screen MUST render every enumerated result shape without missing/placeholder fields — a
  **Time-tiebreak-to-defender** result, a **total wipe** (0 survivors), an **all-survivors** game, a **2-0**
  (only two games) and a **2-1** (three games), and a **defeat** from the viewer's side.

### Key Entities *(include if feature involves data)*

This feature introduces **no new persisted entities**. It reuses Feature 1's result types (reference, do
not duplicate) and derives one **display-only** ViewModel. Full derivation mapping in
[data-model.md](./data-model.md); the ViewModel contract in
[contracts/view-model.md](./contracts/view-model.md).

- **MatchResult** *(Feature 1 — reused)*: `winner`, `games: GameResult[]`, per-machine fates, per-side
  damage totals, survivor counts. The authoritative input this screen reads. See
  [../001-battle-sim-core/data-model.md](../001-battle-sim-core/data-model.md).
- **GameResult** *(Feature 1 — reused)*: `winner`, `condition (Conquest | Time)`, `rewardTier (Full |
  Lesser)`, `durationTicks`. One per game in the Bo3.
- **BattleResult** *(Feature 1 — reused)*: per-game summary — `winCondition`, `perMachineFates
  (DestroyedAtTick | SurvivedWithHullPct)`, `perSideDamageTotals`, `survivorCounts`, `durationTicks`.
- **Replay `meta.unitOrder`** *(Feature 1 — reused)*: the `{ side, instanceId, typeId, variantId }` per-unit
  dictionary that names each machine for the per-machine fate rows and the MVP. See
  [../001-battle-sim-core/contracts/replay-format.md](../001-battle-sim-core/contracts/replay-format.md).
- **Ladder-standing delta** *(Feature 7 — read)*: the net-victory change (+delta, before→after) the summary
  displays for a ranked match; owned/computed by [Feature 7](../007-accounts-persistence/spec.md), not here.
- **BattleSummaryViewModel** *(new, display-only)*: the derived, presentation-ready structure the components
  render — outcome verdict, series, per-game rows, match totals, per-machine fates, optional MVP, optional
  standing delta, opponent, and the replay/next-opponent references. Defined in
  [data-model.md](./data-model.md).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Full-field representation** — for a battery of `MatchResult` fixtures, **100% of
  `MatchResult` fields** (winner; every `GameResult`'s winner/condition/rewardTier/durationTicks;
  per-machine fates; per-side damage totals; survivor counts) are represented in the rendered summary,
  verified by a unit test over the ViewModel derivation.
- **SC-002**: **Win-condition + tier unambiguous** — in 100% of games, a **Conquest/Full** game and a
  **Time/Lesser** game are distinguishable by **text label** (not color alone), and a Time-tiebreak win
  never renders as a Conquest.
- **SC-003**: **Totals equal the result** — the displayed per-side damage totals, survivor counts, and
  derived units-killed/lost equal the `MatchResult` values with **zero drift** (unit test).
- **SC-004**: **Both orientations first-class (P7)** — the summary renders with **zero horizontal page
  scroll** and all content reachable at **360px portrait** and **1440px landscape** (and at 320px min +
  ultra-wide), verified by automated both-orientation viewport tests.
- **SC-005**: **Result-shape coverage** — the **exact-tie→defender**, **2-0**, **2-1**, **all-survivors**,
  **total-wipe**, and **defeat-from-viewer's-side** cases each render correctly (correct winner, no missing
  fields) in 100% of the enumerated cases.
- **SC-006**: **Ranking-delta correctness** — a ranked win shows **+1 net victory** with the correct
  before→after; an attack loss shows no decrease; a **practice** match shows **no** standing change and is
  labeled unranked — matching Feature 7's standing update in 100% of cases.
- **SC-007**: **Reader, not simulator** — the summary triggers **no simulation and no tick playback**; the
  "watch replay" action targets this match's stored replay for Battle Playback (Feature 5), verified by
  test.
- **SC-008**: **Reduced motion & legibility** — with `prefers-reduced-motion`, decorative animation is
  suppressed and every outcome fact remains legible via text/label (verified by test).

## Assumptions

- **Viewer perspective**: the summary is shown to the player who just resolved the match (typically the
  attacker in async PvP). All "you vs them" framing derives from the **viewer's side**, so the same screen
  renders correctly whether the viewer is side A or B. *(Judgment call: a shared "match report" view for a
  defender reviewing an incoming attack is a Profile/Ladder concern, Feature 9/10, not this screen.)*
- **Net victories, not MMR, is the v1 stake** (§13): the mockup's `+24 MMR · 1486 → 1510` and the shell's
  `GOLD III · 1510 MMR` identity chrome are **forward-looking** (Feature 9 owns tiers/seasons/MMR, and
  Feature 3's data-model flags the labels as forward-looking). This screen renders the **net-victory
  delta**. Recorded as a decision in [research.md](./research.md).
- **MVP + per-machine damage seam**: `MatchResult`'s summary carries per-**side** damage totals and
  per-machine **fates**, but not necessarily per-machine **damage dealt / absorbed / kills**. The MVP and
  any per-machine damage figures are therefore **derived by a single reduction over the linked replay's
  event stream** (O(events), not a re-sim, consistent with SC-002) — or read from an extended per-machine
  result field if Feature 1 adds one. MVP is an **enhancement** (FR-010, MAY) that degrades gracefully.
- **Durations** are rendered in seconds at the ruleset **10 ticks/sec** (§9); the tick rate travels with the
  replay `meta` (Feature 1 replay-format).
- **Reward tier has no economic effect in v1** — the fuel/reward economy is backlogged (§16.1). Full/Lesser
  is displayed for **legibility of the win condition** (§9.3), not to drive a v1 reward.
- **Practice opponent hidden** (§16.1): a practice-sandbox match anonymizes the opponent and moves no
  standing (Feature 7 FR-019).
- **Persistence is Feature 7's**: the `MatchResult`, the stored replay reference, and the standing delta are
  fetched via [Feature 7](../007-accounts-persistence/spec.md); this feature does **not** design that
  storage — it references the seam at a high level.
- **Routing**: the summary is an authenticated route under the Feature 3 app group (e.g.
  `app/(app)/matches/[matchId]/summary/`), a Server Component that fetches the result server-side and passes
  the derived ViewModel down; any interactivity is a small client leaf ([`stacks/nextjs.md`](../../stacks/nextjs.md)).
- **Explicit non-goals (Principle IV)**: the **replay player/scrubber** (Feature 5 — linked, not built), the
  **engine/simulation** (Feature 1 — read, not run), the **ladder screen** with its leaderboard/tiers/
  seasons/MMR (Feature 9 — this shows only the delta), **persistence/storage** (Feature 7 — read via),
  **matchmaking / opponent selection / Bo3 orchestration** (Feature 8), and the **Garage** (Feature 4) /
  **Profile** (Feature 10) screens.
