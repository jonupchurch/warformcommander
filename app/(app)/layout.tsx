import { auth } from "@/auth";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Authenticated route-group layout — wraps every screen dropped into `app/(app)/` with the AppShell
 * chrome, so later features (Garage/Arena/Ladder/Practice/Profile) inherit nav + header for free.
 *
 * Identity is read from the **server session** (`auth()`, the DB session — never a client value): a
 * signed-in commander shows their real name (linking to their profile); a signed-out visitor gets no
 * identity, so the shell renders its neutral "Guest" state (never a real or invented name). There is no
 * rank/MMR in v1 — the ladder is net-victory based (Feature 9) — so the badge carries only the name.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = (await auth())?.user;
  const identity = user?.id
    ? { commander: user.name?.trim() || user.email?.split("@")[0] || "Commander", href: "/profile" }
    : undefined;

  return <AppShell identity={identity}>{children}</AppShell>;
}
