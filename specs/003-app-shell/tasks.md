---
description: "Task list for Feature 3 — App Shell + Design System"
---

# Tasks: App Shell + Design System

**Input**: Design documents from `specs/003-app-shell/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **INCLUDED and non-optional.** This feature's value is a foundation every screen
trusts — its Success Criteria (SC-001…SC-010) are executable, and constitution **Principle
VIII** + **P7** require them. The responsive shell and accessibility are the kind of critical
path a unit test can't reach, so the load-bearing tests are **Playwright + `@axe-core/playwright`**
across a viewport matrix, plus focused unit checks where they carry signal.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 (maps to spec.md user stories); Setup/Foundational/Polish carry no story label
- Paths are exact and match [plan.md](./plan.md) Project Structure. Component paths under
  `src/components/`; tokens in `app/globals.css`; shell layout in `app/(app)/`; tests in `e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the token pipeline's tooling, shadcn, fonts, and the test harness.

- [ ] T001 Add path alias `@/* → src/*` (and confirm `@/components`, `@/lib`) in `tsconfig.json`; create `src/lib/` and `src/components/{shell,brand,ui}/` folders.
- [ ] T002 Run `npx shadcn@latest init` → `components.json` (`cssVariables: true`, `rsc: true`, aliases `@/components` + `@/lib/utils`, icon lib `lucide-react`); on the npm + React 19 peer-dep prompt choose `--legacy-peer-deps` (research B3). Verify it writes `src/lib/utils.ts` `cn()`.
- [ ] T003 [P] Install test deps: `@axe-core/playwright`, ensure `@playwright/test` + browsers (`npx playwright install`). Add `test:e2e` / `typecheck` npm scripts if missing.
- [ ] T004 [P] Add a lint/convention guard against raw brand hex outside `app/globals.css` (ESLint rule or a `grep`-based CI check over `src/components/**` + `app/(app)/**`) — enforces SC-002.
- [ ] T005 [P] Scaffold the dev-only gallery route `app/_gallery/page.tsx` (noindex) — empty shell now; token + primitive sections fill in per story. This is the test/review surface (research D1).
- [ ] T006 [P] Scaffold the Playwright config + `e2e/` with the **viewport matrix** helper (320, 360×640, 1440×900, ultra-wide) reused by shell/a11y specs.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The token contract + fonts + base resets that **every** story consumes. Nothing
in Phase 3+ can begin until this is done.

**⚠️ CRITICAL**: This is the shared visual source of truth (contracts/design-tokens.md).

- [ ] T007 Author the **primitive `@theme` block** in `app/globals.css` — brand/accent ramp, surface ramp, text/line ramp, type scale, spacing/radii/shadow/motion/breakpoint tokens — exact values from [contracts/design-tokens.md](./contracts/design-tokens.md) (SC-002). Remove the scaffold's placeholder `--background/--foreground` light values.
- [ ] T008 Author the **semantic `:root` layer + `@theme inline` mapping** in `app/globals.css` — surface/text/border roles, `faction-*`, `zone-*`, `family-*`, `--ring` — publishing `bg-*`/`text-*`/`border-*` utilities via deferred resolution (research A2, FR-002).
- [ ] T009 Re-point the **shadcn base tokens** (`--background/--foreground/--primary/--card/--popover/--border/--input/--ring/--destructive/--radius`) at Warform semantics in `app/globals.css` so shadcn primitives render on-brand (research B1/B2); set `color-scheme: dark` and remove the `@media (prefers-color-scheme: dark)` block (dark-only, FR-021).
- [ ] T010 Add the global **`prefers-reduced-motion` reset** + base `body` (bg/text/font) in `app/globals.css` (FR-020, SC-006).
- [ ] T011 Wire **fonts** in `app/layout.tsx`: `next/font/google` for `Archivo` → `--font-archivo`, `Archivo_Expanded` → `--font-archivo-expanded`, `Space_Mono` (400/700) → `--font-space-mono`; remove Geist/Geist_Mono; set `<html>` font vars (research A5, SC-009).
- [ ] T012 Set **Warform metadata + viewport** in `app/layout.tsx`: title/description, `export const viewport = { viewportFit: 'cover' }` (FR-010), and reference the brand favicon/icons (asset generated in US4).

**Checkpoint**: tokens + utilities + fonts exist; every story can consume them.

---

## Phase 3: User Story 1 — Design tokens as the single visual source of truth (P1) 🎯 MVP

**Goal**: the Brand Foundation is available as named, tiered, AA-contrast tokens that every
consumer binds to — no raw hex.

**Independent Test**: the gallery's token reference renders every token; computed values match
the Brand Foundation; semantic tokens resolve to intended primitives; text/surface pairings
pass AA — no shell or screen needed.

### Tests for User Story 1 ⚠️ (write first)

- [ ] T013 [P] [US1] `e2e/tokens.spec.ts`: assert `getComputedStyle` of gallery token swatches equals the Brand Foundation values (friendly `#2ad4ff`, enemy `#ff3b4e`, void `#06080b`, panel `#0b0f15`, ink `#eef3f8`/`#c4ccd6`/`#8b97a6`, accents `#ff8c1a`/`#7b5cff`) (SC-002, AS1).
- [ ] T014 [P] [US1] `e2e/tokens.spec.ts`: assert semantic tokens resolve to their intended primitive and that colliding roles (`--color-faction-friendly` / `--color-zone-front` / `--color-family-kinetic`) are distinct tokens (FR-002, AS2).
- [ ] T015 [P] [US1] `e2e/a11y.spec.ts`: `@axe-core/playwright` `color-contrast` on `/_gallery` → zero violations; cross-check the approved-pairings table (SC-003, AS4).

### Implementation for User Story 1

- [ ] T016 [US1] Build the **token reference** section in `app/_gallery/page.tsx` — color ramps (surface/text/faction/zone/family), the type scale (display→micro), spacing/radii/shadow swatches — each labeled with its token name and value (mirrors the Brand Foundation layout).
- [ ] T017 [US1] Add typography helper classes/utilities (or documented className recipes) for the type-scale steps (`display`/`h1`/`h2`/`h3`/`body`/`label`/`readout`/`eyebrow`) combining size + weight + tracking + family tokens (FR-003).
- [ ] T018 [US1] Verify/adjust token values so all shipped pairings pass AA (T015 green); demote any failing pairing to decorative-only per the contract's contrast notes (FR-005, SC-003).

**Checkpoint**: the token system is real, fidelity- and contrast-verified — a shippable foundation.

---

## Phase 4: User Story 2 — A responsive app shell, first-class in both orientations (P1)

**Goal**: the app shell wraps authenticated screens and presents **top-tab in landscape /
bottom-tab in portrait**, no horizontal overflow, safe-area aware, keyboard-operable — the P7
headline.

**Independent Test**: Playwright drives the shell (wrapping a stub page) at 320 / 360×640 /
1440×900 / ultra-wide; asserts no h-scroll, ≤1-interaction reach, chrome switch, single
`aria-current`, focus/landmark/skip-link.

> Note: the shell styles its chrome with **tokens directly** (nav tabs, header, seams) and may
> use a minimal token-styled button; it is refactored onto the US3 `Button` when that lands.
> This keeps US2 independently testable without blocking on US3.

### Tests for User Story 2 ⚠️ (write first)

- [ ] T019 [P] [US2] `e2e/shell.spec.ts`: **no horizontal page scroll** at 320 / 360×640 / 1440×900 / ultra-wide (SC-001, AS3).
- [ ] T020 [P] [US2] `e2e/shell.spec.ts`: **nav chrome switch** — top-tab visible / bottom-tab hidden at ≥`lg`; bottom tab bar visible / top-tab hidden below `lg` (SC-005, AS1/AS2).
- [ ] T021 [P] [US2] `e2e/shell.spec.ts`: exactly one destination has `aria-current="page"` per route; all four reachable in ≤1 interaction in both orientations (SC-001/SC-005, AS4).
- [ ] T022 [P] [US2] `e2e/shell.spec.ts`: keyboard traversal reaches every destination, focus is visible, `<nav aria-label>` landmark + skip-to-content link exist (SC-004, AS5).

### Implementation for User Story 2

- [ ] T023 [US2] Implement `src/components/shell/primary-nav.tsx` (`"use client"`): render the Nav Model (Garage/Arena/Ladder/Practice) as **both** chromes — top-tab (`hidden lg:flex`) + bottom tab bar (`lg:hidden sticky bottom-0`, safe-area padded, ≥44px targets); active via `usePathname` → cyan-fill/dark-text + `aria-current` (FR-007/FR-008, research C1/C2).
- [ ] T024 [US2] Implement `src/components/shell/identity-badge.tsx`: commander (`font-display`) + rank/MMR (`font-mono` orange) + avatar tile (faction-friendly border); truncates long names (FR-006, edge cases).
- [ ] T025 [US2] Implement `src/components/shell/app-shell.tsx` (Server Component): sticky blurred header (Logo placeholder + Wordmark + IdentityBadge) + `PrimaryNav` + content region; `min-h-dvh`, `--container-shell` max-width + centering, `env(safe-area-inset-*)` padding, skip-to-content link + nav landmark (FR-006/009/010/011).
- [ ] T026 [US2] Create the authenticated route group layout `app/(app)/layout.tsx` rendering `AppShell` around `children`, and stub routes `app/(app)/{garage,arena,ladder,practice,profile}/page.tsx` (placeholder content owned by later features — shell only here) so active-state + deep-linking resolve (FR-012, edge case).
- [ ] T027 [US2] Replace the scaffold `app/page.tsx` with a **minimal shell placeholder** demonstrating the chrome (real Home marketing page = Feature 11) (FR-022).

**Checkpoint**: the shell is co-equally first-class in both orientations — the P7 deliverable, verified.

---

## Phase 5: User Story 3 — A core UI primitive kit screens compose (P2)

**Goal**: the reusable, token-driven, shadcn-ready primitives every screen composes; the
component conventions are established.

**Independent Test**: the gallery renders each primitive + variant; variants apply correct
tokens; a stock shadcn component drops in themed with no override; interactive primitives
expose roles/focus.

### Tests for User Story 3 ⚠️ (write first)

- [ ] T028 [P] [US3] `e2e/primitives.spec.ts`: each `Button` variant applies the right tokens (primary = cyan fill + `--color-void` label + glow; secondary = border; ghost = bare); focus ring visible (AS1, FR-019).
- [ ] T029 [P] [US3] `e2e/primitives.spec.ts`: `StatBar` fills to value with the cyan gradient; `Chip` tone renders the correct family/zone/faction tint (AS3).
- [ ] T030 [P] [US3] `e2e/primitives.spec.ts`: a **stock shadcn component** in the gallery renders with `--primary`/`--background`/`--border` (cyan/void/steel) and **no per-component color override** (SC-007, AS4); Menu/Dialog trap focus + close on Escape/outside-click (AS5).

### Implementation for User Story 3

- [ ] T031 [P] [US3] Implement `src/components/ui/button.tsx` (primary/secondary/ghost, sizes, `asChild`) via `cva` + `cn()`, tokens only + `motion-safe:` glow (FR-013/014, contract).
- [ ] T032 [P] [US3] Implement `src/components/ui/panel.tsx` (surface/inset/bordered/radius + eyebrow/actions slots) (FR-013).
- [ ] T033 [P] [US3] Implement `src/components/ui/section-label.tsx` (the `NN // LABEL` mono eyebrow + fading gradient rule) (FR-013).
- [ ] T034 [P] [US3] Implement `src/components/ui/chip.tsx` (tone = family/faction/zone; outline/solid) (FR-013).
- [ ] T035 [P] [US3] Implement `src/components/ui/stat-bar.tsx` (track + cyan-gradient fill, label/display) and `src/components/ui/stat.tsx` (label+value tile) (FR-013).
- [ ] T036 [P] [US3] Implement `src/components/ui/bracket-frame.tsx` (steel corner reticle) and `src/components/ui/grid-backdrop.tsx` (grid + scanline texture, decorative) (FR-013).
- [ ] T037 [US3] Install + re-theme shadcn `dropdown-menu`, `dialog`, `sheet` (`npx shadcn add …`) into `src/components/ui/`; confirm they inherit the base-token theme (FR-014).
- [ ] T038 [US3] Refactor the US2 shell to consume `Button`/`IdentityBadge`/`Panel` where applicable (retire the temporary inline-token button); re-run US2 tests green.
- [ ] T039 [US3] Add every primitive + all variants to `app/_gallery/page.tsx`; document the component conventions (location, naming, variant API, `cn()`) in a short `src/components/README.md` (FR-015).

**Checkpoint**: screens can be built by composition; conventions are set and documented.

---

## Phase 6: User Story 4 — The game visual layer: faction/zone theming, unit icons, brand assets (P2)

**Goal**: the identity-carrying, game-specific visuals — `UnitIcon`, faction/zone theming, and
the Warform logo/wordmark/favicon.

**Independent Test**: `UnitIcon` renders all 7 types and takes the friendly/enemy tint via
`currentColor`; the logo lockups + wordmark match Logo Directions; faction-themed subtrees flip
accents.

### Tests for User Story 4 ⚠️ (write first)

- [ ] T040 [P] [US4] `e2e/unit-icon.spec.ts`: all 7 `UnitIcon` types **inline** their `public/icons/*.svg` and resolve `currentColor` to `#2ad4ff` (friendly) vs `#ff3b4e` (enemy); no per-type color hardcoded (SC-008, AS1/AS2).
- [ ] T041 [P] [US4] `e2e/brand.spec.ts`: the `Logo` lockups (badge/mono/knockout/on-light/favicon) render, and the app favicon/metadata resolve to the Warform mark (not Next default) (FR-018, SC-009, AS4); `UnitIcon`/`Logo` expose accessible names or are marked decorative (AS5).

### Implementation for User Story 4

- [ ] T042 [P] [US4] Implement `src/components/brand/unit-icon.tsx`: inline the 7 machine SVGs keyed by `MachineTypeKey` (type→file map from data-model), tinted via `currentColor`/`faction` prop; neutral fallback when unthemed (FR-016, edge case).
- [ ] T043 [P] [US4] Implement `src/components/brand/logo.tsx` (two-wedge mark, all Logo Directions lockups, optional `BracketFrame`) and `src/components/brand/wordmark.tsx` (FR-018).
- [ ] T044 [US4] Generate the **favicon + app icons** from the mark (`app/favicon.ico`, `app/icon.svg`, apple icon) and wire `app/layout.tsx` metadata (FR-018, SC-009); swap the `Logo` placeholder in `AppShell` for the real component.
- [ ] T045 [US4] Verify `faction-*` and `zone-*` tokens are consumable (add a faction/zone theming demo — friendly/enemy panels, 4-zone accents — to `/_gallery`) (FR-017, AS3).

**Checkpoint**: the game's visual identity is componentized and reused across the app.

---

## Phase 7: User Story 5 — Accessibility & motion baseline (P3)

**Goal**: the a11y + motion floor every screen inherits — focus, keyboard, contrast, reduced
motion — hardened and audited.

**Independent Test**: axe/Lighthouse on the shell + gallery report zero serious violations, AA
contrast, visible focus everywhere; enabling reduced-motion removes decorative animation while
keeping the UI usable.

### Tests for User Story 5 ⚠️ (write first)

- [ ] T046 [P] [US5] `e2e/a11y.spec.ts`: axe scan of a shell page + `/_gallery` → **zero serious/critical** violations (SC-004, AS3).
- [ ] T047 [P] [US5] `e2e/a11y.spec.ts`: every interactive element (nav item, button, menu trigger) shows a visible focus indicator (≥3:1) on keyboard focus (FR-019, AS1).
- [ ] T048 [P] [US5] `e2e/reduced-motion.spec.ts`: with `emulateMedia({ reducedMotion: 'reduce' })`, decorative glow/pulse/transition animations are suppressed and the shell/primitives stay operable (SC-006, AS2).

### Implementation for User Story 5

- [ ] T049 [US5] Ensure a **token-driven focus-visible ring** (`--ring`) is applied consistently across shell + primitives (base layer or per-component `focus-visible:` utilities) (FR-019).
- [ ] T050 [US5] Gate all decorative animation behind `motion-safe:` (and add `motion-reduce:` fallbacks) so the reduced-motion suite passes; confirm the global reset covers stragglers (FR-020, SC-006).
- [ ] T051 [US5] Resolve any axe findings from T046 (labels, roles, landmark, contrast) to reach zero serious violations (SC-004).

**Checkpoint**: the accessibility + motion floor is verified across the system.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T052 [P] Run the full [quickstart.md](./quickstart.md) SC-001…SC-010 suite green; wire the Playwright + axe suite as a CI gate.
- [ ] T053 [P] Confirm `next build`, `tsc --noEmit`, and ESLint (incl. the no-raw-hex guard) pass; confirm Geist fonts fully removed and no unused scaffold assets remain.
- [ ] T054 [P] Verify SC-010 composability: build a throwaway stub screen from only `AppShell` + primitives + semantic tokens and confirm it renders in both orientations, then remove it.
- [ ] T055 Update `STATUS.md` (Feature 3 → built; app shell + design system live) and `CHANGELOG.md` (tokens, shell, primitives, brand); queue a devlog news note per the repo's "code push → news" convention (once the News system ships).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **blocks all user stories** (tokens/fonts/resets).
- **US1 (P3)** → depends on Foundational; the MVP (the tokens themselves).
- **US2 (P4)** → depends on Foundational + US1 (consumes surface/faction/type tokens); the P7 deliverable. Styles chrome with tokens directly; adopts US3 `Button` in T038.
- **US3 (P5)** → depends on Foundational + US1; largely parallel to US2 (different files). T038 (shell refactor) depends on US2 + the primitives.
- **US4 (P6)** → depends on Foundational + US1 (tokens/faction); T044 updates the shell's Logo.
- **US5 (P7)** → depends on US2–US4 existing (it audits/hardens them).
- **Polish (P8)** → depends on all desired stories.

### Within a story

Tests (Playwright/axe) first → tokens/components → gallery wiring → shell integration. Commit
after each task or logical group (Principle IX).

### Parallel opportunities

- Setup: T003–T006 in parallel.
- Foundational: T007→T008→T009 are sequential (same file `globals.css`); T010 follows; T011/T012 (`layout.tsx`) parallel to nothing else in the file but independent of the CSS.
- US1 tests T013–T015 in parallel.
- US2 tests T019–T022 in parallel; then components T023/T024 parallel, T025/T026 sequential.
- US3 primitives T031–T036 all `[P]` (distinct files); T037 after; T038 after US2.
- US4 T042/T043 parallel; US5 tests T046–T048 parallel.
- **US3 and US2 can be worked in parallel** once Foundational + US1 are done (different files),
  reconverging at T038.

---

## Implementation Strategy

### MVP first (US1 → US2)

Setup → Foundational → **US1** (tokens, fidelity + contrast green) → **US2** (shell, both
orientations green). At that point the app has a real, verified visual foundation and a P7-
compliant shell — the shippable core the screen features plug into.

### Incremental delivery

US1 (tokens) → US2 (responsive shell) → US3 (primitives) → US4 (game visual layer) → US5
(a11y/motion hardening). Each adds value without breaking prior stories; the feature is "done"
when quickstart's SC-001…SC-010 are green and `next build`/typecheck/lint pass.

---

## Notes

- `[P]` = different files, no incomplete-task dependency. `globals.css` edits (T007–T010) are
  **not** `[P]` with each other (same file).
- **P7 is the spine**: any shell/nav change must preserve the two-co-equal-chromes + no-overflow
  + safe-area guarantees (SC-001, SC-005) — verify at 360px *and* 1440px, never just one.
- **No raw brand hex** outside `app/globals.css` (SC-002) — the lint guard (T004) enforces it;
  every consumer binds to a semantic token.
- Storybook/Chromatic are **deferred** (research D1) — the `/_gallery` route is the isolation
  surface for v1; recommend Storybook as a fast-follow only if the primitive count grows.
