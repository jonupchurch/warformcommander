# Feature Specification: Arena (async matchmaking) + Practice sandbox

**Feature Branch**: `008-arena-practice`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Feature 8 — the Arena (async ranked PvP) and the Practice sandbox.
The player picks an attack squad, is matched at random against another player's blind defense
snapshot, and the **server** resolves the best-of-3 authoritatively, records the match + replay,
and updates standings — then hands off to the Battle Summary / Playback. Practice faces a random
hidden squad with no stakes, refreshable at any time."

## Overview

This feature is the **orchestration layer of async PvP** — the glue that turns "a player, their
squad, and a live pool of frozen enemy defenses" into a recorded ladder result. It owns almost no
new state and no new rules; it **composes** two features that already exist as data-and-services:
the **Feature-1 battle engine** (`resolve(BattleInput) → BattleOutput`, run server-side via WASM)
and the **Feature-7 persistence layer** (the attack/defense pools, the immutable defense snapshots,
`recordMatch`, and the net-victory standings). See
[../001-battle-sim-core/contracts/engine-api.md](../001-battle-sim-core/contracts/engine-api.md)
and [../007-accounts-persistence/contracts/persistence-api.md](../007-accounts-persistence/contracts/persistence-api.md).

The value it delivers: **a fair, server-authoritative attack loop that is never empty.** A player
opens the Arena, sees a board they can read but whose behaviors are fogged, and hits *Deploy*. The
server picks the opponent, generates the seed, loads the live ruleset, runs the best-of-three, and
writes the result — the client never touches the outcome. Because every player's defense is a
frozen, always-available snapshot (and cold-start bots seed the pool), the ladder is renewable
content by construction (constitution
[P5](../../.specify/memory/constitution.md), [P6 — NON-NEGOTIABLE](../../.specify/memory/constitution.md)).

This feature is **not** the engine (Feature 1), **not** persistence internals (Feature 7 — it calls
that API), **not** the Garage (Feature 4), **not** the Ladder screen (Feature 9), and **not** the
Playback (Feature 5) or Summary (Feature 6) screens — it *hands off* to those by match id. Live
ruleset editing is Feature 12; this feature reads "the current ruleset" through a seam (see
Assumptions and the coordination note in [plan.md](./plan.md)).

Reference: design doc §3 (core loop), §9 (Bo3 + adaptation locked-in-ranked), §13 (fully random
matchmaking; ranking = net victories), §16.1/§16.2 (async ladder, practice sandbox, blind
snapshot served random and Bo3-locked). Screen shape: the
[Arena mockup](../../reference/Warform%20Commander%20Arena.dc.html).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attack: pick a squad, get matched, the server resolves and records the Bo3 (Priority: P1)

An authenticated player opens the Arena, picks one of their **attackable** squads, sees a matched
enemy defense board (composition, placement, power — behaviors fogged), and hits **Deploy · Best of
3**. The **server** selects the opponent, generates a seed, loads the live ruleset, runs the
best-of-three through the Feature-1 WASM engine with adaptation **Locked**, **records** the match +
replay and **updates standings** (via Feature-7 `recordMatch`), and returns a match id the client
uses to open the Battle Summary / Playback. The client never receives an outcome it could alter.

**Why this priority**: This is the whole feature's reason to exist and the load-bearing embodiment
of **P6 (server-authoritative, NON-NEGOTIABLE)**: a ranked result that is *computed and recorded on
the server, never submitted by the client*. Every other story is a facet of this one. It is the MVP:
even with a trivial opponent picker, a player can complete a fair, recorded ranked attack.

**Independent Test**: With a seeded DB (one real attacker + ≥1 cold-start bot defender), call the
attack orchestration for a chosen attackable squad; assert (a) exactly one `matches` row with
`mode='ranked'` is written, (b) its winner/games/damage reconcile with the returned replay, (c)
`ladder_standings` moved by the §13 rule, and (d) the returned handle is a match id, not a
client-trusted result object.

**Acceptance Scenarios**:

1. **Given** a player with ≥1 attackable squad and ≥1 eligible defender in the pool, **When** they deploy an attack, **Then** the server resolves a Bo3 via the WASM engine and returns a match id, and a `matches`+`replays` row is recorded with `mode='ranked'`.
2. **Given** a resolved ranked attack the attacker won, **When** the match records, **Then** the attacker's `attackWins` increments and the defender's `defenseLosses` increments, and `netVictories` recomputes (§13).
3. **Given** a resolved ranked attack, **When** the client requests the outcome, **Then** it fetches the **server-recorded** replay by match id (Feature-5 `getReplay`) — it is never handed a mutable result to trust.
4. **Given** a player with **zero** attackable squads (all designated as defense, or none saved), **When** they open the Arena to attack, **Then** deploy is blocked with a reason and no match is created.

---

### User Story 2 - Random matchmaking: anyone vs anyone, never self, never empty (Priority: P1)

The system matches the attacker against a **uniformly random eligible defender** — any *other*
player who has ≥1 active defense snapshot — with **no bracketing** (v1 is fully random; design §13).
The pool combines real players and **cold-start bot** accounts so it is **never empty** (P5). The
attacker is **always excluded** (never self-matched). The player may **skip** the previewed opponent
to re-roll a fresh random match before committing.

**Why this priority**: "Anyone has a shot at anyone," and a ladder that is *always attackable*, are
the v1 matchmaking promise (§13) and the P5 content guarantee. Co-equal P1 with US1 because an
attack with no fair opponent is no feature at all. Independently testable at the selection layer,
without resolving a battle.

**Independent Test**: Seed the DB with the attacker plus N other users (some `isBot`) each holding
1–3 active snapshots; run the selection K times; assert the attacker is never selected, every
selection returns an eligible non-self defender + exactly one of that defender's active snapshots,
and with only bots present the selection still succeeds (never empty).

**Acceptance Scenarios**:

1. **Given** a pool of eligible defenders, **When** matchmaking runs, **Then** it returns exactly one defender other than the attacker and one of that defender's **active** snapshots, chosen at random.
2. **Given** the attacker is the only real account and only cold-start bots have defenses, **When** matchmaking runs, **Then** it returns a bot defender (pool never empty), never the attacker.
3. **Given** a previewed opponent, **When** the player skips/re-rolls, **Then** a fresh random eligible opponent is served and **no** match is recorded and **no** standing changes.
4. **Given** the attacker's own account, **When** matchmaking runs any number of times, **Then** the attacker's own squads/snapshots are never served (no self-match).

---

### User Story 3 - Defense is served blind and locked for the Bo3 (Priority: P2)

The defender the attacker faces is **one of that defender's ≤3 active snapshots, chosen at random**
by the server — the attacker never gets to pick which snapshot, and the snapshot's **behavior
configuration is hidden** (only composition, placement, power, and derived tags are shown; behaviors
are fog, §3). That same immutable snapshot is used as the defender army for **all three games** of
the match (locked; §9, §16.2).

**Why this priority**: This is the async-fairness contract — a static defender that **cannot respond
mid-match** (P5/P6) and that the attacker cannot scout down to a favorable snapshot. P2 because it
rides on US1 (there must be a match to serve blind) but is independently assertable from the
recorded match + replay.

**Independent Test**: Resolve a ranked match against a defender with 3 active snapshots; assert (a)
the served `defenderSnapshotId` is one of the three, (b) all three game replays use the **identical**
defender army (byte-equal), and (c) the pre-battle preview payload contains no behavior-dial / Plan-B
fields of the served snapshot.

**Acceptance Scenarios**:

1. **Given** a defender with 3 active snapshots, **When** a match is served, **Then** exactly one snapshot is chosen at random and the attacker has no input into which.
2. **Given** a served snapshot, **When** the Bo3 resolves, **Then** all three games use that same immutable snapshot as the defender (`adaptation=Locked`), and the recorded match references one `defenderSnapshotId`.
3. **Given** the served snapshot, **When** the attacker views the pre-battle board, **Then** they see composition / placement / power / damage-family tags but **not** the opponent's dials, Plan-B triggers, or hidden logic.
4. **Given** the defender **re-designates** (a new snapshot) after the attacker was matched, **When** the match resolves, **Then** the attacker still faces the snapshot they were served (immutability; the new snapshot only affects future matches).

---

### User Story 4 - Practice: face a random hidden squad, refreshable, no stakes (Priority: P2)

A player enters **Practice**, faces a **random squad drawn from the DB** with its **identity
concealed**, and can **refresh** to a new random hidden opponent at any time before deploying. On
deploy the server resolves the battle (adaptation **Free**), records it as `mode='practice'`, and
**changes no standing**. The player can then watch the replay like any other battle.

**Why this priority**: Practice is the low-stakes on-ramp and the second consumer of the
player-as-content DB (§16.1). P2 because it reuses US1's resolution path with two differences
(mode, no standing) plus a hidden-identity draw; independently testable.

**Independent Test**: Run a practice match against a random DB squad; assert `matches.mode='practice'`,
`ladder_standings` is unchanged (0 delta), the opponent's identity is absent from every practice
response, and refreshing before deploy re-draws a different random squad with no side effects.

**Acceptance Scenarios**:

1. **Given** a player in Practice, **When** an opponent is drawn, **Then** it is a random squad from the DB with its owner/identity concealed.
2. **Given** a practice match resolves, **When** it records, **Then** `mode='practice'`, adaptation is `Free`, and **no** `ladder_standings` value changes.
3. **Given** a previewed practice opponent, **When** the player refreshes, **Then** a new random hidden squad is drawn with no match recorded and no stakes.
4. **Given** a completed practice match, **When** the player opens the result, **Then** they can watch the replay (Feature 5/6) while the opponent stays anonymous.

---

### User Story 5 - Server authority: a client cannot fabricate a result (Priority: P2)

The only thing a client contributes to a ranked match is **which of its own squads to attack with**
(and the intent to deploy). The **opponent, the seed, the ruleset, and the outcome are all decided
server-side.** A request that carries a fabricated result, winner, seed, or opponent is **ignored**;
the outcome is always recomputed by the server engine and written only through the server-internal
`recordMatch` path (Feature-7 trust-boundary rule A5).

**Why this priority**: P6 is NON-NEGOTIABLE and inseparable from the non-P2W promise (P1). Making
"the client cannot forge a result" an **independently adversarial** test — not just an implied
property of US1 — is how this feature proves ladder integrity. P2 because it hardens US1 rather than
adding a new user-visible path.

**Independent Test**: Submit a deploy request augmented with forged `result`/`winner`/`seed`/`opponentId`
fields; assert the server ignores them, resolves independently, and the recorded match matches the
server's own computation (not the forged values). Assert `recordMatch` has no client-reachable
surface.

**Acceptance Scenarios**:

1. **Given** a deploy request with an attached fabricated outcome, **When** the server handles it, **Then** it discards the client outcome, resolves the Bo3 itself, and records the server-computed result.
2. **Given** a deploy request that names a specific opponent or seed, **When** the server handles it, **Then** those fields are ignored and the opponent/seed are chosen server-side.
3. **Given** the persisted seed + armies + `rulesetHash` of a recorded match, **When** Feature-1 `resolve` is re-run, **Then** it reproduces the byte-identical replay (reproducible, server-authoritative — P6).

---

### Edge Cases

- **Zero attackable squads** — a player who has designated all squads to defense (or saved none) has an empty attack pool (`squads WHERE defenseSlot IS NULL` = ∅); deploy is blocked with a reason (Feature-7 US3-AS5). Practice, which draws the *opponent* from the DB, is unaffected by the attacker's pool.
- **No eligible real defender** — cold-start `isBot` accounts always hold active snapshots (Feature-7, P5), so the eligible pool is never empty; if it somehow were (no bots, no other players), the server returns a typed `NO_OPPONENT` error and **never** self-matches.
- **Self-exclusion** — the attacker's own snapshots (ranked) and own squads (practice) are excluded from selection; a single-account instance still gets a bot/other opponent, never itself.
- **Snapshot deactivated between preview and deploy** — the defender re-designates or undesignates in the preview→deploy window. Because snapshots are **immutable and retained while referenced** (Feature-7 FR-014), the server binds the served snapshot **by id** at deploy and resolves against that exact frozen row; the committed match stays valid and matches the board the attacker saw (see Assumptions for the considered alternative).
- **Attack squad designated to defense between preview and deploy** — the chosen attack squad leaves the attack pool; deploy re-validates attackability and rejects with a reason rather than resolving a now-illegal attack.
- **Concurrent attackers vs one snapshot** — snapshots are immutable read-only rows; many attackers can face the same snapshot simultaneously with no locking; each records its own match.
- **Practice changes no standing and hides identity** — a practice match writes `mode='practice'`, mutates no `ladder_standings` field, and never exposes the opponent's user/handle in any response.
- **Skip / refresh spam** — each re-roll is a fresh random DB read that records nothing and changes no standing (no fuel gate in v1; §11/§16.1 backlogged).
- **Client tries to submit an outcome** — a forged result/winner/seed/opponent is ignored; the server always recomputes and records via the server-only path (P6, A5).
- **Time / exact-tie games** — win-condition resolution (Conquest / Time-by-damage / exact-tie → defender) is entirely Feature-1's job; Feature 8 records whatever `winnerSide` the engine returns.
- **Ruleset changes mid-window** — the ruleset and its `rulesetHash` are bound once at resolve (deploy) time and recorded; a match is resolved under exactly one ruleset (no mid-match swap).
- **Engine/validation error on a stored config** — configs are validated on write by Feature 7, so this should not occur; if the engine returns a validation error, the server records nothing, changes no standing, and returns a typed error.

## Requirements *(mandatory)*

### Functional Requirements

**Attack selection & the trust boundary (Principle II, P6)**

- **FR-001**: The system MUST let an authenticated player choose one of their **attackable** squads (the attack pool = `squads WHERE defenseSlot IS NULL`, read via Feature-7 `listAttackable`) as the attacking army for a ranked match, and MUST block a player with **zero** attackable squads from attacking, with a reason.
- **FR-002**: The system MUST derive the attacker's identity from the **server session** (never a client-supplied user id) and MUST verify the chosen attack squad is owned by the session user and is currently attackable **at deploy time** (Feature-7 ownership rule A2).

**Random matchmaking (§13, P5)**

- **FR-003**: The system MUST select the ranked opponent by **fully random matchmaking** (v1, no bracketing): a uniformly random eligible **defender** — a user other than the attacker holding ≥1 **active** defense snapshot — drawn from the combined **real + cold-start-bot** pool so the pool is **never empty**.
- **FR-004**: The system MUST **never self-match** — the attacker's own account, squads, and snapshots are excluded from ranked selection and practice draws.
- **FR-005**: The system MUST serve exactly **one** of the selected defender's active snapshots, chosen **at random** (blind — the attacker never chooses which snapshot), using Feature-7's serve query (`defense_snapshots WHERE userId=? AND active`).
- **FR-006**: The system MUST let the attacker **skip / re-roll** the previewed opponent before committing, re-running matchmaking to a fresh random eligible defender; a skip records **no** match and changes **no** standing.

**Blind & locked (§9, §16.2, P5/P6)**

- **FR-007**: The system MUST **not** reveal the served snapshot's behavior configuration (dials, Plan-B triggers, hidden logic) in any pre-battle response; only composition, placement, power, and derived damage-family tags are exposed (fog, §3).
- **FR-008**: The system MUST use the **same** served snapshot as the defender army for **all three games** of the Bo3 (`adaptation=Locked`), and MUST bind the served snapshot **by id** so a snapshot deactivated after preview still resolves against the exact immutable frozen row it committed to (Feature-7 immutability + retention, FR-014).

**Server-authoritative resolution (P6 — NON-NEGOTIABLE)**

- **FR-009**: The system MUST resolve a ranked match **server-side** by invoking the Feature-1 WASM engine `resolve(BattleInput)` with `matchConfig = { adaptation: Locked, defenderSide: defender, bestOf: 3 }`, `armies = [attacker config, served snapshot config]`, a **server-generated seed**, and the **current live ruleset** — never trusting any client-supplied outcome, seed, opponent, or ruleset.
- **FR-010**: The system MUST generate the match **seed** server-side from a cryptographically-strong source, one per match, and persist it, so the match is reproducible and the client cannot influence the engine RNG.
- **FR-011**: The system MUST load "the current ruleset" at resolve time through a **single seam** (`loadCurrentRuleset()`), stamp the resolved match with the ruleset's hash, and treat that seam as the integration point for Feature-12's live editable ruleset store (coordination note — see Assumptions).
- **FR-012**: The system MUST **record** every resolved ranked match via Feature-7 `recordMatch(mode='ranked', …)` — writing the match summary, the replay, and provenance (seed, `rulesetHash`, `formatVersion`) and updating `ladder_standings` in one transaction — and MUST expose **no** client-reachable path that writes or alters a result (Feature-7 rule A5).
- **FR-013**: The system MUST, on deploy, resolve and record atomically and return a **match id**; the client obtains the outcome only by fetching the **server-recorded** replay/summary by that id (Feature 5/6), never as a trusted client payload.

**Practice sandbox (§16.1)**

- **FR-014**: The system MUST provide a **Practice** mode that draws a **random squad from the DB** (`squads`, self-excluded) as the opponent, **conceals** the opponent's identity in all responses, resolves server-side with `adaptation=Free`, records `mode='practice'`, and **changes no `ladder_standings` value**.
- **FR-015**: The system MUST let the player **refresh** the practice opponent at any time before resolving, re-drawing a new random hidden squad with **no** recorded match and **no** stakes.

**Orchestration boundary (Principle IV)**

- **FR-016**: The system MUST treat the engine and persistence as **external services it orchestrates** — it MUST NOT re-implement the engine (Feature 1), persistence/standings internals (Feature 7), or the Garage/Ladder/Playback/Summary screens (Features 4/9/5/6); it composes them and hands off by match id.

### Key Entities *(include if feature involves data)*

Feature 8 introduces **no new persistent tables** — it reads/writes the Feature-7 schema and speaks
the Feature-1 types. The entities below are the transient service shapes the orchestration passes
around (defined in [contracts/matchmaking-resolve-api.md](./contracts/matchmaking-resolve-api.md)):

- **RankedMatchRequest**: the *only* client-supplied inputs — `{ attackSquadId, ticketSnapshotId }` (the previewed snapshot to commit against). No user id, opponent, seed, ruleset, or outcome.
- **MatchmakingSelection**: the server-side selection result — `{ defenderUserId, defenderSnapshotId, poolSource: real|bot }` plus the served snapshot config (server-only). Blind + random.
- **MatchTicket / preview**: an opaque handle returned by preview that binds the served snapshot id for a later deploy (US3 / FR-008).
- **PracticeDraw**: `{ opponentSquadId, opponentConfig }` for a random DB squad with identity concealed.
- **BattleInput / BattleOutput** *(reused, Feature 1)*: `resolve(BattleInput) → { replay, result }`; see [engine-api](../001-battle-sim-core/contracts/engine-api.md). Not redefined here.
- **Ruleset + rulesetHash** *(reused, Feature 1)*: loaded via the ruleset seam; the balance table the engine reads.
- **Match / Replay / LadderStanding** *(reused, Feature 7)*: written/updated by `recordMatch`; see [data-model](../007-accounts-persistence/data-model.md). Not redefined here.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (server-authority — P6)**: **100%** of ranked results are computed by the server-side WASM engine and written via `recordMatch`; there is **no** code path that accepts a client-submitted match outcome, seed, opponent, or ruleset (verified by static review + an adversarial forged-request test).
- **SC-002 (locked snapshot)**: for **100%** of ranked matches, all three games use the identical served defender snapshot — one `defenderSnapshotId`, byte-equal defender army across the three game replays.
- **SC-003 (practice never mutates standings)**: across any number of practice matches, every `ladder_standings` delta is **0** (reconciled via Feature-7 SC-007), and no practice response contains the opponent's identity.
- **SC-004 (matchmaking never self / never empty)**: over a large batch of selections with ≥1 cold-start bot present, **0** self-matches and **100%** return an eligible non-self defender plus exactly one active snapshot.
- **SC-005 (standings move correctly)**: **100%** of recorded ranked matches update the attacker/defender counters per §13 (attacker win → `attackWins+1`; defender loss → `defenseLosses+1`; `netVictories` recomputed), reconcilable from `matches` (Feature-7 SC-007).
- **SC-006 (blind)**: the pre-battle preview payload contains **no** behavior-dial / Plan-B fields of the served snapshot, and the attacker has **no** input selecting which defender or which snapshot is served.
- **SC-007 (reproducible)**: every recorded ranked match persists a server-generated seed + `rulesetHash` + armies such that re-running Feature-1 `resolve` reproduces the **byte-identical** replay.
- **SC-008 (budget)**: a ranked Bo3 resolves **and** records within the Vercel Node function budget with wide margin (target well under a few seconds; ≪ the Fluid Compute 300 s default — a Bo3 is ≤3×1000 ticks × 10 units).
- **SC-009 (blocked attack)**: a player with **0** attackable squads is blocked from initiating an attack, with a reason, **100%** of the time, and no match is created.

## Assumptions

- **Practice self-exclusion**: the practice draw excludes the player's own squads (the opponent should be someone else's build). Judgment call; alternative — allowing a self-mirror for build-testing — is a deferred toggle.
- **Practice is recorded**: a practice match writes a `matches` row (`mode='practice'`) and a replay so the player can **watch** the result via Feature 5/6; it changes no standing and hides the opponent (Feature-7 FR-019). Alternative (not recording practice at all) was rejected because the player wants to review the battle.
- **`adaptation=Free` for practice** is passed as the mode flag per §9/§16.1. v1 practice auto-resolves the single submitted squad (no live between-game sideboard UX yet), so Free behaves as a no-stakes run; the Free capability leaves room for a future between-game sideboard without an engine change.
- **Ranked "skip opponent"** (the mockup's ↻ button) = re-roll matchmaking, allowed freely in v1 (no fuel gate; §11/§16.1 backlogged). It is a mild scouting affordance accepted per the mockup — the snapshot choice stays random and behaviors stay fogged, so it cannot be used to pick a *specific* easy defender.
- **Snapshot binding at deploy**: the served snapshot is bound by id at deploy and resolved against the immutable frozen row even if deactivated in the preview→deploy window (leverages Feature-7 immutability + retention). Considered alternative — reject + re-roll on deactivation — was set aside because it would swap the board out from under the attacker.
- **One seed per match**: the match seed is a fresh server-generated `u64`; the engine derives per-game RNG internally from it (one `resolve` call runs the whole Bo3). The client never supplies or sees the seed pre-resolution.
- **Live-ruleset-store dependency (COORDINATION NOTE)**: Feature-7's schema stores `rulesetHash` on `matches`/`replays` but defines **no ruleset table**; no shipped feature yet **owns the editable live ruleset the resolve path must read**. Feature 8 reads it via `loadCurrentRuleset()`, defaulting in v1 to a **committed default ruleset** (the Feature-1 seed ruleset). **Feature 12** (live base-stat editing, §16.2) — or an added Feature-7 `rulesets` store — must provide the editable source; the seam keeps Feature 8's resolve path unchanged when it lands. Flagged in [plan.md](./plan.md) Complexity Tracking.
- **MMR / tier labels** in the Arena mockup are forward-looking (Feature 9); v1's stake is **net victories** only (§13). Feature 8 surfaces net-victory-derived standing, not MMR.
- **Pool sources**: ranked serves from `defense_snapshots WHERE active`; practice draws from `squads` (all saved squads) — per the design's distinction (§16.1/§16.2).
- **Handoff, not ownership**: Feature 8 navigates to the Playback (Feature 5) / Summary (Feature 6) routes by match id; those features fetch the replay via Feature-7 `getReplay`. Feature 8 owns the Arena and Practice screens only (the [Arena mockup](../../reference/Warform%20Commander%20Arena.dc.html) is Feature 8's).
- **No fuel gate in v1**: attacks and practice are free/ungated (attack-fuel economy is backlogged, §11/§16.1).
