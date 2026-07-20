/**
 * Drizzle schema — Warform Commander (Feature 7, Accounts & Persistence).
 *
 * The single persistent schema Features 8 (Arena), 9 (Ladder), 10 (Profile), 11 (News), and 12
 * (Admin) all read and write. Two tiers:
 *   - **Tier A** — auth-adapter tables in the exact Auth.js Postgres shape, so
 *     `DrizzleAdapter(getDb())` works unmodified. `users` is extended with game columns.
 *   - **Tier B** — this feature's game tables.
 *
 * Game content (a squad's config, a battle's replay, a preset) is stored as the **Feature-1 typed
 * `jsonb`** (see `db/types.ts`), never re-declared in SQL (constitution P8 — one source of truth).
 * Defense immutability + the ≤3 cap + attack/defense pool exclusivity are **DB invariants**
 * (copy-on-designate rows + partial-unique indexes), not just application checks.
 *
 * See `specs/007-accounts-persistence/data-model.md` for the full rationale.
 */

import { sql, type SQL, relations } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  smallint,
  bigint,
  boolean,
  uuid,
  jsonb,
  numeric,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

import type { SquadConfig, PresetConfig, Replay } from "./types";

// ---------------------------------------------------------------------------
// Enums (data-model Conventions)
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", ["player", "admin"]);
export const matchModeEnum = pgEnum("match_mode", ["ranked", "practice"]);
export const winnerSideEnum = pgEnum("winner_side", ["attacker", "defender"]);
export const adaptationEnum = pgEnum("adaptation", ["locked", "free"]);
export const postTypeEnum = pgEnum("post_type", ["editorial", "balance", "devlog", "changelog"]);
export const postStatusEnum = pgEnum("post_status", ["draft", "published"]);

// ---------------------------------------------------------------------------
// Tier A — Auth.js adapter tables (Postgres shape) + game extensions on `users`
// ---------------------------------------------------------------------------

/** An account. Auth.js `users` shape, extended with the game columns the adapter simply ignores. */
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // --- game extensions ---
  handle: text("handle").unique(), // commander handle, assigned on onboarding
  role: roleEnum("role").notNull().default("player"), // 'admin' set from the server-side allowlist
  isBot: boolean("isBot").notNull().default(false), // seeded/AI cold-start defenders (P5)
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Tier B — Game tables
// ---------------------------------------------------------------------------

/** A saved 5-unit army in a roster slot — the core player-owned asset. */
export const squads = pgTable(
  "squads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slotIndex: smallint("slot_index").notNull(), // 0..63; baseline usable 0..7
    config: jsonb("config").$type<SquadConfig>().notNull(), // Feature-1 Army (validated on write)
    schemaVersion: smallint("schema_version").notNull().default(1),
    powerRating: integer("power_rating").notNull(), // derived; matchmaking bracketing only
    defenseSlot: smallint("defense_slot"), // NULL = attackable; 0..2 = designated
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("squads_user_slot_uq").on(t.userId, t.slotIndex),
    // structural pool cap + slot distinctness: ≤3 designated, slots 0..2 distinct, pool exclusivity
    uniqueIndex("squads_user_defenseslot_uq")
      .on(t.userId, t.defenseSlot)
      .where(sql`${t.defenseSlot} is not null`),
    index("squads_user_idx").on(t.userId),
    check(
      "squads_defense_slot_chk",
      sql`${t.defenseSlot} is null or (${t.defenseSlot} between 0 and 2)`,
    ),
  ],
);

/** An immutable frozen copy of a squad's config designated for defense (P5/P6). Never UPDATEd. */
export const defenseSnapshots = pgTable(
  "defense_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceSquadId: uuid("source_squad_id").references(() => squads.id, { onDelete: "set null" }),
    name: text("name").notNull(), // copied at designation
    config: jsonb("config").$type<SquadConfig>().notNull(), // FROZEN copy — never updated
    schemaVersion: smallint("schema_version").notNull().default(1),
    powerRating: integer("power_rating").notNull(), // copied
    defenseSlot: smallint("defense_slot").notNull(), // 0..2
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(), // designation time
    deactivatedAt: timestamp("deactivated_at", { mode: "date" }),
  },
  (t) => [
    // exactly one ACTIVE snapshot per (user, slot) ⇒ ≤3 active per user — the DB invariant (SC-005)
    uniqueIndex("defsnap_user_slot_active_uq")
      .on(t.userId, t.defenseSlot)
      .where(sql`${t.active}`),
    index("defsnap_user_active_idx")
      .on(t.userId)
      .where(sql`${t.active}`), // matchmaking serve
    check("defsnap_slot_chk", sql`${t.defenseSlot} between 0 and 2`),
  ],
);

/** A resolved best-of-3 (battle result summary). Written server-side only (P6, FR-020). */
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: matchModeEnum("mode").notNull(), // ranked | practice
    attackerUserId: text("attacker_user_id").references(() => users.id, { onDelete: "set null" }),
    defenderUserId: text("defender_user_id").references(() => users.id, { onDelete: "set null" }),
    attackerSquadId: uuid("attacker_squad_id").references(() => squads.id, { onDelete: "set null" }),
    defenderSnapshotId: uuid("defender_snapshot_id").references(() => defenseSnapshots.id, {
      onDelete: "set null",
    }),
    adaptation: adaptationEnum("adaptation").notNull(), // locked (ranked) | free (practice)
    winnerSide: winnerSideEnum("winner_side").notNull(), // attacker | defender
    attackerGamesWon: smallint("attacker_games_won").notNull(), // Bo3 score
    defenderGamesWon: smallint("defender_games_won").notNull(),
    attackerDamage: integer("attacker_damage").notNull().default(0), // per-side totals (Profile)
    defenderDamage: integer("defender_damage").notNull().default(0),
    durationTicks: integer("duration_ticks"),
    seed: numeric("seed", { precision: 20, scale: 0 }).notNull(), // u64, lossless
    rulesetHash: text("ruleset_hash").notNull(),
    formatVersion: integer("format_version").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("matches_attacker_idx").on(t.attackerUserId),
    index("matches_defender_idx").on(t.defenderUserId),
    index("matches_mode_time_idx").on(t.mode, t.createdAt),
    index("matches_snapshot_idx").on(t.defenderSnapshotId),
  ],
);

/** The full random-access tick stream (jsonb) + scalar provenance, 1:1 with a match. */
export const replays = pgTable("replays", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .unique()
    .references(() => matches.id, { onDelete: "cascade" }),
  replay: jsonb("replay").$type<Replay>().notNull(), // full wire replay
  seed: numeric("seed", { precision: 20, scale: 0 }).notNull(), // provenance (also inside meta)
  rulesetHash: text("ruleset_hash").notNull(),
  formatVersion: integer("format_version").notNull(), // supported-range gate / regenerate
  winnerSide: winnerSideEnum("winner_side").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Net-victory cache, one row per user. Maintained transactionally; reconcilable from `matches`. */
export const ladderStandings = pgTable(
  "ladder_standings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    attackWins: integer("attack_wins").notNull().default(0),
    attackLosses: integer("attack_losses").notNull().default(0),
    defenseWins: integer("defense_wins").notNull().default(0), // defenses held
    defenseLosses: integer("defense_losses").notNull().default(0),
    // net victories = attackWins - defenseLosses (DB-derived so it can't drift from its components)
    netVictories: integer("net_victories").generatedAlwaysAs(
      (): SQL => sql`${ladderStandings.attackWins} - ${ladderStandings.defenseLosses}`,
    ),
    matchesPlayed: integer("matches_played").notNull().default(0),
    totalDamage: bigint("total_damage", { mode: "number" }).notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("standings_net_idx").on(t.netVictories)], // leaderboard ORDER BY net DESC
);

/** The unified news system — all post kinds (§16.2). Owned here; F11/F12 write, F11 reads. */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    body: text("body").notNull(), // markdown
    type: postTypeEnum("type").notNull(),
    status: postStatusEnum("status").notNull().default("draft"),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }), // NULL = auto
    metadata: jsonb("metadata"), // balance diff, commit sha, etc.
    publishedAt: timestamp("published_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("posts_published_idx").on(t.status, t.publishedAt), // News index read
    index("posts_type_idx").on(t.type),
  ],
);

/** A player's custom per-machine-type preset library (provided for Feature 4). */
export const presets = pgTable(
  "presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    machineTypeId: text("machine_type_id").notNull(), // Feature-1 MachineTypeId
    config: jsonb("config").$type<PresetConfig>().notNull(), // loadout + dials + planB
    schemaVersion: smallint("schema_version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("presets_user_type_idx").on(t.userId, t.machineTypeId)],
);

// ---------------------------------------------------------------------------
// Relations (typed joins)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many, one }) => ({
  squads: many(squads),
  defenseSnapshots: many(defenseSnapshots),
  presets: many(presets),
  posts: many(posts),
  standing: one(ladderStandings),
  attacks: many(matches, { relationName: "attacker" }),
  defenses: many(matches, { relationName: "defender" }),
}));

export const squadsRelations = relations(squads, ({ one, many }) => ({
  user: one(users, { fields: [squads.userId], references: [users.id] }),
  snapshots: many(defenseSnapshots),
  matches: many(matches),
}));

export const defenseSnapshotsRelations = relations(defenseSnapshots, ({ one, many }) => ({
  user: one(users, { fields: [defenseSnapshots.userId], references: [users.id] }),
  sourceSquad: one(squads, {
    fields: [defenseSnapshots.sourceSquadId],
    references: [squads.id],
  }),
  matches: many(matches),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
  attacker: one(users, {
    fields: [matches.attackerUserId],
    references: [users.id],
    relationName: "attacker",
  }),
  defender: one(users, {
    fields: [matches.defenderUserId],
    references: [users.id],
    relationName: "defender",
  }),
  attackerSquad: one(squads, {
    fields: [matches.attackerSquadId],
    references: [squads.id],
  }),
  defenderSnapshot: one(defenseSnapshots, {
    fields: [matches.defenderSnapshotId],
    references: [defenseSnapshots.id],
  }),
  replay: one(replays),
}));

export const replaysRelations = relations(replays, ({ one }) => ({
  match: one(matches, { fields: [replays.matchId], references: [matches.id] }),
}));

export const ladderStandingsRelations = relations(ladderStandings, ({ one }) => ({
  user: one(users, { fields: [ladderStandings.userId], references: [users.id] }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));

export const presetsRelations = relations(presets, ({ one }) => ({
  user: one(users, { fields: [presets.userId], references: [users.id] }),
}));
