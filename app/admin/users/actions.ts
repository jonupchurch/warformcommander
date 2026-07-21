"use server";

/**
 * Admin user-moderation Server Actions (layer-3 authz). Each is directly callable, so it re-checks
 * `requireAdmin()` here — never trusting the gated layout ran (research B1; a forged client value is
 * ignored). The service enforces the actor guards (no self / no other-admin) and the delete safety.
 * On success we revalidate the moderation list so the UI reflects the write.
 */

import { revalidatePath } from "next/cache";

import { deleteUser, setUserBanned } from "@/server/admin-users";
import { AuthError, type SessionUser } from "@/server/authz";
import { err, type Result } from "@/server/result";
import { requireAdmin } from "@/server/session";

async function withAdmin<T>(fn: (admin: SessionUser) => Promise<Result<T>>): Promise<Result<T>> {
  try {
    const admin = await requireAdmin();
    return await fn(admin);
  } catch (e) {
    if (e instanceof AuthError) return err("FORBIDDEN", e.message);
    throw e;
  }
}

export async function setUserBannedAction(userId: string, banned: boolean): Promise<Result<void>> {
  const r = await withAdmin((admin) => setUserBanned(admin, userId, banned));
  if (r.ok) revalidatePath("/admin/users");
  return r;
}

export async function deleteUserAction(userId: string): Promise<Result<void>> {
  const r = await withAdmin((admin) => deleteUser(admin, userId));
  if (r.ok) revalidatePath("/admin/users");
  return r;
}
