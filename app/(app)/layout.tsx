import { AppShell } from "@/components/shell/app-shell";

/**
 * Authenticated route-group layout — wraps every screen dropped into `app/(app)/` with the
 * AppShell chrome, so later features (Garage/Arena/Ladder/Practice/Profile) inherit nav + header
 * for free. Identity is placeholder demo data until Feature 7 wires real auth/session.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell identity={{ commander: "CMDR_JUPCHURCH", rank: "GOLD III", mmr: 1486 }}>
      {children}
    </AppShell>
  );
}
