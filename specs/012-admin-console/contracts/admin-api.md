# Contract: Admin Service API

**Feature**: `012-admin-console` | **Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

The server-side surface this feature exposes: ruleset read/edit/save (Server Actions), the
balance-report read (a Server Component data call), and the code-push devlog trigger (a Route
Handler, since it is a public machine-to-machine surface). Implemented under `src/server/`
(matching Feature 7/8's layout) and `app/admin/`/`app/api/admin/devlog/`. **Every** mutating
operation runs `requireAdmin(ctx)` first (see [admin-authz.md](./admin-authz.md)) — never a
client-supplied role. Signatures are TypeScript-shaped; `Result<T>` = success `T` or a typed
`{ error, reason? }`. `ctx` = the resolved server session (`{ userId, role }`, Feature 7) — never a
client argument.

## Ruleset read/edit/save (US1, US2)

```ts
// Public (no auth) — the resolve path only. Never called from a client component.
getCurrentRuleset(): Promise<{
  revisionId: string;
  ruleset: Ruleset;        // Feature-1 Tier-2 type
  rulesetHash: string;
}>

// Admin-only — feeds the editor screen.
getRulesetForEdit(ctx): Promise<{
  revisionId: string;
  data: Ruleset;
  rulesetHash: string;
  version: number;         // MUST be echoed back as `expectedVersion` on save
}>
// errors: NOT_ADMIN

// Admin-only — the one mutation. Validated, diffed, and committed atomically with its balance post.
saveRuleset(ctx, input: {
  data: Ruleset;
  expectedVersion: number; // from the getRulesetForEdit() the editor loaded
  note?: string;
}): Promise<
  | { noop: true;  revisionId: string; rulesetHash: string; version: number }
  | { noop: false; revisionId: string; rulesetHash: string; version: number; postId: string }
  | { error: "VALIDATION_FAILED"; reason: string }
  | { error: "STALE_EDIT" }   // another admin saved first — reload and re-apply
  | { error: "NOT_ADMIN" }
>
```

`saveRuleset` is the single entry point for FR-010…FR-016: it validates, diffs against the current
revision, short-circuits on a no-op (no new revision, no post), and otherwise runs one transaction
— new `rulesets` row → `current_ruleset` pointer swap (guarded by `expectedVersion`) → one
`type='balance'` `posts` insert — committing together or not at all. Full mechanism:
[data-model.md → How a live edit takes effect](../data-model.md#how-a-live-edit-takes-effect-for-the-next-match-the-load-bearing-mechanism).

**Server Action wiring** (`app/admin/balance/actions.ts`):

```ts
"use server";
export async function saveRulesetAction(input: SaveRulesetInput) {
  const session = await auth();
  requireAdmin(session);                 // defense-in-depth — re-checked here, not trusted from the caller
  const ctx = { userId: session.user.id, role: session.user.role };
  const result = await saveRuleset(ctx, input);
  if (!("error" in result)) revalidateTag("ruleset-current");
  return result;
}
```

## Balance report (advisory, read-only — US5)

```ts
getLatestBalanceReport(): Promise<BalanceReport | null>
```

Reads the latest committed report file (Feature 2's [balance-report.md](../../002-auto-balancer/contracts/balance-report.md)
JSON artifact, e.g. the newest file under `balance-reports/`). Returns `null` if none exists yet —
the panel states that clearly and editing remains available (US5-AS2, FR-019). This feature **never
runs the balancer or mutates the report** — it is a pure read of an existing artifact.

## Code-push devlog (US4) — Route Handler, not a Server Action

```ts
// POST /api/admin/devlog
// Headers: Authorization: Bearer <DEVLOG_WEBHOOK_SECRET>
// Body:
{
  sha: string;
  message: string;
  author: string;
  compareUrl: string;
  branch: string;
  deploymentUrl?: string;
  tag?: string;             // present ⇒ posts as type='changelog' instead of 'devlog'
}
// Responses: 200 { created: boolean; postId?: string } | 401 (bad/absent secret) | 400 (bad payload)
```

Internally calls `recordDevlogPost(payload)` (`src/server/devlog.ts`), which derives
`slug = devlog-<sha7>` (or `changelog-<sha7>`) and inserts with `ON CONFLICT (slug) DO NOTHING` —
idempotent by commit SHA (FR-018). See [admin-authz.md](./admin-authz.md) for the secret
verification and [data-model.md](../data-model.md#devlog--changelog-post-shape-posts-typedevlogchangelog--fr-017018)
for the exact post shape.

## Cross-cutting

- **Transactions**: `saveRuleset` uses a postgres-js **interactive transaction** (the same
  capability Feature 7's `designateDefense`/`recordMatch` rely on) — the revision insert, the
  pointer swap, and the balance-post insert are one unit.
- **Validation**: `data` passes `validateRuleset()` **before** the transaction opens — a validation
  failure never touches the database (data-model B3).
- **Caching**: `getCurrentRuleset()` is never served from a per-instance cache (P6 — see
  data-model.md "Read path"). `saveRuleset` calls `revalidateTag('ruleset-current')` after commit
  so **display** surfaces (not the resolve path) refresh.
- **Errors** are typed reasons (`VALIDATION_FAILED`, `STALE_EDIT`, `NOT_ADMIN`), never raw DB
  errors — callers and tests assert on them directly.

## Non-goals

Running the balancer (Feature 2's job — this only reads its output), rendering the public News
feed (Feature 11's job — this only writes `posts`), matchmaking/the Bo3 loop (Feature 8's job —
this only provides `getCurrentRuleset()`), and any editorial-post authoring UI (spec.md's user
stories cover only `balance`/`devlog`/`changelog` auto-posts — see plan.md Constitution Check /
Principle IV for the cross-feature note on Feature 11's broader claim).
