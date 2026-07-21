import type { Metadata } from "next";

import { AdminUsersScreen } from "@/components/admin/admin-users-screen";
import { adminUserKpis, listAdminUsers } from "@/server/admin-users";
import { requireAdmin } from "@/server/session";

/**
 * Admin user-management route (moderation). Server Component: `requireAdmin()` is the **layer-2**
 * re-check (the layout redirect is layer-1, the Server Actions are layer-3), then it loads the roster
 * + KPIs and hands them to the client screen. Reads live each request (force-dynamic).
 */
export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const [usersRes, kpisRes] = await Promise.all([listAdminUsers(admin), adminUserKpis(admin)]);
  return (
    <AdminUsersScreen
      initialUsers={usersRes.ok ? usersRes.value : []}
      kpis={kpisRes.ok ? kpisRes.value : { total: 0, banned: 0, bots: 0, humans: 0 }}
      currentAdminId={admin.id}
    />
  );
}
