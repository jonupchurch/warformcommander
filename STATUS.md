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

**Active work:** Feature 1 (`001-battle-sim-core`) spec is **drafted and pending
review** on branch `001-battle-sim-core`. Nothing is implemented yet.

## Done

- [x] Git repo initialized; Next.js 16 (App Router, TS, Tailwind v4, ESLint, Turbopack) scaffolded and building.
- [x] `ai-tools` spec-kit toolkit + process docs in place.
- [x] Vercel: git-connected, **production live** at `warformcommander.vercel.app` (auto-deploys on push to `main`).
- [x] Observability live: **Vercel Web Analytics** (enabled) + **Sentry** error monitoring & tracing (`@sentry/nextjs`, source-map upload working). `@vercel/otel` deliberately skipped (fragile dual-OTel; Sentry is already OTel-based).
- [x] Design absorbed: game design doc + **9 screen mockups** (Home, Content, Garage, Arena, Battle Playback, Battle Summary, Ladder, Profile, Brand Foundation, Logo Directions) committed to `reference/` and digested.
- [x] **Constitution v3.0.0 ratified (2026-07-18)** — product & architecture invariants P1–P8 + the retained engineering process I–IX. See `.specify/memory/constitution.md`.
- [x] **Feature 1 spec drafted** — `specs/001-battle-sim-core/spec.md` (Status: Draft; quality checklist 16/16, zero clarifications). On branch `001-battle-sim-core`.
- [x] **Vehicle icon set** — 7 line-art unit SVGs in `public/icons/`, one per sim-core machine type, `currentColor`-tinted for faction via CSS (friendly `#2ad4ff` / enemy `#ff3b4e`). Not yet consumed by a screen.

## Next up

1. **Review the Feature 1 spec** — `specs/001-battle-sim-core/spec.md` on branch `001-battle-sim-core`; approve or revise. (Key judgment calls are in its Assumptions section: content-subset, tick/time model, adaptation-policy ownership, defender definition.)
2. **`/speckit-plan`** for Feature 1 — engine design, the framework-agnostic TS module layout, the typed data schema, and the test strategy (determinism + counter-web).
3. **`/speckit-tasks`** → **`/speckit-implement`** — build and test the sim core.
4. Then spec/build the rest in dependency order (see Feature set below).

## Feature set (v1, foundation-first order)

Backlogged per design doc §16.1 (NOT v1): PvE, attack-fuel economy, progression
unlocks, monetization, commanders, manual-override, onboarding.

| # | Feature | Spec | Plan | Tasks | Status |
|---|---|---|---|---|---|
| 1 | Sim core + game data model | ✅ draft | — | — | **spec drafted, pending review** |
| 2 | Auto-balancer (Monte-Carlo, reuses sim core) | — | — | — | not started |
| 3 | App shell + design system (nav, brand tokens) | — | — | — | not started |
| 4 | Garage (squad builder + loadout/dial editor) | — | — | — | not started |
| 5 | Battle playback (tick stream → pixel-art replay) | — | — | — | not started |
| 6 | Battle summary (post-Bo3 results) | — | — | — | not started |
| 7 | Accounts & persistence (backend/DB, defense snapshots) | — | — | — | not started |
| 8 | Arena (async matchmaking) + Practice sandbox | — | — | — | not started |
| 9 | Ladder (seasons, metrics, tiers/MMR) | — | — | — | not started |
| 10 | Profile (career stats, achievements) | — | — | — | not started |
| 11 | Marketing site (Home + article template) | — | — | — | not started |

## Tech stack

- **Framework:** Next.js 16 (App Router) — see `stacks/nextjs.md`.
- **Styling:** Tailwind CSS v4 (shadcn/ui-ready). **Package manager:** npm.
- **Sim core:** framework-agnostic TypeScript, shared by server (authoritative), client (render), and balancer (offline) — per constitution P6/P8.
- **Deployment:** Vercel — git-connected, auto-deploys on push to `main`.
- **Observability:** Vercel Web Analytics + Sentry (`@sentry/nextjs`).
- **Backend/DB:** TBD — design doc suggests Postgres/Supabase; decision deferred to the Accounts & persistence feature (#7).
- **Testing:** unit tests + Playwright e2e (constitution Principle VIII).

## How to maintain this file

- Move items from **Next up** to **Done** as they complete; update the Feature set table.
- Keep **Current phase** honest — it's the first thing a new session should read.
- Record shipped changes in `CHANGELOG.md`; record *where we are* here.
