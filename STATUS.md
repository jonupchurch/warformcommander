# Project Status — Warform Commander

> Living snapshot of where the project is. Update it as phases and features
> move. It complements `CHANGELOG.md` (what shipped) by capturing the
> *current* state and what's next. Last updated: 2026-07-19.

## Current phase

**Feature planning & build (foundation-first).** Bootstrapping is done: the
Next.js app is scaffolded, deployed, and observable, and the whole game design
has been absorbed from `reference/`. The project constitution is ratified
(v3.0.0). We are now building the game, starting from the foundation.

**Approach — foundation-first (a deliberate read of Principle VII):** the design
doc (`reference/warformcommandergamedesigndoc.md`) already surfaces the shared
data model, cross-feature dependencies, and build order that Principle VII asks a
whole-set plan to surface — so rather than mechanically spec all ~11 features
before any code, we build the deterministic **sim core + data model** first (the
foundation everything imports) and spec each later feature just-in-time in
dependency order. The design doc is the master plan.

**Active work:** A gameplay-design deep-dive (2026-07-19) locked ~18 architecture,
combat, and live-ops decisions (see design doc §18) and produced a first-pass stat
block. The Feature 1 spec now needs a **revision pass** to absorb them — WASM engine,
replay-as-data, `ruleset` as an engine input, discrete zone movement, the tick/cadence
model — before planning. Nothing is implemented yet.

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

## Next up

1. **Revise the Feature 1 spec** — absorb this session's decisions (WASM engine, seekable replay-as-data, `ruleset` as an engine input, discrete zone movement, tick/cadence constants, row-based reach) on branch `001-battle-sim-core`, then approve.
2. **`/speckit-plan`** for Feature 1 — the Rust/WASM engine design, the typed data schema, the replay format, and the test strategy (determinism + counter-web).
3. **`/speckit-tasks`** → **`/speckit-implement`** — build and test the sim core.
4. Then spec/build the rest in dependency order (see Feature set below).

## Feature set (v1, foundation-first order)

Backlogged per design doc §16.1 (NOT v1): PvE, attack-fuel economy, progression
unlocks, monetization, commanders, manual-override, onboarding.

| # | Feature | Spec | Plan | Tasks | Status |
|---|---|---|---|---|---|
| 1 | Sim core + game data model | ✅ draft | — | — | **spec drafted; needs revision pass** |
| 2 | Auto-balancer (Monte-Carlo, reuses sim core) | — | — | — | not started |
| 3 | App shell + design system (nav, brand tokens) | — | — | — | not started |
| 4 | Garage (squad builder + loadout/dial editor) | — | — | — | not started |
| 5 | Battle playback (tick stream → pixel-art replay) | — | — | — | not started |
| 6 | Battle summary (post-Bo3 results) | — | — | — | not started |
| 7 | Accounts & persistence (backend/DB, defense snapshots) | — | — | — | not started |
| 8 | Arena (async matchmaking) + Practice sandbox | — | — | — | not started |
| 9 | Ladder (seasons, metrics, tiers/MMR) | — | — | — | not started |
| 10 | Profile (career stats, achievements) | — | — | — | not started |
| 11 | Marketing site (Home + News index + article template) | — | — | — | not started |
| 12 | Admin console + balance publishing (live stat editing → auto news) | — | — | — | not started (post-#7) |

## Tech stack

- **Framework:** Next.js 16 (App Router) — see `stacks/nextjs.md`.
- **Styling:** Tailwind CSS v4 (shadcn/ui-ready). **Package manager:** npm.
- **Sim core:** **Rust → WebAssembly**, a pure `resolve(armies, ruleset, seed) → Replay`. Server runs it via WASM (authoritative); the balancer runs the same core natively; the client only **replays** the emitted per-tick snapshot stream (never simulates) — per constitution P6/P8.
- **Auth:** Google OAuth first (all users), email login fast-follow — provisioned with the DB in feature #7.
- **Deployment:** Vercel — git-connected, auto-deploys on push to `main`.
- **Observability:** Vercel Web Analytics + Sentry (`@sentry/nextjs`).
- **Backend/DB:** TBD — design doc suggests Postgres/Supabase; decision deferred to the Accounts & persistence feature (#7).
- **Testing:** unit tests + Playwright e2e (constitution Principle VIII).

## How to maintain this file

- Move items from **Next up** to **Done** as they complete; update the Feature set table.
- Keep **Current phase** honest — it's the first thing a new session should read.
- Record shipped changes in `CHANGELOG.md`; record *where we are* here.
