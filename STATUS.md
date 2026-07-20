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

**Feature 4 (Garage — squad builder + loadout/dial editor) — BUILT on branch `004-garage`,
all five user stories.** The player-facing configuration surface, and the home of the **V1–V8
TypeScript validation mirror** Feature 1 carried forward. A pure, client-usable TS engine mirror
(`sim/derive.ts` + `sim/legality.ts`) is proven **field-for-field equal to the Rust engine** via a
native-emitted parity fixture (SC-002) — so the Garage's live stat preview and legality gating never
diverge from what the server re-runs (P8); the client never touches wasm (P6 — the server component
derives the ruleset and passes it down). **US1** build + tap-to-place + save (client-gated by
`validate`, server-authoritative); **US2** mount/family-gated loadout with the native-bonus-vs-sidegrade
tell; **US3** capability-gated behavior dials + ≤2 Plan-B triggers (gate table mirrors engine V7/V6
exactly); **US4** presets on-ramp (stock builds + per-type custom presets, slot-fit so a 4-utility
bundle never overfills a 3-slot variant); **US5** base-defense designate/undesignate/re-designate via
Feature 7's transactional service, surfacing the ≤3 cap, attack/defense exclusivity, and ≥1-attackable
rule. Verified: **133 pure Vitest tests green** (parity + reducer + view-models + gating + presets +
defense), `next build` + `tsc` + ESLint + the **no-raw-hex guard** clean, both orientations (P7 — the
`Sheet`-based Customize surface + stacking rig switch on width). Deferred to a live env: the Playwright
e2e (T012–T014/T030/T033) + axe pass (T038) + the save-gate DB test (T016), which need a running app +
browser + local Postgres.

**Feature 5 (Battle playback — tick stream → pixel-art replay + working scrubber) — BUILT on branch
`005-battle-playback`, all five user stories + polish.** The watchable battlefield that **fixes the
previous game's broken viewer**, and a **pure engine-free player** (constitution P6): the reader
extension (`sim/replay-view.ts`) indexes Feature 1's emitted snapshot stream in **O(1)** and projects a
pure `buildViewModel(gameIndex, tick)`; the state machine + rAF loop (`components/battle/use-playback.ts`)
advance integer ticks at `10 × speed` t/s. **No playback module imports `@wfc/engine-wasm`; seek is an
array index, never a re-sim** (the load-bearing anti-regression, enforced by a parametrized import scan
over every `components/battle/*` file). **US1** watch-through of the two-side/4-zone battlefield; **US2**
the headline **O(1) WAI-ARIA media-seek scrubber**; **US3** the control cluster (jump/frame-step/speed/
Skip-to-Outcome + Space/`K`); **US4** Plan-B/death **timeline markers** that seek and are SR-labelled;
**US5** first-class in **both orientations** (portrait stacks the sides, landscape is the wide grid — no
overflow 320→2560px), axe-clean, motion-safe (VFX gated by `motion-safe:`, reduced motion snaps). Verified:
**33 pure Vitest** (SC-001 frame-accuracy, **SC-003 O(1) seek**, **SC-005 engine-never-imported**, reducer/
pacing/markers/scale) + **14 Playwright/axe e2e** green, `next build` + `tsc` + ESLint + no-raw-hex clean;
`web-ci` now also gates the DB-free anti-regression suites. The route renders the committed native battery
replay via a **documented demo seam** (imported so it traces into the bundle) until **Feature 7's `getReplay`**
lands — swap one call site.

**Feature 6 (Battle Summary — post-Bo3 results) — BUILT on branch `006-battle-summary`, all four user
stories + polish.** The post-match outcome screen and the Skip-to-Outcome target that pairs with the
Feature 5 playback. A **pure, total `deriveSummaryViewModel(result, ctx)`** (`lib/battle-summary/`) is
the spine — it represents **every `MatchResult` field** (SC-001), keeps `totals.damageDealt` in raw
milli so it deep-equals the result (SC-003, zero drift), derives condition/tier, per-machine fates
(joined to `unitOrder` identity), the optional **MVP** from an O(events) reduction that reconciles with
the side totals (SC-002), and the ranked/practice standing — with **no engine, no re-sim**. The
components are thin renderers: **US1** OutcomeHero (VICTORY/DEFEAT as text, series pips) + GameBreakdown
(Conquest/Time·DMG distinct in text+color); **US2** MatchTotals dual bars + PerMachineFates + the MVP
card; **US3** SummaryActions (**Watch Full Replay → `/battle/<matchId>`** — the F5 route — Find Next /
Back → `/arena`; reader-only, no player mounted, SC-007); **US4** the net-victory StandingDelta (no
MMR/tier — that's F9). To type the ViewModel honestly, Feature 1's `MatchResult.machineFates` mirror
went from `unknown[]` to `MachineFate[]` (`UnitRef`/`Fate` added to `sim/model.ts`). Verified: **22 pure
Vitest** (full-field, condition/tier, perspective, totals equality, fates, standing, MVP reconciliation
vs the real battery) + **10 Playwright/axe e2e** (action seams + navigation, four-viewport no-overflow,
zero-serious a11y, reduced-motion-as-text), `next build` + `tsc` + ESLint + no-raw-hex clean. The route
derives from the committed demo battery via a **documented seam** (imported JSON, prod-safe) until
**Feature 7's ownership-scoped read path** lands. Known limitation: a Time game is labelled "DMG" (the
`GameResult` doesn't expose the exact-tie flag; surfacing exact-tie→defender needs an engine result
change).

**Feature 8 (Arena async matchmaking + Practice sandbox) — BUILT on branch `008-arena-practice`, all
five user stories + the real round-trip.** The server-authoritative attack loop — a ranked result the
client can **never** fabricate (P6, non-negotiable). Feature 8 owns no schema; it orchestrates the
Feature 1 engine + Feature 7 service layer and hands off by match id. **US1** deploy → resolve →
record: `previewRankedMatch` (no WASM) matchmakes + fogs, `startRankedMatch` re-validates
attackability, binds the snapshot **by id**, resolves the Bo3 in-process (`adaptation:"Locked"`, one
call = all three games), and calls `recordMatch` **exactly once** → returns only `{ matchId }`. **US2**
`pickRankedOpponent` two-step per-player-fair random (never self, never empty, real+bot) + the **↻
Skip** re-roll (records nothing). **US3** `fogPreview` builds a fresh allow-listed preview that
**structurally** omits behavior dials / Plan-B, snapshot bound by id through a re-designate. **US4**
Practice mirrors ranked with `adaptation:"Free"`, records `mode='practice'` (no standing), opponent
anonymous + fogged, refreshable. **US5** the two Node resolve routes **strict-parse** the body
(forged `result`/`winner`/`seed`/`opponentId` structurally unreadable); a static call-graph test pins
`recordMatch` to the two orchestrators + a reproducibility test. Screens: `app/(app)/{arena,practice}`
(pickers + blind board + Deploy/Skip·Refresh), shared token-only `PreviewBoard`, both orientations,
signed-out gate. **Real round-trip:** `server/match-read.ts` turns a persisted match into the Summary/
Playback shapes (cashing in the F5/F6 read-path seam), so **deploy → summary → replay is real
end-to-end**; a non-uuid demo id falls back to the committed battery; `next.config.ts` traces
engine-wasm into `/arena`, `/practice`, `/battle/*`, `/matches/*/summary`. Verified: **25 Vitest
DB-integration + 6 DB-free route anti-forgery** (gated in `web-ci`) + `e2e/{arena,practice}.spec.ts`,
`next build` + `tsc` + ESLint + token guard clean. **Open coordination:** `loadCurrentRuleset()` stays
the v1 default until Feature 12's live ruleset store renames it to `getCurrentRuleset()` (F12 T045).

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
| 4 | Garage (squad builder + loadout/dial editor) | ✅ | ✅ | ✅ 40 | **✅ BUILT — US1–US5 on `004-garage`; engine-parity preview + V1–V8 TS validation mirror; 133 pure tests green; e2e/axe/DB deferred to a live env** |
| 5 | Battle playback (tick stream → pixel-art replay) | ✅ | ✅ | ✅ 42 | **✅ BUILT — US1–US5 + polish on `005-battle-playback`; engine-free O(1) scrubber + markers + both-orientation; 33 Vitest + 14 Playwright/axe e2e green; demo-replay seam pending F7 `getReplay`** |
| 6 | Battle summary (post-Bo3 results) | ✅ | ✅ | ✅ 32 | **✅ BUILT — US1–US4 + polish on `006-battle-summary`; pure `deriveSummaryViewModel` spine; 22 Vitest + 10 Playwright/axe e2e green; demo-result seam pending F7 read path** |
| 7 | Accounts & persistence (backend/DB, defense snapshots) | ✅ | ✅ | ✅ 52 | **✅ BUILT — schema + auth + service layer; 34 Vitest tests green; prod migrate pending** |
| 8 | Arena (async matchmaking) + Practice sandbox | ✅ | ✅ | ✅ 51 | **✅ BUILT — US1–US5 + real round-trip on `008-arena-practice`; server-authoritative resolve/record, fogged blind+locked matchmaking, practice sandbox, strict-parse anti-forgery; 31 Vitest + arena/practice e2e green; F5/F6 read-path seam cashed in** |
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
