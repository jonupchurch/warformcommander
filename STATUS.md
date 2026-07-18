# Project Status — Warframe Commander

> Living snapshot of where the project is. Update it as phases and features
> move. It complements `CHANGELOG.md` (what shipped) by capturing the
> *current* state and what's next. Last updated: 2026-07-18.

## Current phase

**Bootstrapping.** The repo is scaffolded and the spec-driven `ai-tools`
toolkit is in place. No product feature has been specified or built yet.

Per the constitution's **Principle VII (plan the whole feature set first)**,
the next milestone is to spec and plan the *entire* initial feature set
before implementing any single feature.

## Done

- [x] Git repository initialized, pushed to `origin/main`.
- [x] `.gitignore` for Next.js (+ Playwright/vitest artifacts, spec-kit local state).
- [x] `ai-tools` spec-kit toolkit seeded (`.specify/`, `.claude/`, `stacks/`, `CLAUDE.md`, `AGENTS.md`, `MANIFEST.md`).
- [x] Process docs created (`CHANGELOG.md`, `STATUS.md`).

## Next up

1. **Establish/confirm the project constitution** — review `.specify/memory/constitution.md`; run `speckit-constitution` if project-specific principles are needed.
2. **Define the game concept & initial feature set** — a short pitch: what Warframe Commander *is*, core loop, and the first slice of features.
3. **Plan the whole set** — `speckit-specify` → `speckit-plan` across every initial feature (Principle VII) before writing implementation code.
4. **Scaffold the Next.js app** — once the plan exists, stand up the App Router project to match it.

## Feature set

_Not yet specified._ This table fills in once the initial feature set is
defined and each feature moves through spec → plan → tasks → implement.

| Feature | Spec | Plan | Tasks | Status |
|---|---|---|---|---|
| _(none yet)_ | — | — | — | — |

## Tech stack

- **Framework:** Next.js (App Router) — see `stacks/nextjs.md`.
- **Deployment target:** Vercel (assumed; confirm during planning).
- **Testing:** unit tests + Playwright e2e (constitution Principle VIII).

## How to maintain this file

- Move items from **Next up** to **Done** as they complete.
- Keep **Current phase** honest — it's the first thing a new session should read.
- Record shipped changes in `CHANGELOG.md`; record *where we are* here.
