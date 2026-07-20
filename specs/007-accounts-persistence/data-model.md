# Data Model: Accounts & Persistence

**Feature**: `007-accounts-persistence` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

This is **the persistent schema** for Warform Commander — the Drizzle/Postgres tables that
Features **8** (Arena/matchmaking), **9** (Ladder), **10** (Profile), and **12** (Admin) all read
and write. It fills `db/schema.ts` (currently an empty stub) on the repo's existing wiring:
**Neon Postgres + Drizzle ORM via `postgres-js`**, lazy `getDb()`, no Proxy (see
[research.md](./research.md) A3/C3).

It does **not** re-define the game's typed content. A squad's config and a battle's replay are
the **exact typed artifacts from Feature 1**; here they are *stored*, mostly as typed `jsonb`,
with only the fields a query needs promoted to scalar columns (constitution **P8** — one source of
truth; no schema duplication/drift). Where this doc says `SquadConfig` / `Replay` / `PresetConfig`
it means the Feature-1 types in
[`001-battle-sim-core/data-model.md`](../001-battle-sim-core/data-model.md) and
[`replay-format.md`](../001-battle-sim-core/contracts/replay-format.md) — read those; they are not
repeated here.

## Conventions

- **Two tiers**: **Tier A — auth-adapter tables** (the Auth.js Drizzle shape, so the adapter works
  unmodified) and **Tier B — game tables** (this feature's own).
- **IDs**: `text` UUIDs (`$defaultFn(() => crypto.randomUUID())`) for auth tables (Auth.js shape);
  `uuid` (`defaultRandom()`) for game tables. Both are opaque and stable.
- **Timestamps**: `timestamp({ mode: "date" })`; `createdAt` / `updatedAt` default `defaultNow()`;
  `updatedAt` is bumped in the service layer on write.
- **jsonb typing**: game artifacts use `jsonb().$type<T>()` for end-to-end TS types over
  postgres-js (which returns jsonb as parsed objects). Validated on write; never trusted raw.
- **`schemaVersion`** (`smallint`): stamped on every stored `SquadConfig`/`PresetConfig` so the
  content schema can evolve (FR-026). Distinct from the replay `formatVersion` and the un-versioned
  live ruleset.
- **Seed (u64)**: stored as **`numeric(20,0)`** — a u64 (max ≈ 1.8×10¹⁹) exceeds signed `bigint`
  (max ≈ 9.2×10¹⁸). Lossless; matches the replay JSON's "u64-as-string" (FR-027).
- **Enums** (Postgres `pgEnum`):
  `role = ('player','admin')` · `matchMode = ('ranked','practice')` ·
  `winnerSide = ('attacker','defender')` · `adaptation = ('locked','free')` ·
  `postType = ('editorial','balance','devlog','changelog')` · `postStatus = ('draft','published')`.
- **Winner mapping**: Feature-1 `resolve` takes `armies[0] = attacker`, `armies[1] = defender`
  (engine-api contract); its `MatchResult.winner: Side (A|B)` maps `A→attacker`, `B→defender`.

---

## Shared TS types the jsonb columns bind to

Defined once (imported from the Feature-1 TS mirror under `src/sim/`), referenced by the schema —
**not** re-declared in SQL:

| Alias (here) | Is | Source |
|---|---|---|
| `SquadConfig` | Feature-1 **`Army`/`Squad`** — 5 configured `MachineInstance`s (type, variant, loadout, dials, Plan-B, zone) | [001 data-model → Squad/Army](../001-battle-sim-core/data-model.md) |
| `Replay` | Feature-1 **`Replay`** — the random-access tick stream (positional-array, tick-indexed, `formatVersion`) | [replay-format.md](../001-battle-sim-core/contracts/replay-format.md) |
| `PresetConfig` | Feature-1 **`Preset`** minus identity — `loadout + dials + planB` | [001 data-model → Preset](../001-battle-sim-core/data-model.md) |

A thin `src/db/types.ts` re-exports these so `db/schema.ts` can `.$type<SquadConfig>()` /
`.$type<Replay>()` without pulling the engine into the client bundle (P6 — the schema imports
*types only*, never the WASM engine).

---

## Tier A — Auth-adapter tables (Auth.js Drizzle shape)

Defined exactly as the Auth.js Postgres adapter expects so `DrizzleAdapter(getDb())` works
unmodified ([research.md](./research.md) B1). `users` is **extended** with game columns (the
adapter only reads the columns it knows).

### `users` — table name `"user"`

| Field | Type | Notes |
|---|---|---|
| `id` | `text` PK | `$defaultFn(crypto.randomUUID)` (Auth.js shape) |
| `name` | `text?` | Google display name |
| `email` | `text?` **unique** | Google email |
| `emailVerified` | `timestamp?` | Auth.js field |
| `image` | `text?` | Google avatar URL |
| **`handle`** | `text?` **unique** | Commander handle (e.g. `CMDR_JUPCHURCH`); assigned on onboarding |
| **`role`** | `role` enum, `notNull default 'player'` | `admin` set from a **server-side allowlist** (FR-003); authz always re-checked server-side |
| **`isBot`** | `boolean notNull default false` | Seeded/AI cold-start accounts (P5); own defense snapshots so the ladder is never empty |
| **`createdAt`** | `timestamp notNull defaultNow()` | Enlistment date (Profile "ENLISTED") |

Relations: 1─* `squads`, 1─* `defenseSnapshots`, 1─1 `ladderStandings`, 1─* `matches` (as attacker
/ defender), 1─* `presets`, 1─* `posts` (as author).

### `accounts` — table name `"account"`

OAuth linkage (Google now; email/other later). Columns: `userId` (FK→`users.id` **cascade**),
`type`, `provider`, `providerAccountId`, `refresh_token`, `access_token`, `expires_at`,
`token_type`, `scope`, `id_token`, `session_state`. **PK = (`provider`, `providerAccountId`)**.
Verbatim Auth.js shape.

### `sessions` — table name `"session"`

Server-side sessions (**database session strategy**, [research.md](./research.md) A2). Columns:
`sessionToken` (`text` PK), `userId` (FK→`users.id` **cascade**), `expires` (`timestamp notNull`).
The browser holds only the opaque session-token cookie; the server is authoritative (P6).

### `verificationTokens` — table name `"verificationToken"`

For the **email magic-link fast-follow** (FR-005; unused in v1, present so the Email provider is
additive). Columns: `identifier`, `token`, `expires`. **PK = (`identifier`, `token`)**.

### `authenticators` — table name `"authenticator"` *(optional, WebAuthn)*

Included for adapter completeness; **not used in v1**. Columns per Auth.js (`credentialID` unique,
`userId` FK cascade, `providerAccountId`, `credentialPublicKey`, `counter`,
`credentialDeviceType`, `credentialBackedUp`, `transports`; PK = (`userId`,`credentialID`)). May be
omitted from the initial migration and added when passkeys are wanted.

---

## Tier B — Game tables

### `squads` — a saved 5-unit army (roster slot)

The core player-owned asset. Stores the Feature-1 typed config as `jsonb`; the `defenseSlot`
marker drives attack/defense pool exclusivity (see **Snapshot mechanism**).

```ts
export const squads = pgTable("squads", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:         text("name").notNull(),
  slotIndex:    smallint("slot_index").notNull(),          // 0..63; baseline usable 0..7
  config:       jsonb("config").$type<SquadConfig>().notNull(),  // Feature-1 Army (5 units)
  schemaVersion: smallint("schema_version").notNull().default(1),
  powerRating:  integer("power_rating").notNull(),         // derived aggregate (matchmaking only)
  defenseSlot:  smallint("defense_slot"),                  // NULL = attackable; 0..2 = designated
  createdAt:    timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  uniqSlot:     uniqueIndex("squads_user_slot_uq").on(t.userId, t.slotIndex),
  // structural pool cap + slot distinctness: at most 3 designated squads, slots 0..2 distinct
  uniqDefense:  uniqueIndex("squads_user_defenseslot_uq").on(t.userId, t.defenseSlot)
                  .where(sql`${t.defenseSlot} is not null`),
  byUser:       index("squads_user_idx").on(t.userId),
  defenseSlotChk: check("squads_defense_slot_chk",
                  sql`${t.defenseSlot} is null or (${t.defenseSlot} between 0 and 2)`),
}));
```

| Field | Type | Notes |
|---|---|---|
| `config` | `jsonb<SquadConfig>` | The 5-unit army — validated by shared `validate()` **before** any insert/update (FR-008) |
| `powerRating` | `integer` | Feature-1 derived aggregate; matchmaking bracketing only (never combat) |
| `defenseSlot` | `smallint?` | Pool marker: `NULL` ⇒ in the **attack pool**; `0..2` ⇒ **designated** (excluded from attacking) |
| `slotIndex` | `smallint` | Roster slot; unique per user; 8-slot baseline enforced in the service (FR-009), schema allows up to 64 |

Baseline **8-slot cap** is a service-layer rule (`slotIndex < 8`), so raising it to 64 later is a
config change, not a migration (FR-009).

### `defense_snapshots` — immutable frozen copies designated for defense

The heart of the async-PvP fairness guarantee (P5/P6). **Insert-only for `config`** — a snapshot's
config is never `UPDATE`d (see **Snapshot mechanism**).

```ts
export const defenseSnapshots = pgTable("defense_snapshots", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceSquadId: uuid("source_squad_id").references(() => squads.id, { onDelete: "set null" }),
  name:          text("name").notNull(),                          // copied at designation
  config:        jsonb("config").$type<SquadConfig>().notNull(),  // FROZEN copy — never updated
  schemaVersion: smallint("schema_version").notNull().default(1),
  powerRating:   integer("power_rating").notNull(),               // copied
  defenseSlot:   smallint("defense_slot").notNull(),              // 0..2
  active:        boolean("active").notNull().default(true),
  createdAt:     timestamp("created_at", { mode: "date" }).notNull().defaultNow(), // designation time
  deactivatedAt: timestamp("deactivated_at", { mode: "date" }),
}, (t) => ({
  // exactly one ACTIVE snapshot per (user, slot); ⇒ ≤3 active per user — a DB invariant
  uniqActive:  uniqueIndex("defsnap_user_slot_active_uq").on(t.userId, t.defenseSlot)
                 .where(sql`${t.active}`),
  serveIdx:    index("defsnap_user_active_idx").on(t.userId).where(sql`${t.active}`), // matchmaking serve
  slotChk:     check("defsnap_slot_chk", sql`${t.defenseSlot} between 0 and 2`),
}));
```

| Field | Type | Notes |
|---|---|---|
| `config` | `jsonb<SquadConfig>` | **Immutable** frozen copy at designation instant; edits to the source squad never touch it (SC-004) |
| `sourceSquadId` | `uuid?` | Provenance; `set null` if the source squad is deleted (snapshot retained, FR-014) |
| `active` | `boolean` | `true` ⇒ in the ≤3-slot defense rotation matchmaking serves from; re-designation flips the old one to `false` |
| `defenseSlot` | `smallint` | `0..2`; the partial-unique on `(userId, defenseSlot) WHERE active` **structurally caps at 3** (SC-005) |

Superseded snapshots are **soft-deactivated** (`active=false`, `deactivatedAt` set), never deleted,
while any `matches.defenderSnapshotId` references them (FR-014) — historical replays stay valid.

### `matches` — a resolved best-of-3 (battle result summary)

Recorded **server-side** from the authoritative sim result (P6, FR-020); the source of truth for
standings. Scalar columns only — the heavy replay lives in `replays` (1:1).

```ts
export const matches = pgTable("matches", {
  id:                uuid("id").primaryKey().defaultRandom(),
  mode:              matchModeEnum("mode").notNull(),               // ranked | practice
  attackerUserId:    text("attacker_user_id").references(() => users.id, { onDelete: "set null" }),
  defenderUserId:    text("defender_user_id").references(() => users.id, { onDelete: "set null" }),
  attackerSquadId:   uuid("attacker_squad_id").references(() => squads.id, { onDelete: "set null" }),
  defenderSnapshotId: uuid("defender_snapshot_id").references(() => defenseSnapshots.id, { onDelete: "set null" }),
  adaptation:        adaptationEnum("adaptation").notNull(),        // locked (ranked) | free (practice)
  winnerSide:        winnerSideEnum("winner_side").notNull(),       // attacker | defender
  attackerGamesWon:  smallint("attacker_games_won").notNull(),      // Bo3 score
  defenderGamesWon:  smallint("defender_games_won").notNull(),
  attackerDamage:    integer("attacker_damage").notNull().default(0), // per-side totals (Profile)
  defenderDamage:    integer("defender_damage").notNull().default(0),
  durationTicks:     integer("duration_ticks"),                     // summary
  seed:              numeric("seed", { precision: 20, scale: 0 }).notNull(), // u64, lossless
  rulesetHash:       text("ruleset_hash").notNull(),
  formatVersion:     integer("format_version").notNull(),
  createdAt:         timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  byAttacker: index("matches_attacker_idx").on(t.attackerUserId),
  byDefender: index("matches_defender_idx").on(t.defenderUserId),
  byModeTime: index("matches_mode_time_idx").on(t.mode, t.createdAt),
  bySnapshot: index("matches_snapshot_idx").on(t.defenderSnapshotId),
}));
```

- `mode = practice` ⇒ excluded from standings and the opponent identity is kept **hidden**
  downstream (FR-019); the served squad in practice is a random DB squad (Feature 8 draws it).
- Participant FKs are **nullable / `set null`** so a deleted user doesn't destroy others' history,
  standings, or replays.
- `attackerDamage` / `defenderDamage` feed the Profile "damage profile" and Ladder "total damage"
  without parsing the replay.

### `replays` — the full tick stream (jsonb) + provenance (1:1 with a match)

The Feature-1 replay-format storage contract, verbatim ([replay-format §Storage](../001-battle-sim-core/contracts/replay-format.md)).

```ts
export const replays = pgTable("replays", {
  id:            uuid("id").primaryKey().defaultRandom(),
  matchId:       uuid("match_id").notNull().unique().references(() => matches.id, { onDelete: "cascade" }),
  replay:        jsonb("replay").$type<Replay>().notNull(),         // full random-access tick stream
  seed:          numeric("seed", { precision: 20, scale: 0 }).notNull(), // provenance (also in meta)
  rulesetHash:   text("ruleset_hash").notNull(),
  formatVersion: integer("format_version").notNull(),               // supported-range gate / regenerate
  winnerSide:    winnerSideEnum("winner_side").notNull(),           // scalar per replay-format §Storage
  createdAt:     timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

- The **army inputs live inside `replay.meta.armies`** (not a separate column) → seed + armies +
  rulesetHash persisted ⇒ a `formatVersion` bump is a **server-side re-emission**, never in-place
  migration (FR-018).
- Postgres **TOAST** auto-compresses the jsonb (5–10× at these sizes); no `bytea`, no manual gzip,
  no Blob offload (Feature-1 research C3–C5). Escape hatch (MessagePack-in-`bytea`) stays unbuilt.
- **Why a separate table** (not a column on `matches`): keeps summary/standings queries off the
  large blob; still trivially joined `1:1`. Merging into `matches` is a valid alternative if
  preferred — the scalar provenance would just move.

### `ladder_standings` — net-victory cache (one row per user)

Maintained transactionally as **ranked** matches record; reconcilable from `matches` (SC-007).
Net victories = **attack wins − defense losses** (§13). The Ladder (Feature 9) and Profile
(Feature 10) read this; they layer seasons/tiers/MMR on top (not defined here).

```ts
export const ladderStandings = pgTable("ladder_standings", {
  userId:        text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  attackWins:    integer("attack_wins").notNull().default(0),
  attackLosses:  integer("attack_losses").notNull().default(0),
  defenseWins:   integer("defense_wins").notNull().default(0),   // defenses held
  defenseLosses: integer("defense_losses").notNull().default(0),
  // net victories = attackWins - defenseLosses (a GENERATED column keeps it DB-derived)
  netVictories:  integer("net_victories").generatedAlwaysAs(
                   (): SQL => sql`${ladderStandings.attackWins} - ${ladderStandings.defenseLosses}`),
  matchesPlayed: integer("matches_played").notNull().default(0),
  totalDamage:   bigint("total_damage", { mode: "number" }).notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak:    integer("best_streak").notNull().default(0),
  updatedAt:     timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  leaderboard: index("standings_net_idx").on(t.netVictories),   // ORDER BY net_victories DESC
}));
```

- `netVictories` as a **generated column** makes the core stat DB-derived (can't drift from its
  components); the component counters are the maintained values. (If generated-column support is
  awkward, store `netVictories` plainly and recompute — SC-007 checks reconciliation either way.)
- **Seasons/tiers/MMR** are Feature 9: they can extend this (add `seasonId` to the PK) or sit
  beside it. v1's stake is net victories only (design §13; the mockups' MMR/tier labels are
  forward-looking).

### `posts` — the unified news system (shared persistence)

One table for **all** post kinds (§16.2). **Owned by Feature 7** (both Feature 11 editorial and
Feature 12 auto-publish write here); Feature 11 owns the News-index/article UI, Feature 12 owns the
admin authoring + auto-post triggers.

```ts
export const posts = pgTable("posts", {
  id:          uuid("id").primaryKey().defaultRandom(),
  slug:        text("slug").notNull().unique(),
  title:       text("title").notNull(),
  excerpt:     text("excerpt"),
  body:        text("body").notNull(),                    // markdown
  type:        postTypeEnum("type").notNull(),            // editorial | balance | devlog | changelog
  status:      postStatusEnum("status").notNull().default("draft"),
  authorId:    text("author_id").references(() => users.id, { onDelete: "set null" }), // NULL = system/auto
  metadata:    jsonb("metadata"),                         // balance diff, commit sha, etc.
  publishedAt: timestamp("published_at", { mode: "date" }),
  createdAt:   timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  publishedIdx: index("posts_published_idx").on(t.status, t.publishedAt), // News index read
  byType:       index("posts_type_idx").on(t.type),
}));
```

- `authorId` **nullable** ⇒ auto-published balance/devlog posts (a code push, a ruleset edit) need
  no human author (FR-024/025).
- `metadata` jsonb carries structured extras (the balance delta for a `balance` post, the commit
  SHA for a `devlog`/`changelog`) without schema churn.

### `presets` — custom per-machine-type builds *(provided for Feature 4)*

Persistence for a player's **custom preset library** (§8.4). Minimal here; the Garage (Feature 4)
owns the editor and stock presets (which are static data, not rows).

```ts
export const presets = pgTable("presets", {
  id:            uuid("id").primaryKey().defaultRandom(),
  userId:        text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:          text("name").notNull(),
  machineTypeId: text("machine_type_id").notNull(),        // Feature-1 MachineTypeId (presets are per type)
  config:        jsonb("config").$type<PresetConfig>().notNull(), // loadout + dials + planB
  schemaVersion: smallint("schema_version").notNull().default(1),
  createdAt:     timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({ byUserType: index("presets_user_type_idx").on(t.userId, t.machineTypeId) }));
```

---

## The snapshot mechanism (defense) — the load-bearing detail

Immutability + pool exclusivity + the ≤3 cap are enforced by **copy-on-designate + partial unique
indexes**, all inside transactions ([research.md](./research.md) B3). Four operations:

**Designate** `squad S → defense slot k` (transaction):
1. Assert `S.userId == session.userId` (ownership, Principle II) and `S.defenseSlot IS NULL`.
2. Deactivate any current active snapshot at slot `k`: `UPDATE defense_snapshots SET active=false,
   deactivated_at=now() WHERE userId=? AND defenseSlot=k AND active`.
3. `INSERT defense_snapshots` with a **frozen copy** of `S.config` (+ name, powerRating,
   schemaVersion), `defenseSlot=k`, `active=true`.
4. `UPDATE squads SET defenseSlot=k WHERE id=S.id` (removes S from the attack pool).
   - The partial unique `squads_user_defenseslot_uq` + `defsnap_user_slot_active_uq` reject a race
     that would create a 4th designation or a duplicate slot (SC-005).

**Edit source squad** `S`: `UPDATE squads SET config=?, updatedAt=now()`. **Does not touch any
snapshot** — the in-flight defense is a *different row* (SC-004, US3-AS2). Isolation is structural,
not a lock.

**Re-designate** `S`: same as Designate at S's current slot ⇒ a **new** snapshot row captures the
edit and the prior snapshot is `active=false`. The old row's `config` is **never mutated** (US3-AS3,
FR-012).

**Undesignate** `S`: `UPDATE squads SET defenseSlot=NULL` (S rejoins the attack pool) +
deactivate its active snapshot. The snapshot **row persists** if any `matches.defenderSnapshotId`
references it (FR-014).

**Pool queries** (used by Feature 8):
- Attack pool: `SELECT * FROM squads WHERE userId=? AND defenseSlot IS NULL`. A user with **0** rows
  here cannot attack (US3-AS5).
- Serve a defender: pick a random `defense_snapshots` row `WHERE userId=? AND active` (≤3) — blind
  to the attacker, then locked for the Bo3 (Feature 8's job; this feature guarantees it's stable
  and immutable).

---

## Standing derivation (§13)

On recording a **ranked** match (in the same transaction as the `matches` insert):

| Participant | If they won | If they lost |
|---|---|---|
| **Attacker** | `attackWins += 1` | `attackLosses += 1` |
| **Defender** | `defenseWins += 1` (held) | `defenseLosses += 1` |

`netVictories = attackWins − defenseLosses` (attack wins add, **defense losses subtract** — a weak
defense bleeds rank; §13). `matchesPlayed`, `totalDamage`, and streaks update alongside. **Practice
matches update nothing** (FR-019). Reconciliation oracle (SC-007): recompute the counters by
aggregating `matches` and assert equality with `ladder_standings`.

---

## Index & constraint summary

| Table | Index / constraint | Purpose |
|---|---|---|
| `users` | unique `email`, unique `handle` | identity + handle uniqueness |
| `squads` | unique `(userId, slotIndex)` | one squad per roster slot |
| `squads` | **partial unique** `(userId, defenseSlot) WHERE defenseSlot NOT NULL` | ≤3 designated, slots distinct, pool exclusivity |
| `squads` | check `defenseSlot ∈ {NULL,0,1,2}` · index `(userId)` | slot sanity · roster read |
| `defense_snapshots` | **partial unique** `(userId, defenseSlot) WHERE active` | exactly one active snapshot per slot ⇒ **≤3 active** |
| `defense_snapshots` | partial index `(userId) WHERE active` | matchmaking serve |
| `matches` | index `(attackerUserId)`, `(defenderUserId)`, `(mode, createdAt)`, `(defenderSnapshotId)` | history, ladder feed, snapshot-usage |
| `replays` | unique `(matchId)` | 1:1 with match |
| `ladder_standings` | index `(netVictories)` | leaderboard `ORDER BY net DESC` |
| `posts` | unique `(slug)` · index `(status, publishedAt)` · index `(type)` | article URLs · News index · filtering |
| auth tables | Auth.js PKs/uniques verbatim | adapter compatibility |

---

## Entity relationship summary

```
users(user) 1──* accounts        (OAuth: Google now, email later)
users       1──* sessions        (server-authoritative DB sessions)
users       1──1 ladder_standings (net victories cache)
users       1──* squads          (≤8 baseline; defenseSlot NULL = attackable)
users       1──* defense_snapshots (≤3 active; immutable frozen copies)
users       1──* presets          (custom library; for Feature 4)
users       1──* posts (author)   (nullable author ⇒ system/auto posts)

squads          1──* defense_snapshots (sourceSquadId, provenance; set null on delete)
squads          1──* matches           (attackerSquadId, provenance)
defense_snapshots 1──* matches         (defenderSnapshotId — the served snapshot)
matches         1──1 replays           (jsonb tick stream + provenance)

# jsonb payloads bind to Feature-1 types (P8 — one source of truth, no SQL duplication):
squads.config, defense_snapshots.config : SquadConfig  (= Feature-1 Army/Squad)
replays.replay                          : Replay        (= Feature-1 Replay)
presets.config                          : PresetConfig  (= Feature-1 Preset loadout+dials+planB)
```

---

## Trust-boundary rules (Principle II, P6)

Enforced in the service layer on **every** operation, in addition to the DB constraints:

| # | Rule | Rejects |
|---|---|---|
| A1 | An authenticated session is required for any owned-resource read/write | anonymous access to squads/defense/results/standing |
| A2 | `resource.userId == session.user.id` on read/write/delete of squads, defense, presets | cross-user access (US2-AS5, US3 ownership) |
| A3 | Admin operations require `session.user.role == 'admin'` **read server-side** | forged client `admin` flag (US1-AS4) |
| A4 | A squad `config` passes shared Feature-1 `validate()` before insert/update | illegal army persisted (US2-AS3, SC-003) |
| A5 | Match results are written **only** by the server from the authoritative sim | client-submitted/forged outcomes (US4, P6) |
| A6 | Designation is transactional; the partial-unique indexes are the final guard | 4th active defense / duplicate slot under a race (SC-005) |

Every rejection returns a reason. Validation (A4) reuses the **same** `validate()` the Garage and
engine call, so the DB rejects exactly the builds the engine would (P8).

---

## How Features 8–12 consume this (the contract they build on)

- **Feature 8 (Arena/Practice)** reads the **attack pool** (`squads WHERE defenseSlot IS NULL`),
  picks a random defender + a random **active** `defense_snapshot` (blind, Bo3-locked), calls the
  server sim, then **records a `matches` + `replays` row** and updates `ladder_standings` — all via
  this feature's service API. Practice draws a random DB squad and records `mode='practice'`.
- **Feature 9 (Ladder)** reads `ladder_standings` ordered by `netVictories` and per-week rollups
  from `matches`; adds seasons/tiers/MMR atop the substrate.
- **Feature 10 (Profile)** reads a user's `ladder_standings`, their `matches` (recent/record),
  `squads` (most-played), and a badges source; renders career stats.
- **Feature 12 (Admin)** gates on `users.role='admin'`, edits the live ruleset (Feature 1's input),
  and **inserts `posts`** (`type='balance'`, auto) on a ruleset change; code pushes insert
  `type='devlog'/'changelog'`.
- **Feature 11 (News/Marketing)** reads `posts WHERE status='published' ORDER BY publishedAt` for
  the News index + article pages.
