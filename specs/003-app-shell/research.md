# Research: App Shell + Design System

**Feature**: `003-app-shell` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

Resolves the technical unknowns behind the spec: how to express the Brand Foundation as
Tailwind v4 tokens, whether shadcn/ui fits Tailwind v4 + Next.js 16, and how to build a
shell that is *co-equally* first-class in mobile portrait and desktop landscape (constitution
**P7**). Format per decision: **Decision / Rationale / Alternatives considered**, sources
cited inline. Everything is grounded in what the committed mockups in
[`reference/`](../../reference/) actually show.

The unknowns cluster into three workstreams — **(A) Tailwind v4 CSS-first theming**,
**(B) shadcn/ui on Tailwind v4 + Next 16**, and **(C) the co-equal responsive shell**.

---

## Workstream A — Tailwind v4 CSS-first theming & the token pipeline

### A1. Token definition → **CSS-first `@theme` in `app/globals.css`, no `tailwind.config.js`**

- **Decision**: Define all tokens in `app/globals.css` via the **`@theme` directive** (not a
  JS config). Namespaced names (`--color-*`, `--font-*`, `--text-*`, `--spacing`, `--radius-*`,
  `--shadow-*`, `--breakpoint-*`, `--ease-*`) each generate **both** a CSS custom property
  **and** the matching utility class (`bg-*`, `text-*`, `font-*`, `p-*`, `rounded-*`, …).
- **Rationale**: In v4 "theme variables aren't *just* CSS variables — they also instruct
  Tailwind to create new utility classes." This gives us `bg-surface-panel`,
  `text-faction-friendly`, `font-display`, etc. with IntelliSense and opacity modifiers
  (`bg-surface-panel/80`) for free, while the same value is readable in hand-written CSS as
  `var(--color-surface-panel)`. The existing scaffold already uses this shape
  ([`app/globals.css`](../../app/globals.css) has `@import "tailwindcss"` + an `@theme inline`
  block) — we extend it, not replace the approach.
- **Alternatives considered**: *Keep a `tailwind.config.js`* (still possible via `@config`) —
  rejected: legacy path, loses automatic CSS-var emission, fights the shadcn v4 convention.
  *All tokens in `:root` only* — rejected: yields CSS vars but **no utilities**, defeating
  Tailwind. v4 also drops the `content` array (automatic detection; extra sources via
  `@source`).
- Sources: [Tailwind v4 theme docs](https://tailwindcss.com/docs/theme),
  [functions & directives](https://tailwindcss.com/docs/functions-and-directives),
  [Tailwind v4 blog](https://tailwindcss.com/blog/tailwindcss-v4).

### A2. Two-tier tokens → **primitive `@theme` + semantic `:root` mapped via `@theme inline`**

- **Decision**: Structure tokens in the two tiers the spec mandates (FR-002):
  1. **Primitive tokens** in a plain `@theme { … }` block — the raw Warform palette and scales
     (`--color-cyan-500: #2ad4ff`, `--color-void: #06080b`, the surface ramp, `--spacing`,
     `--radius-lg`, the glow `--shadow-*`, `--breakpoint-*`).
  2. **Semantic tokens** as bare vars in `:root` (`--surface-panel`, `--border`, `--text-body`,
     `--faction-friendly`, `--zone-front`, `--family-kinetic`, …), then published into
     Tailwind's color namespace with **`@theme inline`**:
     ```css
     :root { --faction-friendly: var(--color-cyan-500); --zone-front: var(--color-cyan-500); }
     @theme inline { --color-faction-friendly: var(--faction-friendly);
                     --color-zone-front: var(--zone-front); }
     ```
- **Rationale**: A **non-inline** `@theme` *bakes the value into the generated utility at
  build time*; `@theme inline` instead emits `.bg-faction-friendly { background-color:
  var(--faction-friendly) }`, **deferring resolution to use time** so the cascade (and any
  future theme selector) wins. This is exactly the mechanism that lets a *semantic* role be
  re-pointed centrally. It also directly enables the spec's FR-002 requirement that colliding
  roles (**friendly = kinetic = front = cyan**) stay **distinct named tokens** that resolve to
  the same primitive today but can diverge tomorrow — each is its own `@theme inline` line
  over its own `:root` var. This is the *deliberate greenfield convention* (Principle III).
- **Alternatives considered**: *Semantic colors in a plain `@theme`* — rejected: values bake at
  build time, so a later central re-point (or a second theme) silently wouldn't reach already-
  inlined utilities. `@theme inline` is the specific fix for that trap.
- Sources: [Tailwind theme — `inline` option](https://tailwindcss.com/docs/theme),
  [functions & directives](https://tailwindcss.com/docs/functions-and-directives).

### A3. Color format → **keep brand hex for fidelity; accept shadcn's oklch base alongside**

- **Decision**: Author the **Warform brand tokens as the exact hex values from the mockups**
  (`#2ad4ff`, `#ff3b4e`, `#06080b`, `#0b0f15`, `#eef3f8`, …) — the source of truth (SC-002).
  Let shadcn's own base tokens (`--background`, `--primary`, `--border`, `--ring`, …) keep
  their generated **oklch** values; the two coexist in the same file (they occupy different
  names). Where a shadcn base token should *be* a brand color (e.g. `--primary` = cyan,
  `--background` = void), point it at the brand var.
- **Rationale**: SC-002 requires computed values to match the mockups exactly; hex is the
  legible, unambiguous way to hit that and to review it. Tailwind v4 `@theme` accepts any CSS
  color, so hex and oklch mix freely. (oklch is preferable for *programmatic* palette
  generation, which we don't need — our palette is hand-authored from the mockups.)
- Sources: [Tailwind theme docs](https://tailwindcss.com/docs/theme),
  [shadcn theming](https://ui.shadcn.com/docs/theming).

### A4. Dark mode → **dark-only for v1; structure for a future theme via `@custom-variant`**

- **Decision**: Ship **dark-only** (FR-021 — the mockups are the sole aesthetic). Do **not**
  branch tokens on theme now. But keep the semantic layer (A2) so a theme *could* be added by
  introducing a `.dark`/`[data-theme]` block and a `@custom-variant dark (&:where(.dark, .dark
  *))` later — with **zero consumer edits**. Set `color-scheme: dark` so form controls/
  scrollbars render dark.
- **Rationale**: Building/maintaining a light theme is out of scope and unbacked by any
  mockup; but the `@theme inline`-over-`:root` structure makes a later theme a central change,
  satisfying FR-021 cheaply. The current scaffold's `@media (prefers-color-scheme: dark)` block
  and light `:root` defaults are **removed** (they encode a light theme we don't want).
- Sources: [Tailwind dark mode](https://tailwindcss.com/docs/dark-mode),
  [Tailwind theme docs](https://tailwindcss.com/docs/theme).

### A5. Fonts → **`next/font/google` for Archivo, Archivo Expanded, Space Mono → font tokens**

- **Decision**: Load the three brand families via `next/font/google` in
  [`app/layout.tsx`](../../app/layout.tsx) exposing CSS variables — `Archivo` →
  `--font-sans`, `Archivo_Expanded` → `--font-display`, `Space_Mono` (weights 400/700) →
  `--font-mono` — and wire them into `@theme` font tokens (`--font-display`, `--font-sans`,
  `--font-mono`). Replace the scaffold's Geist/Geist_Mono. Each has a system fallback in the
  token.
- **Rationale**: `next/font` self-hosts and preloads, giving ~zero font-swap layout shift
  (SC-009) — no runtime Google Fonts request (the mockups' `<link>` to fonts.googleapis is a
  prototyping shortcut we don't ship). `Archivo Expanded` is a **distinct Google family**
  (`Archivo_Expanded` in `next/font/google`), not a width axis of `Archivo` — it must be
  imported separately. Matches [`stacks/nextjs.md`](../../stacks/nextjs.md) ("fonts via
  next/font").
- Sources: [next/font](https://nextjs.org/docs/app/api-reference/components/font),
  [Google Fonts: Archivo Expanded](https://fonts.google.com/specimen/Archivo+Expanded).

### A6. Namespace → utility cheat-sheet (for the token authors)

`--color-*` → `bg-/text-/border-/fill-`; `--font-*` → `font-*`; `--text-*` → font-size (+ optional
line-height); `--font-weight-*`, `--tracking-*`, `--leading-*`; `--spacing` → the whole
`p-/m-/gap-/w-/h-` scale via `calc(var(--spacing) * n)`; `--radius-*` → `rounded-*`; `--shadow-*`
→ `shadow-*`; `--breakpoint-*` → responsive variants; `--container-*` → `@container` sizes;
`--ease-*`/`--animate-*` → motion. Reset a scale with `--namespace-*: initial`.
Source: [Tailwind theme docs](https://tailwindcss.com/docs/theme).

---

## Workstream B — shadcn/ui on Tailwind v4 + Next.js 16 / React 19

### B1. Adopt shadcn/ui → **`npx shadcn@latest init`, `cssVariables: true`, owned source**

- **Decision**: Use shadcn/ui as the accessible-primitive layer under the Warform design
  system. Run `npx shadcn@latest init` with `cssVariables: true`. shadcn owns the base semantic
  tokens (`--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`,
  `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--chart-*`, `--sidebar-*`) in
  `:root` + `@theme inline`; we **append the Warform game tokens into the same blocks** and
  **re-point the base tokens at brand values** so shadcn components render on-brand.
- **Rationale**: shadcn's Tailwind-v4 + React-19 support is **shipped and documented as
  non-breaking** ("All components are updated for Tailwind v4 and React 19"). It copies source
  into the repo (`@/components/ui/*`) — no hidden abstraction to break under Next 16, and every
  component is editable to match the mockups (our buttons, panels, chips are *styled shadcn or
  bespoke-on-the-same-tokens*, our call per component). Its convention (oklch CSS vars,
  `:root`/`@theme inline`, `cn()`) is *identical* to Workstream A, so one token file serves
  both. This is the greenfield "establish conventions deliberately" call (Principle III).
- **What `init` produces**: `components.json` (`cssVariables: true`, `rsc: true`, aliases
  `@/components`, `@/lib/utils`), the `globals.css` token structure, `lib/utils.ts` with
  `cn()` (= `twMerge(clsx(...))` so caller overrides win), and `tw-animate-css` (replaces the
  deprecated `tailwindcss-animate`). Components are React-19-native: no `forwardRef`,
  `data-slot` attributes, `size-*` utilities.
- **Alternatives considered**: *`cssVariables: false`* (raw utility theming, `bg-zinc-950
  dark:bg-white`) — rejected: far harder to retheme a faction-colored game; semantic tokens
  are the point. *Radix directly / Park UI / DaisyUI* — Radix still sits *under* shadcn; the
  others don't match the exact `@theme inline` convention we're adopting. *Hand-roll all
  primitives* — rejected: high cost, and the token layer already gives design ownership without
  rebuilding accessible menus/dialogs/focus management.
- Sources: [shadcn Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4),
  [shadcn theming](https://ui.shadcn.com/docs/theming),
  [components.json](https://ui.shadcn.com/docs/components-json).

### B2. Custom tokens coexisting with shadcn → **same three blocks, no conflict**

- **Decision**: Add game semantics exactly like shadcn's own "add a token" recipe:
  ```css
  :root       { --faction-friendly: #2ad4ff; }
  @theme inline { --color-faction-friendly: var(--faction-friendly); }
  ```
  → `bg-faction-friendly` sits alongside `bg-primary`, both first-class. The primitive Warform
  palette (`@theme { --color-cyan-500: #2ad4ff }`) coexists by occupying different names.
- **Rationale**: Identical mechanism ⇒ zero conflict; shadcn documents this exact pattern.
- Sources: [shadcn theming](https://ui.shadcn.com/docs/theming).

### B3. React 19 / npm gotcha → **install flag, or prefer pnpm/bun**

- **Decision**: Note the peer-dep hazard: on **npm** with React 19, some Radix deps still
  declare React 16–18 peers, so `shadcn add` may need `--legacy-peer-deps` (the CLI now
  *prompts* for the choice). STATUS.md pins **npm**, so document the flag; **pnpm/bun/yarn
  need none** — flag pnpm as the friction-free option if the repo ever reconsiders.
- **Rationale**: Avoids a first-run install failure; keep `rsc: true` (shadcn interactive
  primitives already carry `"use client"`).
- Sources: [shadcn React 19](https://ui.shadcn.com/docs/react-19),
  [shadcn-ui/ui#5557](https://github.com/shadcn-ui/ui/issues/5557).

---

## Workstream C — The co-equal responsive shell (P7)

### C1. Strategy → **one shell, two first-class nav chromes; macro = media, micro = container**

- **Decision**: Build **one shell that renders two navigation chromes**, both present in the
  DOM and toggled with CSS breakpoint utilities (not JS): a **bottom tab bar in mobile
  portrait** and a **top-tab (or sidebar) nav in desktop landscape**. Use **media/breakpoint
  queries for the macro switch** (which chrome shows, page column count) and **container
  queries (`@container`) for micro layout** (how a panel/card re-flows independent of the
  viewport). The mockups' in-app nav (GARAGE · ARENA · LADDER · PRACTICE) maps directly onto
  this: the desktop top-tab is drawn in the Garage/Arena mockups; the **bottom-tab is the
  co-equal portrait design this feature originates** (no mockup shows it — P7 obligation).
- **Rationale**: web.dev's "new responsive" prescribes exactly this split — media queries
  "adjust the global/macro styles," container queries "adjust the container's children."
  Rendering both chromes and toggling with `hidden lg:flex` / `lg:hidden` means each is
  *authored for its form factor* rather than one degraded from the other — the literal P7
  requirement. Container queries are stable/Baseline (Chrome/Edge 105+, FF 110+, Safari 16+)
  and first-class in Tailwind v4 (`@container`, `@sm/@md/@lg`, `@max-*`, named containers) with
  **no plugin**.
- **Alternatives considered**: *A single fluid nav that morphs across all widths* — rejected:
  compromises both form factors; the spec treats them as co-equal. *Container queries for the
  shell nav switch itself* — wrong tool: the shell chrome depends on the **viewport**, not a
  parent's size; reserve `@container` for reusable inner panels. *JS `matchMedia` conditional
  render* — rejected: hydration cost + CLS risk; CSS toggling is SSR-safe and flash-free.
- Sources: [web.dev — new responsive](https://web.dev/articles/new-responsive),
  [web.dev — container queries stable](https://web.dev/blog/cq-stable),
  [Tailwind responsive design](https://tailwindcss.com/docs/responsive-design).

### C2. Breakpoint choice → **switch on width (`lg`), not `orientation`**

- **Decision**: Select the chrome on a **width breakpoint** (Tailwind `lg`, ~64rem), not the
  `orientation:` media feature. Mobile-first: unprefixed = portrait/mobile default, `lg:` =
  desktop-landscape.
- **Rationale**: A small phone in *landscape* should still get the thumb-reachable bottom bar,
  not the desktop sidebar; `orientation` would wrongly promote it. Width-based switching treats
  "mobile-portrait" and "desktop-landscape" as **size classes**, which is the intent. (`min-h`
  and content behavior can still consult orientation where genuinely needed.)
- Sources: [Tailwind responsive design](https://tailwindcss.com/docs/responsive-design),
  [MDN @media orientation](https://developer.mozilla.org/en-US/docs/Web/CSS/@media).

### C3. Height → **`dvh`/`svh`, never `100vh`**

- **Decision**: Shell root uses `min-h-dvh`; where a fixed full-height region is needed use
  **`svh`** (smallest viewport) as the safe default. Never `100vh`.
- **Rationale**: `100vh` overflows under mobile browser chrome. `svh` = UI-expanded height
  (never overflows — safest); `lvh` = UI-hidden (can be obscured); `dvh` adapts live but can
  jank while scrolling. Use `svh` for safety-first full-height, `dvh` when live adaptation is
  worth it. (Bare `vh` currently == `lvh`.)
- Sources: [MDN length / viewport units](https://developer.mozilla.org/en-US/docs/Web/CSS/length),
  [MDN @media](https://developer.mozilla.org/en-US/docs/Web/CSS/@media).

### C4. Mobile chrome → **`env(safe-area-inset-*)` + `viewport-fit=cover`**

- **Decision**: Pad the fixed top/bottom bars and content with `env(safe-area-inset-*)`
  (with a `, 0px` fallback), and set `viewport-fit=cover` — in Next 16 via the `viewport`
  export (`viewportFit: "cover"`). Optionally expose `--spacing-safe-b/-t` tokens for
  `pb-safe-b`/`pt-safe-t` utilities.
- **Rationale**: Keeps the bottom tab bar off the iOS home indicator and content out from
  under notches. Insets are **0 on desktop**, so the same rule is harmless there and correct on
  mobile. `viewport-fit=cover` is required for insets to be non-zero. Caveat: iOS doesn't
  update the bottom inset for the expanded tab-bar toolbar, so pair it with `dvh`/`svh` sizing,
  not as the sole bottom spacing.
- Sources: [MDN env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env),
  [Next viewport export](https://nextjs.org/docs/app/api-reference/functions/generate-viewport).

### C5. Motion → **`prefers-reduced-motion` global reset + `motion-safe:`/`motion-reduce:`**

- **Decision**: Add a defensive global `@media (prefers-reduced-motion: reduce)` reset (near-
  zero animation/transition durations, `scroll-behavior:auto`) and gate the signature cyan
  glows/pulses with Tailwind's `motion-safe:`/`motion-reduce:` variants (FR-020, SC-006).
- **Rationale**: The brand leans on animated glow/pulse accents; those are decorative and must
  not fire for motion-sensitive users, while essential feedback (focus, state) stays. The base
  reset catches anything a variant misses.
- Sources: [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion),
  [Tailwind responsive/variants](https://tailwindcss.com/docs/responsive-design).

### C6. Server/client boundary → **shell is a Server Component; nav interactivity pushed down**

- **Decision**: The shell layout (`app/(app)/layout.tsx`) is a **Server Component**; only the
  interactive bits (active-tab detection via `usePathname`, mobile menu toggles, dropdowns)
  are small `"use client"` leaves. Active-route styling uses `next/navigation`'s `usePathname`
  in the nav leaf; links use `next/link`.
- **Rationale**: Matches [`stacks/nextjs.md`](../../stacks/nextjs.md) (Server Components by
  default; push client boundaries down). Keeps the chrome cheap and SSR-safe (no layout flash).
- Sources: [`stacks/nextjs.md`](../../stacks/nextjs.md),
  [Next.js layouts](https://nextjs.org/docs/app/api-reference/file-conventions/layout).

---

## Workstream D — Component isolation & visual testing

### D1. Primitive isolation → **an in-app `/_gallery` route now; Storybook optional/deferred**

- **Decision**: Ship a lightweight **in-app component gallery route** (dev-only /
  noindex) that renders every primitive + variant and a token reference — the surface the
  US1/US3/US5 tests and manual review target. **Do not** add Storybook in this feature;
  *recommend* it (with Chromatic visual-regression) as a fast-follow if the component count
  grows.
- **Rationale**: A gallery route needs zero new build tooling, runs inside the real Next/
  Tailwind pipeline (so it tests the *actual* token resolution, not a Storybook mock), and is
  directly drivable by Playwright for the viewport/contrast/reduced-motion checks. Storybook is
  real value later but is scope the foundation doesn't need yet (Principle IV) — named as
  future work, not folded in.
- **Alternatives considered**: *Storybook now* — rejected for this feature: extra toolchain +
  config surface for a system that currently has ~8 primitives; the gallery route covers the
  need. *No isolation surface* — rejected: the primitives need a place to be tested and
  reviewed independently (US3/US5 Independent Tests).
- Sources: [Playwright](https://playwright.dev/),
  [axe-core](https://github.com/dequelabs/axe-core).

### D2. Automated a11y/viewport testing → **Playwright + `@axe-core/playwright`**

- **Decision**: Use **Playwright** (already the repo's e2e tool per STATUS.md / Principle VIII)
  with `@axe-core/playwright` for the SC-001/003/004/005/006 checks: viewport matrix
  (320 / 360×640 / 1440×900 / ultra-wide), no-horizontal-scroll assertions, nav-chrome-switch
  assertions, axe scans (zero serious violations, contrast), focus-visible checks, and an
  emulated `prefers-reduced-motion` run.
- **Rationale**: One tool covers responsive layout *and* accessibility; matches the repo's
  chosen stack; runs against the real app.
- Sources: [axe-core/playwright](https://www.npmjs.com/package/@axe-core/playwright),
  [Playwright emulation (reduced motion / viewport)](https://playwright.dev/docs/emulation).

---

## Cross-cutting decisions (summary for plan.md Technical Context)

| Area | Decision |
|---|---|
| **Token pipeline** | Tailwind v4 CSS-first `@theme` in `app/globals.css`; **primitive `@theme` + semantic `:root` via `@theme inline`** (deferred resolution) |
| **Color format** | Brand tokens as **hex from the mockups** (SC-002); shadcn base tokens keep oklch; base tokens re-pointed at brand vars |
| **Theme** | **Dark-only v1**; structured (semantic layer + `@custom-variant` ready) for a future theme with no consumer edits |
| **Fonts** | `next/font/google`: Archivo (`--font-sans`), Archivo Expanded (`--font-display`), Space Mono (`--font-mono`); replaces Geist |
| **Component layer** | **shadcn/ui** (`shadcn@latest init`, `cssVariables:true`, owned source, `cn()`); game tokens appended to the same `:root`/`@theme inline` blocks |
| **npm caveat** | React-19 peer-deps → `--legacy-peer-deps` on `shadcn add` (npm); pnpm/bun need none |
| **Responsive shell** | One shell, **two co-equal chromes** — bottom-tab (portrait) / top-tab (landscape); toggle via `lg:` utilities; **media = macro, `@container` = micro** |
| **Breakpoint** | Switch on **width (`lg`)**, not `orientation` |
| **Height / safe area** | `min-h-dvh` / `svh` (never `100vh`); `env(safe-area-inset-*)` + `viewport-fit=cover` |
| **Motion** | `prefers-reduced-motion` global reset + `motion-safe:`/`motion-reduce:` on decorative glow |
| **Boundary** | Shell = Server Component; interactive nav = small `"use client"` leaves (`usePathname`) |
| **Isolation / testing** | In-app `/_gallery` route (Storybook deferred/recommended); Playwright + `@axe-core/playwright` for SC-001/003/004/005/006 |

All spec unknowns (Tailwind v4 theming, shadcn compatibility, co-equal responsive strategy,
token/component structure) are resolved. No unresolved unknowns remain for Phase 1.
