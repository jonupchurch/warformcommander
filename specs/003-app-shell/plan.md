# Implementation Plan: App Shell + Design System

**Branch**: `003-app-shell` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-app-shell/spec.md`

## Summary

Build the **visual and structural foundation** of the Warform Commander web app: the design
tokens (from the Brand Foundation), the responsive application shell that is **co-equally
first-class in mobile portrait and desktop landscape** (constitution **P7**), the reusable
token-driven UI primitives every screen composes, and the brand assets (logo, wordmark,
favicon, `UnitIcon`). It is the UI counterpart to Feature 1's data model: a single visual
source of truth (**P8**, applied to presentation) that Features 4–6 and 8–12 all render
inside. This is greenfield design-system work — conventions are established **deliberately**
here (**Principle III**) and every value is **derived from the committed mockups**, not
generic assumptions.

The technical approach, all resolved in [research.md](./research.md): a **Tailwind v4
CSS-first token pipeline** — primitive `@theme` + semantic `:root` published via
`@theme inline` (deferred resolution, so roles are re-pointable and a future theme is a
central change) — with the brand palette kept as **exact hex** for fidelity (SC-002);
**shadcn/ui** (`shadcn@latest init`, `cssVariables: true`, owned source) as the accessible-
primitive layer whose base tokens are re-pointed at Warform semantics so its components render
on-brand; a **single shell rendering two co-equal nav chromes** (bottom-tab portrait /
top-tab landscape, toggled by `lg:` utilities — media queries for the macro switch,
`@container` for micro layout), sized with `dvh`/`svh` and padded with `env(safe-area-inset-*)`;
fonts (Archivo, Archivo Expanded, Space Mono) via `next/font/google`; and a dark-only theme
with a `prefers-reduced-motion` baseline. Verification is Playwright + `@axe-core/playwright`
across a 320 / 360×640 / 1440×900 / ultra-wide viewport matrix.

## Technical Context

**Language/Version**: **TypeScript** on **Next.js 16** (App Router, Turbopack), **React 19**.
CSS via **Tailwind CSS v4** (CSS-first `@theme`). No new language surface (contrast with
Feature 1's Rust).

**Primary Dependencies**: `tailwindcss` v4 (present); **shadcn/ui** (`shadcn@latest`) +
its runtime deps `clsx`, `tailwind-merge` (the `cn()` helper), `class-variance-authority`
(variants), `tw-animate-css`, Radix primitives (pulled in per component); `next/font/google`
(Archivo / Archivo Expanded / Space Mono); `lucide-react` (nav/action icons). Dev/test:
`@playwright/test` (present per STATUS.md) + `@axe-core/playwright`.

**Storage**: N/A — this feature is presentation-only; it reads no DB and persists nothing.
(It encodes Feature 1's fixed game facts — 7 types, 4 zones, friendly/enemy — as visual
tokens/components, but defines none of them.)

**Testing**: **Playwright** e2e for the responsive shell (viewport matrix, no-horizontal-
scroll, nav-chrome-switch, `aria-current`), **`@axe-core/playwright`** for accessibility +
contrast, an emulated `prefers-reduced-motion` run, and component-render checks against an
in-app `/_gallery` route. Unit-level checks where they carry signal (the `UnitIcon` type→file
map, `cn()`, token-presence). Matches constitution **Principle VIII** and
[`stacks/nextjs.md`](../../stacks/nextjs.md) ("`next build` passes; changed route renders").

**Target Platform**: The **browser**, both **mobile portrait AND desktop landscape as
co-equal first-class targets** (P7) — the defining constraint. Deployed on Vercel (existing).

**Project Type**: A **design system + shell inside the existing single Next.js app** at the
repo root — not a new package or sub-app. It evolves `app/globals.css`, `app/layout.tsx`,
adds `src/components/` + `src/lib/`, and introduces an authenticated route group `app/(app)/`.

**Performance Goals**: ~**zero font-swap layout shift** (CLS, via `next/font` self-hosting,
SC-009); no horizontal overflow at any width 320px→ultra-wide (SC-001); shell chrome is a
Server Component (no hydration cost beyond the small interactive nav leaf).

**Constraints**: **P7 is the hard constraint** — both orientations designed *for*, not adapted
(SC-001, SC-005). **WCAG AA** contrast on all shipped pairings (SC-003) and **zero serious
a11y violations** (SC-004). **Token-only styling** — no screen or primitive references a raw
brand hex (SC-002, SC-010). **Dark-only** for v1 (FR-021). **`prefers-reduced-motion`**
honored (SC-006). Fits the existing repo-root app without restructuring it.

**Scale/Scope**: The token system + the app shell + ~14 primitives (Button, Panel, SectionLabel,
Chip, StatBar, Stat, Menu/Dropdown, Dialog, Sheet, BracketFrame, GridBackdrop, Logo, Wordmark,
UnitIcon, IdentityBadge) + brand/favicon. **Not** any screen's content, **not** the marketing
nav content (Feature 11), **not** Admin (Feature 12) — those compose this system (FR-022).

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design. Constitution v3.0.0 —
Product Invariants P1–P8 + Engineering Process I–IX.*

### Product & Architecture Invariants

| Invariant | Status | How this plan satisfies it |
|---|---|---|
| **P1 Non-P2W by construction** | ✅ (N/A here) | Presentation layer; it sells and gates nothing. It *communicates* the promise ("Skill lives in the plan — never the wallet" is in the shell's brand copy) but enforces no economy. |
| **P2 Planning over twitch** | ✅ (N/A here) | No battle input lives in the shell. |
| **P3 Depth from configuration** | ✅ (enabling) | The design *system* itself is depth-from-configuration: variety comes from composing tokens/primitives, not bespoke one-off UI — the visual echo of P3. `UnitIcon` + faction/zone tokens render the 7×3×config depth without per-unit art. |
| **P4 Fairness is verified** | ✅ (N/A here) | No balance surface. |
| **P5 Content from players/puzzles** | ✅ (enabling) | The shell is the frame the player-generated content (defense squads, ladder) is *shown* in; it imposes no content pipeline. |
| **P6 Deterministic, server-authoritative (NON-NEG)** | ✅ (N/A here) | The shell runs no sim and fabricates no result; it only renders. No P6 surface. |
| **P7 Both platforms first-class (NON-NEG for this feature)** | ✅ **the headline deliverable** | One shell renders **two co-equal chromes** — bottom-tab portrait / top-tab landscape, each designed *for* its form factor (research C1), not adapted. SC-001/SC-005 verify both at 360px and 1440px. The mockups' desktop-only nav is *completed* here with the co-equal portrait design. |
| **P8 Data-driven content** | ✅ (applied to UI) | Tokens are the single visual source of truth (data-model, contracts); screens bind to **semantic tokens**, never raw hex (SC-002, SC-010) — the presentation analogue of one typed source. |

### Engineering Process (I–IX)

| Principle | Status | Note |
|---|---|---|
| **I Clarify** | ✅ | Spec has prioritized stories, acceptance scenarios, explicit non-goals (FR-022); zero open `NEEDS CLARIFICATION` (the two-shell scope boundary and dark-only decision are stated). |
| **II Validated trust boundaries** | ✅ (light) | The shell handles no untrusted input/authorization; nav is display-only. Auth-gating of the `(app)` group is Feature 7's concern — noted, not built here. |
| **III Match conventions** | ✅ | **Greenfield design system — conventions established deliberately** (token tiers, component layout, `cn()`, variant API) and documented in the contracts, as Principle III directs for a fresh project. Extends the existing scaffold's `@theme` shape rather than replacing the approach. |
| **IV Scope discipline (NON-NEG)** | ✅ | Only shell + tokens + primitives + brand. Screen content, marketing nav (F11), Admin (F12), Storybook, light theme all explicitly **out** (FR-021, FR-022, research D1) — named, not folded in. |
| **V Verify before done** | ✅ | SC-001..010 are executable (Playwright/axe + `/_gallery`); "done" = green across the viewport matrix + `next build` + typecheck ([quickstart.md](./quickstart.md)). |
| **VI Narrate** | ✅ | research.md records every decision + rejected alternatives with sources. |
| **VII Plan whole set first** | ✅ | Part of the foundation-first planning pass; this plan surfaces the tokens/primitives every later screen feature imports (data-model "Consumers"). |
| **VIII Test at right level** | ✅ | e2e (Playwright viewport + a11y — the right level for a *responsive shell*, per VIII's "critical paths a unit test can't reach"); unit where it carries signal (type map, `cn()`, token presence). |
| **IX Commit atomically, branch per feature** | ✅ | On `003-app-shell`; artifacts + implementation commit atomically per phase/story. |

**Gate result: PASS.** No deviations require Complexity Tracking (see below). P1 and P6 (the
never-waived invariants) have no surface here; **P7 (never-waived) is the feature's core and is
fully satisfied by design**.

## Project Structure

### Documentation (this feature)

```text
specs/003-app-shell/
├── plan.md              # this file
├── spec.md              # prioritized stories, FRs, success criteria
├── research.md          # Phase 0 — Tailwind v4 / shadcn / responsive-shell decisions
├── data-model.md        # Phase 1 — token taxonomy, nav model, component taxonomy
├── quickstart.md        # Phase 1 — build/run/verify guide (maps to SC-001..010)
├── contracts/
│   ├── design-tokens.md # the globals.css token contract (names + values)
│   └── components.md     # the shell + primitive component APIs
└── tasks.md             # Phase 2 — created by /speckit-tasks (next)
```

### Source Code (repository root)

The existing Next.js app is at the **repo root** (`app/`, `app/globals.css`, `app/layout.tsx`).
This feature evolves it in place and adds `src/components/` + `src/lib/`, an authenticated
route group `app/(app)/`, and a dev component gallery. No restructuring of the app.

```text
d:/Codelib/warformcommander/
├── app/
│   ├── globals.css              # EDIT — the full token contract (primitive→semantic→@theme inline→shadcn→reduced-motion)
│   ├── layout.tsx               # EDIT — next/font (Archivo/Archivo Expanded/Space Mono → CSS vars), Warform metadata/favicon, viewportFit:"cover"
│   ├── favicon.ico              # REPLACE — Warform mark (+ app/icon.svg / apple-icon)
│   ├── page.tsx                 # EDIT — minimal shell placeholder (real Home = Feature 11)
│   ├── (app)/                   # NEW — authenticated route group
│   │   ├── layout.tsx           # NEW — AppShell (Server Component): header + PrimaryNav + content
│   │   └── (garage|arena|ladder|practice|profile)/  # placeholders owned by later features; shell only here
│   └── _gallery/                # NEW — dev-only token + component gallery (noindex); the test surface
│       └── page.tsx
├── src/
│   ├── lib/
│   │   └── utils.ts             # NEW — cn() = twMerge(clsx(...)) (shadcn convention)
│   └── components/
│       ├── shell/
│       │   ├── app-shell.tsx        # NEW — header + regions + skip-link + container/safe-area
│       │   ├── primary-nav.tsx      # NEW ("use client") — top-tab lg: / bottom-tab default; usePathname active
│       │   └── identity-badge.tsx   # NEW — commander/rank/MMR + avatar
│       ├── brand/
│       │   ├── logo.tsx             # NEW — two-wedge mark, lockups (badge/mono/knockout/on-light/favicon)
│       │   ├── wordmark.tsx         # NEW — WARFORM wordmark
│       │   └── unit-icon.tsx        # NEW — inline currentColor machine SVGs (7 types)
│       └── ui/                      # NEW — token-driven primitives (+ shadcn-installed here)
│           ├── button.tsx  panel.tsx  section-label.tsx  chip.tsx  stat-bar.tsx  stat.tsx
│           ├── bracket-frame.tsx  grid-backdrop.tsx
│           └── (shadcn: dropdown-menu.tsx  dialog.tsx  sheet.tsx)
├── public/
│   └── icons/                   # EXISTING — 7 currentColor unit SVGs consumed by UnitIcon
├── components.json              # NEW — shadcn config (cssVariables:true, rsc:true, aliases)
├── next.config.ts              # EDIT (if needed) — nothing WASM-like; possibly path aliases
├── tsconfig.json               # EDIT — ensure @/* → src/* (and app) path alias for shadcn
└── e2e/ (or tests/)            # NEW — Playwright shell + a11y specs (viewport matrix, axe, reduced-motion)
```

**Structure Decision**: Evolve the **existing repo-root Next.js app in place**. Tokens live in
`app/globals.css` (Tailwind v4 CSS-first). Shared UI lives under `src/components/` split by
concern (`shell/`, `brand/`, `ui/`) with `src/lib/utils.ts` for `cn()` — the shadcn-idiomatic
layout, established deliberately as the repo convention (Principle III). The authenticated
shell is the `app/(app)/layout.tsx` route-group layout so every later screen feature drops its
route into the group and inherits the chrome for free. A dev-only `app/_gallery` route is the
isolation/test surface (Storybook deferred — research D1). This keeps Feature 3 additive to the
scaffold, matching how Feature 1 added alongside the app without restructuring it.

## Complexity Tracking

*No constitution deviations require justification.* Every dependency introduced (shadcn/ui and
its `clsx`/`tailwind-merge`/`cva`/Radix runtime, `@axe-core/playwright`, `lucide-react`) is a
mainstream, first-party-recommended part of the chosen stack (Tailwind v4 + Next 16), adopted
to *satisfy* the constitution (accessible primitives for SC-004/SC-007; axe for SC-003/SC-004),
not to exceed scope. No new language, service, or architectural layer is added. The one
scope-relevant *exclusion* — deferring Storybook/Chromatic — is recorded as future work in
[research.md](./research.md) D1, not a deviation.

| Consideration | Decision | Simpler alternative rejected because |
|---|---|---|
| Adopt shadcn/ui (+Radix/cva) vs hand-roll every primitive | Adopt | Hand-rolling accessible menus/dialogs/focus-management is high-cost and risks SC-004; shadcn gives owned, on-brand, accessible source with zero hidden abstraction (research B1). |
| `src/components/` split (`shell`/`brand`/`ui`) vs flat | Split | A flat folder blurs shell-vs-primitive-vs-brand ownership as 6+ features start importing; the split is the shadcn-idiomatic convention screens follow (Principle III). |

## Post-Design Constitution Re-check

After Phase 1 (data-model, contracts, quickstart): **still PASS.**
- The token contract keeps **primitive/semantic tiers separate** and consumers on semantics →
  P8-for-UI holds and a future theme stays a central change (FR-002/FR-021).
- The component contract keeps every primitive **token-only** and shadcn re-themed → SC-002/
  SC-007; accessibility (focus, reduced-motion, accessible names) is baked into the APIs →
  SC-003/SC-004/SC-006.
- The shell contract fixes the **two co-equal chromes + max-width + safe-area + no-overflow**
  guarantees → **P7**/SC-001/SC-005.
- No new complexity surfaced; the two tracked considerations above are unchanged. P7 (the
  never-waived invariant in play) is satisfied structurally, not traded.

## Phase status

- [x] **Phase 0 — Research** → [research.md](./research.md) (all unknowns resolved)
- [x] **Phase 1 — Design & contracts** → [data-model.md](./data-model.md),
  [contracts/](./contracts/), [quickstart.md](./quickstart.md)
- [ ] **Phase 2 — Tasks** → `tasks.md` via `/speckit-tasks` (next)
