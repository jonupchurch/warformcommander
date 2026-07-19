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

[Unreleased]: https://github.com/jonupchurch/warformcommander/commits/main
