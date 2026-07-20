# Implementation Plan: Accounts & Persistence

**Branch**: `007-accounts-persistence` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-accounts-persistence/spec.md`

## Summary

Build the **backend/DB layer** for Warform Commander — Google-OAuth accounts with a
server-side admin role, and the persistent data model (rosters of saved squads, **immutable
defense snapshots**, battle results + **jsonb replays**, **net-victory** ladder standings, and
the unified **news posts** system) — on the repo's **already-wired** Neon Postgres + Drizzle
(**postgres-js**) stack. Feature 1's engine is stateless; **this is where all state lives**
(design doc §16/§16.1/§16.2, constitution P5/P6/P8).

Auth is **Auth.js (NextAuth v5) + `@auth/drizzle-adapter` + Google**, with **database sessions**
for server-authoritative identity/role control (P6) — feasible because Next.js 16 runs
middleware/`proxy.ts` on the **Node runtime**. The adapter takes the repo's real `getDb()`
instance via **NextAuth lazy init** (keeps `next build` safe) with **no Proxy** (which would break
the adapter's driver detection) — the repo's `db/index.ts` already satisfies both. The data model
stores each squad as the **Feature-1 typed config in a `jsonb` column** (validated by the shared
`validate()` before write — no illegal army persisted; P8/Principle II), and each replay as
`jsonb` + scalar provenance per Feature 1's [replay-format contract](../001-battle-sim-core/contracts/replay-format.md).
Defense **immutability + the ≤3 cap + attack/defense pool exclusivity** are enforced structurally
(copy-on-designate rows + partial-unique indexes), not just in application code.

## Technical Context

**Language/Version**: **TypeScript** (Next.js 16 App Router, React 19). No new language; this
feature is schema + server code on the existing app.

**Primary Dependencies**: existing **`drizzle-orm` (postgres-js)** + **`postgres`** + **`drizzle-kit`**
(already in `package.json`). **New**: `next-auth@5` (Auth.js v5) + `@auth/drizzle-adapter`. No
`@neondatabase/serverless` / `neon-http` (see driver note below).

**Storage**: **Neon Postgres** via **Drizzle ORM on the `postgres-js` driver** — the repo's
existing wiring (`db/index.ts` lazy `getDb()`, `prepare:false` for Neon's pooler, **no Proxy**;
`drizzle.config.ts`; the dotenv-wrapped `db:generate/push/studio` scripts). This feature fills the
empty `db/schema.ts` and adds `db/migrations/`.

> **Driver correction (STATUS.md is stale):** STATUS.md's Tech-stack line still lists the driver as
> `@neondatabase/serverless` / `drizzle-orm/neon-http`. **The actual code uses `drizzle-orm/postgres-js`**
> (`db/index.ts`, `postgres` in `package.json`), chosen for local+Neon parity and **interactive
> transactions** — which this feature's atomic designate/record flows require and neon-http (stateless
> HTTP) cannot provide. Do **not** reintroduce neon-http. (The orchestrator will fix STATUS.md.)

**Testing**: **Vitest** (or the repo's chosen unit runner) for snapshot-immutability,
pool-exclusivity, standing-reconciliation, and authz unit/integration tests against a **Neon dev
branch**; **Playwright** for the Google sign-in e2e (constitution Principle VIII). Schema/migration
validation: `drizzle-kit generate` applies cleanly on an empty DB (SC-008).

**Target Platform**: Vercel **Node.js** runtime (App Router route handlers + Server Actions; the
DB adapter and battle-recording need Node, never edge). Next.js 16 `proxy.ts` (Node) for route
guards.

**Project Type**: A **backend/persistence layer inside the existing Next.js app** — Drizzle schema,
Auth.js config, and a server-side service API. No separate service, no new runtime.

**Performance Goals**: Ordinary web-app DB budget. Leaderboard reads are indexed
(`ladder_standings.netVictories`); replay blobs are isolated in `replays` (kept off summary
queries) and TOAST-compressed. Nothing here is on the sim's hot path.

**Constraints**: **Server-authoritative** — identity, authz, and match outcomes are decided
server-side; the client can never fabricate a result or elevate a role (P6, Principle II).
**No illegal army persisted** — shared `validate()` gates every squad write (P8). **Defense
immutability + ≤3 cap + pool exclusivity are DB invariants** (partial-unique indexes), not just app
logic. **Honor the existing DB wiring** (postgres-js, lazy `getDb()`, no Proxy) — build on it.

**Scale/Scope**: The schema + auth + service API for one product's async-PvP backend. **Out**:
matchmaking/Arena logic (F8), Ladder seasons/tiers/MMR + UI (F9), Profile UI (F10), Admin console
UI + live ruleset editing + auto-post triggers (F12), MTX slot bundles + fuel economy (backlogged).
This feature provides the **data + auth** those consume.

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 —
Product Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction** | ✅ | Persistence stores **convenience, not power**: the 8→64 roster slots are a *storage-slot* count (a squad in slot 40 is no stronger than one in slot 0), and MTX slot bundles (backlogged) buy breadth, never combat advantage. Power Rating is stored **matchmaking-only**, never fed to combat (Feature-1 rule). No stored field grants power. |
| **P2 Planning over twitch** | ✅ (N/A here) | No real-time input; this layer only persists pre-battle plans and post-battle records. |
| **P3 Depth from configuration** | ✅ | The squad `config` jsonb is the Feature-1 orthogonal-axes model verbatim; persistence adds no power axis, only saved variety. |
| **P4 Fairness is verified** | ✅ (enabling) | Storing seed + inputs + rulesetHash + replay is what lets a disputed match be re-resolved and the balancer's fairness claims be reproduced from real data. |
| **P5 Content from players/puzzles** | ✅ | **Immutable defense snapshots** are the mechanism that turns every player's defense into fresh async-PvP content; `isBot` seeded snapshots keep the ladder non-empty at cold start. This feature *is* the P5 substrate. |
| **P6 Deterministic, seeded, server-authoritative (NON-NEG)** | ✅ | **Match results are written server-side only** (`recordMatch`, A5) from the authoritative sim — the client cannot fabricate outcomes. **Database sessions** make identity/role server-authoritative (instant revocation). Provenance (seed/rulesetHash/formatVersion) persisted for reproducibility. |
| **P7 Both platforms first-class** | ✅ (N/A here) | Headless backend; no UI/layout. The data it exposes carries no orientation assumptions. |
| **P8 Data-driven content** | ✅ | Squad/preset/replay are stored as the **Feature-1 typed jsonb** — one source of truth, no schema duplication into SQL (which would drift). Writes are validated by the **same `validate()`** the sim/Garage use. |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Spec has prioritized independently-testable stories, acceptance scenarios, enumerated edge cases, and explicit non-goals (F8/F9/F10/F12 boundaries named). Zero open `NEEDS CLARIFICATION`. |
| **II Validated trust boundaries** | ✅ | Auth is **server-side** (DB sessions, role from DB); ownership checked on every owned-resource op; squad writes validated before insert; results written only by the server (data-model Trust-boundary rules A1–A6). |
| **III Match conventions** | ✅ | Builds on the repo's existing `db/` wiring (postgres-js, lazy `getDb()`, no Proxy, dotenv `db:*` scripts) rather than replacing it; auth follows the Auth.js v5 canonical shape. New deps named in Complexity Tracking. |
| **IV Scope discipline (NON-NEG)** | ✅ | Data + auth only; matchmaking, ladder dressing, profile/admin UIs, MTX/economy all explicitly out (spec Non-goals). `presets`/`posts` scoped as shared persistence with UIs handed to F4/F11/F12. |
| **V Verify before done** | ✅ | Success criteria are executable (auth round-trip, snapshot immutability, pool exclusivity/≤3 race, replay fidelity, standing reconciliation, migration-clean-apply); "done" = all green on a Neon dev branch. |
| **VI Narrate** | ✅ | research.md records each decision (auth lib, session strategy, no-Proxy/lazy-init, snapshot pattern, Neon branching, driver correction) with rationale + rejected alternatives. |
| **VII Plan whole set first** | ✅ | Part of the foundation-first pass; this plan explicitly names what F8–F12 consume so their build order/deps are on paper (data-model §How Features 8–12 consume this). |
| **VIII Test at right level** | ✅ | Unit (snapshot immutability, pool exclusivity, standing math, validation gate), integration (transactions, authz), e2e (Google sign-in via Playwright), schema (migration applies clean). |
| **IX Commit atomically, branch per feature** | ✅ | On `007-accounts-persistence`; schema, auth, and each service slice commit atomically. |

**Gate result: PASS.** Deviations (new auth dependency; database-session strategy) are named in
Complexity Tracking. P1 and P6 (never-waived) are satisfied, not traded.

## Project Structure

### Documentation (this feature)

```text
specs/007-accounts-persistence/
├── plan.md              # this file
├── research.md          # Phase 0 — auth/session/adapter/snapshot/Neon decisions (all resolved)
├── data-model.md        # Phase 1 — THE schema (centerpiece); tables, indexes, snapshot mechanism
├── spec.md              # user stories, FRs, success criteria
├── contracts/
│   ├── auth.md          # Google OAuth + DB sessions + admin role config/guarantees
│   └── persistence-api.md # squad CRUD, defense designate/record, standings, replays, posts
└── tasks.md             # Phase 2 — created by /speckit-tasks (next step)
```

### Source Code (repository root)

The existing Next.js app lives at the **repo root**. This feature fills `db/schema.ts`, adds
migrations, an auth config, and a server-side service layer — no restructuring.

```text
d:/Codelib/warformcommander/
├── db/
│   ├── index.ts                 # EXISTING — lazy getDb(), postgres-js, no Proxy (unchanged; adapter builds on it)
│   ├── schema.ts                # EDIT — fill the empty stub: Tier A (auth) + Tier B (game) tables + enums + relations
│   ├── types.ts                 # NEW — re-export SquadConfig/Replay/PresetConfig for .$type<>() (types only)
│   └── migrations/              # NEW — drizzle-kit generated SQL migrations (committed)
├── auth.ts                      # NEW — NextAuth v5 config (lazy init, DB sessions, Google, role callback)
├── app/api/auth/[...nextauth]/route.ts  # NEW — export { GET, POST } = handlers; runtime='nodejs'
├── src/server/                  # NEW — the persistence service API (Server Actions / server-only)
│   ├── squads.ts                # saveSquad/updateSquad/loadSquad/listSquads/deleteSquad/listAttackable
│   ├── defense.ts               # designateDefense/undesignate/redesignate/listDefense (transactional snapshots)
│   ├── matches.ts               # recordMatch/getMatch/listMatches/getReplay (server-only writes)
│   ├── standings.ts             # getStanding/getLeaderboard/recomputeStanding
│   ├── posts.ts                 # createPost/publishPost/listPublished/getPostBySlug
│   ├── presets.ts               # savePreset/listPresets/deletePreset
│   └── authz.ts                 # session + ownership + admin guards (Trust-boundary rules A1–A6)
├── proxy.ts                     # NEW (optional) — Next.js 16 Node-runtime route guards via auth()
├── drizzle.config.ts            # EXISTING — schema/out/dialect (unchanged; already points at db/schema.ts)
├── package.json                 # EDIT — add next-auth@5 + @auth/drizzle-adapter; add db:migrate script
└── (existing app: app/, next.config.ts, …)
```

**Structure Decision**: Everything lives **inside the existing Next.js app** (no new service). The
schema is the single `db/schema.ts` the repo already configured drizzle-kit against; the service
API is a server-only layer under `src/server/` that both this feature's stories and Features 8–12
call. The auth config sits at the repo root per Auth.js v5 convention. The engine is never imported
here — only its **types** (`db/types.ts`) — so the WASM core can't leak into the client (P6).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **New auth dependency** (`next-auth@5` + `@auth/drizzle-adapter`) in an app that had no auth | Google OAuth for all users + a server-side admin role are the feature's core ask (§16.2); the Drizzle adapter speaks the repo's existing postgres-js Drizzle directly. | **Hand-rolled OAuth/sessions** — rejected: reinvents session security and CSRF/cookie handling Auth.js provides and hardens. **Hosted auth (Clerk)** — rejected: pulls identity out of *our* Postgres (the schema F8–F12 join against must be ours) and adds vendor coupling against P6's self-owned, server-authoritative posture. |
| **Database session strategy** (vs the common JWT default) | **Server-authoritative** role control (P6): instant admin revocation and "sign out everywhere" — a security requirement for the admin gate. | **JWT sessions** — rejected: a role is frozen in the token until expiry; revoking admin mid-session needs a server-side blocklist (which re-adds a DB). JWT's win (edge/stateless) is moot on Next.js 16's **Node-runtime** middleware and at our scale. |

*No other deviations. P1 and P6 (never-waived) are fully satisfied. The schema deliberately avoids
normalizing the Feature-1 config into SQL (P8) — a non-deviation, recorded as a decision in
research B2.*

## Post-Design Constitution Re-check

After Phase 1 (data-model, contracts): **still PASS.**
- The data model keeps game content as **Feature-1 typed jsonb** (P8, no duplication) and promotes
  only queried fields to scalar columns — sim/Garage/persistence read one source of truth.
- The persistence-api + auth contracts keep every outcome and authz decision **server-side** (P6,
  Principle II): `recordMatch` is server-only, ownership/admin are re-checked from the session/DB,
  and squad writes pass the shared `validate()`.
- Defense **immutability + ≤3 cap + pool exclusivity** landed as **DB invariants** (copy-on-designate
  + partial-unique indexes), strengthening P5/P6 beyond app-code enforcement.
- No new complexity surfaced; the two tracked deviations are unchanged.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (auth/session/adapter/snapshot/Neon/driver — all resolved)
- [x] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md), [contracts/](./contracts/)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
