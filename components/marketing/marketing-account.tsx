"use client";

import { useEffect, useState } from "react";

import { IdentityMenu, type IdentityMenuProps } from "@/components/shell/identity-menu";

/** Minimal shape of the fields the Auth.js `session` callback exposes on `/api/auth/session`. */
type SessionResponse = {
  user?: { id?: string; handle?: string | null; name?: string | null; email?: string | null };
} | null;

/**
 * Session-aware account control for the **marketing** header. The marketing pages are statically
 * prerendered (SEO/CDN), so we can't read `auth()` server-side without forcing them dynamic — instead
 * this client component fetches `/api/auth/session` after hydration and, if signed in, swaps the Log In
 * button for the same Profile/Log Out flyout the app shell shows. It defaults to Log In while the
 * session resolves, so logged-*out* visitors (the common case) never flash; a signed-in visitor sees
 * Log In for a beat before it becomes their account menu.
 */
export function MarketingAccount() {
  const [identity, setIdentity] = useState<IdentityMenuProps["identity"]>(undefined);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<SessionResponse>) : null))
      .then((data) => {
        const u = data?.user;
        if (!active || !u?.id) return; // logged out (null/empty session) → keep the Log In button
        setIdentity({
          // Same display fallback chain the authenticated app layout uses.
          commander: u.handle || u.name?.trim() || u.email?.split("@")[0] || "Commander",
          href: "/profile",
        });
      })
      .catch(() => {}); // network hiccup → harmless; the Log In button stands
    return () => {
      active = false;
    };
  }, []);

  return <IdentityMenu identity={identity} />;
}
