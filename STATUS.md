# Project Status — Warform Commander

> Living snapshot of where the project is. Update it as phases and features
> move. It complements `CHANGELOG.md` (what shipped) by capturing the
> *current* state and what's next. Last updated: 2026-07-19.

## Current phase

**Feature 1 (sim core) — native engine complete; WASM/web-host wiring is the only
remainder.** All 12 v1 features are specced, planned, and tasked (Spec-Kit `spec` +
`plan` + `tasks` under `specs/00X-*/`, each with a passing Constitution Check), and
**Feature 1 is now implemented on branch `001-battle-sim-core`**: the full Rust engine
(all five user stories) resolves best-of-three battles deterministically, with **82
tests green** (unit + integration + a committed golden battery) and clippy/rustfmt
clean. What's built: fixed-point + pinned-PRNG determinism, the typed 3-tier data
model, the V1–V8 validation trust boundary, the tick loop → row-based targeting →
damage pipeline → behavior/Plan-B → Conquest/Time/Bo3 outcomes, the compact
random-access **wire replay** + a pure TS reader, the seed content fixtures, and the
balancer throughput hook (**10,000 Bo3 in ~3.5s**, SC-006). **Remaining for Feature 1:**
the WASM cross-compile (wasm-pack) + the Next.js host route + the native==wasm golden
check (T004/5/7, T017, T027, T033, T052) — needs `wasm-pack` installed.

**Approach — plan-the-whole-set-first, then build foundation-first (Principle VII):**
the full set was planned before any implementation so shared models and cross-feature
dependencies surfaced on paper. Feature 1 (the deterministic **sim core + data model**)
is the foundation everything imports; the design doc
(`reference/warformcommandergamedesigndoc.md`) remains the master plan, and each
feature's `specs/00X-*/` directory is its detailed blueprint.

**Cross-feature reconciliation items** (surfaced during planning; resolve at build time):
- **Ruleset loader naming:** Feature 8 wrote a `loadCurrentRuleset()` placeholder; Feature
  12 defines the real `getCurrentRuleset()` (fresh-read, no per-instance cache, over its new
  `rulesets`/`current_ruleset` store) and renames the call site (F12 tasks T045).
- **Editorial post authoring:** Feature 11 assumes all `posts` writes go through the admin
  surface, but Feature 12's spec covers only auto-posts (balance/devlog/changelog). Editorial
  (hand-written) authoring needs a home — most naturally a small addition to the Feature 12
  admin console — to be assigned before those features are built.
- **Per-machine damage rollup:** Feature 6 wants MVP/per-machine damage that Feature 1's
  `MatchResult` doesn't carry; it derives it from an O(events) replay reduction (no re-sim).
  Adding a per-machine rollup to the engine result is an optional future convenience.

## Done

- [x] Git repo initialized; Next.js 16 (App Router, TS, Tailwind v4, ESLint, Turbopack) scaffolded and building.
- [x] `ai-tools` spec-kit toolkit + process docs in place.
- [x] Vercel: git-connected, **production live** at `warformcommander.vercel.app` (auto-deploys on push to `main`).
- [x] Observability live: **Vercel Web Analytics** (enabled) + **Sentry** error monitoring & tracing (`@sentry/nextjs`, source-map upload working). `@vercel/otel` deliberately skipped (fragile dual-OTel; Sentry is already OTel-based).
- [x] Design absorbed: game design doc + **9 screen mockups** (Home, Content, Garage, Arena, Battle Playback, Battle Summary, Ladder, Profile, Brand Foundation, Logo Directions) committed to `reference/` and digested.
- [x] **Constitution v3.0.0 ratified (2026-07-18)** — product & architecture invariants P1–P8 + the retained engineering process I–IX. See `.specify/memory/constitution.md`.
- [x] **Feature 1 spec drafted** — `specs/001-battle-sim-core/spec.md` (Status: Draft; quality checklist 16/16, zero clarifications). On branch `001-battle-sim-core`.
- [x] **Vehicle icon set** — 7 line-art unit SVGs in `public/icons/`, one per sim-core machine type, `currentColor`-tinted for faction via CSS (friendly `#2ad4ff` / enemy `#ff3b4e`). Not yet consumed by a screen.
- [x] **Gameplay design deep-dive (2026-07-19)** — locked ~18 decisions (Rust/WASM engine + replay-as-data, tick/cadence model, row-based reach, behavior dials + Plan-B conditions & slot-order precedence, rosters/defense/matchmaking, admin console + unified news, Google auth). Written into the design doc (§4/§8/§9/§16/§18).
- [x] **First-pass stat block** — `reference/warformcommander-firstpass-stats.md` (v0 placeholder: 7 types × 3 variants, equipment, damage model, reach, TTK calibration to the 300–450-tick budget). Seeds the engine + balancer.
- [x] **News page mockup** committed to `reference/` (10 screen mockups now).
- [x] **Full v1 feature set planned (2026-07-19)** — all **12 features** carried through Spec-Kit `spec → plan → tasks` under `specs/00X-*/` (Feature 1 in the foreground with dedicated Rust/WASM + determinism + replay research; Features 2–12 via parallel briefed subagents), each with a passing Constitution Check. **~536 tasks** across the set. Root `PLAN.md` is the one-page overview.

## Next up

1. **Finish Feature 1's WASM/host path** — install `wasm-pack`; `wasm-pack build --target nodejs` (prebuild-and-commit `packages/engine-wasm/`); wire `next.config` (`serverExternalPackages` + `outputFileTracingIncludes`) + `sim/index.ts` + `app/api/resolve/route.ts`; add the TS validation mirror; and prove the **wasm golden hashes equal the native golden battery** (T017, the P6 native==wasm check). CI (`.github/workflows/engine-ci.yml`) already has the native x86/ARM matrix + a wasm-pack job ready. Then merge `001-battle-sim-core`.
2. **Then build in dependency order:** Feature 3 (app shell) + Feature 7 (accounts/persistence) as the next foundations → Features 4/5/6 (garage/playback/summary) → 8/9/10 (arena/ladder/profile) → 2 (balancer, fleshed from the Feature 1 stub) → 11 (marketing/news) → 12 (admin). Each `/speckit-implement` from its `specs/00X-*/tasks.md`, on its own feature branch.
3. **Before creating DB tables** (Feature 7): set up a Neon **dev branch** and extend the Neon env vars to Preview.
4. Reconcile the three cross-feature items listed under **Current phase** as their features are built.
5. **Balance rough edge for Feature 2** (surfaced by the counter-web tests): on placeholder numbers, air alpha beats every non-AA archetype (only AA counters it) — the counter-web *shape* is right; the *spread* wants tuning (affordable AA for more archetypes, or trim air's alpha).

## Feature set (v1, foundation-first order)

Backlogged per design doc §16.1 (NOT v1): PvE, attack-fuel economy, progression
unlocks, monetization, commanders, manual-override, onboarding.

All 12 planned (spec + plan + tasks, Constitution Check passing). Task counts per
feature; see root `PLAN.md` for the per-feature task TL;DR. "Build order" = suggested
implementation sequence, not the spec numbering.

| # | Feature | Spec | Plan | Tasks | Build order |
|---|---|---|---|---|---|
| 1 | Sim core + game data model | ✅ | ✅ | ✅ 54 | **1st — native engine BUILT (82 tests); WASM/host pending** |
| 2 | Auto-balancer (Monte-Carlo, reuses sim core) | ✅ | ✅ | ✅ 32 | after #1 |
| 3 | App shell + design system (nav, brand tokens) | ✅ | ✅ | ✅ 55 | 2nd |
| 4 | Garage (squad builder + loadout/dial editor) | ✅ | ✅ | ✅ 40 | after #3/#7 |
| 5 | Battle playback (tick stream → pixel-art replay) | ✅ | ✅ | ✅ 42 | after #3 |
| 6 | Battle summary (post-Bo3 results) | ✅ | ✅ | ✅ 32 | after #3 |
| 7 | Accounts & persistence (backend/DB, defense snapshots) | ✅ | ✅ | ✅ 52 | 3rd (foundation) |
| 8 | Arena (async matchmaking) + Practice sandbox | ✅ | ✅ | ✅ 51 | after #4/#7 |
| 9 | Ladder (seasons, metrics, tiers/MMR) | ✅ | ✅ | ✅ 38 | after #7/#8 |
| 10 | Profile (career stats, achievements) | ✅ | ✅ | ✅ 33 | after #7 |
| 11 | Marketing site (Home + News index + article template) | ✅ | ✅ | ✅ 59 | after #3/#7 |
| 12 | Admin console + balance publishing (live stat editing → auto news) | ✅ | ✅ | ✅ 48 | after #7 |

## Tech stack

- **Framework:** Next.js 16 (App Router) — see `stacks/nextjs.md`.
- **Styling:** Tailwind CSS v4 (shadcn/ui-ready). **Package manager:** npm.
- **Sim core:** **Rust → WebAssembly**, a pure `resolve(armies, ruleset, seed) → Replay`. Server runs it via WASM (authoritative); the balancer runs the same core natively; the client only **replays** the emitted per-tick snapshot stream (never simulates) — per constitution P6/P8.
- **Auth:** Google OAuth first (all users), email login fast-follow — provisioned with the DB in feature #7.
- **Deployment:** Vercel — git-connected, auto-deploys on push to `main`.
- **Observability:** Vercel Web Analytics + Sentry (`@sentry/nextjs`).
- **Backend/DB:** **Neon Postgres + Drizzle ORM** via the Vercel Marketplace (decided 2026-07-19). Driver **`postgres`** (postgres-js) with **`drizzle-orm/postgres-js`** — chosen over neon-http for local+prod parity and transaction support (see `db/index.ts`: lazy `getDb()`, `prepare:false` for the Neon pooler, no Proxy wrapper so auth adapters work). **Already provisioned** and wired now (battle-result/replay storage is an early need); the full schema lands with Feature 7. **Auth** = Google via Auth.js + the Drizzle adapter, database session strategy (Feature 7).
- **Testing:** unit tests + Playwright e2e (constitution Principle VIII).

## How to maintain this file

- Move items from **Next up** to **Done** as they complete; update the Feature set table.
- Keep **Current phase** honest — it's the first thing a new session should read.
- Record shipped changes in `CHANGELOG.md`; record *where we are* here.
