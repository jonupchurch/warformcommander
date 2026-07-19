# Feature Specification: Accounts & Persistence

**Feature Branch**: `007-accounts-persistence`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Accounts & Persistence — the backend/DB layer for Warform
Commander. Google-OAuth accounts (players + a server-side admin role), a persistent data
model (rosters of saved squads, immutable defense snapshots, battle results + stored replays,
net-victory ladder standings, and the unified news posts system), all on Neon Postgres via
Drizzle. The engine (Feature 1) is stateless; this is where state lives."

## Overview

Feature 1 is a **pure, stateless** `resolve(armies, ruleset, seed) → Replay`. It knows
nothing about who is playing, what they saved, or who won yesterday. **This feature is where
all of that state lives** — it is the backend/DB layer the async-PvP product stands on
(design doc §16, §16.1, §16.2).

It delivers five things, each independently valuable:

1. **Identity** — sign in with Google (all users), server-side sessions, and a server-side
   **admin role** (an allowlist on a Google account) that Feature 12 gates on. Direct email
   login is architected-for as a fast-follow.
2. **Rosters** — a player saves up to **8 squads** (a *squad* = one full 5-unit army, stored
   as the typed config from Feature 1's data model), expandable to 64 later via a non-P2W
   storage-slot bundle (backlogged).
3. **Defense with snapshot semantics** — a player designates up to **3 squads** as base
   defense; each is **snapshotted** (an immutable copy) at designation time, so editing the
   live squad afterward never mutates an in-flight defense. Defense squads are **not available
   for attacking** (mutually-exclusive pools). This is the persistence that makes P5
   (player-as-content) real.
4. **Battle results + replays** — every resolved match is recorded from day one (§16.1):
   a summary row plus the full **random-access replay stored as `jsonb`** with scalar
   provenance columns (seed, rulesetHash, formatVersion, winner), honoring Feature 1's
   [replay-format contract](../001-battle-sim-core/contracts/replay-format.md).
5. **Ladder standing + news** — **net-victory** standings (attack wins − defense losses,
   §13) as the persistence substrate the Ladder/Profile screens read, and the **unified
   posts** table (§16.2) that editorial news (Feature 11) and admin/auto-published balance &
   devlog posts (Feature 12) both write to.

The value it delivers: **a stateful, server-authoritative account and persistence layer** —
the single schema that Features 8 (Arena/matchmaking), 9 (Ladder), 10 (Profile), and 12
(Admin) all read and write. Because so many features bind to it, its data model must be right
before they are built (constitution P6, P8, Principle VII).

### What this feature is NOT (explicit non-goals)

Feature 7 provides the **data + auth**; the *logic* that consumes them is other features.

- **Matchmaking / Arena logic** (pick a random defender, serve a blind snapshot, run the Bo3,
  the practice sandbox draw) → **Feature 8**. Feature 7 provides the tables and the
  designate/record operations it calls.
- **Ladder seasons, tiers, MMR, and the leaderboard UI** → **Feature 9**. Feature 7 provides
  the net-victory standing substrate; MMR/tiers/seasons layer on top later.
- **Profile UI** (career stats, achievements screen) → **Feature 10**. Feature 7 provides the
  underlying results/standings/badges data.
- **Admin console UI + live ruleset editing + auto-post triggers** → **Feature 12**. Feature 7
  provides the `posts` table and the `role='admin'` flag it gates on.
- **MTX squad-slot bundles (+8 → 64) and the fuel economy** → **backlogged** (§16.1). The
  8-slot baseline ships; the schema leaves room to raise the cap.
- **The Garage editor UI** (Feature 4) and **battle playback** (Feature 5) — Feature 7 stores
  the squad config and the replay those features produce/consume.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in with Google, with a server-side admin role (Priority: P1)

A visitor signs in with their Google account. On first sign-in an account is created; on
return the same account is recognized. A **server-side session** is established (the server,
not the client, is the source of truth for who someone is). Some accounts carry an **admin
role**, set from a server-side allowlist — used only server-side to gate Feature 12. A normal
player can never elevate themselves to admin by manipulating client state.

**Why this priority**: Identity is the root dependency — a roster, a defense, a match result,
a standing all belong to *a user*. Nothing else in this feature (or Features 8–12) can be
built or tested without it. It is the MVP slice.

**Independent Test**: Complete a Google OAuth round-trip against a test/dev instance; assert a
`users` row and an `accounts` row are created and a session exists. Sign in again; assert no
duplicate user. Flip an account to `admin` in the allowlist; assert the server sees the role
and a non-admin session does not — and that no client-supplied value can change the verdict.

**Acceptance Scenarios**:

1. **Given** a new visitor, **When** they complete Google sign-in, **Then** a `users` row (with
   their Google profile) and a linked `accounts` row are created and a server-side session is
   returned.
2. **Given** a returning user, **When** they sign in again with the same Google account, **Then**
   they are matched to the existing `users` row (no duplicate account).
3. **Given** a Google account on the admin allowlist, **When** they sign in, **Then** their
   `users.role` is `admin` and server-side admin checks pass.
4. **Given** a normal player's session, **When** a request forges an `admin` flag in client
   state (cookie/body/query), **Then** the server ignores it and the authorization check fails
   (role is read server-side from the session/DB, never from the request).
5. **Given** an admin whose role is revoked in the allowlist/DB, **When** they make their next
   request, **Then** the server denies admin access **without** requiring them to sign in again
   (server-authoritative sessions).

---

### User Story 2 - Save and load a roster of squads (Priority: P1)

A signed-in player builds a 5-unit army in the Garage and **saves** it into one of their 8
roster slots under a name. They can **load**, **rename**, **overwrite**, and **delete** their
saved squads. A squad is stored as the exact typed config Feature 1's data model defines, and
is **validated** (by the same shared `validate()` the engine uses) before it is written — an
illegal army never reaches the database.

**Why this priority**: The roster is the core player-owned asset and the thing a defense
designation and an attack both draw from. Co-equal P1 with identity.

**Independent Test**: As a signed-in user, save a valid 5-unit squad into slot 0; read it back
and assert the config round-trips exactly. Attempt to save an illegal squad (6 units / zone-cap
breach); assert it is rejected with a reason and nothing is written. Attempt to save a 9th
squad; assert the 8-slot cap is enforced. Attempt to read/modify another user's squad; assert
it is denied server-side.

**Acceptance Scenarios**:

1. **Given** a signed-in user and a valid 5-unit army, **When** they save it to an empty slot,
   **Then** a `squads` row is written with the typed config and its derived power rating, and it
   loads back byte-for-byte.
2. **Given** a saved squad, **When** the user renames or overwrites it, **Then** the change
   persists and `updatedAt` advances.
3. **Given** a submitted army that fails validation (wrong size, zone-cap breach, mount-illegal
   equipment, duplicate utility, excess Plan-B), **When** the user tries to save it, **Then** the
   write is rejected with the validation reason and no row is created.
4. **Given** a user with 8 saved squads, **When** they try to save a 9th, **Then** the write is
   rejected (baseline cap) with a message that more slots are a future unlock.
5. **Given** user A's squad, **When** user B attempts to load, edit, or delete it, **Then** the
   server denies the operation (ownership checked server-side).

---

### User Story 3 - Designate defense with immutable snapshots (Priority: P1)

A player designates up to **3** of their saved squads as base defense. At the moment of
designation each is **snapshotted** — an immutable frozen copy of its config. From then on,
editing the live squad in the Garage **does not** change the snapshot an opponent is fighting;
to update a defense the player must re-designate (taking a fresh snapshot). A squad that is
currently designated for defense is **removed from the attack pool** (a player needs ≥1
non-defense squad to attack). Matchmaking (Feature 8) later serves one of a defender's ≤3
snapshots blind-random and locked for the Bo3 — this feature guarantees the snapshot it serves
is stable and immutable.

**Why this priority**: Immutable defense snapshots are what make async PvP fair against a
static defender (§9 adaptation rule, P5/P6) and are the single trickiest piece of persistence
in the game. Getting the snapshot/exclusivity semantics right is core to the feature.

**Independent Test**: Designate squad S to a defense slot; assert an immutable
`defense_snapshots` row is created and S leaves the attack pool. Edit S's live config; assert
the snapshot is unchanged. Re-designate S; assert a new snapshot captures the edit and the old
one is deactivated. Attempt to designate a 4th squad; assert the ≤3 cap is enforced. Undesignate
S; assert it returns to the attack pool.

**Acceptance Scenarios**:

1. **Given** a saved squad and an open defense slot, **When** the user designates it for
   defense, **Then** an immutable snapshot of its current config is created and the squad is
   marked as a defender (excluded from the attack pool).
2. **Given** a designated squad with a live snapshot, **When** the user edits the source squad
   in the Garage, **Then** the snapshot's config is **unchanged** (edits do not propagate to an
   in-flight defense).
3. **Given** a designated squad, **When** the user re-designates it, **Then** a **new** snapshot
   captures the current config and the previous snapshot is deactivated (immutability preserved —
   the old row is never mutated).
4. **Given** a user with 3 active defense designations, **When** they try to designate a 4th,
   **Then** the operation is rejected (≤3 cap enforced structurally).
5. **Given** a designated squad, **When** the user requests their attackable squads, **Then**
   the designated squad is **not** in the list; **and** a user with all squads designated has an
   empty attack pool and is told they need a free squad to attack.
6. **Given** a defense snapshot that is referenced by an in-flight or historical match,
   **When** the user undesignates or deletes the source squad, **Then** the snapshot row is
   retained for replay/provenance (soft-deactivated, never destroyed while referenced).

---

### User Story 4 - Persist battle results and replays (Priority: P2)

When the server resolves a match (ranked, via Arena; or a practice-sandbox game), it **records
the outcome**: a summary row (mode, participants, Bo3 score, winner, seed, rulesetHash,
formatVersion) and the **full replay** stored as `jsonb`, from day one (§16.1). The stored
replay is a valid Feature-1 replay the Battle Playback (Feature 5) can load and scrub, and the
scalar provenance columns let the server select/gate replays without parsing the blob. Because
seed + army inputs + rulesetHash are persisted, an old replay whose `formatVersion` is no longer
supported can be **regenerated** server-side rather than migrated.

**Why this priority**: Results/replays are stored from the start, but the *producer* of them is
the server-side sim invoked by the Arena (Feature 8); this feature provides the schema and the
record operation. P2 because Stories 1–3 define the participants a result references.

**Independent Test**: Record a resolved match (from a fixture replay) with its provenance;
read it back and assert the `jsonb` replay parses to a valid `Replay` with a supported
`formatVersion`, and that the scalar columns (seed, rulesetHash, winner) equal the values inside
the replay's `meta`. Query results for a user without deserializing any blob.

**Acceptance Scenarios**:

1. **Given** a resolved Bo3 match and its replay, **When** the server records it, **Then** a
   summary row and a `jsonb` replay row are written with matching provenance (seed, rulesetHash,
   formatVersion, winner) and are linked 1:1.
2. **Given** a stored replay, **When** it is read back, **Then** the `jsonb` deserializes to a
   valid `Replay` and the Battle Playback reader can index `snapshots[tick]` in O(1) (Feature 1
   SC-002).
3. **Given** a stored match, **When** the server filters results by user / mode / winner,
   **Then** it uses the scalar columns and never parses the replay blob.
4. **Given** a replay whose `formatVersion` is below the supported range, **When** it is
   requested for playback, **Then** the server can re-emit it from the persisted seed + armies +
   rulesetHash (regenerate-not-migrate) rather than failing.
5. **Given** a practice-sandbox match, **When** it is recorded, **Then** the opponent's identity
   is stored but marked so downstream screens can keep it **hidden** (§16.1), and the match is
   flagged `practice` so it does **not** affect ladder standing.

---

### User Story 5 - View net-victory ladder standing (Priority: P2)

A player's **standing** is their **net victories = attack wins − defense losses** (§13):
winning an attack adds, losing on defense subtracts. The persistence layer maintains each
user's standing as ranked matches resolve, so the Ladder (Feature 9) and Profile (Feature 10)
can read a leaderboard and a career record without recomputing from every match. The standing
is always reconcilable from the `matches` source of truth.

**Why this priority**: The standing is the ladder's v1 stake, but the tiers/seasons/MMR that
dress it are Feature 9. P2 because it derives from Story 4's recorded results.

**Independent Test**: Record a sequence of ranked results (attacker wins, defender losses) and
assert each user's stored `netVictories` equals `attackWins − defenseLosses` recomputed from
`matches`. Assert practice matches move nothing. Read the top-N leaderboard ordered by net
victories.

**Acceptance Scenarios**:

1. **Given** a ranked match the attacker wins, **When** it is recorded, **Then** the attacker's
   `attackWins` and `netVictories` increment and the defender's `defenseLosses` increments and
   their `netVictories` decrements.
2. **Given** a recorded history, **When** standings are recomputed from `matches`, **Then** each
   user's stored standing equals the recomputed value (cache reconciles with source of truth).
3. **Given** a practice-sandbox match, **When** it is recorded, **Then** no user's standing
   changes.
4. **Given** many users with standings, **When** the leaderboard is queried, **Then** users are
   returned ordered by net victories (the Ladder/Profile read path).

---

### Edge Cases

- **Concurrent squad edit vs in-flight defense**: a player edits a squad in one tab while a
  snapshot of it is being fought in a match. The snapshot is a copy, so the edit is isolated by
  construction; the match resolves against the frozen snapshot (US3-AS2).
- **Concurrent designation race**: two requests try to fill the same/last defense slot at once.
  Designation runs in a transaction; the partial-unique constraint on active defense slots
  rejects the loser deterministically (no 4th active snapshot, no duplicate slot).
- **Attack/defense pool exclusivity boundary**: designating a squad removes it from the attack
  pool atomically; a user whose every squad is designated has **0 attackable squads** and is
  told to free one before attacking (US3-AS5).
- **Deleting a source squad that has a defense snapshot or match history**: the squad may be
  removed, but its snapshot/result rows persist (nullable/retained FK) so replays and standings
  stay intact.
- **Replay with a too-old `formatVersion`**: served by regeneration from persisted inputs, not a
  hard failure (US4-AS4); if regeneration is unavailable, the read path returns an explicit
  "unsupported version" rather than mis-rendering.
- **Seeded cold-start defenders (P5)**: hand-made/AI defense armies must exist as defenders with
  no human player; they are attributed to system/bot accounts so matchmaking and standings treat
  them uniformly and the ladder is never empty.
- **Auth failure / callback error**: a failed or cancelled Google OAuth round-trip creates no
  user and returns to sign-in with an error; a request with no/expired session is treated as
  anonymous and denied on any owned resource.
- **Authz denial across users**: every read/write of an owned resource (squad, defense, result,
  standing) checks ownership server-side; a mismatched user id is denied (Principle II).
- **u64 seed range**: seeds span the full unsigned 64-bit range (beyond signed `bigint`);
  stored losslessly (numeric/text) so the exact seed survives round-trip for regeneration.
- **News post with no human author**: an auto-published balance/devlog post (Feature 12) has a
  null/system author; the schema allows it.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & sessions (Principle II, P6)**

- **FR-001**: The system MUST authenticate users via **Google OAuth** for all users (players and
  admins), creating a `users` record on first sign-in and matching returning users to their
  existing record.
- **FR-002**: The system MUST persist auth state in the **auth-adapter tables** (`users`,
  `accounts`, `sessions`, `verificationTokens`) and establish a **server-side session**; the
  server, never client state, is the source of truth for identity.
- **FR-003**: The system MUST support an **admin role** on a user, set from a **server-side
  allowlist** of Google identities, and MUST evaluate any admin authorization **server-side**
  from the session/DB — never from a client-supplied value (Principle II, P6).
- **FR-004**: The system MUST check **resource ownership server-side** for every read/write of a
  user-owned resource (squad, defense designation, match result, standing); a user MUST NOT be
  able to access or mutate another user's data.
- **FR-005**: The system SHOULD be architected so **direct email login** can be added as a
  fast-follow without reworking the model (the `verificationTokens` table and adapter support it).

**Rosters & squads (P8, P1)**

- **FR-006**: The system MUST let a signed-in user save up to **8 squads** (baseline), each a
  named 5-unit army, into distinct roster slots, and MUST let them load, rename, overwrite, and
  delete their squads.
- **FR-007**: The system MUST store a squad as the **typed config from Feature 1's data model**
  (the `Squad`/`Army` shape: 5 configured `MachineInstance`s with type, variant, loadout, dials,
  Plan-B, and zone) as a **`jsonb`** column typed end-to-end, plus derived scalar columns
  (power rating) for query without parsing the blob.
- **FR-008**: The system MUST **validate every squad against the shared Feature-1 `validate()`
  rules (V1–V8) before persisting it** — an illegal army (wrong size, zone-cap breach,
  mount-illegal equipment, duplicate utility, excess Plan-B, impossible order) MUST be rejected
  with a reason and never written (Principle II, P8).
- **FR-009**: The system MUST enforce the **8-slot baseline cap** while leaving the schema able
  to raise the cap to 64 (a future non-P2W storage bundle) without migration of stored squads.

**Defense snapshots (P5, P6)**

- **FR-010**: The system MUST let a user designate up to **3** of their squads as base defense,
  enforcing the **≤3 cap structurally** (not only in application code).
- **FR-011**: The system MUST, on designation, create an **immutable snapshot** — a frozen copy
  of the squad's config at that instant — and MUST guarantee that later edits to the source
  squad do **not** alter any existing snapshot.
- **FR-012**: The system MUST treat re-designation as **creating a new snapshot** and
  deactivating the prior one; a snapshot row's config is **never updated in place**.
- **FR-013**: The system MUST make defense and attack pools **mutually exclusive**: a currently
  designated squad is excluded from the attackable set, and the system MUST expose a user's
  attackable squads (a user with none cannot attack).
- **FR-014**: The system MUST **retain** a defense snapshot that is referenced by any match
  (in-flight or historical) even if the source squad is undesignated or deleted (soft-deactivate,
  never hard-delete while referenced) — so stored replays remain valid.
- **FR-015**: The system MUST support **seeded (cold-start) defense armies** attributable to
  system/bot accounts, so the ladder is never empty (P5) and matchmaking treats them uniformly.

**Battle results & replays (§16.1, honoring the replay-format contract)**

- **FR-016**: The system MUST record every resolved match as a **summary row** capturing mode
  (`ranked` | `practice`), attacker, defender (and the served defense snapshot), the Bo3 score,
  the winner, and provenance (seed, rulesetHash, formatVersion, adaptation policy).
- **FR-017**: The system MUST store the full **replay as a `jsonb` column** typed as the
  Feature-1 `Replay`, with **first-class scalar provenance columns** (seed, rulesetHash,
  formatVersion, winner) so the server can filter/gate replays without parsing the blob
  ([replay-format §Storage](../001-battle-sim-core/contracts/replay-format.md)).
- **FR-018**: The system MUST persist enough to **regenerate** a replay (seed + exact army
  inputs + rulesetHash live in the replay `meta`), so a bump in `formatVersion` is handled by
  server-side re-emission, never in-place migration.
- **FR-019**: The system MUST flag **practice** matches so they are excluded from ladder standing
  and so downstream screens can keep the practice opponent's identity **hidden** (§16.1).
- **FR-020**: Battle results MUST be written **server-side** from the authoritative sim result
  (Feature 1 via the server); the client MUST NOT be able to submit or alter a match outcome
  (P6).

**Ladder standing (§13)**

- **FR-021**: The system MUST maintain each user's **net-victory standing = attack wins −
  defense losses**, incrementing/decrementing it transactionally as **ranked** matches are
  recorded.
- **FR-022**: The standing MUST be **reconcilable** from the `matches` source of truth (the
  maintained standing is a cache; recomputation from results MUST equal it).
- **FR-023**: The system MUST expose a **leaderboard read** ordered by net victories, and a
  per-user career record (wins, losses, defenses held, damage totals) for the Ladder (Feature 9)
  and Profile (Feature 10) — without prescribing the tiers/MMR/seasons those features add.

**News posts (unified posts system, §16.2)**

- **FR-024**: The system MUST provide a single **`posts`** table serving all post kinds —
  `editorial` (hand-written, Feature 11), `balance` and `devlog`/`changelog` (auto-published by
  Feature 12) — with title, slug, body, type, status (`draft`|`published`), optional author
  (nullable for system/auto posts), publish timestamp, and optional structured metadata.
- **FR-025**: The system MUST support **auto-published** posts with no human author (a code push
  or a balance edit auto-posts a devlog/balance entry) and a **published-index** read ordered by
  publish time (the News index consumed by Feature 11).

**Data integrity & provenance (P8)**

- **FR-026**: Every stored squad and snapshot MUST carry a **config/schema version** so the
  game-data schema can evolve without silently mis-reading old configs.
- **FR-027**: Seeds (u64) MUST be stored **losslessly** across the full unsigned 64-bit range.
- **FR-028**: The schema MUST honor the **existing DB wiring** — Neon Postgres via **Drizzle ORM
  on the `postgres-js` driver**, the lazy `getDb()` accessor, and **no Proxy** around the client
  (which would break the auth adapter's driver detection).

### Key Entities *(include if feature involves data)*

Auth-adapter entities follow the **Auth.js Drizzle adapter** shape (so the adapter works
unmodified); game entities are defined by this feature. Full columns/types/indexes live in
[data-model.md](./data-model.md).

- **User**: an account. Google profile (name, email, image) + game fields: a unique commander
  handle, a **role** (`player` | `admin`), an `isBot` flag (seeded/AI accounts), timestamps.
  Owns rosters, defenses, results, a standing.
- **Account**: an OAuth linkage (Google now; provider + providerAccountId + tokens). One user
  may have several (email fast-follow adds another).
- **Session**: a server-side session (token + user + expiry) — the server-authoritative source
  of identity (database session strategy).
- **VerificationToken**: for the email magic-link fast-follow (unused in v1, present for the
  adapter).
- **Squad**: a saved 5-unit army in a roster slot — the Feature-1 typed config as `jsonb`, a
  name, a slot index, a derived power rating, a defense-slot marker (null = attackable),
  timestamps. Owned by a User.
- **Defense Snapshot**: an **immutable** frozen copy of a squad's config designated for defense,
  in one of ≤3 active slots, with provenance back to the source squad; what matchmaking serves.
- **Match (Battle Result)**: a resolved Bo3 — mode, attacker, defender, served snapshot, Bo3
  score, winner, and provenance (seed, rulesetHash, formatVersion, adaptation). The source of
  truth for standings.
- **Replay**: the full Feature-1 replay as `jsonb` (1:1 with a Match) + scalar provenance
  columns; the artifact Battle Playback loads.
- **Ladder Standing**: a per-user cache of net victories (attack wins − defense losses) and
  career counters, reconcilable from Matches; the Ladder/Profile read model.
- **Post**: a unified news post (editorial / balance / devlog), the substrate for the News index
  (Feature 11) and admin auto-publishing (Feature 12).
- **Preset** *(provided for Feature 4)*: a named, reusable per-machine-type build in a user's
  personal library (Feature 1 `Preset` shape as `jsonb`); persistence lives here, editing UI is
  the Garage's.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Auth round-trip** — a Google sign-in creates exactly one `users` + one
  `accounts` row on first sign-in and zero new users on repeat sign-in (100% of test round-trips).
- **SC-002**: **Server-authoritative authz** — 100% of enumerated cross-user and
  forged-admin-flag attempts are denied server-side; an admin role revocation takes effect on the
  **next request** with no re-login (database sessions).
- **SC-003**: **No illegal squad persisted** — 100% of squad writes pass the shared Feature-1
  `validate()` before insert; every enumerated illegal army is rejected with a reason and leaves
  no row.
- **SC-004**: **Snapshot immutability** — after designating a squad and then editing the source
  squad N times, the snapshot's config shows **zero** change; re-designation produces a new
  snapshot and never mutates the prior row.
- **SC-005**: **Pool exclusivity & ≤3 cap** — a designated squad appears in 0 attack-pool
  queries; the 4th concurrent designation is rejected by a database constraint (not only app
  code) in 100% of race tests.
- **SC-006**: **Replay fidelity & provenance** — 100% of stored replays deserialize to a valid
  `Replay` with a supported (or regenerable) `formatVersion`, and each scalar provenance column
  equals the value inside the replay `meta`.
- **SC-007**: **Standing reconciliation** — for any recorded history, each user's stored
  `netVictories` equals `attackWins − defenseLosses` recomputed from `matches` (0 drift);
  practice matches change no standing.
- **SC-008**: **Migration safety** — the schema is created via a reviewed drizzle-kit migration
  against a **Neon dev branch** first, then applied to production; `db:generate` produces a
  migration that applies cleanly on an empty database.

## Assumptions

- **Auth library**: Google OAuth is implemented with **Auth.js (NextAuth v5)** + the
  **`@auth/drizzle-adapter`**, using the repo's existing **postgres-js** Drizzle instance. This
  is the current best-supported path for Next.js 16 App Router on Vercel; if a materially better
  option emerges it can be swapped behind the same tables. Recorded as a decision in
  [research.md](./research.md).
- **Session strategy = database sessions** (not JWT): chosen for **server-authoritative**
  control (P6) — instant admin-role revocation and "sign out everywhere" — enabled because
  Next.js 16 runs middleware/`proxy.ts` on the **Node runtime** (no edge-DB constraint). Rationale
  in [research.md](./research.md).
- **Squad config is stored as typed `jsonb`, not normalized** into per-unit/per-slot SQL tables —
  the config *is* Feature 1's typed contract (P8); normalizing would duplicate and drift the
  sim's type system. Validated on write, versioned for evolution.
- **The `posts` table is owned by this feature** (shared persistence), because both Feature 11
  (editorial) and Feature 12 (auto-published balance/devlog) write to it; those features own the
  UI and the auto-post triggers, not the table.
- **Ladder standing is a maintained cache** keyed by user, updated transactionally with each
  ranked result and reconcilable from `matches`. Seasons/tiers/MMR are **Feature 9**; the
  mockups' MMR/tier labels are forward-looking (v1 stake is net victories, §13).
- **Cold-start seeded defenders** are modeled as `isBot` users owning defense snapshots, so the
  ladder is populated at launch (P5); authoring those armies is a data task, not this feature's
  logic.
- **Auth-adapter table names** follow the Auth.js defaults (`user`, `account`, `session`,
  `verificationToken`) so the adapter works unmodified; game tables use descriptive snake/camel
  names consistent with the repo. Recorded in [data-model.md](./data-model.md).
- **The seed column** is stored as `numeric(20,0)` (or `text`) to hold the full u64 range
  losslessly; the JSON replay renders it as a string per the replay-format contract.
- **Neon dev/prod branching**: a Neon **dev branch** is created and all table creation is tested
  there before applying to the production (primary) branch; the repo's `db:*` scripts
  (dotenv-cli + drizzle-kit) are the migration workflow.
