# Project Status — Warform Commander

> Living snapshot of where the project is. Update it as phases and features
> move. It complements `CHANGELOG.md` (what shipped) by capturing the
> *current* state and what's next. Last updated: 2026-07-21.

> **Ops milestone (2026-07-21): both user-gated items are now DONE.** (1) The reviewed
> `0000`+`0001` migrations are applied to the Neon **production** branch — `rulesets` +
> `current_ruleset` now live alongside the other 11 tables (SC-008 dev-first gate was
> satisfied on local dev Postgres). (2) `DEVLOG_WEBHOOK_SECRET` is set in **Vercel
> Production** + as the **GitHub Actions** repo secret (same value), prod was redeployed to
> bake it in, and the secret gate is verified live: bad/absent secret → 401, valid secret +
> bad body → 400 (no write). The authed prod loop and the code-push→news pipeline are ARMED.

## Current work (2026-07-24) — v3 Counter-Web (specs 013→015)

**Post-v1, the active frontier is the v3 counter-web rewrite** — a ground-up redesign of the engine's
weapon / defense / behavior vocabulary to break the degenerate ~94% total-order field the v2 balance
passes could never move (see `balance.md`, `specs/014-counter-web/weapons-design.md`).

**State: v3 is mechanics-complete, content-incomplete — deployed to prod but UNTUNED.**
The *behavioral spine* shipped and is tested: the sharpened damage matrix + native bonus (US1a), the
priority-score targeting chain + 4 movement modes (US2), the 3-stance collapse + energy-cut + Plan-B
rewrite (US4). The *content that makes counters bite* mostly did not: per-chassis defense identities
(US1d), the full weapon roster baked+tuned (US1b/c), the equipment/slot economy (US3), and the distinct
Commander (US5). Live ruleset `0b4cd0f2…` +10 hot-added `damage:0` weapons; field still ~90% walls.

**→ Authoritative status + correction plan: `specs/015-v3-counter-web/gap-analysis.md`.**
Locked plan: docs-first → defenses §10 + weapon tuning (wake the matrix) → equipment economy →
Commander; content-first, measure each slice, open a super-linearity engine pass only if walls persist.
**Update (2026-07-24): implementing ALL remaining v3 features first, balance deferred to one pass at
the end — see `specs/015-v3-counter-web/completion-plan.md`.** (US1b weapon bake + US3-B riders done;
EMP anti-sustain proven to flip sustain walls — the counter-web is an equipment-counter problem.)

---

## Backlog (post-current-work)

- **Garage: live gear-effect flyout during selection.** On the garage customization screen (active
  customization state), show a tooltip/flyout **next to the dropdown** that previews each gear item's
  effects **as the player browses the dropdown options** (on hover/focus), *before* committing a
  selection — so they don't have to select → check → reselect. The effect-derivation already exists
  (`components/garage/effect-breakdown.tsx` + `sim/derive.ts` `deriveEffectiveStats`); the work is a
  per-option hover preview wired into the loadout dropdowns (`components/garage/loadout-editor.tsx` /
  `field-select.tsx` / `defense-panel.tsx`), likely a diff-vs-current stat delta shown in a popover.
  UX-only, no engine change. (Added 2026-07-24.)

---

## Current phase (v1 feature set — all built/deployed)

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

**Feature 2 (auto-balancer, Monte-Carlo) — COMPLETE on branch `002-auto-balancer`.** The offline
native `crates/balancer` tool that makes P4 (*Fairness Is Verified, Not Hoped*) real — it reuses the
**one** engine crate natively (never a second engine) and runs `resolve()` thousands of times to read
win-probability distributions, flag dominant/degenerate/underpowered combos, and numerically verify
the four load-bearing balance claims. Built US1–US4 + polish: **`seed`** (SplitMix64 per-**match**
seeding, the reproducibility spine) → **`stats`** (integer win-count tally + **Wilson 95%** CI +
outcome breakdown) → **`batch`** (`run_batch`: `rayon` **across matches only**, integer reduction →
**thread-count-independent**, SC-001) → **`sweep`** (each archetype vs the reference field, both roles,
canceling the deterministic first-strike bias) → **`flags`** (interval-gated dominant/degenerate/
underpowered + the structural §8.2 free-turtle, severity-sorted) → **`invariants`** (family-bonus band
0.12 · power-gap-cap + skill-beats-gear via a **survivor margin** — win rate saturates 0/1 in a
deterministic engine — · no-dominant-unit via the sweep) → **`report`** (provenance-stamped JSON +
markdown, `rulesetHash`+versions, SC-007) + a `matchup | sweep | verify` **clap** CLI. Verified: **39
Rust tests green** (reproducibility, statistics/Wilson, the **planted-imbalance** SC-003 golden, the
four **invariant-violation** SC-004 goldens, flagging incl. interval-gating, report shape +
non-mutation SC-006) + a `#[ignore]` throughput smoke (**10,000 Bo3 in ~0.8s parallel / 12.3k Bo3/s**,
SC-005), clippy `-D warnings` + rustfmt clean; covered by the existing `engine-ci` (`cargo test
--workspace` on x86-64 + ARM64). Notable calls: **advisory-only** (reads the Ruleset read-only, never
mutates — SC-006); a **mirror lands ~52%** not 50% because the engine's `(zone, side, instance)`
acting order gives the attacker a small, explainable first-strike premium (not a bug); the report JSON
is the clean seam **Feature 12** will consume; the balancer surfaces the first-pass numbers' real rough
edges (air-alpha / artillery-line read Dominant, aa-rocket / support-ball Underpowered) — exactly its
job. `clap` uses `default-features = false` (drops the ANSI-color `windows-sys` path that needs MinGW
`dlltool`); the rayon global pool is sized to a 32 MB worker stack (a full Bo3 tick stream on the stack
overflows the default worker guard page under parallel-test load on Windows).

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
`next build`. **Prod promote DONE (2026-07-21):** the reviewed `0000`+`0001` migrations are applied
to the Neon **production** branch (SC-008), so `rulesets`/`current_ruleset` and the full schema are
live in prod. New env: `AUTH_SECRET`/`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`/`ADMIN_ALLOWLIST`.

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

**Feature 9 (Ladder — net-victory leaderboard) — BUILT on branch `009-ladder`, all four user stories.**
The competitive spine: every commander ranked by **net victories** (attack wins − defense losses), so a
weak defense visibly bleeds rank. **Read-only** — composes Feature 7's standings/matches reads, never
writes (P6, FR-015). **US1** the board — `getLadderPage`/`getViewerStanding` (actor-less; public board)
with the **deterministic tiebreak** (metric DESC → net → totalDamage → userId ASC), 1-based ranks, a
`COUNT`-above viewer rank (correct off-page), `{state:'unranked'}` for no row, `includeBots` default true
(P5); the screen is a podium + landscape table (`overflow-x-auto`, `hidden lg:block`) + portrait card
list (`lg:hidden`) from one dataset (SC-003) + pagination + an always-on viewer standing card + `#my-rank`
jump. **US2** MetricTabs (net/damage/defenses) re-query via URL; the defense-loss-lowers-rank stake is
pinned by a query test (SC-002). **US3** per-period rollups — `week`/`month` roll up **ranked** matches
in the calendar window (`date_trunc(now())`, attacker+defender contribs UNIONed/grouped), practice
excluded, season reads `ladder_standings`; RangeTabs switch. **US4** NetVictoryExplainer states the model
inline. Verified: **18 Vitest DB-integration + 6 pure view-model** (CI-gated) + **8 Playwright/axe e2e**,
`next build` + `tsc` + ESLint + token guard clean; the **full suite is 269 tests green across 30 files**.
No WASM (pure DB reads), so no new tracing entry. Seasons/MMR/tiers/trend deferred (spec FR-016).

**Feature 10 (Profile — career stats & achievements) — BUILT on branch `010-profile`, all four user
stories.** A public career view assembled **read-only** from Feature 7 — **no new table, no write path**
(P1/P6). Own (`/profile`) + public (`/commander/[handle]`) routes render the same view-model. **US1**
identity + career: `toCareerStats` **equals `ladder_standings`** with record/win-rate recomputed
(SC-001); the hero headlines net victories, win rate, matches, best streak (MMR/tiers omitted, not
faked); a bot renders with a seeded-AI marker (P5); assembly selects **only public user columns** (never
email/role, SC-007). **US2** recent matches from the subject's perspective (practice hidden, deleted
participant graceful) each linking Summary (F6) + Playback (F5) by matchId, plus a CSS activity chart.
**US3** signature squads (matches×squads) + most-fielded `UnitIcon` (omitted when none) — additive
read-only projections, no schema change. **US4** derived **cosmetic** badges — a typed catalog + pure
`deriveBadges`, no store, only display fields (SC-004/SC-005). Verified: **8 profile-stats + 8 badges
pure (CI-gated) + 4 DB assembly + 7 Playwright/axe e2e**, `next build` + `tsc` + ESLint + token guard
clean. No WASM (pure DB reads). **The full suite is 285 tests green across 33 files.**

**Feature 11 (Marketing site — Home + News index + article template) — BUILT on branch
`011-marketing-news`, all five user stories + SEO.** The public, unauthenticated front door and the
reader half of the unified `posts` system — **read-only over `posts`** (this feature never writes; the
admin + auto-post triggers of Feature 12 are the sole writers, P6). The load-bearing trust boundary is
`server/news.ts`: **every** read is constrained *in the query* to `status='published' AND publishedAt
IS NOT NULL AND publishedAt <= now()`, newest-first (hits Feature 7's `posts_published_idx`), so a
draft or future-dated post is **never** public and an unknown vs. draft slug is indistinguishable
(SC-001/SC-004). The reads are deliberately **resilient** (a data-access failure returns an empty
result, never throws) so the static build + `generateStaticParams` succeed against the still-un-migrated
prod DB and render graceful empty states, filled by ISR once the DB is live (SC-007). **US1** Home —
the one-line pitch, the four pillars (incl. the explicit **non-P2W** promise "Skill lives in the plan —
never the wallet.", P1), the roadmap snapshot, a latest-news teaser, and working CTAs, complete even
with zero posts; **US2** the shared marketing shell (Logo + Wordmark + nav + Wishlist CTA + footer),
first-class in both orientations with News marked active via `usePathname`; **US3** `/news` — a
featured lead + grid, type badge, date, excerpt, pagination + type filter, graceful empty state;
**US4** `/news/[slug]` — a published post rendered **safely** from markdown (`react-markdown` +
`remark-gfm`, raw HTML disabled → **zero XSS survivors**, one shared pipeline for body/excerpt/feed),
every kind through one template, an unknown/draft/future slug → the one not-found dead-end; **US5**
discoverability — `sitemap.ts` / `robots.ts` / `feed.xml` (RSS 2.0) over published-only posts +
`metadataBase` so OG/canonical URLs resolve absolute, and the F11↔F12 `revalidatePostsPublish(slug)`
seam (path-based) so a publish surfaces across index/article/sitemap/feed **without a redeploy**.
Verified: **29 pure Vitest** (13 published-only DB-read boundary — drafts/future never returned,
`publishedAt`-DESC ordering, unknown==draft slug; 16 view-model + markdown-XSS) + **15 Playwright/axe
e2e** (Home pitch/promise/pillars/roadmap/CTAs, shell + active state, News frame, not-found dead-end,
sitemap/robots/feed, **both-orientation no-overflow at 320→2560px**, zero-serious a11y), `next build`
+ `tsc` + ESLint + the no-raw-hex guard clean; **the full suite is 314 tests green across 36 files.**
Notable calls: the app's `type-display text-2xl` convention (a size override on the display face) was
missing on the new hero + article headings — bare `type-display` (72px) overflowed ≤360px; fixed with
responsive size steps. The footer's low-emphasis tokens (`text-dim`/`text-faint`) failed AA on the
near-black chrome surface → bumped to `text-muted` (verified 0 axe contrast nodes). An unknown/draft
slug renders the not-found page but, because the article route is ISR-prerendered (the SC-007
requirement), Next serves it as a **soft-404 (200)** rather than a hard 404 — a documented Next SSG/ISR
behavior; the guarantee that matters (drafts unreadable, and excluded from sitemap/index/feed) holds
regardless, and the e2e asserts the not-found *content* (the repo's `profile.spec` convention). No WASM.

**Feature 12 (Admin console + balance publishing) — BUILT on branch `012-admin-console`, all five user
stories + the live-ruleset store.** The v1 set's **last** feature — Warform Commander's live-ops
surface. Its load-bearing contribution is the **live-ruleset store** that fills the F7↔F8 coordination
gap: two tables added to `db/schema.ts` — append-only **`rulesets`** (the Feature-1 `Ruleset` as typed
`jsonb` + canonical `rulesetHash` + editor + self-referential audit chain) and a singleton
**`current_ruleset`** pointer (text-PK `'current'` + `CHECK`, optimistic `version`). It **replaces
Feature 8's `loadCurrentRuleset()` placeholder** with a real Postgres-backed `getCurrentRuleset()` read
**authoritatively on every match** (no per-instance cache → zero stale window, SC-008), bootstrapping
the engine default on first read so it is never empty (FR-009). **US1** an admin edits base stats and
saves; the pointer flips + the hash recomputes and the **next** match resolves against the new ruleset,
while already-recorded replays stay **byte-unchanged** (self-contained; this feature never writes
`replays` — SC-003). **US2** the admin gate is **server-authoritative** — the `app/admin` layout
redirects non-admins (reading the DB session, never a client flag) and **every** Server Action / route
re-checks `requireAdmin()` / the webhook secret independently (P6, Principle II; the optional `proxy.ts`
UX layer is omitted — Next 16's proxy loader rejects the NextAuth v5 `auth()` wrapper, and it's UX-only
by contract). **US3** every changing save **auto-publishes exactly one** `type='balance'` post with a
legible diff, atomically in the save transaction (no-op saves post nothing; a failed post rolls back the
whole save — FR-013/015). **US4** a pushed `main` commit auto-publishes one `devlog`/`changelog` post
via a **secret-gated, SHA-idempotent** webhook (`/api/admin/devlog` + a GitHub Action) — the durable
"code push → news" rule made mechanical. **US5** a read-only panel surfaces Feature 2's latest committed
`BalanceReport` (advisory; its absence never blocks editing). The **canonical hash** (FR-007) is a new
`hash_ruleset` **wasm export** (BLAKE3 over the same serialization `resolve` stamps on replays; the
committed wasm was rebuilt + re-verified), exposed as `hashRuleset()` — proven byte-equal to a replay's
stamp, so `matches`/`replays.rulesetHash` join back to the exact revision. Concurrency is optimistic:
two saves from the same `version` → one wins, the other `STALE_EDIT`, no lost update (SC-007). Edits pass
a server-side `validateRuleset()` (structural + bounds — `splash ≤ 0.25`, probabilities in `[0,1]`,
ordered `hitClamp`) **before** any write (SC-006). Verified: **42 Vitest** (hash parity + determinism;
validate bounds; diff; the store — edit-changes-next-hash SC-002, replays-untouched SC-003, NOT_ADMIN /
VALIDATION_FAILED gates, concurrent STALE_EDIT SC-007, atomic exactly-one balance post SC-004, silent
no-op; the devlog webhook — secret gate SC-005, SHA-idempotency, changelog, non-main; the editor-form
helpers; the report reader) **+ the admin signed-out-gate e2e**; F8's 25 arena/practice tests stay green
through the sync→async `getCurrentRuleset` rename; `next build` + `tsc` + ESLint + no-raw-hex + engine
clippy/tests clean. **The full suite is 356 tests green across 43 files.** `next.config.ts` traces
engine-wasm into `/admin/balance` (its `hashRuleset` call). New env: `DEVLOG_WEBHOOK_SECRET` — **set
in Vercel Production + as the GitHub Actions repo secret (2026-07-21); prod redeployed, gate verified
live (401 on bad/absent, 400 on valid+bad-body → no write). The code-push→news pipeline is ARMED.**

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
4. ~~**Neon prod promote (user-gated)**~~ ✅ **DONE (2026-07-21)** — the reviewed `0000`+`0001` migrations are applied to the Neon **production** branch (`npm run db:migrate`; SC-008 dev-first gate satisfied on local dev Postgres). `rulesets`/`current_ruleset` + the full schema are live in prod. `DEVLOG_WEBHOOK_SECRET` set in Vercel Production + GitHub Actions; prod redeployed; gate verified live. **Auth env (`AUTH_SECRET`/`AUTH_GOOGLE_*`/`ADMIN_ALLOWLIST`) — set in Vercel Production 2026-07-21** (they were MISSING before, which broke Google sign-in with an Auth.js `Configuration` error; an earlier note in this file wrongly claimed they were already present). Prod redeployed; sign-in verified live (CSRF POST → Google OAuth handoff with the correct prod callback). **Optional remaining:** `npm run db:seed` to seed cold-start bot defenders in prod (idempotent) so the ladder is never empty; extend the auth env to **Preview** too if preview deploys need auth (note: Google OAuth won't match previews' dynamic URLs). Confirm the prod redirect URI `https://warformcommander.vercel.app/api/auth/callback/google` is registered in the Google Cloud OAuth client.
4. Reconcile the three cross-feature items listed under **Current phase** as their features are built.
5. **Balance rough edge for Feature 2** (surfaced by the counter-web tests, re-confirmed 2026-07-21 after the engine gameplay update): air-alpha + artillery-line sweep ~80% (Dominant), aa-rocket + support-ball ~20% (Underpowered) — only AA counters air. The counter-web *shape* is right; the *spread* wants tuning (affordable AA for more archetypes, or trim air's alpha). The engine gameplay update (air-to-air plink, whole-army support heal, stalemate guard — see CHANGELOG) did **not** move this and kept all 4 balance invariants passing; the spread is a separate tuning pass.

## Feature set (v1, foundation-first order)

Backlogged per design doc §16.1 (NOT v1): PvE, attack-fuel economy, progression
unlocks, monetization, commanders, manual-override, onboarding.

All 12 planned (spec + plan + tasks, Constitution Check passing). Task counts per
feature; see root `PLAN.md` for the per-feature task TL;DR. "Build order" = suggested
implementation sequence, not the spec numbering.

| # | Feature | Spec | Plan | Tasks | Build order |
|---|---|---|---|---|---|
| 1 | Sim core + game data model | ✅ | ✅ | ✅ 54 | **✅ MERGED + LIVE — native engine (82 tests) + WASM + /api/resolve prod-verified; native==wasm proven byte-for-byte in production** |
| 2 | Auto-balancer (Monte-Carlo, reuses sim core) | ✅ | ✅ | ✅ 32 | **✅ BUILT — US1–US4 + polish on `002-auto-balancer`; native `crates/balancer` reuses the one engine; reproducible Wilson-CI batches, interval-gated flagging, 4 numeric invariants, JSON+MD reports; 39 Rust tests incl. planted-imbalance (SC-003) + 4 invariant-violation (SC-004) goldens; 10k Bo3 ~0.8s (SC-005)** |
| 3 | App shell + design system (nav, brand tokens) | ✅ | ✅ | ✅ 55 | **✅ MERGED — tokens + responsive shell + primitives + brand; 18 Playwright/axe e2e green** |
| 4 | Garage (squad builder + loadout/dial editor) | ✅ | ✅ | ✅ 40 | **✅ BUILT — US1–US5 on `004-garage`; engine-parity preview + V1–V8 TS validation mirror; 133 pure tests green; e2e/axe/DB deferred to a live env** |
| 5 | Battle playback (tick stream → pixel-art replay) | ✅ | ✅ | ✅ 42 | **✅ BUILT — US1–US5 + polish on `005-battle-playback`; engine-free O(1) scrubber + markers + both-orientation; 33 Vitest + 14 Playwright/axe e2e green; demo-replay seam pending F7 `getReplay`** |
| 6 | Battle summary (post-Bo3 results) | ✅ | ✅ | ✅ 32 | **✅ BUILT — US1–US4 + polish on `006-battle-summary`; pure `deriveSummaryViewModel` spine; 22 Vitest + 10 Playwright/axe e2e green; demo-result seam pending F7 read path** |
| 7 | Accounts & persistence (backend/DB, defense snapshots) | ✅ | ✅ | ✅ 52 | **✅ BUILT — schema + auth + service layer; 34 Vitest tests green; prod migrated (0000+0001 live on Neon prod, 2026-07-21); + commander handles (required-at-registration onboarding gate + profile rename; case-insensitive uniqueness; `session.user.handle`; 2026-07-21)** |
| 8 | Arena (async matchmaking) + Practice sandbox | ✅ | ✅ | ✅ 51 | **✅ BUILT — US1–US5 + real round-trip on `008-arena-practice`; server-authoritative resolve/record, fogged blind+locked matchmaking, practice sandbox, strict-parse anti-forgery; 31 Vitest + arena/practice e2e green; F5/F6 read-path seam cashed in** |
| 9 | Ladder (seasons, metrics, tiers/MMR) | ✅ | ✅ | ✅ 38 | **✅ BUILT — US1–US4 on `009-ladder`; net-victory board + deterministic tiebreak + period rollups + both-orientation; read-only over F7; 24 Vitest + 8 e2e green** |
| 10 | Profile (career stats, achievements) | ✅ | ✅ | ✅ 33 | **✅ BUILT — US1–US4 on `010-profile`; public career view (own + /commander/[handle]), career==standing, cosmetic derived badges; read-only, no new table; 20 Vitest + 7 e2e green** |
| 11 | Marketing site (Home + News index + article template) | ✅ | ✅ | ✅ 59 | **✅ BUILT — US1–US5 + SEO on `011-marketing-news`; published-only read boundary (drafts/future never public), safe markdown (zero XSS), Home/News/article + sitemap/robots/RSS + F11↔F12 revalidate seam; read-only over F7 `posts`; 29 Vitest + 15 Playwright/axe e2e green** |
| 12 | Admin console + balance publishing (live stat editing → auto news) | ✅ | ✅ | ✅ 48 | **✅ BUILT — US1–US5 on `012-admin-console`; the live-ruleset store (replaces F8's placeholder, authoritative `getCurrentRuleset`), server-authoritative admin gate, atomic auto-published balance post, SHA-idempotent code-push devlog webhook, read-only fairness-report panel; canonical `hash_ruleset` wasm export; 42 Vitest + admin e2e green** |

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
