# Data Model: Admin Console + Balance Publishing

**Feature**: `012-admin-console` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

This is **the live-ruleset store** — the two tables this feature **adds** to Feature 7's
`db/schema.ts` (already filled by [007-accounts-persistence](../007-accounts-persistence/data-model.md))
on the same **Neon Postgres + Drizzle (postgres-js)** wiring, plus the exact shape of the two
`posts` writes this feature performs. It fills the coordination gap Feature 8 flagged: its resolve
path needs "the current ruleset" as an engine input and today reads a **v1-default placeholder**
(`loadCurrentRuleset()` in `src/server/ruleset.ts`, [008 plan.md](../008-arena-practice/plan.md)).
This document — plus [`src/server/ruleset.ts`](#the-service-surface-srcserverrulesetts) — is the
real store that placeholder is replaced by.

It does **not** redefine the game's typed content. The **`Ruleset`** stored here is the exact
Feature-1 Tier-2 type — read
[`001-battle-sim-core/data-model.md` → Tier 2](../001-battle-sim-core/data-model.md) — and the
**`posts`** table written here is Feature 7's, verbatim — read
[`007-accounts-persistence/data-model.md` → posts](../007-accounts-persistence/data-model.md).
Neither is repeated here.

## Conventions (inherited from Feature 7 — matched, not reinvented)

- **IDs**: `uuid` (`defaultRandom()`) for `rulesets`, matching Feature 7's game-table convention.
  `current_ruleset` is a **singleton** and uses a fixed `text` id instead (see below).
- **Timestamps**: `timestamp({ mode: "date" })`; `defaultNow()` on insert.
- **jsonb typing**: `jsonb("data").$type<Ruleset>()` — end-to-end TS types over postgres-js, exactly
  Feature 7's pattern for `SquadConfig`/`Replay` (P8 — one source of truth, no SQL duplication of
  Feature 1's type). Never trusted raw; always through `validateRuleset()` before a write.
- **Enums reused**: `posts.type` already includes `'balance' | 'devlog' | 'changelog'` (Feature 7)
  — **no enum change needed**.
- **`rulesetHash`**: `text`, computed by **Feature 1's canonical hash** (research A3) — the exact
  function the engine stamps on every replay — never a bespoke hash here.

---

## Shared TS types the new columns bind to

| Alias (here) | Is | Source |
|---|---|---|
| `Ruleset` | Feature-1 Tier-2 **`Ruleset`** — the whole balance table (`variants`, `equipment`, `damageMatrix`, `cadenceTicks`, `airMods`, `globals`) | [001 data-model → Tier 2](../001-battle-sim-core/data-model.md) |
| `hashRuleset(ruleset)` | Feature-1's **canonical serialization + hash** — the same function stamped on replays | [001 research A5 / data-model → rulesetHash](../001-battle-sim-core/data-model.md); re-exported for this feature via `src/sim/ruleset-hash.ts` (coordinated — see plan.md Complexity Tracking) |
| `Post` / `posts` | Feature-7 **`posts`** table (`type`, `status`, `authorId` nullable, `metadata` jsonb) | [007 data-model → posts](../007-accounts-persistence/data-model.md) |
| `SessionUser` | Feature-7 session shape (`{ id, role }`) — `requireAdmin(session)` reads `role` | [007 contracts/auth.md](../007-accounts-persistence/contracts/auth.md) |

`db/schema.ts` imports `Ruleset` from `src/sim/` the same way it already imports
`SquadConfig`/`Replay` (types only — never the WASM engine itself, keeping the schema client-safe).

---

## New tables (added to `db/schema.ts`, Tier B)

### `rulesets` — append-only revision history

Every saved ruleset, forever. **Insert-only** — a revision's `data` is never `UPDATE`d (mirrors
Feature 7's `defense_snapshots` immutability pattern: freeze-on-write, never mutate a past row).
This is the **audit + diff basis**, not a replay-reconstruction dependency (FR-008) — the engine
reads only the *current* row via the pointer below; it never walks this history.

```ts
export const rulesets = pgTable("rulesets", {
  id:          uuid("id").primaryKey().defaultRandom(),
  data:        jsonb("data").$type<Ruleset>().notNull(),      // Feature-1 Tier-2 Ruleset, verbatim
  rulesetHash: text("ruleset_hash").notNull(),                 // Feature-1 canonical hash of `data`
  editorId:    text("editor_id").references(() => users.id, { onDelete: "set null" }), // NULL = system/seed
  parentId:    uuid("parent_id").references((): AnyPgColumn => rulesets.id, { onDelete: "set null" }), // audit chain
  note:        text("note"),                                   // optional admin note on the change
  createdAt:   timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  byHash:    index("rulesets_hash_idx").on(t.rulesetHash),     // provenance join: matches/replays.rulesetHash → here
  byCreated: index("rulesets_created_idx").on(t.createdAt),    // audit history, newest-first
}));
```

| Field | Type | Notes |
|---|---|---|
| `data` | `jsonb<Ruleset>` | The full balance table at this revision. **Validated by `validateRuleset()` before insert** — never a half-valid ruleset persisted (FR-011). |
| `rulesetHash` | `text` | Computed via Feature-1's canonical hash of `data` (FR-007) — join key back from any `matches`/`replays.rulesetHash` to the exact revision that produced a result. |
| `editorId` | `text?` | The admin who saved it; `NULL` for the bootstrap seed (FR-009) — nullable exactly like `posts.authorId`. |
| `parentId` | `uuid?` | The revision this one was edited from — a linked list back to the bootstrap seed. `set null` on parent deletion (never actually deleted in practice; append-only). |
| `note` | `text?` | Optional free-text admin note, surfaced in the audit history. |

### `current_ruleset` — the singleton pointer

The **single source of truth** `getCurrentRuleset()` reads and `saveRuleset()` swaps. Exactly one
row, enforced structurally (not just by convention).

```ts
export const currentRuleset = pgTable("current_ruleset", {
  id:         text("id").primaryKey().default("current"),     // always the literal 'current'
  rulesetId:  uuid("ruleset_id").notNull().references(() => rulesets.id, { onDelete: "restrict" }),
  version:    integer("version").notNull().default(1),         // optimistic-concurrency guard
  updatedAt:  timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  singleton: check("current_ruleset_singleton_chk", sql`${t.id} = 'current'`), // structurally ≤1 row
}));
```

| Field | Type | Notes |
|---|---|---|
| `id` | `text` PK, literal `'current'` | The `CHECK` makes a second row impossible — any insert with a different id is rejected outright; the PK makes a duplicate `'current'` row impossible. Together: **exactly one row, always**. |
| `rulesetId` | `uuid` | FK → the **active** `rulesets` row. `onDelete: "restrict"` — a revision the pointer references can never be deleted out from under it (moot in practice; history is append-only). |
| `version` | `integer` | Bumped on every successful swap; the optimistic-concurrency guard `saveRuleset` checks in its `WHERE` clause (research D1). |
| `updatedAt` | `timestamp` | When the pointer last swapped — the display surfaces' cache-bust signal. |

**Why a dedicated pointer table, not an `isCurrent` flag on `rulesets`** (research A1 alternative):
a separate singleton gives a clean atomic swap (`UPDATE current_ruleset SET rulesetId=… WHERE
version=…`) and a natural, single home for the concurrency `version` — no partial-unique-index
juggling on the (potentially large) revision table.

---

## How a live edit takes effect for the next match (the load-bearing mechanism)

**Read path** (Feature 8's resolve route, every match):

```
getCurrentRuleset()
  = SELECT r.data, r.ruleset_hash, r.id AS revision_id, c.version
    FROM current_ruleset c JOIN rulesets r ON r.id = c.ruleset_id
    WHERE c.id = 'current'
```

One indexed jsonb row, read **fresh from Postgres on every call** — no per-instance in-memory
cache on this path (research A2: Vercel instances don't share memory and `revalidateTag()` is
per-instance, so a warm-instance cache would create exactly the stale-fairness-input window P6
forbids). Feature 8's `startRankedMatch`/`startPracticeMatch` call this, pass `ruleset` into
`resolve(...)`, and stamp `rulesetHash` on the recorded `matches`/`replays` row (Feature 7
provenance columns) — unchanged from how Feature 8 already calls its placeholder, **only the
implementation swaps** (Complexity Tracking: the export rename).

**Write path** (`saveRuleset(ctx, { data, expectedVersion, note? })`, one transaction):

1. `requireAdmin(ctx)` — re-checked here even though the caller (a Server Action) already checked
   it (Principle II defense-in-depth; never trust that an earlier layer was actually called).
2. `validateRuleset(data)` — **before the transaction opens**. A structurally invalid or
   out-of-bounds ruleset (missing group, dangling equipment reference, `splash > 0.25`,
   probability outside `[0,1]`, …) is rejected here with a reason; **nothing is written** (FR-011).
3. Load the current row (`current_ruleset ⋈ rulesets`) for its `data` (the diff base) and `version`.
4. `diff = diffRuleset(current.data, data)`. **If `diff.length === 0`** (a no-op save): return
   `{ noop: true, revisionId: current.id, rulesetHash: current.rulesetHash, version: current.version }`
   — **no new revision, no balance post** (FR-015).
5. `rulesetHash = hashRuleset(data)` (Feature-1's canonical hash — FR-007).
6. **Open the transaction**:
   a. `INSERT INTO rulesets (data, ruleset_hash, editor_id, parent_id, note) VALUES (...)` → `newId`.
   b. `UPDATE current_ruleset SET ruleset_id = newId, version = version + 1, updated_at = now()
      WHERE id = 'current' AND version = expectedVersion`. **If 0 rows affected** → `ROLLBACK`,
      return `STALE_EDIT` (another admin saved first since this admin loaded the editor — FR-012,
      no lost update).
   c. `INSERT INTO posts (type='balance', status='published', author_id=ctx.userId, slug, title,
      body, metadata) VALUES (...)` — see **Balance post shape** below (FR-013/014).
   d. **Commit.** All three writes land together or none do — a saved edit is never published
      without its post and a post never exists without its edit (US3-AS4).
7. After commit: `revalidateTag('ruleset-current')` (and the News tags) so **display** surfaces
   (the editor page itself, any cached "current balance" view) refresh — the resolve path never
   needed this, since it never cached in the first place (step "Read path" above).

**Recorded replays are untouched by design, not by extra code**: a replay is a self-contained
snapshot stream stamped with the `rulesetHash` it was resolved against (Feature 1 Tier 3); nothing
in this write path ever touches `matches`/`replays` rows. The "byte-unchanged" guarantee (SC-003)
falls out of the fact that this feature **never writes to those tables** — there is no mechanism by
which an edit *could* reach a past replay.

---

## Balance post shape (`posts`, `type='balance'`) — FR-014/016

Written inside `saveRuleset`'s transaction (step 6c above), never as a separate call — this is
what "auto-published" means (no manual authoring step exists).

```ts
{
  slug:     `balance-${newId.slice(0, 8)}`,          // stable, derived from the revision id
  title:    "Balance Update — <N> change(s)",         // e.g. "Balance Update — 2 changes"
  excerpt:  renderDiffOneLiner(diff),                 // e.g. "Grizzly hull ↓10%, SAM Battery air dmg ↑13%"
  body:     renderDiffSummary(diff),                  // markdown: one bullet per changed leaf path
  type:     "balance",
  status:   "published",
  authorId: ctx.userId,                               // the editing admin
  metadata: {
    diff:        diff,                                // RulesetDiffEntry[] — see below
    rulesetId:   newId,
    rulesetHash: rulesetHash,
    parentId:    current.id,
  },
  publishedAt: now(),
}
```

`RulesetDiffEntry = { path: string; oldValue: unknown; newValue: unknown; percentDelta?: number }`
— one entry per changed leaf (e.g. `path: "variants.Grizzly.hull"`, `oldValue: 2000`,
`newValue: 1800`, `percentDelta: -0.10`). `diffRuleset(prev, next)` produces this array (research
C2, `microdiff` or an equivalent typed walk); `renderDiffSummary` turns it into the markdown body
readers see on Feature 11's News index/article pages (FR-016).

## Devlog / changelog post shape (`posts`, `type='devlog'|'changelog'`) — FR-017/018

Written by `recordDevlogPost` from the webhook route, **outside** any ruleset transaction (no
`rulesets`/`current_ruleset` involvement at all — this trigger is fully independent of US1–US3).

```ts
{
  slug:     `devlog-${sha.slice(0, 7)}`,               // `changelog-<sha7>` for a tagged release
  title:    commitSummaryLine ?? `Deploy ${sha.slice(0, 7)}`,
  body:     renderCommitBody({ sha, message, author, compareUrl }),  // markdown
  type:     isTaggedRelease ? "changelog" : "devlog",
  status:   "published",
  authorId: null,                                       // no human author (FR-017)
  metadata: { sha, author, message, compareUrl, deploymentUrl, branch },
  publishedAt: now(),
}
```

Idempotency is the `posts.slug` **unique** constraint (Feature 7) plus an `ON CONFLICT (slug) DO
NOTHING` insert — a retried webhook delivery is a silent no-op, never a duplicate post or an error
(FR-018, US4-AS2).

---

## Cold start — the bootstrap seed (FR-009)

`getCurrentRuleset()` must never be empty. A one-time seed (run once, before Feature 8's resolve
path is first exercised) inserts:

1. `INSERT INTO rulesets (data, ruleset_hash, editor_id, parent_id, note) VALUES
   (<Feature-1 first-pass stats as Ruleset>, hashRuleset(...), NULL, NULL, 'bootstrap seed')`.
2. `INSERT INTO current_ruleset (id, ruleset_id, version) VALUES ('current', <that id>, 1)`.

`editorId = NULL` marks it as system-originated, exactly like Feature 7's `isBot` cold-start
defense snapshots (P5 precedent: never-empty by a seeded default, not a special-cased empty state).

---

## Concurrency — optimistic, on the pointer (research D1, FR-012)

Two admins can both call `getRulesetForEdit()` and load the same `version`. The **second** to call
`saveRuleset` loses the race: its `UPDATE … WHERE version = expectedVersion` affects **0 rows**
(the first save already bumped `version`), the transaction rolls back, and `STALE_EDIT` is
returned. **No lost update** — the loser reloads (`getRulesetForEdit()` again, now returning the
winner's revision + the new `version`) and re-applies their change on top. This is deliberately
**optimistic, not pessimistic** (`SELECT … FOR UPDATE`): conflicts are rare (a handful of admins,
infrequent edits), so no lock is held across the (human-speed) time between load and save.

---

## Validation — the ruleset's trust boundary (research D2, FR-011)

`validateRuleset(data): { ok: true } | { ok: false; reason: string }` runs **before any
persistence**, checking:

- **Structural completeness**: every required group present (`variants`, `equipment`,
  `damageMatrix`, `cadenceTicks`, `airMods`, `globals`); every equipment/variant reference used
  elsewhere in `data` resolves to an entry that exists.
- **Numeric bounds**: fractions/probabilities in `[0,1]`; `splash ≤ 0.25`; `hitClamp` bounds valid
  and ordered; cadence tiers present and positive; `nativeBonus` in a sane band.

A rejection returns a typed reason and **the current pointer is never advanced** — `saveRuleset`
never reaches the transaction (SC-006). This is the `Ruleset` analog of Feature 1's army
`validate()` (V1–V8): reject illegal input with a reason, never silently "fix" it.

---

## The service surface (`src/server/ruleset.ts`)

```ts
getCurrentRuleset(): Promise<{ revisionId: string; ruleset: Ruleset; rulesetHash: string }>
  // Authoritative Postgres read, no cache. Called by Feature 8's resolve path (replaces its
  // v1-default `loadCurrentRuleset()` placeholder — see plan.md Complexity Tracking).

getRulesetForEdit(ctx): Promise<{ revisionId: string; data: Ruleset; rulesetHash: string; version: number }>
  // requireAdmin(ctx) first. Feeds the editor screen; `version` is what the caller must echo back.

saveRuleset(ctx, input: { data: Ruleset; expectedVersion: number; note?: string })
  : Promise<
      | { noop: true; revisionId: string; rulesetHash: string; version: number }
      | { noop: false; revisionId: string; rulesetHash: string; version: number; postId: string }
      | { error: "VALIDATION_FAILED"; reason: string }
      | { error: "STALE_EDIT" }
      | { error: "NOT_ADMIN" }
    >
  // requireAdmin → validateRuleset → diff → (no-op short-circuit) → atomic
  // (insert revision + swap pointer + insert balance post).
```

`ctx` is the resolved server session (`{ userId, role }`, Feature 7) — never a client argument.

---

## Index & constraint summary

| Table | Index / constraint | Purpose |
|---|---|---|
| `rulesets` | index `(rulesetHash)` | provenance join from `matches`/`replays.rulesetHash` |
| `rulesets` | index `(createdAt)` | audit history, newest-first |
| `current_ruleset` | PK `(id)` + `CHECK id = 'current'` | structurally exactly one row |
| `current_ruleset` | FK `(rulesetId)` → `rulesets(id)` `RESTRICT` | pointer always resolves to a real revision |
| `posts` (Feature 7, reused) | unique `(slug)` | **the devlog idempotency mechanism** (`ON CONFLICT DO NOTHING`) |

---

## Entity relationship summary

```
users(user)         1──* rulesets         (editorId; NULL = system/seed)
users(user)         1──* posts (author)   (balance posts; devlog posts have authorId=NULL)
rulesets            1──* rulesets         (parentId — self-referential audit chain)
current_ruleset(1)  ──points to──> rulesets (rulesetId; the ONE active revision)

# jsonb payload binds to Feature-1's type (P8 — one source of truth, no SQL duplication):
rulesets.data : Ruleset  (= Feature-1 Tier-2 Ruleset)

# consumed downstream (not owned here):
Feature 8 resolve path ──calls──> getCurrentRuleset() ──reads──> current_ruleset ⋈ rulesets
Feature 8 recordMatch  ──stamps──> matches.rulesetHash / replays.rulesetHash (Feature 7 columns)
                                    (joinable back to rulesets.rulesetHash for audit)
Feature 11 News index  ──reads──> posts WHERE status='published' (includes this feature's writes)
```

---

## Trust-boundary rules (Principle II, P6) — this feature's additions to Feature 7's table

Enforced in the service layer (`src/server/ruleset.ts`), **in addition to** Feature 7's A1–A6:

| # | Rule | Rejects |
|---|---|---|
| B1 | `requireAdmin(ctx)` re-checked at the top of **every** admin action/handler/RSC, reading `session.user.role` from the DB session | anonymous, non-admin, and forged-`admin`-flag callers (US2) |
| B2 | The code-push webhook is gated by a **verified shared secret**, never a role (no user session exists for a system caller) | forged/absent-secret webhook calls (US2-AS5) |
| B3 | `validateRuleset(data)` runs to completion **before** the save transaction opens | a structurally invalid or out-of-bounds ruleset ever reaching persistence (US1-AS4) |
| B4 | The pointer swap's `WHERE version = expectedVersion` is the **only** path that advances `current_ruleset` | a lost update under concurrent admin edits (US1 concurrency) |
| B5 | The webhook insert is `ON CONFLICT (slug) DO NOTHING` | a duplicate devlog post from a retried delivery (US4-AS2) |

Every rejection returns a typed reason (`VALIDATION_FAILED`, `STALE_EDIT`, `NOT_ADMIN`, 401), never
a raw DB error.

## How Feature 8 (and beyond) consumes this

- **Feature 8 (Arena/Practice)** — its resolve path calls **`getCurrentRuleset()`** (this feature's
  real implementation, replacing its v1-default placeholder) to obtain the `ruleset` it passes into
  `resolve(...)` and the `rulesetHash` it stamps on `matches`/`replays` (Feature 7 columns). No
  other change to Feature 8's flow.
- **Feature 11 (News)** reads `posts WHERE status='published' ORDER BY publishedAt DESC` — this
  feature's `balance`/`devlog`/`changelog` rows appear there exactly like Feature 11's own
  editorial posts, no special-casing needed on the read side.
- **Feature 2 (auto-balancer)** is read-only input here (the committed `BalanceReport` US5
  surfaces) — this feature never calls or mutates it.
