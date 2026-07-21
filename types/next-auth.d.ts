/**
 * Module augmentation for Auth.js — surface the game fields on the session (Feature 7). `id` is the
 * owner key every authz check uses; `role` is read **server-side** from the DB user each request
 * (database-session strategy), never from client state (Principle II, P6).
 */

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "player" | "admin";
      /** Commander handle (public identity); `null` until chosen at onboarding. */
      handle: string | null;
      /** Admin-set moderation flag — a banned session is rejected at `requireSession` (A1). */
      banned: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: "player" | "admin";
    /** Optional on the raw user — a fresh OAuth user has none until onboarding sets it. */
    handle?: string | null;
    banned?: boolean;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    role: "player" | "admin";
    handle?: string | null;
    banned?: boolean;
  }
}
