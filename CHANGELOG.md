# Changelog

All notable changes to Warform Commander are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches a released version. Until then, everything lives under
**Unreleased**.

## [Unreleased]

### Added
- Initial repository scaffolding and `.gitignore` for a Next.js project.
- Seeded the `ai-tools` spec-driven toolkit into the repo: the `.specify/`
  Spec-Kit engine (templates + PowerShell scripts), `.claude/` agents,
  commands, and `speckit-*` skills, the `stacks/` convention packs, and the
  always-on operating context (`CLAUDE.md`, `AGENTS.md`, `MANIFEST.md`).
- Project process docs: `CHANGELOG.md` and `STATUS.md`.
- Next.js 16 (App Router) application scaffold — TypeScript, Tailwind CSS v4,
  ESLint, Turbopack; `app/` at the repo root with the `@/*` import alias.
  Verified with a clean `next build`.
- Linked the repository to the Vercel project
  `jupchurch-7994s-projects/warformcommander` (Next.js framework preset).
- Vercel Web Analytics via `@vercel/analytics` (`<Analytics />` in the root
  layout); enabled on the project and collecting.
- Sentry error monitoring and tracing via `@sentry/nextjs` across the Node,
  Edge, and browser runtimes (`instrumentation.ts`, `instrumentation-client.ts`,
  `sentry.server.config.ts`, `sentry.edge.config.ts`, `app/global-error.tsx`,
  and `withSentryConfig` in `next.config.ts`). Activated in production via the
  Sentry Vercel Marketplace integration (DSN + source-map env configured);
  `.env.example` documents the required env. Chose Sentry alone over pairing it
  with `@vercel/otel` (fragile dual OpenTelemetry setup; Sentry's SDK already
  provides OTel-based tracing).
- Reference material under `reference/` — the game design doc plus brand
  foundation, logo directions, and eight screen mockups (Home, Content, Garage,
  Arena, Battle Playback, Battle Summary, Ladder, Profile).
- Project constitution v3.0.0 (`.specify/memory/constitution.md`) — Warform
  Commander's product & architecture invariants (P1–P8: non-P2W, planning-over-
  twitch, depth-from-config, fairness-verified, content-from-players,
  deterministic/seeded/server-authoritative sim, both-platforms-first-class,
  data-driven) atop the retained engineering process (Principles I–IX).
  Ratified 2026-07-18.
- Vehicle icons under `public/icons/` — seven line-art unit SVGs (64×40), one
  per sim-core machine type (`heavy-tank`, `light-tank`, `mech`,
  `attack-helicopter`, `rocket-artillery`, `artillery`, `support`). Each uses
  `currentColor` so faction color is applied via CSS (friendly `#2ad4ff` /
  enemy `#ff3b4e`) rather than a file per color; render inline for `color` to
  apply. Not yet consumed by a screen.
- News page reference mockup (`reference/Warform Commander News Wireframe.dc.html`)
  — public news index (search, category chips, featured post + card grid,
  pagination), articles linking the existing Content Page template.
- First-pass stat block (`reference/warformcommander-firstpass-stats.md`) —
  placeholder v0 numbers for the 7 unit types × 3 chassis variants, representative
  equipment, the damage/mitigation model, row-based targeting/reach, and
  time-to-kill calibration to the 10 t/s · 1000-tick-cap · 30–45 s-average battle
  budget. Seeds the sim engine and the Monte-Carlo balancer (which tunes finals).
- Design-doc consolidation (`reference/warformcommandergamedesigndoc.md`) of the
  2026-07-19 gameplay deep-dive (§4/§8/§9/§16/§18): **Rust → WASM** engine (pure
  `resolve(armies, ruleset, seed) → Replay`) with a **replay-only client**;
  deterministic fixed-point sim; **random-access per-tick-snapshot** replay
  (scrubber-safe); **admin-editable ruleset** input; four-tier fire cadence and
  **discrete zone-based movement**; **row-based targeting/reach** with ≤25% splash;
  the full **behavior-dial + Plan-B condition** menus with latch + slot-order
  precedence; **8 saved squads** (→ 64 via bundles) with **blind random 3-squad
  defense**; **Google-first auth**; and a **unified news system** auto-posting
  balance changes and code pushes.
- **Full v1 feature set planned (2026-07-19)** — all **12 features** carried
  through Spec-Kit `spec → plan → tasks` under `specs/00X-*/` (**~536 tasks**),
  each with a passing Constitution Check, plus a root **`PLAN.md`** one-page
  overview and a refreshed `STATUS.md` feature table. Feature 1 (sim core) was
  planned in the foreground with dedicated research — cross-platform determinism
  (fixed-point `i64` + pinned `Pcg64` + golden-hash CI), Rust→WASM on Vercel
  (wasm-pack + output-file-tracing), and the seekable positional-array JSON
  replay (`jsonb`, O(1) seek); Features 2–12 were planned by parallel briefed
  subagents against Feature 1's data model, the design system, and the DB schema.
  Also corrected the DB driver of record to **postgres-js** (`drizzle-orm/
  postgres-js`) over neon-http, for local+prod parity and transactions. Nothing
  implemented yet — this is the buildable blueprint.
- **Feature 1 — deterministic sim core + game data model (native engine, 2026-07-19).**
  The Rust workspace (`crates/engine` cdylib+rlib, `crates/balancer`) implementing
  all five user stories on branch `001-battle-sim-core`:
  - **Determinism primitives (P6):** `Fixed` scaled-`i64` milli-units + basis-point
    `Bp` (no floats anywhere), a version-pinned value-stable `Pcg64` PRNG with
    integer-only draws + a locked reference vector, and a **golden-hash** harness
    (`tests/golden/manifest.json`, `BLESS_GOLDEN` to re-bless).
  - **Typed 3-tier data model:** Tier-1 content (7 machine types × 3 variants,
    equipment union, behavior dials + Plan-B), Tier-2 the admin-editable `Ruleset`
    balance table (all `BTreeMap`, BLAKE3 `rulesetHash`), and the shared
    effective-stat derivation (equipment deltas additive over the chassis).
  - **`validate()`** — the V1–V8 trust boundary, run server-side before any resolve.
  - **`resolve()`** — a pure best-of-three: fixed 10 t/s tick loop (1000-tick cap),
    row-based reach + Target-Row/Rule dials, the §9.2 damage pipeline (shields →
    hull → ≤25% splash, the counter-web matrix + air modifiers), Plan-B latching
    (Slot-1 > Slot-2), Conquest/Time win conditions (exact tie → defender), and
    Locked/Free adaptation. `resolve_series()` for Free-mode practice/balancer runs.
  - **Replay:** the in-memory tick stream + a compact positional/columnar **wire
    format** (tick-indexed, O(1) seek, versioned) and a **pure TypeScript reader**
    (`sim/replay-reader.ts`, no engine import, no re-sim).
  - **Verification:** 82 tests (determinism 1000×/sensitivity/run-twice + committed
    golden battery, counter-web ratios + AA/artillery/no-single-winner, win
    conditions + Bo3 + adaptation modes, wire reconstruction/reconciliation),
    `cargo clippy --all-targets -D warnings` + `cargo fmt --check` clean, a
    `resolve_demo` example, and a balancer throughput smoke (**10k Bo3 ≈ 3.5s**,
    SC-006). Six per-damage-type muzzle/explosion SVGs added for the Feature 5
    playback renderer.
  - **WASM + web host (complete).** The engine is cross-compiled to WebAssembly
    (`wasm-pack build --target nodejs`) and the artifact is **prebuilt-and-committed**
    to `packages/engine-wasm/` (`@wfc/engine-wasm`, an npm workspace) so Vercel needs
    no Rust toolchain. `native == wasm` is proven **byte-for-byte** across the golden
    battery (`examples/emit_battery.rs` + `scripts/wasm-parity.mjs`; P6/SC-001, T017).
    A `POST /api/resolve` Next.js route (Node runtime) resolves a `BattleInput` to a
    wire replay via a server-only host (`sim/index.ts`), verified with `next build`
    and a live HTTP smoke. `next.config` externalizes the wasm + traces the `.wasm`
    into the function bundle. Engine CI workflow added: native x86-64 + ARM64 matrix,
    the wasm-parity check, fmt/clippy, and the TS typecheck. **Feature 1 is complete;**
    the only carried-forward item is the V1–V8 TypeScript validation mirror (Garage /
    Feature 4).
  - **Merged to `main` and verified live in production (2026-07-20).** `POST /api/resolve`
    on `warformcommander.vercel.app` resolves all four golden-battery inputs to HTTP 200
    replays that are **byte-for-byte identical to the native Rust output** — cross-platform
    determinism (P6) confirmed end-to-end on Vercel's runtime, not just locally. The first
    production deploy surfaced a wasm-loading bug (the function 500'd with
    `MODULE_NOT_FOUND '@wfc/engine-wasm'`) that local dev couldn't catch; fixed by tracing
    the whole real `packages/engine-wasm/` directory into the function bundle (not just the
    `.wasm`) and loading the engine from that real path rather than the npm-workspace
    symlink, which resolves to an absolute local path that doesn't exist on Vercel.
- **Feature 3 — app shell + design system (2026-07-20).** The visual + structural
  foundation every screen composes, on branch `003-app-shell`:
  - **Design tokens** (`app/globals.css`) — the full Brand Foundation as a tiered
    Tailwind v4 system: primitive ramps → semantic faction/zone/family roles → published
    `bg-*`/`text-*`/`border-*` utilities → shadcn base tokens re-pointed on-brand, dark-only,
    with a reduced-motion reset. Fonts: Archivo (variable, width axis → expanded display face)
    + Space Mono via `next/font`. A `lint:tokens` guard forbids raw brand hex outside the token
    file (SC-002). The brand purple was brightened `#7b5cff`→`#8a6dff` to clear WCAG AA as small
    text (FR-005).
  - **Responsive app shell** (`components/shell/`) — `AppShell` (sticky blurred header +
    max-width/safe-area content + skip link + nav landmark), `PrimaryNav` (top-tab in
    landscape, viewport-pinned bottom bar in portrait — the P7 spine), `IdentityBadge`; an
    `app/(app)` route group so every later screen inherits the chrome.
  - **Primitive kit** (`components/ui/`) — Button (cva variants + `asChild`), Panel,
    SectionLabel, Chip, StatBar, Stat, BracketFrame, GridBackdrop, plus shadcn
    dropdown-menu/dialog/sheet themed by the base tokens alone (SC-007). Conventions in
    `components/README.md`.
  - **Brand marks** (`components/brand/`) — the two-wedge `Logo` (all lockups), `Wordmark`,
    and `UnitIcon` inlining the 7 machine SVGs with `currentColor` faction tinting (SC-008).
  - **Verification** — 18 Playwright + `@axe-core/playwright` e2e (token fidelity, AA contrast,
    responsive shell no-overflow/chrome-switch, primitive variants, brand lockups, focus rings,
    reduced motion — SC-001…SC-010), all green with `next build` + `tsc` + ESLint + the token
    guard; browsable at `/gallery`. New `web-ci` GitHub workflow gates it. The repo keeps
    root-level `components/`/`lib/` (matching `sim/`/`db/`) rather than `src/`; the user's custom
    `app/favicon.ico` was left untouched. Removed the unused create-next-app scaffold SVGs.
- **Feature 7 — accounts & persistence (backend/DB, 2026-07-20).** The stateful account +
  persistence layer the async-PvP product stands on, on branch `007-accounts-persistence`.
  Feature 1's engine is stateless; **this is where all state lives** (design §16/§16.1/§16.2).
  - **Schema** (`db/schema.ts`) — the single Drizzle/Postgres schema Features 8–12 read/write:
    Tier A auth-adapter tables (Auth.js Postgres shape; `users` extended with `handle`/`role`/
    `isBot`) + Tier B game tables (`squads`, `defense_snapshots`, `matches`, `replays`,
    `ladder_standings`, `posts`, `presets`). Game content is stored as **Feature-1 typed `jsonb`**
    (`db/types.ts` ← `sim/model.ts`), never re-declared in SQL (P8). Migration `0000` on the
    `postgres-js` driver. Defense **immutability + the ≤3 cap + attack/defense pool exclusivity**
    and the `net_victories` **generated column** are **DB invariants** (partial-unique indexes +
    copy-on-designate), not app-only checks.
  - **US1 — Google auth + server-authoritative admin role.** Auth.js v5 + `@auth/drizzle-adapter`
    on the existing `getDb()` with **database sessions** (lazy factory, no Proxy). Admin role seeded
    from a server-side `ADMIN_ALLOWLIST` and always re-read from the DB — instant revocation, no
    re-login (SC-002). `server/authz.ts` (pure, unit-testable) + `server/session.ts` (the `auth()`
    boundary guards); the service layer takes a resolved actor, never a client id.
  - **US2 — roster CRUD** (`server/squads.ts`): ≤8 squads, each validated by the shared engine
    `validate()` **before** insert (no illegal army persisted, SC-003) with the power rating derived
    from the same call; ownership enforced.
  - **US3 — immutable defense snapshots** (`server/defense.ts`): designate/redesignate/undesignate,
    all transactional; a frozen config copy that source edits never touch (SC-004); the ≤3/slot
    guard is the partial-unique index, proven under a real concurrent double-designation
    (SC-005); snapshots soft-deactivated + retained when referenced (FR-014).
  - **US4 — server-only match/replay recording** (`server/matches.ts`): a `matches` summary + a
    `jsonb` `replays` row (1:1) with provenance promoted to scalar columns, written in one tx; the
    outcome is **derived from the authoritative replay**, never a caller scalar (A5/P6). `getReplay`
    **regenerates** an unsupported `formatVersion` from persisted seed+armies rather than failing
    (FR-018).
  - **US5 — net-victory standings** (`server/standings.ts`): attack wins − defense losses (§13),
    updated inside `recordMatch`'s tx; leaderboard read; `recomputeStanding` reconciliation oracle
    (SC-007, zero drift). Practice matches move nothing.
  - **Shared** — the unified `posts` table (`server/posts.ts`: admin-authored + null-author auto
    posts, publish, public index/article reads — FR-024/025) and the `presets` library
    (`server/presets.ts`, for Feature 4). Idempotent **cold-start bot-defender seed**
    (`db/seed.ts`) so the ladder is never empty at launch (P5).
  - **Engine** — a standalone `validate` + `default_ruleset` were exported to the wasm engine so the
    DB rejects exactly the builds the engine would (P8, no drifting TS mirror); `validate` also
    returns the derived army power rating. Rebuilt wasm re-verified **native == wasm byte-identical**
    across the golden battery (P6/SC-001).
  - **Verification** — **34 Vitest integration tests** green against a local dev Postgres (auth
    round-trip, forged-flag/revocation, roster + all of V1/V2/V4/V5/V6, snapshot immutability +
    race-safe cap, replay provenance + regenerate, standing reconciliation, posts/presets, seed),
    plus `tsc` + ESLint + a clean `next build` (auth route + `/api/resolve` both present). Migrations
    are validated on a dev target before prod (`db/README.md`, SC-008); the Neon dev-branch→prod
    apply is the remaining user-gated promote step. Note: the service layer lives at root-level
    `server/` (matching `sim/`, `db/`, `lib/` — the repo has no `src/`).

[Unreleased]: https://github.com/jonupchurch/warformcommander/commits/main
