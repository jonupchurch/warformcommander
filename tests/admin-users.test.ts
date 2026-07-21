/**
 * Admin user-management service (moderation). Verifies the admin gate, ban/unban, the actor guards
 * (no self / no other-admin), the list/KPIs, and — the load-bearing one — that deleting a user leaves
 * every *other* user's stats and shared match history intact (the schema's cascade/set-null contract).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { ladderStandings, matches, users } from "@/db/schema";
import {
  adminUserKpis,
  deleteUser,
  listAdminUsers,
  setUserBanned,
} from "@/server/admin-users";
import { AuthError } from "@/server/authz";

import { closeDb, createTestUser, truncateAll } from "./db-setup";

beforeEach(truncateAll);
afterAll(closeDb);

const admin = () => createTestUser({ role: "admin" });

async function seedStanding(
  userId: string,
  vals: Partial<{ attackWins: number; attackLosses: number; defenseWins: number; defenseLosses: number; matchesPlayed: number }>,
) {
  await getDb().insert(ladderStandings).values({ userId, ...vals });
}

async function seedMatch(attackerUserId: string, defenderUserId: string): Promise<string> {
  const [row] = await getDb()
    .insert(matches)
    .values({
      mode: "ranked",
      adaptation: "locked",
      attackerUserId,
      defenderUserId,
      winnerSide: "attacker",
      attackerGamesWon: 2,
      defenderGamesWon: 1,
      seed: "123",
      rulesetHash: "test",
      formatVersion: 1,
    })
    .returning({ id: matches.id });
  return row!.id;
}

describe("admin-users — admin gate", () => {
  it("rejects every operation for a non-admin", async () => {
    const player = await createTestUser();
    const target = await createTestUser();
    await expect(listAdminUsers(player)).rejects.toThrow(AuthError);
    await expect(adminUserKpis(player)).rejects.toThrow(AuthError);
    await expect(setUserBanned(player, target.id, true)).rejects.toThrow(AuthError);
    await expect(deleteUser(player, target.id)).rejects.toThrow(AuthError);
  });
});

describe("admin-users — ban / unban + guards", () => {
  it("bans then unbans a player", async () => {
    const a = await admin();
    const target = await createTestUser();

    expect((await setUserBanned(a, target.id, true)).ok).toBe(true);
    const [r1] = await getDb().select({ banned: users.banned }).from(users).where(eq(users.id, target.id));
    expect(r1!.banned).toBe(true);

    expect((await setUserBanned(a, target.id, false)).ok).toBe(true);
    const [r2] = await getDb().select({ banned: users.banned }).from(users).where(eq(users.id, target.id));
    expect(r2!.banned).toBe(false);
  });

  it("cannot ban yourself or another admin", async () => {
    const a = await admin();
    const other = await createTestUser({ role: "admin" });
    expect((await setUserBanned(a, a.id, true)).ok).toBe(false);
    expect((await setUserBanned(a, other.id, true)).ok).toBe(false);
  });
});

describe("admin-users — delete preserves everyone else's stats", () => {
  it("deleting A keeps B's standing and the shared match (A nulled, B intact)", async () => {
    const a = await admin();
    const A = await createTestUser();
    const B = await createTestUser();
    await seedStanding(A.id, { attackWins: 5, matchesPlayed: 5 });
    await seedStanding(B.id, { defenseWins: 3, attackLosses: 2, matchesPlayed: 5 });
    const matchId = await seedMatch(A.id, B.id);

    const [bBefore] = await getDb().select().from(ladderStandings).where(eq(ladderStandings.userId, B.id));

    expect((await deleteUser(a, A.id)).ok).toBe(true);

    // A and A's own standing are gone (cascade).
    expect(await getDb().select().from(users).where(eq(users.id, A.id))).toHaveLength(0);
    expect(await getDb().select().from(ladderStandings).where(eq(ladderStandings.userId, A.id))).toHaveLength(0);

    // B's standing is byte-for-byte unchanged — no other user's stats move.
    const [bAfter] = await getDb().select().from(ladderStandings).where(eq(ladderStandings.userId, B.id));
    expect(bAfter).toEqual(bBefore);

    // The shared match survives; only A's reference is nulled, B's side is intact.
    const [m] = await getDb().select().from(matches).where(eq(matches.id, matchId));
    expect(m!.attackerUserId).toBeNull();
    expect(m!.defenderUserId).toBe(B.id);
  });

  it("cannot delete yourself or another admin", async () => {
    const a = await admin();
    const other = await createTestUser({ role: "admin" });
    expect((await deleteUser(a, a.id)).ok).toBe(false);
    expect((await deleteUser(a, other.id)).ok).toBe(false);
    expect(await getDb().select().from(users).where(eq(users.id, other.id))).toHaveLength(1);
  });
});

describe("admin-users — list + KPIs", () => {
  it("lists with derived stats, filters by status, and searches", async () => {
    const a = await admin();
    const alice = await createTestUser({ handle: "AliceCmdr" });
    const bob = await createTestUser({ handle: "BobCmdr" });
    await setUserBanned(a, bob.id, true);
    await seedStanding(alice.id, { attackWins: 7, defenseLosses: 1, matchesPlayed: 10 });

    const all = await listAdminUsers(a);
    expect(all.ok && all.value.length).toBe(3); // admin + alice + bob

    const bannedOnly = await listAdminUsers(a, { filter: "banned" });
    expect(bannedOnly.ok && bannedOnly.value.map((u) => u.id)).toEqual([bob.id]);

    const search = await listAdminUsers(a, { query: "alice" });
    expect(search.ok && search.value.length).toBe(1);
    if (search.ok) {
      expect(search.value[0]!.wins).toBe(7);
      expect(search.value[0]!.netVictories).toBe(6); // 7 attackWins − 1 defenseLosses
    }

    const kpis = await adminUserKpis(a);
    expect(kpis.ok && kpis.value.total).toBe(3);
    expect(kpis.ok && kpis.value.banned).toBe(1);
  });
});
