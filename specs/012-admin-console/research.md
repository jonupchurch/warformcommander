# Research: Admin Console + Balance Publishing

**Feature**: `012-admin-console` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

Resolves the genuine unknowns behind the admin console: **(A) the live-ruleset store + its
authoritative load/cache/invalidation**, **(B) server-side admin authz on Next.js 16 App Router**,
**(C) the two auto-post triggers** (balance-edit + code-push), and **(D) ruleset diffing +
concurrency**. Format per decision: **Decision / Rationale / Alternatives considered**, sources cited
inline. The store (A) is the load-bearing contribution — it fills the coordination gap between
Feature 7 (stores only `rulesetHash` on matches/replays) and Feature 8 (must load "the current
ruleset" at resolve time).

---

## Workstream A — The live-ruleset store & authoritative load (P6, P8, FR-005…FR-009)

### A1. Where the live ruleset lives → **append-only `rulesets` revisions + a singleton current-pointer, in Postgres**

- **Decision**: Add two tables to Feature 7's `db/schema.ts` on the existing postgres-js/Drizzle
  wiring: **`rulesets`** (append-only revision history — the Tier-2 `Ruleset` as `jsonb().$type<Ruleset>()`
  + `rulesetHash` + `editorId` + `parentId` audit chain + timestamp) and **`current_ruleset`** (a
  **singleton pointer** row naming the active revision + an optimistic-concurrency `version`). Store
  the `Ruleset` as **typed `jsonb`, never normalized into per-field SQL** — it is Feature 1's typed
  contract; normalizing would duplicate and drift the sim's type system (constitution **P8**, exactly
  as Feature 7 stores `SquadConfig`/`Replay` as jsonb).
- **Rationale**: The engine reads the `Ruleset` as one data blob (`resolve(BattleInput { ruleset, … })`,
  [engine-api](../001-battle-sim-core/contracts/engine-api.md)); Postgres `jsonb` gives a parsed,
  TS-typed object for free via Drizzle `.$type<Ruleset>()` + postgres-js — the same pattern Feature 7
  already proved for squads/replays ([007 research C3]). A **single current row** makes the
  read a trivial indexed lookup and makes "the edit takes effect immediately" a one-row pointer swap.
  The **append-only history** gives the audit trail and the **diff basis** the balance post needs
  (prev revision → new revision), at negligible cost (a ruleset is tens of KB; TOAST compresses it).
- **Reconciling "un-versioned (safe)"** (design doc §16.2 / §18): that property is about the
  **engine** — recorded replays are self-contained (they carry `rulesetHash` + full per-tick
  snapshots, [001 data-model Tier 3]) and **never re-derive** from the ruleset, so no old-version
  migration is ever needed. The revision history here is an **admin audit/diff convenience**, not a
  replay-reconstruction dependency (FR-008). Keeping it does **not** re-introduce versioned
  resolution — the engine still reads exactly one current ruleset.
- **Alternatives considered**: *A committed file / env var holding the ruleset* — **rejected**: not
  live-editable at runtime; every balance tweak would need a code change + redeploy, defeating §16.2
  and the auto-post loop. *An `isCurrent boolean` partial-unique flag on `rulesets`* (instead of a
  pointer table) — viable and one fewer table, but a dedicated pointer gives a cleaner atomic swap
  and a natural home for the concurrency `version`; noted as the fallback. *A single mutable
  `ruleset` row updated in place* — **rejected**: loses the diff basis and audit trail the balance
  post + P4 review want, and makes concurrency harder to reason about.
- Sources: [Feature 7 data-model (posts/jsonb conventions)](../007-accounts-persistence/data-model.md),
  [Feature 1 data-model (Ruleset Tier 2 + rulesetHash)](../001-battle-sim-core/data-model.md),
  [Postgres JSON types](https://www.postgresql.org/docs/current/datatype-json.html).

### A2. The authoritative load → **`getCurrentRuleset()` reads Postgres on the resolve path; no per-instance cache in the hot read**

- **Decision**: `getCurrentRuleset()` reads the `current_ruleset` → `rulesets` join **directly from
  Postgres** on the resolve path (Feature 8), returning `{ revisionId, ruleset, rulesetHash }`. Do
  **not** serve the authoritative resolve read from a warm in-process cache. Read-heavy **display**
  surfaces (the editor page, any public "current balance" view) MAY use Next's Data Cache tagged
  `ruleset-current`, invalidated on save.
- **Rationale**: On Vercel's serverless/Fluid Compute, **instances don't share memory and
  `revalidateTag()` invalidation is local to the instance that ran it** — "revalidation events are
  local by default; calling `revalidateTag()` on instance A only invalidates the cache on that
  instance" ([Next.js caching guide], [Next.js revalidateTag]). A per-instance in-memory ruleset
  cache would therefore let a **warm instance resolve the next match against a stale ruleset** —
  unacceptable for a server-authoritative fairness lever (**P6**). A single indexed row read
  (jsonb, TOAST) is cheap and is already co-located with the resolve route's other DB work
  (recording the match/replay), so reading it fresh costs essentially nothing and **eliminates the
  stale window** (SC-008). Display surfaces can afford `stale-while-revalidate` because they don't
  decide battles.
- **Cache-busting for display**: on save, call `revalidateTag('ruleset-current')` (and the News
  tags) so the editor and any cached "current balance" view refresh. If the app adopts Cache
  Components, use `cacheTag('ruleset-current')` on the cached read + `updateTag('ruleset-current')`
  from the save action for read-your-own-writes ([Next.js cacheTag], [updateTag vs revalidateTag]).
- **Alternatives considered**: *Cache the ruleset in memory with tag invalidation* — **rejected for
  the resolve read** (stale-window risk above); fine for display. *A short TTL cache (e.g. 5 s)* —
  still a stale window on a fairness input; not worth it at one-row cost. *Request-scoped
  memoization* (React `cache()` / a per-request singleton) — **adopted** to avoid re-reading within a
  single resolve request, which is safe (no cross-request staleness).
- Sources: [Next.js Caching guide](https://nextjs.org/docs/app/guides/caching),
  [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag),
  [cacheTag](https://nextjs.org/docs/app/api-reference/functions/cacheTag),
  [updateTag vs revalidateTag (#84805)](https://github.com/vercel/next.js/discussions/84805).

### A3. `rulesetHash` provenance → **compute with Feature 1's canonical hash, never a bespoke one**

- **Decision**: The store computes `rulesetHash` by calling **Feature 1's canonical
  serialization + hash** of the `Ruleset` (the exact function the engine stamps on each replay), not
  a hash invented here. Expose `hashRuleset(ruleset)` from the engine's WASM/TS surface if not
  already standalone; the store imports **types + that pure function only** (never the resolve engine
  into the client).
- **Rationale**: The whole provenance chain depends on hash agreement: a match resolved against
  revision *r* stamps `rulesetHash(r)` on its `matches`/`replays` provenance columns (Feature 7); the
  store recorded `rulesetHash(r)` on the same revision. Those two hashes **must be byte-equal** so a
  replay's `rulesetHash` can be joined back to the `rulesets` row that produced it (audit: match →
  hash → revision → balance post). Feature 1 already pins a deterministic, integer-only,
  map-free serialization whose bytes are stable ([001 research A5/C1]) — reuse it, don't fork it.
- **Alternatives considered**: *A separate hash here (e.g. `sha256(JSON.stringify(ruleset))`)* —
  **rejected**: key ordering / number formatting could differ from the engine's canonical bytes,
  silently breaking the join and the "same hash" guarantee. *No hash link at all* — rejected: loses
  the match→revision provenance that makes a disputed match auditable (P4/P6).
- Sources: [Feature 1 research A5 (golden-hash / canonical serialization)](../001-battle-sim-core/research.md),
  [Feature 1 data-model (rulesetHash)](../001-battle-sim-core/data-model.md).

---

## Workstream B — Server-side admin authz on Next.js 16 (P6, Principle II, FR-001…FR-004)

### B1. Where the check lives → **defense-in-depth: `proxy.ts` UX redirect + a `requireAdmin()` re-check inside every action/handler**

- **Decision**: Guard the `/admin` segment two ways. (1) A **`proxy.ts`** (Next.js 16's renamed
  middleware, **Node runtime by default**) redirect that bounces non-admins away from `/admin*` for
  UX. (2) The **real** security check: `requireAdmin(ctx)` re-reads the server session (`await auth()`,
  Feature 7) and asserts `role === 'admin'` **inside every admin Server Action, route handler, and the
  admin layout RSC** — the check that actually authorizes each mutation/read. Reuse Feature 7's
  server-authoritative DB session + `session.user.role`
  ([auth contract](../007-accounts-persistence/contracts/auth.md)).
- **Rationale**: The 2026 App Router consensus is a **layered** model where "edge middleware, Server
  Components, Route Handlers, and Server Actions all enforce permissions independently," and the
  handler-level check is the guarantee — middleware is "a fast first pass," "a UX layer, not a
  security layer" ([WorkOS 2026 auth guide], [Next.js proxy docs]). This is not optional caution:
  **CVE-2025-29927** (March 2025) let attackers **bypass Next.js middleware entirely** by forging the
  `x-middleware-subrequest` header — so anything relying **only** on `proxy.ts`/middleware for authz
  is exploitable ([WorkOS], [nexgismo 2026]). Treating Server Actions "with the same security
  considerations as public-facing API endpoints" and putting an `authorize()`/`requireAdmin()` at the
  top of each is the dominant, correct RBAC pattern. This directly satisfies **Principle II** ("never
  trust client-side state for authorization; check it server-side") and **P6**.
- **Migration note**: Next.js 16 renamed `middleware.ts` → `proxy.ts`; a leftover `middleware.ts` is
  **silently ignored at build**, so a guard written the old way "stops running" and protected routes
  become public ([Next.js middleware-to-proxy], [bhived lesson]). Since this repo has no middleware
  yet, we author `proxy.ts` directly — no codemod needed.
- **Forged-flag rejection**: because the role is read from the **DB session** server-side (Feature 7
  database-session strategy), a client-supplied `admin` cookie/body/query value is never consulted —
  it is structurally ignored (FR-003, SC-001).
- **Alternatives considered**: *Middleware-only gate* — **rejected** (CVE-2025-29927; UX-layer only).
  *A hosted-authz service* — rejected: the role already lives in *our* Postgres (Feature 7); adding a
  vendor for a boolean check is coupling against P6's self-owned posture.
- Sources: [WorkOS — Next.js App Router auth guide 2026](https://workos.com/blog/nextjs-app-router-authentication-guide-2026),
  [Next.js proxy file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy),
  [Next.js Authentication guide](https://nextjs.org/docs/app/guides/authentication),
  [middleware-to-proxy](https://nextjs.org/docs/messages/middleware-to-proxy),
  [Next.js 16 auth security mistakes 2026](https://www.nexgismo.com/blog/nextjs-16-auth-security-mistakes-2026),
  [RBAC in Next.js 16 with Auth.js v5](https://dev.to/huangyongshan46a11y/how-to-add-role-based-access-control-to-nextjs-16-with-authjs-v5-e92).

### B2. The webhook's trust boundary → **verified shared secret / signature (system caller), not a role**

- **Decision**: The code-push devlog endpoint (`POST /api/admin/devlog`) is **machine-to-machine** —
  it has **no user session**. Gate it with a **verified shared secret** in an `Authorization` header
  (constant-time compare) or, if delivered by a Vercel webhook, verify the webhook **signature**;
  never a user role. Node runtime. A bad/absent secret → 401, no write (FR-004, US2-AS5).
- **Rationale**: A caller with no user identity cannot be authorized by `users.role`; the correct
  boundary for a trusted system caller is a secret/signature it holds. This keeps the authz story
  consistent (server-verified, never a client flag) while acknowledging the caller type. Deploy-hook
  and webhook URLs "should be treated with the same security as any other token or password"
  ([Vercel deploy hooks]); a Vercel webhook is verifiable via its signature ([Vercel webhooks API]).
- **Alternatives considered**: *Reuse an admin session for the webhook* — impossible (CI has no
  session). *An unauthenticated endpoint* — rejected: anyone could forge devlog posts. *IP allowlist
  only* — rejected: brittle and not a real authentication factor; a secret/signature is the standard.
- Sources: [Vercel Deploy Hooks](https://vercel.com/docs/deploy-hooks),
  [Vercel Webhooks API](https://vercel.com/docs/webhooks/webhooks-api).

---

## Workstream C — The two auto-post triggers (§16.2, FR-014…FR-018)

### C1. Balance-edit → news → **compute the diff inside the save transaction; one published `balance` post**

- **Decision**: Inside the atomic `saveRuleset` transaction, after recording the new revision and
  swapping the pointer, **compute a deep diff** of the previous vs. new `Ruleset`, render a
  human-readable summary, and **insert one** `posts` row (`type='balance'`, `status='published'`,
  `authorId` = the editing admin, `metadata.diff` = the structured changed-path list, +
  `metadata.rulesetId`/`rulesetHash`). A **no-op** save (empty diff) inserts **nothing** and creates
  no new revision (FR-015). The post + revision + pointer swap are **one transaction** (FR-013) so an
  edit is never published without its post and vice-versa (US3-AS4).
- **Rationale**: The diff basis (prev revision `data`) is already in hand inside the save tx, so
  computing it there is free and keeps the "exactly one post per changing save" invariant atomic and
  race-free. Publishing immediately matches §16.2 ("balance changes … auto-post as a live
  devlog/changelog"). Feature 11 renders it as an ordinary published post; Feature 7's `posts.metadata`
  jsonb + nullable `authorId` already anticipate this ([007 data-model → posts]).
- Sources: [Feature 7 data-model → posts](../007-accounts-persistence/data-model.md),
  [Feature 7 persistence-api → News posts](../007-accounts-persistence/contracts/persistence-api.md).

### C2. Ruleset diffing → **`microdiff` (or a typed path-walk), rendered to paths + old→new + % delta**

- **Decision**: Diff prev vs. new `Ruleset` with a **small deep-diff** — `microdiff` (zero-dep, <1 kB,
  full TS types, returns `{ type, path, value, oldValue }`) — or a hand-rolled recursive walk over the
  known `Ruleset` shape. Render each change as a legible line (`variants.Grizzly.hull: 2000 → 1800
  (−10%)`), computing a percent delta for numeric leaves. Store the raw structured diff in
  `metadata.diff`; put the rendered summary in the post `body` (markdown).
- **Rationale**: The `Ruleset` is a plain nested object of numbers/enums/small maps (no cycles),
  which is exactly `microdiff`'s wheat: "provides the change type, new value, old value, and path" and
  is "significantly faster than most other deep comparison libraries" with "full TypeScript support"
  ([microdiff]). Disabling cycles (`cyclesFix: false`) is safe for parsed-JSON-shaped data. A
  hand-rolled walk is a fine zero-dependency alternative given the shape is known and stable; either
  is acceptable — the output contract (changed leaf paths, old → new) is what matters.
- **Alternatives considered**: *`deep-object-diff`* — equivalent, slightly larger output shape;
  acceptable. *Rolling our own generic differ* — unnecessary given `microdiff`'s size; but a
  Ruleset-specific walk that emits domain-labeled changes ("SAM Battery air damage") is a nice polish
  layer on top of whichever raw differ.
- Sources: [microdiff (GitHub)](https://github.com/AsyncBanana/microdiff),
  [microdiff (npm)](https://www.npmjs.com/package/microdiff),
  [deep-object-diff](https://github.com/saeedhaider/deep-object-diff).

### C3. Code-push → news → **post-deploy hook → secret-gated `POST /api/admin/devlog`, idempotent by SHA**

- **Decision**: A **post-deploy** hook POSTs commit metadata to the secret-gated endpoint, which
  inserts a `devlog`/`changelog` `posts` row (`authorId` null). **Primary mechanism**: a **GitHub
  Action step** that runs after a successful production deploy of a push to `main` and POSTs
  `{ sha, message, author, compareUrl, branch }` (from the `github` context) with
  `Authorization: Bearer $DEVLOG_WEBHOOK_SECRET`. **Alternative**: a **Vercel
  `deployment.succeeded` webhook** to the same endpoint — Vercel's payload carries the commit SHA,
  message, and author, which the endpoint reads. Either can ship; both hit one endpoint.
- **What identifies a "push"**: a **successful production deploy** whose target is a `main`-branch
  commit. A preview deploy or a non-`main` deploy does **not** post (FR-018, US4-AS4) — the GitHub
  Action is scoped to `push` on `main`; the Vercel-webhook path filters on `target === 'production'`.
- **Idempotency**: derive the post **slug from the commit SHA** (`devlog-<sha7>`); `posts.slug` is
  `unique` (Feature 7), so a **retried hook is a no-op** — exactly one post per commit (FR-018,
  US4-AS2). (Vercel notes deploy/webhook delivery can retry, so idempotency is required, not
  optional.)
- **What the post says**: title = the commit summary line (or "Deploy <sha7>"); body = the commit
  message + author + compare link (markdown); `metadata = { sha, author, message, compareUrl,
  deploymentUrl, branch }`. Commit metadata available from both the GitHub context and Vercel's
  deployment payload (SHA, message, author name/username) ([Vercel for GitHub], [Vercel webhooks]).
- **Rationale**: A **post**-deploy trigger (not a *deploy hook*, which *starts* a deploy) is what
  "code push → news" needs. The GitHub Action path gives the richest, most reliable commit metadata
  and fires exactly on a `main` push; the Vercel-webhook path is a zero-CI alternative. Secret-gated
  + SHA-idempotent makes it safe and exactly-once.
- **Alternatives considered**: *A Vercel **Deploy Hook*** — **rejected**: it *triggers* a build, it is
  not a post-deploy notification. *Parsing git log at build time and posting from the build* —
  rejected: the build shouldn't write to prod DB, and a failed/rolled-back deploy would still have
  posted. *Manual devlog authoring* — rejected: the durable rule is **auto**-post.
- Sources: [Vercel Deploy Hooks](https://vercel.com/docs/deploy-hooks),
  [Deploying GitHub Projects with Vercel (commit metadata)](https://vercel.com/docs/git/vercel-for-github),
  [Vercel Webhooks](https://vercel.com/docs/webhooks),
  [vercel-post-deploy-webhook (precedent)](https://github.com/PaulKinlan/vercel-post-deploy-webhook).

---

## Workstream D — Concurrency & validation (P6, Principle II, FR-011, FR-012)

### D1. Concurrent admin edits → **optimistic concurrency: a `version` on the current-pointer, checked in the swap's `WHERE`**

- **Decision**: `current_ruleset` carries an integer **`version`**. `getRulesetForEdit()` returns the
  ruleset **and** the loaded `version`. `saveRuleset({ data, expectedVersion })` swaps the pointer
  with `UPDATE current_ruleset SET rulesetId = :new, version = version + 1, updatedAt = now() WHERE
  id = 'current' AND version = :expectedVersion`. If **0 rows** are affected, the transaction aborts
  and returns `STALE_EDIT` — another admin saved first; the loser reloads and re-applies. **No lost
  update.**
- **Rationale**: Two admins loading the same ruleset and both saving is the classic lost-update race:
  without a guard, the second save silently overwrites the first's changes to the shared balance
  table — a fairness (P4) hazard. Optimistic concurrency — "add a version column, increment on every
  update, and include a `WHERE version = :loaded` clause; if they don't match, the update fails" — is
  the standard fix and maps cleanly onto Drizzle: `db.update(current).set({ rulesetId, version:
  sql\`version + 1\` }).where(and(eq(current.id,'current'), eq(current.version, expectedVersion)))`,
  checking the affected-row count ([Leapcell optimistic locking], [Drizzle update docs]). Optimistic
  (not pessimistic `SELECT … FOR UPDATE`) fits because conflicts are rare (few admins, infrequent
  edits) and it needs no held lock. The whole save runs in a postgres-js **interactive transaction**
  — the same capability Feature 7 relies on ([007 persistence-api cross-cutting]).
- **Alternatives considered**: *Last-writer-wins* — **rejected**: silent lost updates to the balance
  table. *Pessimistic `SELECT … FOR UPDATE` on the pointer* — works but serializes edits and holds a
  lock across the (fast) validation; optimistic is lighter and the conflict path (reload) is fine for
  a human editor. *Field-level 3-way merge* — over-engineered for a rare event; reload-and-re-apply
  is honest and simple.
- Sources: [Optimistic vs pessimistic locking with an ORM](https://leapcell.io/blog/implementing-concurrent-control-with-orm-a-deep-dive-into-pessimistic-and-optimistic-locking),
  [Drizzle ORM — Update](https://orm.drizzle.team/docs/update),
  [Drizzle `SELECT FOR UPDATE` discussion](https://github.com/drizzle-team/drizzle-orm/discussions/1337).

### D2. Ruleset validation before save → **`validateRuleset()`, a server-side structural+bounds gate (the Ruleset trust boundary)**

- **Decision**: Before any persistence, run `validateRuleset(data)` — a pure server-side check that
  the edited ruleset is (a) **structurally complete** (all required groups present: `variants`,
  `equipment`, `damageMatrix`, `cadenceTicks`, `airMods`, `globals`; every content reference
  resolvable), and (b) **within bounds** (fractions/probabilities in `[0,1]`; `splash ≤ 0.25`;
  `hitClamp` inside `[0,1]` and ordered; cadence tiers present and positive; `nativeBonus` in a sane
  band). Reject with a typed reason; **the current pointer is never advanced to an invalid ruleset**
  (FR-011, SC-006). Prefer sharing Feature 1's validator surface (the engine already knows the
  Ruleset's legality); if Feature 1 does not expose `validateRuleset`, this feature defines it and
  Feature 1 adopts it, mirroring how army `validate()` is shared (P8).
- **Rationale**: The ruleset is a **trust boundary** (admin input that the engine will then read on
  every match) — **Principle II** requires validating it server-side before use, and **P6** requires
  the engine never resolve against a ruleset that would panic/error. A structural+bounds gate is the
  Ruleset analog of Feature 1's army `validate()` (V1–V8) — same philosophy: reject illegal input
  with a reason, never "fix" it. Sharing the engine's own notion of legality avoids two
  drifting definitions of "valid ruleset" (P8).
- **Optional deeper check**: a **canary dry-run resolve** (resolve one fixed battle against the
  proposed ruleset in-process before committing) would catch any legality gap the static validator
  misses. Recorded as an optional hardening, not a must — the static gate is the required guarantee;
  the dry-run is cheap insurance if a static rule is ever incomplete.
- Sources: [Feature 1 engine-api → validate()](../001-battle-sim-core/contracts/engine-api.md),
  [Feature 1 data-model → validation rules](../001-battle-sim-core/data-model.md).

---

## Cross-cutting decisions (summary for plan.md Technical Context)

| Area | Decision |
|---|---|
| **Live-ruleset store** | Append-only `rulesets` (jsonb `Ruleset` + `rulesetHash` + editor + parent) + singleton `current_ruleset` pointer (+ `version`), added to Feature 7's `db/schema.ts` |
| **Authoritative load** | `getCurrentRuleset()` reads Postgres on the resolve path (no per-instance cache → no stale window); display surfaces cache-tagged `ruleset-current`, busted on save |
| **`rulesetHash`** | Computed via **Feature 1's canonical hash** (shared fn), so store hash == the hash a replay stamps |
| **Un-versioned** | Engine reads one current ruleset; replays never re-derive (self-contained). History = audit/diff only |
| **Admin authz** | Defense-in-depth: `proxy.ts` UX redirect + `requireAdmin()` re-check in every action/handler/RSC (CVE-2025-29927: never middleware-only). Role read from Feature 7 DB session |
| **Webhook authz** | Secret/signature-gated system caller (no user session), Node runtime |
| **Balance post** | Deep diff (microdiff / typed walk) inside the atomic save tx → one published `type='balance'` post; no-op save posts nothing |
| **Devlog post** | Post-deploy hook (GitHub Action on `main`, or Vercel `deployment.succeeded`) → secret-gated `POST /api/admin/devlog`, idempotent by commit SHA (slug) |
| **Concurrency** | Optimistic: `version` on the pointer, checked in the swap `WHERE`; stale save → `STALE_EDIT`, no lost update |
| **Validation** | Server-side `validateRuleset()` (structural + bounds) before any write; optional canary dry-run resolve |
| **Mutations / webhook** | Server Actions for admin mutations (Feature 7 `src/server/` style); Route Handler for the webhook (stacks/nextjs.md) |
| **UI** | Feature 3 shell + primitives + tokens; both orientations first-class (P7) |

All spec unknowns (store location + load/cache/invalidation, admin authz, the two triggers, diffing,
concurrency, validation) are resolved. No unresolved unknowns remain for Phase 1.
