# Feature Specification: Admin Console + Balance Publishing

**Feature Branch**: `012-admin-console`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Admin console + live-ops publishing — a server-side-admin-gated
console where an admin edits the game's **base stats live** (the Tier-2 `Ruleset` the engine reads
at resolve time), un-versioned; each save recomputes `rulesetHash`, takes effect for the next match
immediately, and **auto-publishes a balance news post**; and a pushed code change **auto-publishes a
devlog/changelog post**. Owns the **live-ruleset store** (the persistence gap between Feature 7's
schema — which stores only `rulesetHash` on matches/replays — and Feature 8's resolve path, which
must load 'the current ruleset'). Post-accounts (Feature 7); gates on `users.role='admin'`."

## Overview

This is Warform Commander's **live-ops surface** — the admin-only console the human balancer uses to
tune the game and the two automatic publishers that keep the public **News** feed honest. It is the
last feature in the v1 set because it sits on top of accounts (Feature 7), the engine (Feature 1),
and the Arena resolve path (Feature 8).

It delivers three things, each independently valuable:

1. **A live balance editor.** An admin edits the **base stats / balance table** — Feature 1's
   Tier-2 [`Ruleset`](../001-battle-sim-core/data-model.md) (per-variant base stats, the equipment
   catalog deltas, the damage matrix, cadence tiers, air modifiers, and global constants) — and
   saves. The numbers the engine reads at resolve time change **immediately** for the *next* match,
   with **no redeploy** (design doc §16.2, constitution **P8**). The ruleset is **un-versioned** in
   the sense that matters (recorded replays never re-derive from it — they are self-contained via
   their stamped `rulesetHash` + full per-tick snapshots), so editing it live is safe.

2. **Auto-published balance news.** Every ruleset save **auto-inserts exactly one `posts` row**
   (`type='balance'`) summarizing the change — the human-readable diff in the body, the structured
   diff in `metadata` — with **no manual authoring** (design doc §16.2, **P4**).

3. **Auto-posted code-push devlog.** A pushed/deployed code change **auto-inserts a `posts` row**
   (`type='devlog'`/`changelog'`) from the commit metadata — the durable "code push → news" rule.

Two invariants sit above everything (**both never-waived**): the console is reachable and every
action is authorized **server-side** from the session/DB `users.role`, never a client flag
(constitution **P6**, **Principle II**); and the admin **tunes balance and fairness numbers — never
sells or grants power** (**P1**). The console has no store, no price, no power-grant surface; the
only thing it changes is the *ruleset*, which is the very lever that keeps the game non-P2W and fair.

**The load-bearing design contribution — the live-ruleset store.** Feature 1's engine takes the
`Ruleset` as a data **input** to `resolve(...)`. Feature 7's schema stores only the `rulesetHash`
*stamped on* each match/replay (provenance) — it has **no store of the live ruleset itself**.
Feature 8's resolve route needs to load "the current ruleset" to pass into `resolve`. **This feature
defines and owns that store**: an append-only `rulesets` revision table (the Tier-2 `Ruleset` as
`jsonb` + `rulesetHash` + editor + audit chain) plus a single **current-ruleset pointer** with an
optimistic-concurrency guard, read authoritatively on the resolve path. See
[data-model.md](./data-model.md).

### What this feature is NOT (explicit non-goals)

- **The balancer** (Feature 2) — it *runs the sim thousands of times and produces the fairness
  report the admin reads before tuning*; this console does not run it. The console **surfaces** the
  latest committed [BalanceReport](../002-auto-balancer/contracts/balance-report.md) read-only.
- **The game types / engine** (Feature 1) — the console edits the *values* of Feature 1's typed
  `Ruleset`; it does not define the schema or the resolution logic.
- **Rendering the public News** (Feature 11) — this feature *writes* `posts` rows; Feature 11 owns
  the News index + article pages that *read* them.
- **General persistence** (Feature 7) — this feature **adds** the two ruleset tables to Feature 7's
  `db/schema.ts` and **writes** `posts`/reads `users.role`; it does not own the auth adapter,
  squads, matches, replays, or standings.
- **Matchmaking / the Bo3 run loop** (Feature 8) — this feature provides `getCurrentRuleset()`;
  Feature 8 calls it, passes the ruleset into `resolve`, and records the `rulesetHash`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit the base stats live; the next battle uses them (Priority: P1) 🎯 MVP

A signed-in **admin** opens the balance editor, changes one or more base stats in the ruleset (e.g.
lowers *Grizzly* hull, raises the SAM Battery's anti-air damage, nudges the native-family bonus),
and saves. The save is **validated server-side**, a new ruleset **revision** is recorded, the
**current-ruleset pointer** flips to it, and its **`rulesetHash` is recomputed**. From that instant,
**the next match resolves against the new ruleset**. Any **already-recorded replay is byte-unchanged**
— the edit does not, and cannot, alter a replay that was already resolved (the un-versioned safety
property: replays are self-contained).

**Why this priority**: This is the feature's reason to exist and the piece that fills the
cross-feature gap (the live-ruleset store). Without it, balancing means a code change + redeploy per
tweak, defeating §16.2. It is the MVP: even alone, it is a complete, demonstrable live-ops lever.

**Independent Test**: Seed an initial ruleset and resolve a fixed battle (fixed armies + seed) →
observe result R1 stamped with `rulesetHash` H1, and persist its replay. As an admin, edit a stat
that affects that battle and save → assert a new revision + H2 (≠ H1) is now current. Resolve the
**same** armies + seed → assert the result/`rulesetHash` differs from R1/H1 (the edit took effect).
Re-read the **first** replay row → assert it is **byte-identical** (untouched).

**Acceptance Scenarios**:

1. **Given** an admin and the current ruleset, **When** they change a base stat and save, **Then** a
   new ruleset revision is recorded, the current pointer flips to it, and a new `rulesetHash` is
   computed and returned.
2. **Given** a saved edit, **When** the next match is resolved (Feature 8 calls `getCurrentRuleset()`),
   **Then** it resolves against the **new** ruleset and stamps the **new** `rulesetHash` on its
   match/replay.
3. **Given** replays recorded **before** an edit, **When** the edit is saved, **Then** those replay
   rows are **byte-unchanged** and remain valid (un-versioned safety — replays never re-derive).
4. **Given** an admin submits a **structurally invalid** ruleset (missing a required field, a
   multiplier out of bounds, a splash cap > 0.25, a dangling equipment reference), **When** they
   save, **Then** the write is **rejected with a reason before any persistence** and the current
   pointer is unchanged (it never points at an invalid ruleset).

---

### User Story 2 - Only server-verified admins can reach and use the console (Priority: P1)

The console and **every** action behind it — reading the editor, saving a ruleset, publishing —
require `users.role='admin'`, **re-checked server-side on every request** from the session/DB
(Feature 7's server-authoritative sessions). A normal player who navigates to `/admin`, or who
**forges an `admin` flag** in a cookie/body/query, or who calls an admin Server Action / route
directly, is **denied server-side**. The machine-to-machine code-push webhook is a *system* caller
with **no user session**; it is gated by a **verified shared secret**, never a role flag.

**Why this priority**: The trust boundary *is* the feature (constitution **P6** + **Principle II**,
both non-negotiable). Co-equal P1 with US1: a live balance lever with a soft gate is a fairness and
integrity hole. Independently shippable and testable before any editing UI exists.

**Independent Test**: Hit every admin route/action as (a) anonymous, (b) a signed-in **non-admin**,
(c) a non-admin with a **forged `admin` flag** in client state — assert all are denied server-side
(no state read, no write). Hit them as a real admin → assert allowed. POST the devlog webhook with a
**bad/absent secret** → denied; with the **correct secret** → accepted.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor, **When** they request `/admin` or any admin action, **Then** they
   are redirected to sign-in / denied (no admin data is read or written).
2. **Given** a signed-in non-admin, **When** they request any admin route or invoke an admin Server
   Action directly, **Then** the server denies it (403), **because the role is read server-side from
   the session/DB, not from the request**.
3. **Given** a non-admin who forges `admin` in a cookie/body/query, **When** the server evaluates
   authorization, **Then** the forged value is **ignored** and the request is denied.
4. **Given** an admin whose role is **revoked** (allowlist/DB), **When** they make their next
   request, **Then** admin access is denied **without** a re-login (server-authoritative sessions,
   Feature 7 SC-002).
5. **Given** the code-push webhook endpoint, **When** it is called with a missing/invalid secret,
   **Then** it is rejected (401) and no post is written; with a valid secret, it is accepted.

---

### User Story 3 - A ruleset edit auto-publishes exactly one balance news post (Priority: P2)

When an admin saves a ruleset change, the system **automatically** creates **one** `posts` row of
`type='balance'` (no manual authoring): a human-readable summary of what changed in the body (e.g.
"*Grizzly* hull 2000 → 1800 (−10%); SAM Battery air damage ×1.5 → ×1.7"), the **structured diff**
(changed leaf paths, old → new) in `metadata`, and the new `rulesetHash`/revision id for provenance.
The post is published so Feature 11's News index picks it up.

**Why this priority**: Auto-published balance news is half of §16.2's live-ops promise and the
player-facing transparency that supports the non-P2W/fairness brand (**P1/P4**). P2 because it rides
on US1 (there is no diff without a save).

**Independent Test**: Record the current ruleset. As an admin, change two stats and save. Assert
**exactly one** new `posts` row exists with `type='balance'`, `authorId` = the admin (or system),
`status='published'`, a body naming both changes, and a `metadata.diff` whose entries equal the two
changed paths (old → new). Save a **no-op** (identical) ruleset → assert **no** balance post is
created (nothing changed).

**Acceptance Scenarios**:

1. **Given** a ruleset save that changes N fields, **When** it commits, **Then** exactly one
   `posts` row (`type='balance'`, `status='published'`) is created with a summary body and a
   `metadata.diff` of the N changed paths (old → new value each).
2. **Given** the balance post, **When** Feature 11's News index is read, **Then** the post appears
   ordered by publish time (it is a normal published post).
3. **Given** an admin saves a ruleset **identical** to the current one, **When** it is processed,
   **Then** **no** balance post is created (and, per US1, no new current revision is required).
4. **Given** the balance post write fails, **When** the save transaction runs, **Then** the whole
   save **rolls back** (revision + pointer swap + post are one atomic transaction — a saved edit is
   never published without its post, and a post never exists without its edit).

---

### User Story 4 - A code push auto-publishes a devlog/changelog post (Priority: P2)

When code is **pushed and deployed** (a production deploy of a `main`-branch commit), the system
**automatically** creates a `posts` row of `type='devlog'` (or `changelog` for a tagged release)
from the **commit metadata** — SHA, message, author, compare link — with **no human author**
(`authorId` null). The trigger is a post-deploy hook (a GitHub Action step, or a Vercel
`deployment.succeeded` webhook) that POSTs to a **secret-gated** internal endpoint; the endpoint is
**idempotent by commit SHA** so a retried hook cannot double-post.

**Why this priority**: This is the durable "code push → news" project rule made mechanical (design
doc §16.2, MEMORY). P2 because it is independent of the ruleset editor and rides only on the
`posts` table + the secret gate.

**Independent Test**: POST the devlog endpoint (with the valid secret) a commit payload `{ sha,
message, author, compareUrl }` → assert one `posts` row (`type='devlog'`, `authorId` null,
`status='published'`) with the commit metadata in `body`/`metadata` and a slug derived from the SHA.
POST the **same** payload again → assert **no** duplicate (idempotent). POST with a bad secret →
assert 401 and no row.

**Acceptance Scenarios**:

1. **Given** a successful production deploy of a pushed commit, **When** the post-deploy hook fires,
   **Then** one `posts` row (`type='devlog'`/`changelog'`, `authorId` null, `status='published'`) is
   created carrying the commit SHA, message, author, and compare link.
2. **Given** the same commit SHA delivered twice (hook retry), **When** the endpoint processes it,
   **Then** the second call is a **no-op** (idempotent by SHA) — exactly one post per commit.
3. **Given** a request with a missing/invalid secret, **When** the endpoint is hit, **Then** it is
   rejected (401) and no post is written (system-caller trust boundary — no client flag, no user
   session).
4. **Given** a deploy that is **not** a production `main` push (a preview deploy), **When** the hook
   is evaluated, **Then** no devlog post is created (only real pushes post).

---

### User Story 5 - Surface the balancer's fairness report to inform tuning (Priority: P3)

Before tuning, an admin can view the latest committed **BalanceReport** (Feature 2) read-only inside
the console — the matchup win-rate table, the severity-sorted flagged combos with reasons, and the
four invariant pass/fails — so edits are informed by *proven* imbalance rather than guesswork. The
console does not run the balancer; it consumes the report's stable JSON seam.

**Why this priority**: A convenience that closes the balance loop (read the report → tune the
ruleset → auto-post the change). P3 because US1–US4 stand without it; it is a read-only panel over an
existing artifact ([balance-report.md](../002-auto-balancer/contracts/balance-report.md)).

**Independent Test**: Point the console at a fixture BalanceReport JSON; assert the editor page
renders the matchups, the flagged list (severity-sorted, with reasons), and the four invariants with
measured numbers/margins, and gates the panel behind the admin check.

**Acceptance Scenarios**:

1. **Given** a committed BalanceReport, **When** an admin opens the balance panel, **Then** it
   renders the report's matchups, flagged combos (worst-first, with reasons), and invariant
   pass/fails — read-only.
2. **Given** no report is available, **When** the panel loads, **Then** it states that clearly and
   still allows editing (the report is advisory, not a gate).

---

### Edge Cases

- **Forged admin flag / non-admin caller**: every admin route + Server Action re-checks
  `session.user.role === 'admin'` server-side; a client-supplied `admin` value is ignored (US2). The
  `proxy.ts` `/admin` guard is a **UX redirect only** — the handler/action check is the real
  security boundary (never rely on middleware alone; see research on CVE-2025-29927).
- **Invalid ruleset edit**: rejected by `validateRuleset()` **before** any write; the current
  pointer is never advanced to a ruleset that would make `resolve` error (US1-AS4).
- **In-flight vs. recorded replays under an edit**: a match already **resolved** has a stored replay
  that is **byte-unchanged** by any later edit (self-contained; un-versioned safety). A match
  **being resolved** used the ruleset it read at its own resolve time; an edit takes effect for the
  **next** `getCurrentRuleset()` read — never mid-resolve (the resolve reads the ruleset once).
- **Two admins editing concurrently**: each save carries the `version` it loaded; the pointer swap
  is guarded by `WHERE version = expectedVersion`. The second (stale) save is rejected with a
  `STALE_EDIT` conflict — **no silent lost update** to the balance table — and the admin is told to
  reload and re-apply (US1 concurrency; SC-007).
- **No-op save**: a ruleset identical to the current one produces no new revision and **no** balance
  post (US3-AS3).
- **Balance-post write failure mid-save**: the whole save (revision + pointer swap + post) is one
  transaction and rolls back together (US3-AS4).
- **Code push with no user author / a system deploy**: the devlog post has `authorId = null`
  (nullable per Feature 7 `posts`); the schema allows it (US4).
- **Duplicate deploy webhook (retry)**: idempotent by commit SHA (slug uniqueness) → exactly one
  devlog post per commit (US4-AS2).
- **Cold start (no ruleset yet)**: a bootstrap seed inserts the initial ruleset revision (from
  Feature 1's first-pass stats) with `editorId = null` and points `current_ruleset` at it, so
  `getCurrentRuleset()` is never empty (analogous to Feature 7's cold-start seeded defenders).
- **Stale read after a save**: the resolve path reads the current ruleset **authoritatively from
  Postgres** (single source of truth), so a saved edit is visible to the **very next** match with
  no per-instance stale window (SC-008); read-heavy display surfaces may cache with a tag busted on
  save.
- **Both orientations**: the editor (a dense stat table) and the report panel are usable in
  **mobile portrait and desktop landscape** (constitution **P7**) — the table scrolls within its own
  container, never the page body.

## Requirements *(mandatory)*

### Functional Requirements

**Admin gate (server-authoritative — P6, Principle II)**

- **FR-001**: The system MUST restrict the admin console and **every** admin action to users whose
  `users.role` is `admin`, evaluated **server-side** from the session/DB on **every** request
  (Feature 7 auth), never from any client-supplied value.
- **FR-002**: The system MUST guard the `/admin` route segment (a `proxy.ts`/layout redirect for UX)
  **and independently** re-check the role inside every admin Server Action and route handler
  (defense-in-depth — the handler check is the security guarantee, not the proxy).
- **FR-003**: The system MUST deny anonymous callers, non-admins, and requests carrying a forged
  `admin` flag; a role **revocation** MUST take effect on the next request with no re-login.
- **FR-004**: The system MUST gate the machine-to-machine code-push webhook with a **verified shared
  secret** (or signature), NOT a user role, since it has no user session; a bad/absent secret MUST
  be rejected.

**Live-ruleset store (the owned coordination gap — P8)**

- **FR-005**: The system MUST persist the **live ruleset** — Feature 1's Tier-2 `Ruleset` — as typed
  `jsonb`, with its `rulesetHash`, in a store this feature adds to Feature 7's schema (an append-only
  `rulesets` revision table + a single **current-ruleset pointer**). It MUST NOT normalize the
  `Ruleset` into per-field SQL (P8 — one source of truth, no drift with Feature 1's types).
- **FR-006**: The system MUST expose `getCurrentRuleset()` returning the current `Ruleset` + its
  `rulesetHash` + revision id, read **authoritatively** (no stale window) — the seam Feature 8's
  resolve route calls to obtain the `ruleset` it passes into `resolve` and the `rulesetHash` it
  records on the match/replay (Feature 7 provenance columns).
- **FR-007**: The system MUST compute `rulesetHash` using **Feature 1's canonical hash** of the
  ruleset (the exact function the engine stamps on replays), never a bespoke hash — so the hash the
  store records equals the hash a match resolved against that ruleset stamps.
- **FR-008**: The system MUST keep the ruleset **un-versioned for the engine**: recorded replays
  MUST never re-derive from the current ruleset (they are self-contained via their stamped
  `rulesetHash` + full snapshots). The `rulesets` revision history exists for **audit and diffing
  only**, not replay reconstruction.
- **FR-009**: The system MUST seed an **initial** ruleset revision at bootstrap (from Feature 1's
  first-pass stats) and point `current_ruleset` at it, so `getCurrentRuleset()` is never empty.

**Live editing & validation (trust boundary — P6, Principle II, P4)**

- **FR-010**: The system MUST let an admin **read** the current ruleset for editing (with the
  concurrency `version`) and **save** an edited ruleset; on save it MUST record a new revision, flip
  the current pointer to it, and recompute `rulesetHash` — taking effect for the **next** match.
- **FR-011**: The system MUST **validate** an edited ruleset server-side **before** any persistence
  (`validateRuleset()`: required fields present, references resolvable, numeric bounds honored — e.g.
  splash cap ≤ 0.25, probabilities/fractions in [0,1], cadence tiers present) and MUST reject an
  invalid ruleset with a reason, leaving the current pointer unchanged.
- **FR-012**: The system MUST guard **concurrent edits** with optimistic concurrency: a save carries
  the `version` it loaded and the pointer swap MUST apply only if the stored version still matches;
  a stale save MUST be rejected (`STALE_EDIT`) with **no lost update**.
- **FR-013**: A save MUST be **atomic** — the new revision, the pointer swap, and the auto-published
  balance post commit together or not at all (one transaction).

**Auto-published balance news (§16.2)**

- **FR-014**: On a ruleset save that changes ≥1 field, the system MUST **auto-insert exactly one**
  `posts` row (`type='balance'`, `status='published'`) — no manual authoring — with a human-readable
  summary body and a **structured diff** (changed leaf paths, old → new) in `metadata`, plus the new
  `rulesetHash`/revision id.
- **FR-015**: A **no-op** save (ruleset identical to current) MUST create **no** balance post and no
  new current revision.
- **FR-016**: The balance diff MUST be computed as a deep comparison of the previous vs. new
  `Ruleset` and rendered legibly (path + old → new, with percent deltas where meaningful).

**Auto-posted code-push devlog (§16.2, durable project rule)**

- **FR-017**: On a **production deploy of a pushed commit**, the system MUST **auto-insert** a
  `posts` row (`type='devlog'`, or `changelog` for a tagged release) with `authorId` null, carrying
  the commit SHA, message, author, and a compare link in `body`/`metadata`, published to the News
  feed.
- **FR-018**: The devlog trigger MUST be a post-deploy hook (a GitHub Action step and/or a Vercel
  `deployment.succeeded` webhook) POSTing to a **secret-gated** internal endpoint; the endpoint MUST
  be **idempotent by commit SHA** (a retried hook creates no duplicate) and MUST post **only** for
  real pushes (not preview deploys).

**Balance report surface (advisory — P4)**

- **FR-019**: The system SHOULD surface the latest committed **BalanceReport** (Feature 2) read-only
  in the console (matchups, severity-sorted flags with reasons, the four invariants with measured
  numbers/margins), gated behind the admin check; it MUST NOT run the balancer or mutate the report.

**Non-P2W posture (P1)**

- **FR-020**: The console MUST expose **only** balance/live-ops surfaces (ruleset editing, news
  publishing, report reading). It MUST NOT provide any surface that sells, grants, or per-account
  boosts power (no store, no price, no per-user stat grant) — the only thing it changes is the
  shared ruleset (P1, never waived).

### Key Entities *(include if feature involves data)*

New (owned by this feature; full columns in [data-model.md](./data-model.md)):

- **Ruleset Revision** (`rulesets`): an append-only record of one saved ruleset — the Feature-1
  Tier-2 `Ruleset` as typed `jsonb`, its `rulesetHash`, the editing admin (`editorId`, nullable for
  system/seed), the parent revision it was edited from (audit chain), an optional note, and a
  timestamp. History for audit + diffing; **never** a replay-reconstruction dependency (FR-008).
- **Current-Ruleset Pointer** (`current_ruleset`): a **singleton** row naming the active revision
  plus an optimistic-concurrency `version`. The single source of truth `getCurrentRuleset()` reads
  and `saveRuleset()` swaps.

Reused by reference (defined elsewhere; not redefined here):

- **`Ruleset`** + **`rulesetHash`** — Feature 1 Tier-2
  ([001 data-model → Ruleset](../001-battle-sim-core/data-model.md)); stored verbatim as `jsonb`.
- **`users.role`** (`player`|`admin`) — Feature 7 the admin gate
  ([007 data-model → users](../007-accounts-persistence/data-model.md),
  [auth contract](../007-accounts-persistence/contracts/auth.md)).
- **`posts`** (`type ∈ {editorial, balance, devlog, changelog}`, nullable `authorId`, `metadata`
  jsonb) — Feature 7; this feature writes `balance`/`devlog`/`changelog` rows
  ([007 data-model → posts](../007-accounts-persistence/data-model.md)).
- **BalanceReport** — Feature 2 read-only seam
  ([balance-report.md](../002-auto-balancer/contracts/balance-report.md)).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Server-verified admin only** — 100% of enumerated non-admin, anonymous, and
  forged-`admin`-flag attempts against **every** admin route/action are denied server-side (no state
  read, no write); a role revocation denies on the next request with no re-login; a bad-secret
  webhook call is rejected.
- **SC-002**: **A saved edit changes the next resolution and recomputes the hash** — after a save,
  `getCurrentRuleset()` returns the new revision, and resolving a fixed battle (fixed armies + seed)
  yields a result whose stamped `rulesetHash` equals the new revision's hash and differs from the
  pre-edit run.
- **SC-003**: **Recorded replays are byte-unchanged by an edit** — for any replay recorded before a
  ruleset save, its stored bytes show **zero** change after the save (un-versioned safety), in 100%
  of tests.
- **SC-004**: **Exactly one balance post per changing save** — every ruleset save that changes ≥1
  field creates exactly one `type='balance'` published post whose `metadata.diff` equals the set of
  changed paths (old → new); a no-op save creates none.
- **SC-005**: **A code push auto-publishes exactly one devlog** — a valid post-deploy hook creates
  exactly one `type='devlog'`/`changelog'` post per commit SHA (idempotent on retry); a bad-secret
  or preview-deploy call creates none.
- **SC-006**: **No invalid ruleset persisted** — 100% of enumerated invalid ruleset edits are
  rejected before any write; the current pointer is never advanced to an invalid ruleset.
- **SC-007**: **Concurrent-edit safety** — in a race where two admins save from the same loaded
  version, exactly one succeeds and the other is rejected (`STALE_EDIT`) with no lost update, in
  100% of race tests.
- **SC-008**: **Fresh authoritative read** — after a save commits, the very next `getCurrentRuleset()`
  (as the resolve path calls it) returns the new revision with no stale window (0 stale reads on the
  authoritative path).

## Assumptions

- **Post-accounts.** Feature 7 (accounts, sessions, `users.role`, `posts`) exists; this feature
  reuses its server-authoritative session + role and its `posts` table, and **adds** the two ruleset
  tables to the same `db/schema.ts` on the same postgres-js/Drizzle wiring. Recorded in
  [data-model.md](./data-model.md).
- **"Un-versioned" reconciled.** The design doc calls the ruleset "un-versioned (safe)." That
  property is about the **engine**: recorded replays never re-derive from it, so no old-version
  migration is ever needed. This feature keeps an **append-only revision history** purely for admin
  **audit + diffing**; it is not a replay dependency and does not re-introduce versioned resolution.
  Recorded as a decision in [research.md](./research.md).
- **`rulesetHash` is Feature 1's.** The store computes the hash via Feature 1's canonical
  serialization + hash (shared function), so the store's recorded hash equals the hash the engine
  stamps on a replay resolved against that ruleset. If Feature 1 does not yet expose it standalone,
  exposing `hashRuleset(ruleset)` is a small coordinated addition.
- **Authoritative, mostly-uncached resolve read.** Because serverless instances don't share memory
  and Next's `revalidateTag` is per-instance, the **resolve path reads the current ruleset from
  Postgres** (a single tiny indexed row) rather than a warm in-process cache — guaranteeing no stale
  window (P6). Read-heavy *display* surfaces may use the Data Cache tagged `ruleset-current`, busted
  on save. Recorded in [research.md](./research.md).
- **Mutations are Server Actions; the webhook is a Route Handler.** Matching Feature 7's `src/server/`
  service style and `stacks/nextjs.md` (Server Actions for owned mutations; Route Handlers for
  webhooks / machine-to-machine).
- **Editor scope.** The editor exposes the **base-stats / balance table** the admin actually tunes
  (per-variant base stats, equipment deltas, the damage matrix, cadence tiers, air mods, globals).
  Exhaustive data entry of every variant/module is a data task, not this feature; the editor edits
  whatever the `Ruleset` contains.
- **Devlog trigger mechanism.** Primary = a GitHub Action post-deploy step on `main` POSTing commit
  metadata to the secret-gated endpoint; alternative = a Vercel `deployment.succeeded` webhook to the
  same endpoint. Both are equivalent to the endpoint; either can ship. Recorded in
  [research.md](./research.md).
- **Balance report source.** Feature 2 emits committed report files (`balance-reports/`); the console
  reads the latest. Persisting reports as rows is out of scope (Feature 2 non-goal) and not required.
- **UI reuse.** The console is built from Feature 3's shell + primitives + tokens
  ([components](../003-app-shell/contracts/components.md),
  [design-tokens](../003-app-shell/contracts/design-tokens.md)); both orientations first-class (P7).
