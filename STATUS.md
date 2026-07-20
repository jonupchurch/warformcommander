# Project Status — Warform Commander

> Living snapshot of where the project is. Update it as phases and features
> move. It complements `CHANGELOG.md` (what shipped) by capturing the
> *current* state and what's next. Last updated: 2026-07-20.

## Current phase

**Feature 1 (sim core) — COMPLETE, MERGED to `main`, and LIVE in production
(prod-verified).** All 12 v1 features are specced, planned, and tasked (Spec-Kit `spec` +
`plan` + `tasks` under `specs/00X-*/`, each with a passing Constitution Check), and
**Feature 1 is fully implemented and deployed**: the Rust engine (all five user stories)
resolves best-of-three battles deterministically — **82 native tests green** (unit +
integration + committed golden battery) plus clippy/rustfmt clean — and now runs
**server-side as WASM**, with `native == wasm` proven **byte-for-byte** across the golden
battery (P6/SC-001, T017). **`POST /api/resolve` is live at `warformcommander.vercel.app`
and prod-verified**: all four golden inputs return HTTP 200 with responses byte-for-byte
identical to the native Rust output — cross-platform determinism holds all the way to
production. (The first prod deploy 500'd on wasm module resolution; fixed in `25965b1` —
trace the whole real `packages/engine-wasm/` dir into the function and load it by real
path, not the workspace-symlink package name. See the engine README / build-state notes.)
What's built: fixed-point + pinned-PRNG determinism, the typed 3-tier data model, the
V1–V8 validation trust boundary, the tick loop → row-based targeting → damage pipeline →
behavior/Plan-B → Conquest/Time/Bo3 outcomes, the compact random-access **wire replay** +
a pure TS reader, the seed content fixtures, the balancer throughput hook (**10,000 Bo3
in ~3.5s**, SC-006), the prebuilt-and-committed `packages/engine-wasm/`, and a live
`POST /api/resolve` Next.js route (verified via `next build` + an HTTP smoke). Engine CI
covers native x86-64 + ARM64, the wasm-parity check, fmt/clippy, and the TS typecheck.
The only carried-forward item is the full **V1–V8 TypeScript validation mirror**, which
belongs to the Garage (Feature 4) where edit-time validation UX lives — the WASM engine
remains the authoritative validator meanwhile.

**Feature 3 (app shell + design system) — COMPLETE and MERGED to `main`.** The visual +
structural foundation every screen composes: the full Brand Foundation
**token system** in `app/globals.css` (primitive ramps → semantic faction/zone/family roles →
published utilities → shadcn base tokens re-pointed on-brand), Archivo + Space Mono via
`next/font`, the **responsive app shell** (`components/shell/` — top-tab in landscape /
bottom-tab in portrait, the P7 spine), the **token-driven primitive kit** (`components/ui/`:
Button/Panel/Chip/StatBar/Stat/SectionLabel/BracketFrame/GridBackdrop + shadcn
dropdown/dialog/sheet themed by base tokens alone), and the **brand marks** (`components/brand/`:
the two-wedge Logo lockups, Wordmark, and UnitIcon inlining the 7 machine SVGs with
`currentColor` faction tinting). Verified: **18 Playwright + axe e2e green** (token fidelity,
AA contrast, responsive shell, primitives, brand, focus rings, reduced motion — SC-001…SC-010),
`next build` + `tsc` + ESLint + the **no-raw-hex guard** clean, browsable at **`/gallery`**.
New CI: `.github/workflows/web-ci.yml`. Notable calls: the repo keeps root-level `components/` +
`lib/` (matching `sim/`/`db/`, `@/* → ./*`) rather than `src/`; "Archivo Expanded" isn't in
next/font so the display face uses Archivo's variable width axis (`font-stretch`); the brand
purple was brightened `#7b5cff`→`#8a6dff` for AA (FR-005); the user's custom `app/favicon.ico`
was left untouched (the Logo can generate a mark-based favicon on request).

**Feature 7 (accounts & persistence) — COMPLETE on branch `007-accounts-persistence`, ready to
merge.** The stateful backend/DB layer the async-PvP product stands on: the single Drizzle schema
(`db/schema.ts`) Features 8–12 read/write — Tier A Auth.js tables + Tier B game tables (squads,
defense snapshots, matches, replays, ladder standings, posts, presets), game content as Feature-1
typed `jsonb` (P8), with **defense immutability + the ≤3 cap + pool exclusivity + `net_victories`
as DB invariants**. **US1** Google auth (Auth.js v5 + Drizzle adapter, **database sessions**,
server-side admin allowlist with instant revocation); **US2** roster CRUD gated by the shared engine
`validate()` (no illegal army persisted); **US3** copy-on-designate immutable defense snapshots;
**US4** server-only match+`jsonb`-replay recording with regenerate-not-migrate; **US5** net-victory
standings + reconciliation oracle; plus the unified `posts` table, the `presets` library, and an
idempotent cold-start bot-defender seed (P5). The engine gained wasm `validate`/`default_ruleset`
exports so the DB validates exactly as the engine does (rebuilt wasm re-verified byte-identical).
Verified: **34 Vitest integration tests green** on a local dev Postgres + `tsc` + ESLint + a clean
`next build`. Remaining: the user-gated **Neon dev-branch → prod** migration promote (SC-008;
`db/README.md`). New env: `AUTH_SECRET`/`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`/`ADMIN_ALLOWLIST`.

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

1. ~~**Merge `001-battle-sim-core`**~~ ✅ **DONE (2026-07-20)** — merged to `main` (`--no-ff`, `2686b64`), deployed, and prod-verified (`POST /api/resolve` returns byte-for-byte-native replays live). Regenerate the wasm with `wasm-pack build crates/engine --target nodejs --out-dir ../../packages/engine-wasm --release` whenever the engine changes — and re-verify the prod route (see the wasm-on-Vercel notes below), since a wasm/host change can break module resolution in the function bundle without breaking local dev.
2. ~~**Feature 3 (app shell + design system)**~~ ✅ **DONE + MERGED (2026-07-20)**.
3. ~~**Feature 7 (accounts & persistence)**~~ ✅ **DONE (2026-07-20)** — built + verified (34 Vitest tests) on branch `007-accounts-persistence`, ready to merge. **Build the rest in dependency order:** Features 4/5/6 (garage/playback/summary — Feature 4 owns the **V1–V8 TS validation mirror**; a TS `sim/model.ts` type mirror + a wasm `validate`/`default_ruleset` export already landed in Feature 7) → 8/9/10 (arena/ladder/profile; Feature 8 wraps `/api/resolve` with auth + a server-loaded ruleset, and consumes the Feature-7 service API) → 2 (balancer) → 11 (marketing/news) → 12 (admin). Each on its own feature branch.
4. **Neon prod promote (user-gated):** the schema is migrated + tested on **local dev Postgres**; before Features 8–12 write prod data, apply the reviewed migration to the Neon **production** branch (`npm run db:migrate` with the prod `DATABASE_URL`) and seed cold-start defenders — see `db/README.md` (SC-008). Extend the auth env (`AUTH_SECRET`/`AUTH_GOOGLE_*`/`ADMIN_ALLOWLIST`) to Vercel Production + Preview.
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
| 1 | Sim core + game data model | ✅ | ✅ | ✅ 54 | **✅ MERGED + LIVE — native engine (82 tests) + WASM + /api/resolve prod-verified; native==wasm proven byte-for-byte in production** |
| 2 | Auto-balancer (Monte-Carlo, reuses sim core) | ✅ | ✅ | ✅ 32 | after #1 |
| 3 | App shell + design system (nav, brand tokens) | ✅ | ✅ | ✅ 55 | **✅ MERGED — tokens + responsive shell + primitives + brand; 18 Playwright/axe e2e green** |
| 4 | Garage (squad builder + loadout/dial editor) | ✅ | ✅ | ✅ 40 | after #3/#7 |
| 5 | Battle playback (tick stream → pixel-art replay) | ✅ | ✅ | ✅ 42 | after #3 |
| 6 | Battle summary (post-Bo3 results) | ✅ | ✅ | ✅ 32 | after #3 |
| 7 | Accounts & persistence (backend/DB, defense snapshots) | ✅ | ✅ | ✅ 52 | **✅ BUILT — schema + auth + service layer; 34 Vitest tests green; prod migrate pending** |
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
