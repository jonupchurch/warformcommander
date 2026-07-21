/**
 * Feature 7 — `setHandle` (the server-authoritative handle write behind onboarding + profile rename),
 * against the local dev Postgres. Proves: a valid claim persists; uniqueness is **case-insensitive**;
 * a commander can re-save / change their own handle; invalid input writes nothing; and a handle frees
 * up once its owner renames away.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { setHandle } from "@/server/handle";
import { closeDb, createTestUser, truncateAll } from "./db-setup";

beforeEach(truncateAll);
afterAll(closeDb);

async function dbHandle(userId: string): Promise<string | null> {
  const [row] = await getDb().select({ handle: users.handle }).from(users).where(eq(users.id, userId));
  return row?.handle ?? null;
}

describe("setHandle", () => {
  it("claims a valid handle and persists it", async () => {
    const a = await createTestUser();
    const res = await setHandle(a, "Ace");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.handle).toBe("Ace");
    expect(await dbHandle(a.id)).toBe("Ace");
  });

  it("rejects a duplicate handle case-insensitively and writes nothing", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await setHandle(a, "Ace");

    const res = await setHandle(b, "ace");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("HANDLE_TAKEN");
    expect(await dbHandle(b.id)).toBeNull();
  });

  it("lets a commander re-save the same handle and change it", async () => {
    const a = await createTestUser();
    await setHandle(a, "Ace");
    expect((await setHandle(a, "Ace")).ok).toBe(true); // same value ⇒ not a self-clash
    const res = await setHandle(a, "Ace_Prime");
    expect(res.ok).toBe(true);
    expect(await dbHandle(a.id)).toBe("Ace_Prime");
  });

  it("rejects invalid handles (VALIDATION_FAILED) without writing", async () => {
    const a = await createTestUser();
    for (const bad of ["ab", "bad handle", "12345", "admin"]) {
      const res = await setHandle(a, bad);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("VALIDATION_FAILED");
    }
    expect(await dbHandle(a.id)).toBeNull();
  });

  it("frees a handle once its owner renames away", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await setHandle(a, "Ace");
    expect((await setHandle(b, "Ace")).ok).toBe(false); // taken
    await setHandle(a, "Ace_Two");
    expect((await setHandle(b, "Ace")).ok).toBe(true); // now free
    expect(await dbHandle(b.id)).toBe("Ace");
  });
});
