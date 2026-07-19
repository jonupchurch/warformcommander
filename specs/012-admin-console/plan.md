# Implementation Plan: Admin Console + Balance Publishing

**Branch**: `012-admin-console` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-admin-console/spec.md`

## Summary

Build Warform Commander's **live-ops surface**: a server-side-admin-gated console where an admin
edits the game's **base stats live** — Feature 1's Tier-2 `Ruleset` — and two automatic publishers
that keep the public News feed honest. The console has exactly one lever (the shared balance table)
and no store, price, or power-grant surface (**P1**, never waived); every action behind it is
re-checked **server-side** from `users.role` on every request, never from a client flag (**P6**,
**Principle II**, never waived).

**The load-bearing contribution is the live-ruleset store**, resolved in
[research.md](./research.md) Workstream A: an append-only `rulesets` revision table (the Feature-1
`Ruleset` as typed `jsonb` + `rulesetHash` + editor + audit chain) plus a singleton
`current_ruleset` pointer with an optimistic-concurrency `version`, added to Feature 7's
`db/schema.ts`. This fills the coordination gap Feature 8 flagged and shimmed
([008 plan.md → Complexity Tracking](../008-arena-practice/plan.md)): its resolve path needs "the
current ruleset" and today reads a v1-default placeholder (`loadCurrentRuleset()` in
`src/server/ruleset.ts`). This feature **replaces that placeholder** with the real Postgres-backed
store, read authoritatively (no per-instance cache) so a saved edit is visible to the *very next*
match with zero stale window. A save is one atomic transaction — new revision, pointer swap, and an
auto-published `balance` news post commit together or not at all — and a separate, secret-gated
webhook auto-posts a `devlog`/`changelog` entry on every real code push (the durable "code push →
news" project rule made mechanical).

## Technical Context

**Language/Version**: **TypeScript** (Next.js 16 App Router, React 19). No new language — this
feature is schema + server code + two small screens on the existing app.

**Primary Dependencies**: existing **Feature 7** Drizzle/postgres-js schema, session, and
`src/server/authz.ts` (`requireAdmin`); existing **Feature 1** `Ruleset` TS types + canonical
hash surface (via `src/sim/`, coordinated — see Complexity Tracking); existing **Feature 3** shell
+ primitives for the editor/report screens. **New**: `microdiff` (zero-dep deep-diff, <1 kB,
research C2) for the ruleset diff the balance post renders — or an equivalent hand-rolled
typed-path walk; either satisfies the contract (changed leaf paths, old → new).

**Storage**: **Neon Postgres via Drizzle ORM on `postgres-js`** — the repo's existing wiring. This
feature **adds two tables** (`rulesets`, `current_ruleset`) to the already-filled
`db/schema.ts` (Feature 7); no new storage technology, no new driver.

**Testing**: **Vitest** — unit (`validateRuleset` bounds/structural rules, `diffRuleset` path
output) and integration against a **Neon dev branch** (Feature 7's harness): the authz denial
matrix, the concurrent-edit race (`STALE_EDIT`), the atomic-rollback property, the no-op-save
property, and webhook idempotency-by-SHA. **Playwright** e2e: an admin edits a stat → the next
resolved battle's hash changes and a balance post appears; a forged `admin` flag is denied in the
browser (constitution Principle VIII).

**Target Platform**: Vercel **Node.js** runtime — the admin Server Actions, the admin layout RSC,
and the webhook Route Handler all need Node (DB access, the canonical-hash call); Next.js 16
`proxy.ts` also runs Node by default (no edge-DB constraint, per Feature 7 research A4).

**Project Type**: A **screen feature + a small admin service layer inside the existing Next.js
app** (mirrors Features 8–10's framing) — no new service, no new runtime.

**Performance Goals**: Ordinary admin-console web budget. The resolve-path's `getCurrentRuleset()`
read is one indexed `jsonb` row (TOAST-compressed) — cheap enough to read fresh on every match with
**zero** stale window (SC-008), which is the point: this is a fairness-input read, not a
high-QPS one.

**Constraints**: **Server-authoritative admin gate, three layers** (P6, Principle II, never
waived) — `proxy.ts` UX redirect, the admin layout RSC's `requireAdmin()`, and a `requireAdmin()`
re-check inside every admin Server Action/route handler; a client-supplied `admin` value is never
consulted. **Ruleset writes are validated + atomic + optimistically concurrency-guarded** (FR-011,
FR-012, FR-013) — the current pointer is never advanced to an invalid ruleset and never lost-updates
under a race. **The console sells/grants nothing** — it changes exactly one shared lever, the
ruleset (P1, never waived).

**Scale/Scope**: One human-balancer console + two machine auto-posters. **Out** (spec non-goals):
the balancer itself (Feature 2 — this feature only *reads* its committed report), the engine/data
schema (Feature 1 — this feature edits `Ruleset` *values*, not its type), rendering the public News
feed (Feature 11 — this feature only *writes* `posts`), general persistence/auth (Feature 7 — this
feature *adds* to its schema and *reuses* its session/role), and matchmaking/the Bo3 loop (Feature
8 — this feature provides `getCurrentRuleset()`; Feature 8 calls it).

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 —
Product Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction (NON-NEG)** | ✅ | The console exposes **only** balance/live-ops surfaces — ruleset editing, news publishing, report reading (FR-020). No store, no price, no per-account stat grant; the only thing it changes is the **shared** ruleset, the very lever that keeps the game fair. An admin tunes fairness; they never sell or grant power. |
| **P2 Planning over twitch** | ✅ (N/A here) | Backend/admin surface; no real-time input. |
| **P3 Depth from configuration** | ✅ (N/A here) | This feature edits the *values* behind Feature 1's orthogonal axes; it adds no new axis. |
| **P4 Fairness is verified** | ✅ | The console surfaces the latest committed **BalanceReport** read-only (FR-019, US5) so tuning is evidence-driven, and every changing edit is **auto-published** with a legible diff (FR-014/016) — fairness changes are provable and transparent, not silent. |
| **P5 Content from players/puzzles** | ✅ (N/A here) | No interaction with defense snapshots or matchmaking. |
| **P6 Deterministic, seeded, server-authoritative (NON-NEG)** | ✅ | **Central to this feature.** Admin authz is re-checked server-side on every request from the DB session, never a client flag (FR-001–003). `getCurrentRuleset()` is read **authoritatively from Postgres** on the resolve path — no per-instance cache, no stale window (FR-006, SC-008). Every edit is **validated server-side before any write** (FR-011) and **atomic** (FR-013), so the engine never resolves against a half-written or illegal ruleset. |
| **P7 Both platforms first-class** | ✅ | The balance editor (a dense stat table) and the report panel are usable in mobile portrait and desktop landscape — the table scrolls within its own container, never the page body (spec edge cases). |
| **P8 Data-driven content** | ✅ | The live ruleset is stored as **typed `jsonb`** (`Ruleset` verbatim), never normalized into per-field SQL (FR-005) — one source of truth with Feature 1's types. `rulesetHash` is computed via **Feature 1's canonical hash**, never a bespoke one (FR-007), so the store's hash always equals the hash a replay stamps. |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Spec has 5 prioritized, independently-testable stories, 20 FRs, 8 executable SCs, and explicit non-goals. `research.md` resolves all four workstreams (store, authz, triggers, concurrency/validation). Zero open `NEEDS CLARIFICATION`. |
| **II Validated trust boundaries** | ✅ | **Central.** `requireAdmin()` re-reads the server session at three independent layers (never a client flag); `validateRuleset()` gates every write before persistence (the ruleset is a trust boundary — admin input the engine will read on every match); the webhook is gated by a verified secret (a system caller, not a role). |
| **III Match conventions** | ✅ | Reuses Feature 7's `src/server/authz.ts` `requireAdmin`, `db/schema.ts` `jsonb().$type<T>()`/index conventions, and `posts` table verbatim. Reuses Feature 8's `src/server/ruleset.ts` file (replacing its v1-default seam — the coordinated rename is tracked below). Server Actions for admin mutations, a Route Handler for the webhook (`stacks/nextjs.md`, matching Feature 7/8). |
| **IV Scope discipline (NON-NEG)** | ✅ | Explicit non-goals carried from spec.md (not the balancer, not the engine, not News rendering, not general persistence, not matchmaking). This plan does **not** build an editorial-post authoring UI, even though Feature 11's spec attributes that authoring to "Feature 12's admin surface" — spec.md's own user stories (US1–US5) do not include it, so it is **not** folded in here; flagged for the orchestrator as a cross-feature note, not silently added. |
| **V Verify before done** | ✅ | SC-001…SC-008 are executable ([data-model.md](./data-model.md), [contracts/](./contracts/)); tasks.md writes the authz-matrix, edit-changes-next-match+hash+replay-untouched, concurrency-race, no-op-save, atomic-rollback, and webhook-idempotency tests **before** their implementation. |
| **VI Narrate** | ✅ | research.md records every decision with rationale + rejected alternatives; this plan's Complexity Tracking records the two coordination deviations (schema ownership, the seam rename) out loud. |
| **VII Plan whole set first** | ✅ | The last feature in the v1 set; this plan explicitly names what it reuses from Features 1/3/7/8/2/11 so the full dependency graph is on paper before implementation. |
| **VIII Test at right level** | ✅ | Unit (`validateRuleset`, `diffRuleset`), integration on a Neon dev branch (authz matrix, concurrency race, atomic rollback, hash/replay invariants, webhook idempotency), e2e (Playwright: edit → next-match hash change → balance post; forged-flag denial in the browser). |
| **IX Commit atomically, branch per feature** | ✅ | On `012-admin-console`; schema, store, authz wiring, and each auto-post trigger commit atomically. |

**Gate result: PASS.** Two coordination deviations (extending Feature 7's schema file; renaming
Feature 8's ruleset seam) are tracked in Complexity Tracking below. P1 and P6 (never-waived) are
fully satisfied, not traded.

## Project Structure

### Documentation (this feature)

```text
specs/012-admin-console/
├── plan.md              # this file
├── research.md          # Phase 0 — all unknowns resolved (store, authz, triggers, concurrency)
├── spec.md              # user stories, FRs, success criteria, edge cases, assumptions
├── data-model.md         # Phase 1 — the live-ruleset store (centerpiece) + posts-write shapes
├── contracts/
│   ├── admin-api.md      # ruleset read/edit/save + devlog webhook + balance-report read surface
│   └── admin-authz.md    # the three-layer server-side admin gate + webhook secret verification
└── tasks.md              # Phase 2 — created by /speckit-tasks (next step)
```

### Source Code (repository root)

The existing Next.js app lives at the **repo root**. This feature adds two tables to the
already-filled `db/schema.ts` (Feature 7), a small `src/server/` slice, an `app/admin/` route
segment, and one webhook route. No restructuring.

```text
d:/Codelib/warformcommander/
├── db/
│   └── schema.ts                      # EDIT — add `rulesets` + `current_ruleset` (Tier B extension,
│                                       #   Feature 7's file); postTypeEnum already has balance/devlog/changelog
├── src/
│   ├── server/
│   │   ├── ruleset.ts                 # EDIT — REPLACES Feature 8's v1-default seam. getCurrentRuleset(),
│   │   │                              #   getRulesetForEdit(ctx), saveRuleset(ctx, {data, expectedVersion, note?})
│   │   │                              #   — the atomic transaction (revision + pointer swap + balance post)
│   │   ├── ruleset-validate.ts        # NEW — validateRuleset(data): ValidationResult (structural + bounds gate)
│   │   ├── ruleset-diff.ts            # NEW — diffRuleset(prev, next) + renderDiffSummary(diff) (microdiff-based)
│   │   ├── devlog.ts                  # NEW — recordDevlogPost({sha,message,author,compareUrl,branch,tag?})
│   │   │                              #   — idempotent by slug; called by the webhook route
│   │   └── authz.ts                   # EXISTING (Feature 7) — requireAdmin(session) reused verbatim
│   └── components/admin/
│       ├── ruleset-editor.tsx         # NEW — "use client" leaf: the dense stat-table editor (Feature 3 primitives)
│       └── balance-report-panel.tsx   # NEW — read-only BalanceReport viewer (US5)
├── app/
│   ├── admin/
│   │   ├── layout.tsx                 # NEW — the REAL server check: requireAdmin() (RSC), admin shell chrome
│   │   ├── page.tsx                   # NEW — admin landing (links to the balance editor)
│   │   ├── balance/
│   │   │   ├── page.tsx               # NEW — Server Component: requireAdmin() + getRulesetForEdit() +
│   │   │   │                          #   latest BalanceReport → <RulesetEditor> + <BalanceReportPanel>
│   │   │   └── actions.ts             # NEW — "use server" saveRulesetAction(input) → requireAdmin() → saveRuleset()
│   │   └── loading.tsx                # NEW — skeleton
│   └── api/admin/devlog/route.ts      # NEW — POST handler, Node runtime, secret-gated, idempotent by SHA
├── proxy.ts                           # EDIT or NEW (coordinate with Feature 7 — "(optional)" there) —
│                                       #   add the `/admin*` → sign-in/redirect branch (UX-only, research B1)
├── .github/workflows/devlog.yml       # NEW (primary trigger, research C3) — post-deploy step on `main`
│                                       #   POSTing commit metadata to /api/admin/devlog
└── (existing: app/(app)/, app/(marketing)/, db/index.ts, auth.ts, src/server/{squads,defense,matches,
    standings,posts}.ts, src/sim/ [Feature 1 types + hashRuleset], packages/engine-wasm/, …)
```

**Structure Decision**: Everything lives **inside the existing Next.js app**. The live-ruleset store
is **two tables added to Feature 7's `db/schema.ts`** (the single Postgres source of truth every
other feature already reads) rather than a new schema file or an out-of-band store (Edge Config/KV)
— the atomic revision+pointer+post transaction (FR-013) needs one connection. The admin surface is
its **own top-level route segment** (`app/admin/`, sibling to `app/(app)/` and `app/(marketing)/`)
because it shares chrome with neither the authenticated player shell nor the public marketing shell
— its own `layout.tsx` is where the real `requireAdmin()` RSC-level check lives. Mutations are
Server Actions (`app/admin/balance/actions.ts`); the code-push trigger is a Route Handler
(`app/api/admin/devlog/route.ts`) because it is a public, secret-gated, machine-to-machine surface
(`stacks/nextjs.md`, matching Feature 1's `/api/resolve` and Feature 8's `/api/arena/resolve`).

## Complexity Tracking

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Extending Feature 7's `db/schema.ts`** with two tables this feature owns (`rulesets`, `current_ruleset`) rather than adding a schema file of its own | The revision insert, the pointer swap, and the balance-post insert must be **one atomic transaction** (FR-013) — that requires one Drizzle schema object / one connection. Feature 7's own data-model already names Feature 12 as the future owner of exactly this extension (`data-model.md` → "How Features 8–12 consume this"). | **A separate schema module / a non-Postgres store (Edge Config, KV)** — rejected: fragments the single source of truth, breaks the atomic-transaction requirement, and reintroduces the "which store is authoritative" question research A1 already closed against. |
| **Renaming Feature 8's placeholder export** `loadCurrentRuleset()` → `getCurrentRuleset()` inside `src/server/ruleset.ts` (this feature's own FR-006 naming), requiring a one-line call-site update in Feature 8's `src/server/arena.ts` / `practice.ts` | This feature's spec, research, and data-model all name the seam `getCurrentRuleset()`; Feature 8's plan.md explicitly documented `ruleset.ts` as carrying "a v1 default; Feature-12 replaces." Keeping two names for one seam would be a silent inconsistency between the owning feature's own contract and its implementation. | **Keep Feature 8's `loadCurrentRuleset` name** to avoid touching its file — rejected: it is a one-line, tracked, coordinated rename (not a hidden break), and it keeps the seam's name consistent with the feature that actually owns and documents it. |
| **`validateRuleset()` defined here** (`src/server/ruleset-validate.ts`), not inside Feature 1's engine crate, even though it is the Ruleset's trust-boundary gate (Principle II) — the same role Feature 1's army `validate()` plays for armies | Feature 1 does not yet expose a standalone ruleset validator; blocking this feature on adding one to the Rust/WASM surface would needlessly couple the two features' schedules. Research D2 records this as the deliberate, temporary placement. | **Add it to Feature 1's crate first** — rejected for now: a real option later (P8 — one shared notion of "valid ruleset"), but not required to ship this feature; noted so a future move is a small, planned migration, not a surprise. |

*No P1/P6 trade. Both never-waived invariants are fully satisfied by this plan, not worked around.*

## Post-Design Constitution Re-check

After Phase 1 (data-model, contracts): **still PASS.**
- The store design (data-model.md) keeps the `Ruleset` as **typed `jsonb`, never normalized** (P8)
  and makes the resolve-path read **authoritative with zero stale window** (P6, SC-008) — the two
  properties the Constitution Check counted on are realized exactly as planned, not weakened.
- The `admin-authz.md` contract keeps the **three-layer server-side check** (`proxy.ts` UX redirect,
  the admin layout RSC, every action/handler) and the webhook's **secret/signature gate** — no
  surface authorizes from client state (Principle II, P6).
- The `admin-api.md` contract keeps `saveRuleset` **validated-then-atomic** (validation happens
  entirely before the transaction opens; the transaction itself cannot partially commit) and keeps
  the console's only mutation surface the ruleset + `posts` — no power-grant surface appeared
  during design (P1).
- No new complexity surfaced beyond the two tracked deviations.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (all four workstreams resolved)
- [x] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md), [contracts/](./contracts/)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
