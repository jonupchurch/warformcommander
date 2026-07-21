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
- **Feature 12 — admin console + balance publishing (2026-07-21).** Warform Commander's **live-ops
  surface** and the **last** v1 feature, on branch `012-admin-console`. Server-side-admin-gated live
  balance editing + two automatic news publishers; the only lever is the shared ruleset — no store, no
  price, no per-account grant (P1).
  - **The live-ruleset store** (the load-bearing contribution — fills the F7↔F8 gap). Two tables added
    to `db/schema.ts`: append-only **`rulesets`** (the Feature-1 `Ruleset` as typed `jsonb` + canonical
    `rulesetHash` + editor + self-referential audit chain) and a singleton **`current_ruleset`** pointer
    (text-PK `'current'` + `CHECK`, optimistic `version`). `getCurrentRuleset()` reads it
    **authoritatively from Postgres on every match** (no per-instance cache → zero stale window, SC-008),
    seeding the engine default on first read (never empty, FR-009). **Replaces Feature 8's
    `loadCurrentRuleset()` placeholder** — the 4 call sites now `await getCurrentRuleset()` (a tracked,
    coordinated sync→async rename); F8's 25 tests stay green.
  - **Live editing (US1) + auto-published balance news (US3).** An admin edits base stats and saves; the
    pointer flips, the hash recomputes, and the **next** match resolves against the new ruleset while
    already-recorded replays stay **byte-unchanged** (self-contained — this feature never writes
    `replays`, SC-003). Every changing save auto-publishes **exactly one** `type='balance'` post with a
    legible diff, **atomically** in the save transaction; a no-op save posts nothing; a failed post rolls
    the whole save back (FR-013/015). Optimistic concurrency (`version`-guarded pointer swap) → one save
    wins, the other `STALE_EDIT`, no lost update (SC-007). A server-side `validateRuleset()` (structural
    + bounds: `splash ≤ 0.25`, probabilities in `[0,1]`, ordered `hitClamp`) gates every write **before**
    persistence (SC-006).
  - **Canonical hash (FR-007).** A new `hash_ruleset` **wasm export** (BLAKE3 over the exact
    serialization `resolve` stamps on replays) — the committed wasm was rebuilt + re-verified — exposed
    as `hashRuleset()`. Proven byte-equal to a replay's stamped hash, so `matches`/`replays.rulesetHash`
    join back to the exact `rulesets` revision that produced them (provenance; never a bespoke hash).
  - **Server-authoritative admin gate (US2, P6/Principle II).** The `app/admin` layout redirects
    anonymous/non-admin requests (reading the DB session, never a client flag) and **every** admin Server
    Action / route re-checks `requireAdmin()` / the webhook secret independently — a forged `admin` value
    is structurally ignored. (The optional `proxy.ts` UX-redirect layer was omitted: Next 16's proxy
    loader rejects the NextAuth v5 `auth()` wrapper, and the contract makes it UX-only.)
  - **Code-push devlog (US4).** A pushed `main` commit auto-publishes one `devlog`/`changelog` post
    (`authorId` null) via a **secret-gated** (constant-time Bearer), **SHA-idempotent** webhook
    (`POST /api/admin/devlog`) + a post-deploy GitHub Action (injection-safe; commit fields via env). A
    bad/absent secret is 401 with no write; a retried delivery is a silent no-op; a non-main deploy posts
    nothing — the durable "code push → news" rule made mechanical.
  - **Fairness-report panel (US5).** A read-only view of Feature 2's latest committed `BalanceReport`
    (invariants, severity-sorted flags, matchups) so tuning is evidence-driven; advisory — its absence
    never blocks editing.
  - **Tests (42 Vitest + admin e2e).** Hash parity + determinism; validate bounds; diff; the store
    (edit-changes-next-hash SC-002, replays-untouched SC-003, admin/validation gates, concurrent
    STALE_EDIT SC-007, atomic one-balance-post SC-004, silent no-op); the devlog webhook (secret gate
    SC-005, SHA-idempotency, changelog, non-main); the editor-form helpers; the report reader; the admin
    signed-out-gate in a browser. `next build` + `tsc` + ESLint + no-raw-hex + engine clippy/tests clean;
    the full suite is **356 tests across 43 files**. `next.config.ts` traces engine-wasm into
    `/admin/balance`; new env `DEVLOG_WEBHOOK_SECRET`. **This feature makes the "code push → news"
    convention mechanical — no further manual devlog posts are needed.**
- **Feature 11 — marketing site: Home + News index + article template + SEO (2026-07-21).** The
  public, unauthenticated front door and the reader half of the unified `posts` system, on branch
  `011-marketing-news`. **Read-only over `posts`** — this feature never writes; Feature 12's admin +
  auto-post triggers are the sole writers (P6). Composes Feature 3's tokens/primitives and reads
  Feature 7's `posts` table.
  - **The published-only trust boundary** — `server/news.ts` is the single path any marketing/SEO
    surface reads `posts` through: **every** query is constrained *in the query* to `status='published'
    AND publishedAt IS NOT NULL AND publishedAt <= now()`, newest-first (hits `posts_published_idx`), so
    a draft or future-dated post is **never** public and an unknown vs. draft slug is indistinguishable
    (SC-001/SC-004). Reads are **resilient** (a data-access failure returns empty, never throws) so the
    static build + `generateStaticParams` succeed against the un-migrated prod DB and render graceful
    empty states, filled by ISR once the DB is live (SC-007).
  - **Home (US1) + shell (US2)** — the pitch, four pillars (incl. the explicit **non-P2W** promise
    "Skill lives in the plan — never the wallet.", P1), roadmap snapshot, latest-news teaser, and CTAs,
    complete with zero posts; wrapped in the shared marketing shell (Logo + Wordmark + nav + Wishlist +
    footer), first-class in both orientations, News marked active via `usePathname`.
  - **News index (US3) + article (US4)** — `/news` featured lead + grid (badge/date/excerpt),
    pagination + type filter, graceful empty state; `/news/[slug]` renders a published post **safely**
    from markdown (`react-markdown` + `remark-gfm`, raw HTML disabled → **zero XSS survivors**, one
    shared pipeline for body/excerpt/feed), every kind through one template, unknown/draft/future →
    one not-found dead-end.
  - **Discoverability (US5)** — `sitemap.ts` / `robots.ts` / `feed.xml` (RSS 2.0) over published-only
    posts + `metadataBase` for absolute OG/canonical URLs, and the F11↔F12 `revalidatePostsPublish(slug)`
    seam (path-based) so a publish surfaces across index/article/sitemap/feed **without a redeploy**.
  - **Tests (29 Vitest + 15 Playwright/axe e2e)** — 13 published-only DB-read boundary tests
    (drafts/future never returned, `publishedAt`-DESC ordering, unknown==draft slug) + 16 view-model +
    markdown-XSS; e2e covers Home pitch/promise/pillars/roadmap/CTAs, shell + active state, News frame,
    not-found dead-end, sitemap/robots/feed, **both-orientation no-overflow at 320→2560px**, and
    zero-serious a11y. `next build` + `tsc` + ESLint + the no-raw-hex guard clean; **the full suite is
    314 tests green across 36 files.**
  - Notable calls: the app's `type-display text-2xl` convention (a size override on the display face)
    was missing on the new hero + article headings — bare `type-display` (72px) overflowed ≤360px,
    fixed with responsive size steps; the footer's low-emphasis tokens (`text-dim`/`text-faint`) failed
    AA on the near-black chrome surface → `text-muted` (0 axe contrast nodes). An unknown/draft slug
    renders the not-found page but, because the article route is ISR-prerendered (the SC-007
    requirement), Next serves a **soft-404 (200)** not a hard 404 — a documented Next SSG/ISR behavior;
    the guarantee that matters (drafts unreadable + excluded from sitemap/index/feed) holds regardless.
- **Feature 2 — auto-balancer: Monte-Carlo fairness verification (2026-07-20).** The offline native
  `crates/balancer` tool that makes P4 (*Fairness Is Verified, Not Hoped*) real, on branch
  `002-auto-balancer`. It reuses the **one** Feature 1 engine crate natively (never a second engine,
  P6/P4) and runs `resolve()` thousands of times to read win-probability distributions, flag
  degenerate/dominant combos before players find them, and numerically verify the four load-bearing
  balance claims. **Advisory only** — it reads the Ruleset read-only and emits reports; it never edits
  balance (the live editor + auto-news pipeline is Feature 12).
  - **Reproducible batches** — `seed` (SplitMix64 per-**match** seeding, never per-thread) + `batch`
    (`run_batch`: `rayon` **across matches only**, integer-count reduction) → the aggregate is
    **byte-identical regardless of thread count** (SC-001). `stats`: integer tally + **Wilson 95%**
    confidence interval (research B1) + outcome breakdown (Conquest/Time, 2-0/2-1, mean duration).
  - **Sweep + flagging (US2)** — `sweep` evaluates each archetype across a curated reference field in
    **both roles** (canceling the engine's deterministic first-strike side bias); `flags` classifies
    **interval-gated** (the Wilson interval, not the point, must clear the fair band — no noise flags,
    FR-011) as Dominant/Underpowered, plus Degenerate for a clean-field-sweep or the structural §8.2
    **free-turtle**; severity-sorted worst-first.
  - **Invariant verification (US3)** — the four numeric checks with measured value + margin:
    native-family-bonus band (measured as the uncapped **first-hit** damage lift, ~0.12), power-gap cap
    and skill-beats-gear (measured as a **survivor margin** — a win rate saturates to 0/1 in the
    deterministic engine), and no-dominant-unit (via the sweep's clean-sweep detection).
  - **Reports (US4)** — provenance-stamped (`rulesetHash` + engine/replay-format versions, SC-007)
    canonical **JSON** (the seam Feature 12 will consume) + human-readable **markdown**, from a
    `matchup | sweep | verify` **clap** CLI. Reports land in `balance-reports/`.
  - **Golden tests (39 Rust tests)** — the **planted-imbalance** (SC-003) and four
    **invariant-violation** (SC-004) fixtures prove it catches what it must; plus reproducibility,
    statistics/Wilson, flagging (incl. interval-gating), and report shape + non-mutation (SC-006). A
    `#[ignore]` throughput smoke does **10,000 Bo3 in ~0.8s parallel** (12.3k Bo3/s, SC-005). Covered by
    the existing `engine-ci` (`cargo test --workspace` on x86-64 + ARM64).
  - Notable calls: a **mirror lands ~52%**, not 50% — the `(zone, side, instance)` acting order gives
    the attacker a small, explainable first-strike premium (not a bug); the balancer honestly surfaces
    the first-pass numbers' rough edges (air-alpha/artillery-line read Dominant); `clap` uses
    `default-features = false` (drops the `windows-sys` color path needing MinGW `dlltool`); the rayon
    pool is sized to a 32 MB worker stack (a Bo3 tick stream overflows the default worker guard page
    under parallel-test load on Windows).
- **Feature 10 — Profile (career stats & achievements) (2026-07-20).** A public career view on branch
  `010-profile`, assembled **read-only** from Feature 7 — **no new table, no write path** (P1/P6). Own
  (`/profile`) + public (`/commander/[handle]`) routes render the same view-model.
  - **Pure derivations** (the cheaply-testable contract) — `lib/profile-stats.ts`: `toCareerStats`
    **equals `ladder_standings`** with `record`/`winRatePct`/`wins`/`losses` recomputed (SC-001);
    `toMatchRow` reads result/side/Bo3-score from the **subject's perspective**, hides practice
    opponents (FR-011), renders a null participant as `[deleted]` (FR-012), and links Summary (F6) +
    Playback (F5) by `matchId`; `toWeekBuckets` buckets W/L by week. `lib/badges.ts`: a typed
    `BADGE_CATALOG` + pure `deriveBadges` — **cosmetic, no store**, every `measure` reads only
    `CareerStats`, a `BadgeView` exposes only display fields, so crossing a threshold flips a picture
    and nothing else (SC-004/SC-005).
  - **Assembly** (`server/profile.ts`) — `getOwnProfile` / `getProfileByHandle` select **only public
    `users` columns** (never `email`/`role`, SC-007), render a **bot** subject with a seeded-AI marker
    (P5), and add read-only projections with no schema change: signature squads (`matches`×`squads`),
    most-fielded unit (squad-config frequency), and a display-only ladder position. An unknown handle
    → `NOT_FOUND` → `notFound()` (FR-005).
  - **Screen** — hero (avatar/handle/ENLISTED + headline win-rate/matches/best-streak/**net
    victories**), career grid, recent matches (each ranked row → Summary + Replay), a CSS activity
    chart (no chart lib), signature squads (win-rate bars), the most-fielded `UnitIcon` (omitted when
    none), and the badge grid (earned / in-progress). Feature-3 token-only, both-orientation, no 360px
    overflow. MMR/tiers/seasons stay forward-looking — omitted, never fabricated.
  - **Verification** — 8 `profile-stats` + 8 `badges` pure (CI-gated) + 4 DB-integration assembly
    (career==standing, public-only, recorded-match rows, practice-hidden, NOT_FOUND) + 7 Playwright/axe
    e2e (sign-in gate, unknown-handle not-found, both-orientation no-overflow, zero-serious a11y), all
    green with `next build` + `tsc` + ESLint + the token guard. **Full suite: 285 tests across 33 files.**
- **Feature 9 — Ladder (net-victory leaderboard) (2026-07-20).** The competitive spine on branch
  `009-ladder`: every commander ranked by **net victories** (attack wins − defense losses), so a weak
  defense visibly bleeds rank (§13). **Read-only** — it composes Feature 7's standings/matches reads
  and never writes (P6, FR-015).
  - **Read surface** (`server/ladder/queries.ts`) — `getLadderPage` + `getViewerStanding`, actor-less
    (the board is public). The **deterministic tiebreak** is the load-bearing guarantee (contract §3):
    selected metric DESC → net → totalDamage → `userId` ASC, so the order is exact and reproducible;
    negatives sort below non-negatives naturally. Ranks are 1-based positions; the viewer's rank is a
    `COUNT`-above so it's correct off the first page; no standing row → `{ state:'unranked' }` (never a
    fabricated rank). `includeBots` defaults true (P5 never-empty).
  - **Per-period rollups** — `range='week'|'month'` rolls up **ranked** `matches` in the calendar
    window (`date_trunc(..., now())`), UNIONing each match's attacker + defender contributions and
    grouping by commander; `practice` is structurally excluded; season reads the maintained
    `ladder_standings` (not a rollup). Verified equal to an independent recompute.
  - **Screen** — a podium (top 3), the landscape **table** (`overflow-x-auto`, `hidden lg:block`) and
    portrait **card list** (`lg:hidden`) from one dataset (SC-003), pagination, and the always-on
    **viewer standing card** (rank + net victories / unranked Arena CTA / anonymous sign-in) with a
    `#my-rank` jump anchor; own row highlighted cyan. **MetricTabs** (Net Victories / Total Damage /
    Defenses Held) and **RangeTabs** (Season / This Week / This Month) re-query via the URL (server
    round-trip, `aria-current`). **NetVictoryExplainer** states the model inline (defense losses
    subtract). Params validated/clamped before use (Principle II).
  - **Verification** — 18 Vitest DB-integration (order==tiebreak vs an independent sort, negatives
    last + stable, computed rank + unranked, metric orderings, **defense-loss-lowers-rank** SC-002,
    period rollup + practice-excluded + season≠rollup, includeBots) + 6 pure view-model (signed labels
    / mapping, CI-gated) + 8 Playwright/axe e2e (both-orientation no-overflow, viewer card, explainer,
    zero-serious a11y), all green with `next build` + `tsc` + ESLint + the token guard. Seasons/MMR/
    tiers/trend stay deferred (spec FR-016).
- **Feature 8 — Arena (async matchmaking) + Practice sandbox (2026-07-20).** The server-authoritative
  attack loop on branch `008-arena-practice`: a ranked result the client can **never** fabricate (P6,
  non-negotiable). Feature 8 owns no schema — it orchestrates the Feature 1 engine + the Feature 7
  service layer and hands off by match id.
  - **US1 — deploy → resolve → record.** `previewRankedMatch` (no WASM) matchmakes + fogs a defender;
    `startRankedMatch` re-validates attackability at deploy, binds the served snapshot **by id**,
    resolves the Bo3 in-process (`adaptation:"Locked"`, one call = all three games vs the one served
    army), and calls `recordMatch` **exactly once** — returning only `{ matchId }`.
  - **US2 — matchmaking.** `pickRankedOpponent` is a two-step per-player-fair random draw (defender ≠
    self via SQL, then a random active snapshot), real+bot pool, never self, never empty. The Arena
    **↻ Skip** re-rolls a fresh ticket and records nothing.
  - **US3 — blind + locked.** `fogPreview` builds a fresh allow-listed `MatchTicketPreview`
    (composition/placement/power/derived family tags) that **structurally** omits behavior dials /
    Plan-B — a defender's logic cannot leak pre-battle. The snapshot is bound by id even if the
    defender re-designates in the preview→deploy window.
  - **US4 — Practice.** `startPracticeMatch` mirrors ranked with `adaptation:"Free"`, records
    `mode='practice'` (moves **no** standing), and keeps the opponent anonymous (`defenderUserId:null`);
    the draw is fogged the same way, so no build leaks even in practice. Refreshable before deploy.
  - **US5 — anti-forgery.** The two Node resolve routes (`app/api/{arena,practice}/resolve`) **strict-parse**
    the body — destructure exactly the allow-listed fields, so a forged `result`/`winner`/`seed`/
    `opponentId` is structurally unreadable, not merely discarded. A static call-graph test asserts
    `recordMatch` is reachable only from inside the two orchestrators; a reproducibility test re-runs
    the persisted seed+armies to a byte-identical replay.
  - **Screens** — `app/(app)/arena` (attackable-squad picker + blind enemy board + Deploy/Skip) and
    `app/(app)/practice` (own-squad picker + hidden draw + Deploy/Refresh), sharing a token-only,
    AA-safe `PreviewBoard`; both first-class in both orientations, signed-out gate + Garage on-ramp.
  - **Real round-trip** — cashed in the Feature 5/6 read-path seam: `server/match-read.ts`
    (`loadRealSummary`/`loadRealReplay`) turns a persisted match into the exact shapes those routes
    consume (viewer-scoped standing + opponent, practice hidden), so **deploy → summary → replay is
    real end-to-end**; a non-uuid demo id falls back to the committed battery. `next.config.ts` traces
    engine-wasm into `/arena`, `/practice`, `/battle/*`, `/matches/*/summary` (each reaches the engine
    at render).
  - **Verification** — 25 Vitest DB-integration (matchmaking fairness/never-self, one-write record +
    standings move, blind+locked, practice-no-standing, anti-forgery + reproducibility, real read
    round-trip) + 6 DB-free route anti-forgery (gated in `web-ci`) + `e2e/{arena,practice}.spec.ts`,
    all green with `next build` + `tsc` + ESLint + the token guard. Open: `loadCurrentRuleset()` stays
    the v1 default until Feature 12's live ruleset store renames the call site (`getCurrentRuleset()`).
- **Feature 6 — battle summary: post-Bo3 results (2026-07-20).** The post-match outcome screen and
  the Skip-to-Outcome target that pairs with Battle Playback, on branch `006-battle-summary`. A
  **reader** — it never re-simulates, recomputes the winner, or renders MMR/tiers; if a value isn't
  in the persisted `MatchResult` or the read-in standing, it isn't on the screen.
  - **Pure ViewModel spine** (`lib/battle-summary/`) — `deriveSummaryViewModel(result, ctx)` is pure
    + total: it represents **every `MatchResult` field** (SC-001), keeps `totals.damageDealt` in raw
    milli so it deep-equals the result (SC-003, zero drift), derives condition/tier and per-machine
    fates (joined to `unitOrder` identity), and carries the perspective from `ctx.viewerSide`
    (swapping it flips the verdict + every `SidePair`). `format.ts` holds the arithmetic; `mvp.ts` is
    the optional **O(events) per-machine damage reduction** (no re-sim) whose Σ reconciles with the
    side totals (Feature 1 SC-002).
  - **US1** OutcomeHero (VICTORY/DEFEAT as text not color-only, series pips) + GameBreakdown (Conquest
    vs Time·DMG distinct in text **and** color); **US2** MatchTotals dual bars (damage / units killed
    / units lost / avg hull) + PerMachineFates (grouped by side) + the optional MVP card; **US3**
    SummaryActions — **Watch Full Replay → `/battle/<matchId>`** (the Feature 5 route), Find Next
    Opponent / Back → the Arena — a reader that mounts **no** replay player (SC-007); **US4** the
    net-victory StandingDelta (`+1 NET VICTORY` / `UNRANKED`, no MMR/tier — that is Feature 9).
  - **Feature 1 mirror** — `MatchResult.machineFates` went from `unknown[]` to a typed `MachineFate[]`
    (`UnitRef`/`Fate` added to `sim/model.ts`) so the ViewModel reads it honestly.
  - **Verification** — 22 pure Vitest (full-field, condition/tier, perspective, totals equality,
    fates, standing, MVP reconciliation vs the real battery) + 10 Playwright/axe e2e (action seams +
    navigation, four-viewport no-overflow, zero-serious a11y, reduced-motion-as-text), all green with
    `next build` + `tsc` + ESLint + the token guard. The route derives from the committed demo battery
    via a documented seam (imported JSON, prod-safe) until Feature 7's read path lands. Known limit: a
    Time game is labelled "DMG" (the `GameResult` doesn't carry the exact-tie flag).
- **Feature 5 — battle playback: tick stream → pixel-art replay + working scrubber
  (2026-07-20).** The watchable battlefield that fixes the previous game's broken viewer, on branch
  `005-battle-playback`. A **pure, engine-free player** (constitution P6): every frame is an O(1)
  index into the emitted snapshot stream — **no component or helper imports `@wfc/engine-wasm`, and
  seek is an array index, never a re-simulation** (the load-bearing anti-regression).
  - **Reader extension** (`sim/replay-view.ts`) over Feature 1's `replay-reader` — `snapshotAt`/
    `eventsAt`/`lastTick` O(1), the `buildViewModel(gameIndex, tick)` projection (bucket by zone,
    hull/shield vs the tick-0 baseline, per-side alive/hull/damage), and a memoized-per-game
    `deriveMarkers`. Holds no UI type; the `typeId → UnitIcon` map lives in the render leaf.
  - **State machine + rAF loop** (`components/battle/use-playback.ts`) — a pure exported reducer
    (play/pause/tick-halt, O(1) seek clamp, frame-step, speed, game-select) + a `requestAnimationFrame`
    accumulator advancing integer ticks at `10 × speed` t/s, torn down on pause/unmount.
  - **US1** watch a stored replay play through the two-side / 4-zone battlefield (UnitSprite +
    ZoneColumn + ContactLine + BattleStage + OverallStats); **US2** the headline **O(1) media-seek
    scrubber** (WAI-ARIA slider, `aria-valuetext`, Arrow/Home/End native + PageUp/PageDown ±10);
    **US3** the control cluster (jump / frame-step / 0.5×–1×–2× speed / Skip-to-Outcome, Space/`K`
    toggle); **US4** Plan-B/death **timeline markers** that seek and are screen-reader labelled;
    **US5** first-class in **both orientations** (portrait stacks the sides, landscape is the wide
    two-column grid — no overflow 320px→2560px), accessible (axe zero serious), and motion-safe
    (hit/death VFX gated by `motion-safe:`, reduced motion snaps; state readable from the snapshot
    alone). Bo3 game selector resets to that game's tick 0.
  - **Verification** — 33 pure Vitest tests (frame-accuracy SC-001, **O(1)-seek SC-003**,
    **engine-never-imported SC-005** across every playback module, reducer/pacing, markers, scale
    robustness) + **14 Playwright/axe e2e** (play-through halt, keyboard seek, jump-and-continue,
    speed/step/jump, marker-seek, four-viewport no-overflow, zero-serious a11y, reduced-motion),
    all green with `next build` + `tsc` + ESLint + the token guard. `web-ci` now also gates the
    DB-free anti-regression suites. The route renders the committed native battery replay via a
    documented demo seam until Feature 7's `getReplay` lands.
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
- **Feature 4 — Garage: squad builder + loadout/dial editor + defense designation (2026-07-20).**
  The player-facing configuration surface, on branch `004-garage`. All five user stories:
  - **Engine mirror + parity** — a pure, client-usable TS port of the engine's derivation and V1–V8
    validation (`sim/derive.ts`, `sim/legality.ts`, `sim/ruleset.ts`), proven **field-for-field equal
    to the Rust engine** against a **native-emitted fixture** (`crates/engine/examples/emit_derive_battery.rs`
    → `tests/fixtures/derive-battery.json`; 34 derive + 11 validate cases). The client never runs wasm
    (P6) — the Garage server component derives the ruleset once and passes it down; every stat preview
    and legality gate the UI shows is the same math the server re-runs (P8, SC-002).
  - **US1 — build + place + save.** A `useReducer`/Immer editor state machine (`lib/garage/`), the
    three-column landscape rig that stacks in portrait (P7), tap-to-place across the four zones with
    caps enforced by disabling (not rejecting), live PWR/stat readout, and a **Save gated by the client
    `validate`** — server-authoritative via Feature 7 Server Actions (A4; a rejection surfaces back).
  - **US2 — loadout editor.** Weapon/defense/utility pickers offering only mount-legal options
    (family crossover), utility **dedup** by disabling equipped options, and the **native-family bonus
    vs off-family sidegrade** made legible (FR-006).
  - **US3 — behavior dials + Plan-B.** The four dials with the three engine-gated options (Adaptive /
    Opportunist / Target-Air) **disabled unless** the machine's utilities unlock them, and ≤2 Plan-B
    triggers — the gate table mirrors the engine's V7/V6 exactly (cross-checked vs `validateArmy`).
  - **US4 — presets on-ramp.** Stock builds per variant (one-tap `+ PRESET`, no deep editor) + per-type
    **custom presets** (Feature 7 `listPresets`/`savePreset`), **slot-fit** so a 4-utility bundle never
    overfills a 3-slot variant (FR-013); the reducer's `applyPreset` verb stamps a provenance id cleared
    by any later hand-edit.
  - **US5 — base defense.** Designate/undesignate/re-designate a saved squad via Feature 7's
    transactional service, surfacing the ≤3 cap, attack/defense exclusivity, and the **≥1-attackable**
    rule as convenience guards (Principle II — the DB invariants are authority), plus a "re-designate to
    push live" affordance when an edited squad has drifted from its frozen snapshot.
  - **Polish** — an `beforeunload` unsaved-changes guard (never silently lose a dirty draft), visible
    focus rings on the custom tap-to-place controls, and the `Sheet`-based Customize surface (LOADOUT /
    BEHAVIOR / PRESETS tabs) that works in both orientations.
  - **Verification** — **133 pure Vitest tests** green (parity, reducer, projection, view-models, loadout,
    dial gating, presets, defense) + `next build` + `tsc` + ESLint + the **no-raw-hex guard** clean.
    Deferred to a live env: the Playwright e2e + `@axe-core/playwright` pass + the save-gate DB test
    (need a running app + browser + local Postgres). The editor lives at root-level `lib/garage/` +
    `components/garage/` (no `src/`).

[Unreleased]: https://github.com/jonupchurch/warformcommander/commits/main
