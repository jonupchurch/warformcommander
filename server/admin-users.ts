/**
 * Admin user-management service (moderation). Every function is **admin-gated** (`assertAdmin` on an
 * already-resolved {@link SessionUser}) and reads/writes only the shared Feature-7 schema.
 *
 * **Delete safety (the load-bearing invariant):** removing a user must never alter anyone else's
 * record. The schema already guarantees this — a user's *own* rows cascade (accounts, sessions,
 * squads, defense_snapshots, ladder_standings, presets) while shared history is preserved by
 * `ON DELETE SET NULL` (`matches.attacker/defenderUserId`, `posts.authorId`, `rulesets.editorId`). So
 * a plain `DELETE FROM "user"` keeps every opponent's match rows and standings intact; this module
 * only adds the actor guards (never delete/ban yourself or another admin).
 *
 * Server-only.
 */

import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";

import { getDb } from "@/db";
import { defenseSnapshots, ladderStandings, users } from "@/db/schema";

import { assertAdmin, type Role, type SessionUser } from "./authz";
import { err, ok, type Result } from "./result";

export type UserFilter = "all" | "active" | "banned";

/** One row of the admin user list — identity + moderation status + career stats (0 when unranked). */
export interface AdminUserRow {
  id: string;
  handle: string | null;
  name: string | null;
  email: string | null;
  role: Role;
  isBot: boolean;
  banned: boolean;
  createdAt: Date;
  netVictories: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  defenseCount: number;
}

export interface AdminUserKpis {
  total: number;
  banned: number;
  bots: number;
  humans: number;
}

/** A hard cap so a huge table can never dump unbounded rows (paging is a later refinement). */
const LIST_CAP = 200;

/** The moderation user list — searchable (handle/name/email) + filterable by status, newest first. */
export async function listAdminUsers(
  admin: SessionUser,
  opts: { query?: string; filter?: UserFilter } = {},
): Promise<Result<AdminUserRow[]>> {
  assertAdmin(admin);
  const db = getDb();

  const filters = [];
  if (opts.filter === "banned") filters.push(eq(users.banned, true));
  if (opts.filter === "active") filters.push(eq(users.banned, false));
  const q = opts.query?.trim();
  if (q) {
    const like = `%${q}%`;
    filters.push(or(ilike(users.handle, like), ilike(users.name, like), ilike(users.email, like)));
  }

  const rows = await db
    .select({
      id: users.id,
      handle: users.handle,
      name: users.name,
      email: users.email,
      role: users.role,
      isBot: users.isBot,
      banned: users.banned,
      createdAt: users.createdAt,
      attackWins: ladderStandings.attackWins,
      attackLosses: ladderStandings.attackLosses,
      defenseWins: ladderStandings.defenseWins,
      defenseLosses: ladderStandings.defenseLosses,
      netVictories: ladderStandings.netVictories,
      matchesPlayed: ladderStandings.matchesPlayed,
    })
    .from(users)
    .leftJoin(ladderStandings, eq(ladderStandings.userId, users.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(LIST_CAP);

  // Active-defense counts for just this page, merged in (avoids a correlated subquery).
  const ids = rows.map((r) => r.id);
  const defCounts = ids.length
    ? await db
        .select({ userId: defenseSnapshots.userId, c: count() })
        .from(defenseSnapshots)
        .where(and(inArray(defenseSnapshots.userId, ids), eq(defenseSnapshots.active, true)))
        .groupBy(defenseSnapshots.userId)
    : [];
  const defByUser = new Map(defCounts.map((d) => [d.userId, Number(d.c)]));

  const list: AdminUserRow[] = rows.map((r) => ({
    id: r.id,
    handle: r.handle,
    name: r.name,
    email: r.email,
    role: r.role,
    isBot: r.isBot,
    banned: r.banned,
    createdAt: r.createdAt,
    netVictories: r.netVictories ?? 0,
    wins: (r.attackWins ?? 0) + (r.defenseWins ?? 0),
    losses: (r.attackLosses ?? 0) + (r.defenseLosses ?? 0),
    matchesPlayed: r.matchesPlayed ?? 0,
    defenseCount: defByUser.get(r.id) ?? 0,
  }));
  return ok(list);
}

/** Headline moderation counts for the KPI cards. */
export async function adminUserKpis(admin: SessionUser): Promise<Result<AdminUserKpis>> {
  assertAdmin(admin);
  const db = getDb();
  const [totalRow] = await db.select({ c: count() }).from(users);
  const [bannedRow] = await db.select({ c: count() }).from(users).where(eq(users.banned, true));
  const [botRow] = await db.select({ c: count() }).from(users).where(eq(users.isBot, true));
  const total = Number(totalRow?.c ?? 0);
  const banned = Number(bannedRow?.c ?? 0);
  const bots = Number(botRow?.c ?? 0);
  return ok({ total, banned, bots, humans: total - bots });
}

/** Fetch a target user's role, or `null` if they don't exist. */
async function targetRole(userId: string): Promise<Role | null> {
  const [row] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.role ?? null;
}

/** Ban or unban a user. Cannot target yourself or another admin (A2/A3 moderation guard). */
export async function setUserBanned(
  admin: SessionUser,
  userId: string,
  banned: boolean,
): Promise<Result<void>> {
  assertAdmin(admin);
  if (userId === admin.id) return err("FORBIDDEN", "you cannot ban your own account");
  const role = await targetRole(userId);
  if (role === null) return err("NOT_FOUND", "no such user");
  if (role === "admin") return err("FORBIDDEN", "cannot ban another admin");
  await getDb().update(users).set({ banned }).where(eq(users.id, userId));
  return ok(undefined);
}

/**
 * Permanently delete a user. The account's own rows cascade; shared match history is retained with
 * the id nulled (see the module note), so **no other player's stats change**. Cannot target yourself
 * or another admin.
 */
export async function deleteUser(admin: SessionUser, userId: string): Promise<Result<void>> {
  assertAdmin(admin);
  if (userId === admin.id) return err("FORBIDDEN", "you cannot delete your own account");
  const role = await targetRole(userId);
  if (role === null) return err("NOT_FOUND", "no such user");
  if (role === "admin") return err("FORBIDDEN", "cannot delete another admin");
  await getDb().delete(users).where(eq(users.id, userId));
  return ok(undefined);
}
