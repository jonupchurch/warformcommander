# Implementation Plan: Arena (async matchmaking) + Practice sandbox

**Branch**: `008-arena-practice` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-arena-practice/spec.md`

## Summary

Build the **orchestration layer of async PvP** — the Arena (ranked) and the Practice sandbox. It
owns no new persistent state and no game rules; it **composes** the two features that already exist
as services: the **Feature-1 WASM engine** (`resolve(BattleInput) → BattleOutput`, server-authoritative)
and the **Feature-7 persistence layer** (attack/defense pools, immutable defense snapshots,
`recordMatch`, net-victory standings). The load-bearing invariant is **P6 (NON-NEGOTIABLE)**: a
ranked result is **computed on the server and recorded on the server — the client never submits or
alters an outcome.**

The ranked flow, resolved synchronously in one server call ([research.md](./research.md) A1): derive
the attacker from the **session** → confirm the chosen squad is **attackable** (Feature-7) → pick a
**uniformly random eligible defender** and serve **one of its ≤3 active snapshots at random, blind**
([research.md](./research.md) C1) → generate a **server-side seed** → load the **current ruleset**
through a seam → run the **Bo3 (`adaptation=Locked`)** via the in-process Feature-1 host → **record**
match + replay + standings via Feature-7 `recordMatch` → return a **match id** the client uses to open
the Battle Summary (Feature 6) / Playback (Feature 5). **Practice** is the same path against a **random
hidden DB squad** with `adaptation=Free`, `mode='practice'`, and **no standing change**, refreshable
before deploy.

Two decisions carry the design: **(1)** the resolve step is a **Node Route Handler** (stable WASM
file-tracing key + an explicit P6 boundary) that calls the engine **in-process** (no self-HTTP), while
preview/skip/refresh are **Server Actions** (no WASM); **(2)** a **`loadCurrentRuleset()` seam**
decouples resolution from the (not-yet-owned) live ruleset store — a flagged coordination note for
Features 12/7.

## Technical Context

**Language/Version**: **TypeScript** (Next.js 16 App Router, React 19). No new language. This feature
is server orchestration + two screens on the existing app.

**Primary Dependencies**: existing only — the Feature-1 WASM host (`src/sim/`, `@wfc/engine-wasm`)
and the Feature-7 service API (`src/server/*`, Auth.js session, Drizzle/postgres-js). Feature-3 shell
+ primitives for the screens. **No new package.**

**Storage**: **None new.** Reads/writes the **Feature-7 schema** exclusively (attack pool,
`defense_snapshots`, `matches`, `replays`, `ladder_standings`) via its service API — never raw DB
access from Feature 8. See [../007-accounts-persistence/data-model.md](../007-accounts-persistence/data-model.md).

**Testing**: **Vitest** integration against a **Neon dev branch** (reusing Feature-7's harness) for
resolve+record+standings, the anti-forgery (server-authority) property, the locked-snapshot property,
practice-no-standing, and matchmaking exclude-self/never-empty; **Playwright** e2e for the Arena
deploy → Summary handoff and Practice draw/refresh/deploy (constitution Principle VIII).

**Target Platform**: Vercel **Node.js** runtime (route handlers + Server Actions; the WASM engine and
the DB adapter both require Node, never edge). Fluid Compute default duration (300 s) is ample — a Bo3
resolves sub-second ([research.md](./research.md) A1).

**Project Type**: An **orchestration + two screens inside the existing Next.js app** — a server-only
service layer under `src/server/` (matching Feature 7) plus `app/(app)/arena` and
`app/(app)/practice` routes. No new service, no new runtime.

**Performance Goals**: Ordinary web budget plus one sub-second WASM Bo3 per deploy (SC-008); wide
margin under the Vercel duration limit. Matchmaking is a filtered `ORDER BY random()` — negligible at
v1 cold-start scale ([research.md](./research.md) C1).

**Constraints**: **Server-authoritative (P6, NON-NEG)** — the outcome, opponent, seed, and ruleset are
all decided server-side; the client's only input is *which of its own squads attacks*; there is **no**
client-reachable result-write path (Feature-7 A5). **Blind + Bo3-locked** serve (immutable snapshot,
one `resolve`, `adaptation=Locked`). **Reuse, don't reimplement** the engine (Feature 1) and
persistence (Feature 7).

**Scale/Scope**: Ranked attack loop + practice sandbox for one product's async PvP. **Out**: the engine
(F1), persistence/standings internals (F7 — called via its API), the Garage (F4), the Ladder screen +
seasons/tiers/MMR (F9), the Playback (F5) and Summary (F6) screens (handed off by match id), live
ruleset **editing** (F12), and the attack-fuel economy (backlogged, §11/§16.1).

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 — Product
Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction** | ✅ | The Arena grants **no power** and sells nothing. Matchmaking is **fully random** (§13) — no pay-to-face-weaker-opponents. The ranked stake is **net victories** (§13), never a power reward. Skip/refresh are free (no fuel gate in v1). |
| **P2 Planning over twitch** | ✅ | Skill lives in **which squad you deploy** against a board you can read but whose behaviors are **fogged** (the prediction game, §3). No real-time input decides the battle — the engine auto-resolves. |
| **P3 Depth from configuration** | ✅ (N/A here) | This feature adds no unit/gear/power axis; it consumes the Feature-1 configured armies verbatim. |
| **P4 Fairness is verified** | ✅ (enabling) | Every ranked match persists seed + armies + `rulesetHash` (via F7), so any result is **reproducible** and re-checkable (SC-007) — the same property the balancer relies on. |
| **P5 Content from players/puzzles** | ✅ **(central)** | The Arena **is** the player-as-content loop: every player's frozen defense is renewable opposition, and **cold-start bots keep the pool never-empty** (matchmaking real+bot, FR-003). Practice mines the same DB. This feature realizes P5. |
| **P6 Deterministic, seeded, server-authoritative (NON-NEG)** | ✅ **(central)** | **The whole point.** The outcome is **computed by the server WASM engine** and **written only by the server** (`recordMatch`, A5); the client supplies only its own squad id — opponent, **seed**, ruleset, and result are all server-side (FR-009/010/012). Persisted seed+armies+`rulesetHash` make it reproducible (SC-007). The client can never fabricate a ranked result (US5). |
| **P7 Both platforms first-class** | ✅ | The Arena and Practice screens are built on the Feature-3 responsive shell + primitives (portrait bottom-tab / landscape top-tab); the matchup grid and deploy CTA reflow per the mockup. No orientation is second-class. |
| **P8 Data-driven content** | ✅ | Armies, snapshots, and the **ruleset** are the Feature-1 typed data read through F7/the ruleset seam; Feature 8 hard-codes no stats and reads the same source of truth the engine and Garage do. |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Prioritized independently-testable stories, acceptance scenarios, enumerated edge cases, explicit non-goals, and Assumptions record every judgment call. Zero open `NEEDS CLARIFICATION`; the one cross-feature gap (ruleset store) is a **flagged coordination note**, not an ambiguity in this feature. |
| **II Validated trust boundaries** | ✅ | Attacker identity is **session-derived** (never client); the chosen squad's ownership + attackability are re-checked server-side at deploy (F7 A2); the resolve route validates its input schema and **strips any client outcome/seed/opponent** (US5); results are written only server-side (A5). |
| **III Match conventions** | ✅ | Server layer under `src/server/*` mirrors Feature 7; the resolve route mirrors Feature-1's `app/api/resolve`; screens use the Feature-3 shell/tokens/primitives. No new library. Deviations named below. |
| **IV Scope discipline (NON-NEG)** | ✅ | Orchestration + two screens only; engine, persistence internals, Garage, Ladder, Playback, Summary, and ruleset editing are all explicitly out (spec Overview + Assumptions). Handoff by match id, nothing folded in. |
| **V Verify before done** | ✅ | The nine SC are executable (anti-forgery, locked-snapshot, practice-no-standing, exclude-self/never-empty, standings-move, reproducibility, budget, blocked-attack); "done" = all green on a Neon dev branch + native/wasm engine reuse. |
| **VI Narrate** | ✅ | research.md records each decision (sync-vs-queue, in-process engine reuse, route-vs-action, matchmaking selection, seed, ruleset seam) with rationale + rejected alternatives. |
| **VII Plan whole set first** | ✅ | Part of the foundation-first pass; this plan names every seam it consumes/hands to (F1 engine, F7 API, F5/F6 handoff, F9 ladder read, **F12 ruleset store**) so build order + the ruleset coordination surface on paper. |
| **VIII Test at right level** | ✅ | Integration (resolve+record+standings, forged-request rejection, locked snapshot, practice no-standing, matchmaking properties), plus e2e (Playwright arena/practice flows). |
| **IX Commit atomically, branch per feature** | ✅ | On `008-arena-practice`; matchmaking, resolve orchestration, practice, and each screen commit atomically. |

**Gate result: PASS.** Deviations are minor and tracked below. **P1 and P6 (never-waived) are the
feature's backbone, satisfied not traded.**

## Project Structure

### Documentation (this feature)

```text
specs/008-arena-practice/
├── plan.md              # this file
├── research.md          # Phase 0 — sync-vs-queue, WASM reuse, matchmaking selection, ruleset seam
├── spec.md              # user stories, FRs, success criteria, edge cases, assumptions
├── contracts/
│   └── matchmaking-resolve-api.md  # the Feature-8 orchestration service surface (reuses F1 + F7 types)
└── tasks.md             # Phase 2 — created by /speckit-tasks (next step)
```

**No `data-model.md`** — Feature 8 introduces **no new persistent entities**. It reads/writes the
Feature-7 schema and speaks the Feature-1 types; its only "new" shapes are transient service DTOs,
captured in the contract. (Recording this omission deliberately — Principle IV / III.)

### Source Code (repository root)

The existing Next.js app lives at the **repo root**. This feature adds a server-only orchestration
layer and two routes; it edits `next.config.ts` only to extend WASM file-tracing. No restructuring.

```text
d:/Codelib/warformcommander/
├── src/server/                        # server-only orchestration (mirrors Feature 7's layout)
│   ├── matchmaking.ts                 # NEW — pickRankedOpponent(ctx), drawPracticeOpponent(ctx, exclude) (research C1)
│   ├── arena.ts                       # NEW — previewRankedMatch (action), startRankedMatch (orchestrator: select→resolve→record)
│   ├── practice.ts                    # NEW — refreshPracticeOpponent (action), startPracticeMatch (Free, mode='practice')
│   ├── ruleset.ts                     # NEW — loadCurrentRuleset() seam (v1 default; Feature-12 replaces) (research D1)
│   ├── seed.ts                        # NEW — server crypto u64 seed generator (research B3)
│   ├── arena-types.ts                 # NEW — RankedMatchRequest / MatchmakingSelection / MatchTicket / PracticeDraw DTOs
│   ├── matches.ts                     # EXISTING (F7) — recordMatch/getMatch (called, not modified)
│   └── squads.ts                      # EXISTING (F7) — listAttackable/loadSquad (called, not modified)
├── src/sim/
│   └── index.ts                       # EXISTING (F1) — resolveBattle() host wrapper (called in-process, not modified)
├── app/api/arena/resolve/route.ts     # NEW — Node handler: validates input, calls startRankedMatch, returns { matchId }
├── app/api/practice/resolve/route.ts  # NEW — Node handler: calls startPracticeMatch, returns { matchId }
├── app/(app)/arena/
│   ├── page.tsx                       # NEW — Arena matchup/preview screen (Server Component; reads attack pool + preview)
│   └── deploy-panel.tsx               # NEW — "use client" leaf: DEPLOY (→ resolve route) + ↻ SKIP OPPONENT (→ preview action)
├── app/(app)/practice/
│   ├── page.tsx                       # NEW — Practice screen (Server Component; draws a hidden opponent)
│   └── practice-panel.tsx             # NEW — "use client" leaf: DEPLOY (→ practice resolve) + REFRESH (→ refresh action)
├── next.config.ts                     # EDIT — extend outputFileTracingIncludes for /api/arena/resolve + /api/practice/resolve (research B2)
└── (existing app: app/(app)/layout.tsx shell (F3), db/, auth.ts (F7), packages/engine-wasm/ (F1), …)
```

**Structure Decision**: Everything lives **inside the existing Next.js app**. The orchestration is a
**server-only service layer under `src/server/`** (the same home and `ctx`-session convention as
Feature 7's API), the WASM-invoking resolve step is a **Node Route Handler** (stable file-tracing key
+ an explicit P6 boundary; mirrors Feature-1's `/api/resolve`), and the two screens live under the
authenticated route group `app/(app)/` on the Feature-3 shell. Feature 8 imports the engine host
**in-process** (no self-HTTP) and calls Feature-7's service API — it forks neither.

## Complexity Tracking

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Resolve step is a Route Handler, not a Server Action** (the stack pack's default for mutations) | The resolve step **instantiates the WASM engine**, so it needs a **stable `outputFileTracingIncludes` key** to ship `engine_bg.wasm` reliably, and it is a **P6 security boundary** best modeled as an explicit validated endpoint (mirrors Feature-1's `/api/resolve`). | A **plain Server Action** — rejected for the resolve step: WASM file-tracing folds into the calling route's bundle less explicitly (the "wasm not found at runtime" trap), and a P6 boundary deserves an explicit surface. **Preview / skip / refresh (no WASM) remain Server Actions** — no deviation there. |
| **`loadCurrentRuleset()` seam with a v1 default ruleset** (a temporary shim until Feature 12) | The resolve path **must** read "the current ruleset," but **no shipped feature owns the live editable ruleset store** yet (Feature-7 stores only `rulesetHash`; Feature 12 will own editing). The seam lets Feature 8 build/test now and swaps to the real store with **zero** resolve-path change. | **Blocking Feature 8 on Feature 12** — rejected (needless coupling). **Baking a ruleset constant into Feature 8** — rejected (violates P8 / Feature-1 FR-007). **Flagged as a coordination note** for Features 12/7 (who owns the store). |

*No P1/P6 trade. Both invariants are the feature's backbone. The two items above are integration
shapes, not invariant violations.*

## Cross-feature coordination notes

- **⚠ Live ruleset store (Feature 12 / Feature 7) — the one real gap.** Feature 8's resolve path
  needs the **current live ruleset** as an engine input; today **no feature owns that store**
  (Feature-7 persists `rulesetHash` but no ruleset table; Feature 12 will own live *editing*).
  Feature 8 reads it via `loadCurrentRuleset()`, defaulting to a committed ruleset in v1. **Decision
  owed by Features 12/7:** a Feature-12-owned store (row / Edge Config / KV) **or** an added Feature-7
  `rulesets` table (one active row). Un-versioned; a bump is a re-emission, not a migration
  (Feature-1 research C4). See [research.md](./research.md) D1.
- **Feature 7 (persistence) — consumed, not modified.** Feature 8 calls `listAttackable`,
  `loadSquad`, the snapshot **serve** query, and `recordMatch`; it relies on snapshot **immutability +
  retention** (FR-014) for the deactivated-mid-window edge case. If any of those signatures shift,
  Feature 8 tracks them.
- **Feature 5 (Playback) / Feature 6 (Summary) — handoff targets.** Feature 8 returns a **match id**
  and navigates to their routes (e.g. `app/(app)/battle/[matchId]`, owned by F5/F6); they fetch the
  server-recorded replay via Feature-7 `getReplay`. Linked by path; those specs may still be
  generating: [../005-battle-playback/](../005-battle-playback/), [../006-battle-summary/](../006-battle-summary/).
- **Feature 9 (Ladder) — downstream reader.** Feature 8 writes the standings Feature 9 reads
  (`ladder_standings` via `recordMatch`); the mockup's MMR/tier labels are Feature-9 forward-looking,
  not Feature-8's v1 stake (§13 net victories).
- **Feature 1 (engine) — imported host.** Feature 8 adds its resolve entrypoints to
  `outputFileTracingIncludes` so the shared `@wfc/engine-wasm` is traced into Feature 8's functions.

## Post-Design Constitution Re-check

After Phase 1 (contract + structure): **still PASS.**
- The contract keeps **every outcome-determining input server-side** (session-derived attacker,
  server seed, server ruleset, server opponent) and exposes **no** client result-write path — P6 holds
  and is the contract's spine.
- Blind + Bo3-locked serve is realized purely by **reusing** Feature-7 immutability + Feature-1
  `adaptation=Locked` (one `resolve`), adding no new mechanism — P5/P6, scope-disciplined.
- Practice is the same path with `mode='practice'` + `adaptation=Free` + **no standing mutation** and
  concealed identity — the differences are flags, not a second engine.
- The two tracked deviations are unchanged; no new complexity surfaced.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (sync-vs-queue, WASM reuse, matchmaking selection, ruleset seam — resolved; ruleset-store ownership flagged)
- [x] **Phase 1 — Design & contracts** → [contracts/matchmaking-resolve-api.md](./contracts/matchmaking-resolve-api.md) (no data-model.md — no new persistent entities)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
