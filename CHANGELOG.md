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

[Unreleased]: https://github.com/jonupchurch/warformcommander/commits/main
