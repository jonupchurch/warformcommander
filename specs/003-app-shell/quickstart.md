# Quickstart: App Shell + Design System

**Feature**: `003-app-shell` | **Plan**: [plan.md](./plan.md)

Build, run, and **verify** the design system + shell. Each check maps to a Success Criterion
(SC) in [spec.md](./spec.md). "Done" = every check green + `next build` + typecheck clean
(constitution **Principle V**), across the viewport matrix.

## Prerequisites

- Node + npm (repo standard). Next.js 16 app at repo root (existing).
- `npx playwright install` (browsers) if not already present.

## Build & run

```bash
npm run dev            # dev server — visit /_gallery for the token + component gallery
npm run build          # next build — MUST pass (RSC boundary + Turbopack)
npm run typecheck      # or tsc --noEmit — clean
npm run lint           # ESLint clean (incl. the "no raw brand hex" convention check)
```

## First-run setup (one-time, in tasks)

```bash
npx shadcn@latest init        # cssVariables:true, rsc:true, aliases @/components @/lib/utils
                              # npm + React 19 → choose --legacy-peer-deps when prompted (research B3)
npx shadcn@latest add button dropdown-menu dialog sheet
```

## Verification — Success Criteria → checks

| SC | What | How to verify |
|---|---|---|
| **SC-001** | Both orientations, no horizontal scroll, destinations reachable | Playwright: load a shell page at **320**, **360×640**, **1440×900**, **ultra-wide**; assert `document.scrollingElement.scrollWidth <= clientWidth` (no h-scroll) and each of Garage/Arena/Ladder/Practice is clickable in ≤1 interaction. |
| **SC-002** | Token fidelity + no raw hex | Gallery: assert `getComputedStyle` of token swatches equals the Brand Foundation values (`#2ad4ff`, `#ff3b4e`, `#06080b`, `#0b0f15`, `#eef3f8`…). Lint/grep: no brand hex literal in `src/components/**` or `app/(app)/**` (only `globals.css` holds hex). |
| **SC-003** | WCAG AA contrast | `@axe-core/playwright` `color-contrast` rule on `/_gallery` + a shell page → zero violations; cross-check the approved-pairings table in [contracts/design-tokens.md](./contracts/design-tokens.md). |
| **SC-004** | Accessibility | axe scan (serious/critical = 0); tab through the shell → every interactive element focus-visible; assert nav `<nav aria-label>` landmark + skip-to-content link present. |
| **SC-005** | Nav chrome switch | Playwright: at ≥`lg` assert the top-tab nav is visible and the bottom bar hidden; below `lg` assert the bottom tab bar visible and top-tab hidden; exactly one item has `aria-current="page"` per route. |
| **SC-006** | Reduced motion | `page.emulateMedia({ reducedMotion: 'reduce' })` → assert decorative glow/pulse animations are suppressed (computed `animation`/`transition` ≈ none) and the UI is still fully operable. |
| **SC-007** | shadcn on-brand | Add a stock shadcn component to `/_gallery`; assert it renders with the app's `--primary`/`--background`/`--border` (cyan/void/steel) and has **no** per-component color className override. |
| **SC-008** | UnitIcon faction tint | Render all 7 `UnitIcon` types under `text-faction-friendly` and `text-faction-enemy`; assert the inlined SVG's resolved stroke/`currentColor` is `#2ad4ff` vs `#ff3b4e`; assert no `type`-specific color is hardcoded. |
| **SC-009** | No font CLS + brand favicon | Lighthouse/Playwright CLS on the shell page ≈ 0 attributable to fonts (next/font self-hosted); assert `<link rel="icon">`/metadata resolve to the Warform mark, not the Next default. |
| **SC-010** | Composability | Build a throwaway stub screen using only `AppShell` + exported primitives + semantic tokens (no bespoke chrome, no raw hex) and confirm it renders correctly in both orientations. |

## Manual golden path

1. `npm run dev` → open `/` (minimal shell placeholder) on a desktop width → Warform header,
   top-tab nav, dark void/panel surfaces, Archivo Expanded headings.
2. Resize to ~360px (or device toolbar, portrait) → nav becomes the bottom tab bar within thumb
   reach; no horizontal scroll; content clears the safe area.
3. Open `/_gallery` → every token swatch, type step, and primitive variant renders; toggle the
   OS "reduce motion" setting → glows stop, UI still works.
4. Tab through with the keyboard → visible cyan focus ring on every control; skip-to-content
   works.

## Done checklist

- [ ] `next build`, typecheck, lint clean.
- [ ] SC-001..010 checks green (Playwright + axe suite).
- [ ] `/_gallery` shows the full token + primitive set; no raw brand hex outside `globals.css`.
- [ ] Warform favicon/metadata replace the scaffold defaults; Geist fonts removed.
- [ ] STATUS.md / CHANGELOG.md updated (Feature 3 → built); a devlog news note queued per the
      repo's "code push → news" convention (once News ships).
