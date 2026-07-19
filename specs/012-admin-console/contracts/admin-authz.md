# Contract: Admin Authorization (three-layer server-side gate + webhook secret)

**Feature**: `012-admin-console` | **Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

The trust boundary the whole feature sits behind (constitution **P6**, **Principle II**, both
never-waived). Two distinct caller types, two distinct mechanisms — **never conflated**:

1. A **human admin** — authorized by `users.role === 'admin'`, read server-side from Feature 7's
   database session, **re-checked independently at three layers** (research B1).
2. A **system caller** (the post-deploy hook) — has **no user session**; authorized by a
   **verified shared secret**, never a role (research B2).

## Files

```
proxy.ts                             # EDIT or NEW — UX-only redirect for `/admin*` (Node runtime)
app/admin/layout.tsx                 # NEW — the REAL check: requireAdmin() at the RSC level
app/admin/balance/actions.ts         # NEW — requireAdmin() re-checked inside the Server Action
app/api/admin/devlog/route.ts        # NEW — secret verification (Node runtime, no session)
src/server/authz.ts                  # EXISTING (Feature 7) — requireAdmin(session), reused verbatim
```

## Layer 1 — `proxy.ts` (UX only, never the security boundary)

```ts
// proxy.ts (Next.js 16's renamed middleware; Node runtime by default)
import { auth } from "@/auth";

export default auth((req) => {
  if (req.nextUrl.pathname.startsWith("/admin")) {
    if (!req.auth) return Response.redirect(new URL("/api/auth/signin", req.url));
    if (req.auth.user.role !== "admin") return Response.redirect(new URL("/", req.url));
  }
});
```

This is a **fast first pass for UX** — it bounces an obviously-unauthorized browser navigation
before a page even renders. It is explicitly **not** trusted as the security guarantee:
**CVE-2025-29927** let attackers bypass Next.js middleware entirely by forging the
`x-middleware-subrequest` header (research B1) — so every admin surface re-checks independently
below, and would still be safe if this file were deleted entirely.

## Layer 2 — the admin layout RSC (the first real check)

```ts
// app/admin/layout.tsx
import { auth } from "@/auth";
import { requireAdmin } from "@/server/authz";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");
  requireAdmin(session);   // throws / returns a typed denial if session.user.role !== 'admin'
  return <AdminShell>{children}</AdminShell>;
}
```

`requireAdmin` is **Feature 7's existing function** (`src/server/authz.ts`,
[persistence-api.md](../../007-accounts-persistence/contracts/persistence-api.md)) — this feature
does not reimplement it, it calls it, keeping exactly one definition of "is this session an admin"
(P8, no drift between features).

## Layer 3 — every Server Action and Route Handler (the check that actually authorizes the mutation)

```ts
// app/admin/balance/actions.ts
"use server";
import { auth } from "@/auth";
import { requireAdmin } from "@/server/authz";

export async function saveRulesetAction(input: SaveRulesetInput) {
  const session = await auth();
  requireAdmin(session);          // re-checked HERE — never assume the layout already ran
  // ... saveRuleset(ctx, input)
}
```

**Why re-check a third time**: Server Actions are directly callable (a client can `fetch` the
action's endpoint without ever rendering the layout that wraps the page it's declared in) — treat
every Server Action "with the same security considerations as a public-facing API endpoint"
(research B1). The layout check stops a browser navigation; this check stops a forged direct call.

## Layer for the system caller — webhook secret (no session exists to check a role against)

```ts
// app/api/admin/devlog/route.ts
export const runtime = "nodejs";

function verifySecret(req: Request): boolean {
  const header = req.headers.get("authorization");           // "Bearer <secret>"
  const provided = header?.replace(/^Bearer\s+/, "") ?? "";
  const expected = process.env.DEVLOG_WEBHOOK_SECRET ?? "";
  return provided.length > 0 && timingSafeEqual(provided, expected); // constant-time compare
}

export async function POST(req: Request) {
  if (!verifySecret(req)) return new Response(null, { status: 401 });
  // ... parse payload, call recordDevlogPost(...)
}
```

A missing/invalid secret is **401** and **no row is written** — the same "deny before any state is
touched" posture as the human-admin gate, applied to the caller type that actually reaches this
endpoint (no `users.role` exists to check; a role check here would be a category error, not extra
safety).

## Environment variables

| Var | Purpose |
|---|---|
| `DEVLOG_WEBHOOK_SECRET` | shared secret the post-deploy hook (GitHub Action or Vercel webhook) presents; verified constant-time, server-side only |
| `ADMIN_ALLOWLIST` | **existing** (Feature 7) — seeds `users.role='admin'`; this feature does not add a second admin-grant mechanism |

## Guarantees

1. **No surface authorizes from client state.** `role` is read from the DB session
   (`await auth()` → `session.user.role`); a forged `admin` cookie/body/query field is never
   consulted at any of the three layers (FR-003, SC-001).
2. **A role revocation takes effect on the very next request, no re-login** — inherited directly
   from Feature 7's database-session strategy (research B1; Feature 7 SC-002).
3. **The webhook cannot be reached by a user session at all** — it checks a secret, not a role,
   because no user identity exists for a CI/deploy-hook caller to present (FR-004).
4. **Denial happens before any admin data is read or written** — `requireAdmin`/`verifySecret` run
   as the first statement of every layer; no query executes on a denied request (SC-001).
5. **Deleting `proxy.ts` degrades UX, not security** — every real authorization decision is made
   at layers 2/3/webhook, which do not depend on middleware having run.

## Non-goals

A second admin-grant mechanism (Feature 7's `ADMIN_ALLOWLIST` is the only one); rate-limiting/abuse
protection on the webhook (platform layer, out of scope here); a UI for managing admin roles (role
assignment is an env-var allowlist + Feature 7's `signIn` event, not a console feature).
