# Warform Commander — Build Plan (one-page overview)

The whole v1 feature set, planned. **12 features · ~536 tasks**, each carried through
Spec-Kit `spec.md → plan.md → tasks.md` under [`specs/`](./specs/) with a passing
Constitution Check. This file is the map; each feature's `specs/00X-*/` directory is the
detailed blueprint. Master design: [`reference/warformcommandergamedesigndoc.md`](./reference/warformcommandergamedesigndoc.md);
invariants: [`.specify/memory/constitution.md`](./.specify/memory/constitution.md).

**Status:** planned, not implemented. Next step = implement Feature 1 (the foundation).

## Architecture in one breath

One **Rust engine** compiled two ways — **WASM** (server-authoritative match resolution on
Vercel) and **native** (the offline balancer) — plus a **TypeScript** Next.js 16 app that only
*plays back* results. Battles are **deterministic** (fixed-point math, pinned PRNG) so replays,
the balancer, and the ladder all agree. Content (units/variants/gear/dials) + the **ruleset**
(balance table) are **typed data** the sim, Garage, and balancer share. Persistence = **Neon
Postgres + Drizzle (postgres-js)**; replays stored as `jsonb`. Non-P2W and server-authority are
structural, never optional (P1, P6).

## Build order (dependency-driven)

```
1. Feature 1  Sim core + data model          ← foundation everything imports
2. Feature 3  App shell + design system   ┐   ← the two next foundations
   Feature 7  Accounts & persistence       ┘      (schema everything reads)
3. Feature 4  Garage   · Feature 5  Playback · Feature 6  Summary
4. Feature 8  Arena/Practice · Feature 9  Ladder · Feature 10  Profile
5. Feature 2  Auto-balancer · Feature 11  Marketing/News · Feature 12  Admin
```
Each feature builds on its own branch via `/speckit-implement` from its `tasks.md`. Every
`tasks.md` is phased **Setup → Foundational → one phase per user story (priority order) →
Polish**, tests-first where the story's success criteria are executable.

| # | Feature | Tasks | MVP (US1) |
|---|---|---|---|
| 1 | [Sim core + data model](./specs/001-battle-sim-core/tasks.md) | 54 | deterministic seed→replay resolution |
| 2 | [Auto-balancer](./specs/002-auto-balancer/tasks.md) | 32 | estimate one matchup's win probability |
| 3 | [App shell + design system](./specs/003-app-shell/tasks.md) | 55 | design tokens as the visual source of truth |
| 4 | [Garage](./specs/004-garage/tasks.md) | 40 | build & save a legal 5-unit squad |
| 5 | [Battle playback](./specs/005-battle-playback/tasks.md) | 42 | watch a stored replay end-to-end |
| 6 | [Battle summary](./specs/006-battle-summary/tasks.md) | 32 | see who won and why |
| 7 | [Accounts & persistence](./specs/007-accounts-persistence/tasks.md) | 52 | Google sign-in + admin role |
| 8 | [Arena + Practice](./specs/008-arena-practice/tasks.md) | 51 | attack → server resolves & records a Bo3 |
| 9 | [Ladder](./specs/009-ladder/tasks.md) | 38 | net-victory leaderboard + my rank |
| 10 | [Profile](./specs/010-profile/tasks.md) | 33 | career stats + identity |
| 11 | [Marketing site + News](./specs/011-marketing-news/tasks.md) | 59 | Home sells the game + non-P2W promise |
| 12 | [Admin console](./specs/012-admin-console/tasks.md) | 48 | edit base stats live; next battle uses them |

---

## Feature 1 — Sim core + game data model · 54 tasks
The deterministic, seeded, server-authoritative tick engine (`resolve(armies, ruleset, seed) →
Replay`) + the typed game-data schema. Rust → WASM (server) & native (balancer); client never
simulates. **Foundation everything imports.** No dependencies.
- **Setup / Foundational:** Cargo workspace (`crates/engine` cdylib+rlib, `crates/balancer` stub), wasm-pack + Vercel file-tracing, CI matrix; fixed-point `i64`, pinned `Pcg64`, the typed model (types/ruleset/army), in-memory replay types, golden-hash harness.
- **US1 (P1, MVP)** deterministic seed→replay resolution + the tick loop/targeting/damage/behavior; determinism tests (1000×, native==wasm, proptest).
- **US2 (P1)** armies as typed data + V1–V8 validation (trust boundary).
- **US3 (P2)** the counter-web resolves as designed (Kinetic→shields, Energy→armor, AA→air, artillery→backline, explosive→clusters).
- **US4 (P2)** win conditions (Conquest / Time-tiebreak / exact-tie→defender) + Bo3 + adaptation lock.
- **US5 (P3)** the serializable random-access JSON replay + pure TS reader (O(1) seek, no re-sim).
- **Polish:** balancer hook, full quickstart validation (SC-001..007) green on both targets.

## Feature 2 — Auto-balancer (Monte-Carlo) · 32 tasks
Offline native tool that runs the **same engine** thousands of times to prove fairness (P4).
Advisory only — never edits balance. Depends on Feature 1.
- **Setup / Foundational:** `crates/balancer` build-out, seed derivation, batch runner (rayon across matches), fixtures.
- **US1 (P1, MVP)** estimate a matchup's win probability (Wilson 95% CI, reproducible 1-thread==N-thread).
- **US2 (P2)** sweep the space + flag dominant/degenerate/underpowered combos, interval-gated & ranked.
- **US3 (P2)** verify the four balance invariants numerically (family band, power-gap cap, no-dominant-unit, skill>gear).
- **US4 (P3)** emit JSON + markdown balance reports stamped with `rulesetHash`.

## Feature 3 — App shell + design system · 55 tasks
The visual foundation + responsive chrome every screen composes. Tailwind v4 tokens, shadcn/ui,
two co-equal nav chromes (P7). No dependencies (pairs with Feature 1 as foundation).
- **Setup / Foundational:** Tailwind v4 CSS-first token pipeline, shadcn init re-themed, fonts, `cn()`.
- **US1 (P1, MVP)** design tokens as the single visual source of truth (brand palette, faction/zone/family tokens).
- **US2 (P1)** a responsive app shell first-class in **both** portrait & landscape (bottom-tab / top-tab).
- **US3 (P2)** the core primitive kit screens compose (Button/Panel/StatBar/Chip/…).
- **US4 (P2)** the game visual layer — faction/zone theming, `UnitIcon` (7 types), brand/logo assets.
- **US5 (P3)** accessibility & motion baseline (WCAG AA, `prefers-reduced-motion`).

## Feature 4 — Garage (squad builder) · 40 tasks
Where the player expresses "skill in the plan" (P2/P3): build/kit/dial/place a 5-unit squad with a
live effective-stat preview; illegal builds rejected via the shared `validate()`. Depends on 1, 3, 7.
- **US1 (P1, MVP)** build & save a legal 5-unit squad (zone caps, preview, save to a roster slot).
- **US2 (P2)** kit each machine with a mount/family-gated loadout (1 weapon/1 defense/3 utility).
- **US3 (P2)** dial in behavior — 4 dials + ≤2 latching Plan-B triggers (precedence).
- **US4 (P2)** presets (stock + custom) as the on-ramp.
- **US5 (P3)** designate ≤3 squads as defense (snapshotting via Feature 7).

## Feature 5 — Battle playback · 42 tasks
The replay player — renders the tick stream with a **working scrubber (O(1) seek, zero re-sim)**,
fixing the previous game's broken viewer. DOM/CSS sprites over 4 zones. Depends on 1, 3.
- **US1 (P1, MVP)** watch a stored replay from start to finish.
- **US2 (P1)** scrub and seek to any tick — the working scrubber (indexes the reader, never re-sims).
- **US3 (P2)** speed control, frame-step, jump to start/end.
- **US4 (P2)** event markers on the timeline (Plan-B triggers, deaths).
- **US5 (P3)** both orientations, accessible, motion-safe.

## Feature 6 — Battle summary · 32 tasks
The post-Bo3 results screen — outcome, per-machine fates, damage, ranking delta; links to replay.
Read-only over Feature 1's `MatchResult`. Depends on 1, 3 (+7 read).
- **US1 (P1, MVP)** see who won the match and why (verdict + 2-0/2-1 + win condition + reward tier).
- **US2 (P2)** per-machine fates + damage breakdown + MVP (derived from the replay, no re-sim).
- **US3 (P2)** watch the replay / rematch / return actions.
- **US4 (P3)** see the net-victory ranking change.

## Feature 7 — Accounts & persistence · 52 tasks
Auth + the whole database — the schema Features 8/9/10/12 read. Google via Auth.js + Drizzle,
server-authoritative sessions. **The schema centerpiece.** No feature dependencies (foundation).
- **Setup / Foundational:** Neon/Drizzle wiring, Auth.js adapter tables, migration flow.
- **US1 (P1, MVP)** sign in with Google + server-side admin role (allowlist).
- **US2 (P1)** save & load a roster of squads (config as jsonb, validated on write).
- **US3 (P1)** designate defense with **immutable copy-on-designate snapshots** (≤3, partial-unique cap).
- **US4 (P2)** persist battle results + replays (jsonb, server-only recording).
- **US5 (P2)** net-victory ladder standing (generated column, maintained transactionally).
- **Shared:** unified `posts` table + custom `presets`.

## Feature 8 — Arena + Practice · 51 tasks
Async ranked PvP + practice. Server resolves the Bo3 (WASM engine), records it, updates standings.
**Server-authoritative — the client can't forge a result (P6).** Depends on 1, 3, 4, 7.
- **US1 (P1, MVP)** attack: pick a squad → matched → the server resolves & records the Bo3.
- **US2 (P1)** random matchmaking: anyone vs anyone, never self, never empty (cold-start bots, P5).
- **US3 (P2)** defense served blind and locked for the Bo3 (immutable snapshot).
- **US4 (P2)** practice: face a random hidden squad, refreshable, no stakes.
- **US5 (P2)** server authority — adversarial tests that a client cannot fabricate a result.

## Feature 9 — Ladder · 38 tasks
The net-victory leaderboard (attack wins − defense losses, §13). Read-only over Feature 7;
seasons/MMR/tiers deferred/presentational. Depends on 7, 8.
- **US1 (P1, MVP)** view the net-victory leaderboard and find my rank.
- **US2 (P2)** read a commander's standing — record, streak, total damage.
- **US3 (P2)** per-period views (this week / this month), computed live from `matches`.
- **US4 (P3)** understand the net-victory model (a weak defense bleeds rank).

## Feature 10 — Profile · 33 tasks
A commander's career screen — identity, stats, notable matches, signature squads, cosmetic badges.
Read-only over Feature 7. Depends on 7 (+links to 5/6/9).
- **US1 (P1, MVP)** career stats + identity (handle, enlisted, net victories, W/L, streaks).
- **US2 (P2)** recent & notable matches + activity (links to summary/replay).
- **US3 (P3)** signature squads & most-fielded unit.
- **US4 (P3)** badges & achievements (cosmetic/derived in v1; never power).

## Feature 11 — Marketing site + News · 59 tasks
Public Home + News index + article template over the unified `posts` table (published-only).
Reads posts; doesn't author them. SSG/ISR + tag revalidation. Depends on 3, 7.
- **US1 (P1, MVP)** the Home page sells the game and its non-P2W promise.
- **US2 (P1)** the marketing shell frames every page in both orientations.
- **US3 (P2)** the News index lists published posts, newest first.
- **US4 (P2)** an article renders a post from markdown by slug (XSS-safe, 404 on unknown).
- **US5 (P3)** discoverable & shareable — SEO / OpenGraph / sitemap / RSS.

## Feature 12 — Admin console + balance publishing · 48 tasks
Admin-gated live-ops: edit the live ruleset (owns the `rulesets`/`current_ruleset` store) and
auto-publish balance + code-push news. **Admin authz server-side (P6); tunes fairness, never sells
power (P1).** Depends on 1, 7 (+2 informs, 11 renders).
- **US1 (P1, MVP)** edit the base stats live; the next battle uses them (fresh-read, replays untouched).
- **US2 (P1)** only server-verified admins can reach and use the console.
- **US3 (P2)** a ruleset edit auto-publishes exactly one balance news post (diff in metadata).
- **US4 (P2)** a code push auto-publishes a devlog/changelog post.
- **US5 (P3)** surface the balancer's fairness report to inform tuning.

---

## Cross-feature items to reconcile at build time

1. **Ruleset loader naming** — Feature 8 references a `loadCurrentRuleset()` placeholder; Feature 12
   defines the real `getCurrentRuleset()` (fresh-read, no per-instance cache) over its new store and
   renames the call site (F12 tasks T045). Land F12's store before wiring F8's resolve path to prod data.
2. **Editorial post authoring** — Feature 11 assumes all `posts` writes go through the admin surface,
   but Feature 12's spec covers only auto-posts (balance/devlog/changelog). Editorial (hand-written)
   authoring needs an explicit home — most naturally a small addition to the Feature 12 console.
3. **Per-machine damage rollup** — Feature 6 derives MVP/per-machine damage from an O(events) replay
   reduction because Feature 1's `MatchResult` carries only per-side totals + per-machine fates. Adding
   a per-machine rollup to the engine result is an optional future convenience.

## Not in v1 (backlogged, per design doc §16.1)

PvE (campaign/roguelite), the attack-fuel economy, progression/unlocks, monetization (cosmetics/
store gear/battle pass), commanders, the single manual-override, onboarding, and MTX squad-slot
bundles (8→64). The schema and dials are architected so these slot in later without a rewrite.
