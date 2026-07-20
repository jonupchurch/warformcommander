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
    } & DefaultSession["user"];
  }

  interface User {
    role: "player" | "admin";
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    role: "player" | "admin";
  }
}
