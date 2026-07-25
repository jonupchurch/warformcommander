"use server";

import { signOut } from "@/auth";

/**
 * Sign the current commander out and drop them on the marketing home. Server-authoritative: clears the
 * database session (Auth.js `session: "database"`), so it's an actual "sign out" — not just a cookie
 * wipe — and the redirect happens server-side (canonical mutate-then-navigate, matching `claimHandle`).
 * Invoked as a `<form action>` from the IdentityMenu flyout's Log Out item.
 */
export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
