import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Authenticated route-group layout — wraps every screen dropped into `app/(app)/` with the AppShell
 * chrome, so later features (Garage/Arena/Ladder/Practice/Profile) inherit nav + header for free.
 *
 * Two session-derived jobs (all from `auth()`, the DB session — never a client value):
 *  1. **Registration gate** — a signed-in commander with no handle yet is redirected to `/onboarding`
 *     to choose one before using the app (handles are required). `/onboarding` lives outside this
 *     route group, so the gate never loops. Signed-out visitors are not gated (they browse read-only).
 *  2. **Identity** — the badge shows the commander's handle (falling back to name until one is set);
 *     a signed-out visitor gets no identity, so the shell renders its neutral "Guest" state. There is
 *     no rank/MMR in v1 (the ladder is net-victory based, Feature 9), so the badge carries only the name.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = (await auth())?.user;
  if (user?.id && !user.handle) redirect("/onboarding");

  const identity = user?.id
    ? { commander: user.handle || user.name?.trim() || user.email?.split("@")[0] || "Commander", href: "/profile" }
    : undefined;

  return <AppShell identity={identity}>{children}</AppShell>;
}
