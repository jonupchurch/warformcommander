# Feature Specification: App Shell + Design System

**Feature Branch**: `003-app-shell`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "App Shell + Design System — the shared chrome and visual foundation every other screen (Garage, Arena, Ladder, Profile, Battle Playback/Summary, News, Admin) is built on. Design tokens from the Brand Foundation, a responsive nav/layout shell that is first-class in both mobile portrait and desktop landscape (P7), the core reusable UI primitives screens share, and the brand/logo assets. NOT the individual screens' content."

## Overview

This feature is the **visual and structural foundation of the web app** — the design
tokens, the responsive application shell (header + navigation + page scaffolding), the
reusable UI primitives, and the brand assets that **every** later screen composes. It is
the UI counterpart to Feature 1: where Feature 1 is the single data model the sim, Garage,
and balancer all read (constitution **P8**), Feature 3 is the single *visual* source of
truth the Garage (Feature 4), Battle Playback (5), Battle Summary (6), Arena (8), Ladder
(9), Profile (10), Marketing site (11), and Admin console (12) all render inside.

It is built now — third in the foundation-first order, ahead of every screen feature —
because a design system established *after* screens exist is a rewrite. This is greenfield
design-system work: per constitution **Principle III**, the conventions are established
*deliberately here* and then held to. Every token, primitive, and layout decision is
**derived from the committed mockups** in [`reference/`](../../reference/) — the
`.dc.html` files are the source of truth for the visual language, not generic assumptions.

The value it delivers: **a player can navigate the whole app and it feels native in both
hand and on a wide monitor (P7); a developer can build any screen by composing tokens and
primitives instead of reinventing them.** The mockups themselves prove the system works —
every one of them is drawn from this vocabulary (the two-wedge Warform mark, the cyan/red
faction split, the `Space Mono` readouts, the panel-on-void surfaces, the corner-bracket
frames, the `UnitIcon` referenced as `dc-import name="UnitIcon"` in Garage and Arena).

**Two shells, one system.** The mockups reveal two distinct navigation chromes built on the
*same* tokens and primitives: an **authenticated app shell** (top tabs **GARAGE · ARENA ·
LADDER · PRACTICE**, commander identity + avatar, `PROFILE` via the avatar — used by Garage,
Arena, Ladder, Practice, Profile, Battle Playback, Battle Summary) and a **public marketing
shell** (Overview · News · Roadmap · Community + Wishlist — used by Home, News, Content
Page). **Feature 3 owns the design system, the app shell, and the shared brand primitives
(logo, header, footer) that both chromes compose.** The marketing shell's *specific nav
content* is Feature 11; it reuses this system's primitives.

## User Scenarios & Testing *(mandatory)*

The "user" here is two-sided: a **player** navigating the app across both orientations, and
a **developer** building screens on top of the system. Stories are prioritized so that
implementing US1 alone already yields a usable, shippable foundation.

### User Story 1 - Design tokens as the single visual source of truth (Priority: P1)

A developer styles anything in the app by referencing **named design tokens** — colors,
type, spacing, radii, elevation, motion — defined *once* from the Brand Foundation as
Tailwind v4 CSS-first `@theme` variables, available as both CSS custom properties and
utility classes. Changing a token (e.g. re-tuning the friendly cyan) updates every screen
that used it, because nothing hardcodes a raw hex.

**Why this priority**: The tokens are the atoms every other story and every later feature
builds from — the shell, the primitives, and all twelve screen features bind to them. Get
them wrong and every screen inherits the mistake. Co-equal P1 with US2; it is the layer US2
and US3 stand on. Even alone it is shippable value: the existing scaffold's placeholder
palette is replaced by the real, WCAG-checked Warform token system.

**Independent Test**: Render a token gallery/reference page; assert the computed color/type/
spacing values equal the Brand Foundation mockup values, that semantic tokens resolve to
their intended primitives, and that text-on-surface pairings meet WCAG AA — with no engine,
shell, or screen needed.

**Acceptance Scenarios**:

1. **Given** the Brand Foundation palette, **When** the theme is defined, **Then** each documented color (friendly `#2ad4ff`, enemy `#ff3b4e`, surfaces `#06080b`/`#0b0f15`, text `#eef3f8`/`#c4ccd6`/`#8b97a6`, accents `#ff8c1a`/`#7b5cff`) exists as a named token and its computed value matches the mockup exactly.
2. **Given** a semantic token (e.g. `--color-surface-panel`, `--color-faction-friendly`, `--color-zone-front`), **When** it is consumed, **Then** it resolves to its intended primitive and can be re-pointed without editing consumers.
3. **Given** the three brand typefaces (Archivo Expanded display, Archivo body/UI, Space Mono labels/readouts), **When** a heading, body paragraph, and stat label are rendered, **Then** each uses the correct family/weight/size/tracking token from the type scale and fonts load without a layout-shifting swap.
4. **Given** any body-or-UI text token placed on its intended surface token, **When** contrast is measured, **Then** it meets WCAG AA (≥4.5:1 normal text, ≥3:1 large text and UI/focus indicators).

---

### User Story 2 - A responsive app shell, first-class in both orientations (Priority: P1)

A player opens the app on a phone in portrait and on a desktop in landscape and, in *both*,
gets a shell that feels made for that device — not one grudgingly adapted from the other
(constitution **P7**). On desktop landscape: the sticky top bar with the Warform mark, the
primary tab nav (GARAGE · ARENA · LADDER · PRACTICE), and the commander identity + avatar,
above a full-height page area. On mobile portrait: the same destinations presented as a
persistent **bottom tab bar** within thumb reach, a compact top bar, and a content area that
respects safe-area insets. Primary destinations are reachable, the active destination is
unmistakable, and nothing overflows horizontally at any supported width.

**Why this priority**: This is the headline constitutional deliverable of the feature — **P7
(Both Platforms First-Class) is never-satisfied-by-adaptation**. Every screen feature plugs
into this shell; if the shell isn't co-equal in both orientations, all twelve inherit a
second-class platform. Co-equal P1 with US1.

**Independent Test**: Render the shell wrapping a stub page and drive it with Playwright at
360×640 (portrait) and 1440×900 (landscape), plus 320px min and an ultra-wide width; assert
no horizontal scroll, every primary destination reachable in ≤1 interaction, correct
active-state, and that the nav presentation switches (bottom-tab ↔ top-tab) at the defined
breakpoint.

**Acceptance Scenarios**:

1. **Given** desktop landscape (≥ the shell's `lg` breakpoint), **When** the shell renders, **Then** the primary destinations appear as a horizontal top-tab nav with the Warform mark and commander/avatar block, and the active destination is highlighted (cyan fill, dark text) per the Garage/Arena mockups.
2. **Given** mobile portrait (< the breakpoint), **When** the shell renders, **Then** the primary destinations appear as a fixed bottom tab bar within thumb reach, the top bar is compacted, and content does not sit under the bar or the device safe-area.
3. **Given** any supported viewport from 320px to ultra-wide, **When** any shell-wrapped page renders, **Then** there is no horizontal page scroll and content stays within safe margins.
4. **Given** a destination is active, **When** the shell renders on either orientation, **Then** exactly one nav item shows the active treatment and it is programmatically marked current (e.g. `aria-current`).
5. **Given** a keyboard-only or screen-reader user, **When** they traverse the shell, **Then** every destination is reachable and operable, focus is visible, and the nav exposes an accessible landmark/label.

---

### User Story 3 - A core UI primitive kit screens compose (Priority: P2)

A developer builds a screen by assembling **reusable primitives** rather than bespoke
markup: buttons (primary cyan-glow / secondary outline / ghost), cards and panels (the
`#0b0f15`-on-void surface with hairline steel border), section eyebrow labels (the `NN //
LABEL` mono label with a fading rule), chips/tags (mono uppercase, colored border+text),
stat bars (track + cyan-gradient fill), and menus/dropdowns/dialogs. The primitives are
shadcn/ui-ready and establish the component conventions (file location, naming, variant
API, the `cn()` class-merge helper) the whole codebase follows.

**Why this priority**: These are the recurring atoms every screen in the mockups is built
from (the Garage stat bars and loadout rows, the Arena matchup panels and history rows, the
faction chips everywhere). They accelerate every screen feature. P2 because US1 (tokens)
must exist first, and the shell (US2) is the more urgent constitutional deliverable.

**Independent Test**: Render each primitive and its variants in isolation (a component
gallery / Storybook-style route); assert variants apply the correct tokens, that a shadcn
component drops in and inherits the theme without restyling, and that interactive primitives
expose correct roles/focus states.

**Acceptance Scenarios**:

1. **Given** the Button primitive, **When** rendered in each variant, **Then** primary shows the cyan fill + glow, secondary the outline, ghost the bare state — each pulling only tokens, matching the mockup CTAs.
2. **Given** the Panel/Card primitive, **When** rendered, **Then** it uses the panel surface, hairline steel border, and card radius tokens, and composes a section-eyebrow label and a footer/actions slot.
3. **Given** the StatBar and Chip/Tag primitives, **When** given a value and a family/zone theme, **Then** the bar fills to the value with the cyan-gradient token and the chip shows the correctly-tinted border+label (kinetic/energy/explosive/support, or a faction/zone).
4. **Given** a fresh shadcn/ui component added via the project's setup, **When** it is placed on a screen, **Then** it renders using the app's theme tokens (background/foreground/primary/border/radius) with no per-component color overrides.
5. **Given** a menu/dropdown/dialog primitive, **When** opened, **Then** it uses the raised-surface + popover-shadow tokens, traps focus, and closes on Escape/outside-click.

---

### User Story 4 - The game visual layer: faction/zone theming, unit icons, brand assets (Priority: P2)

The system provides the **game-specific visual vocabulary** the mockups depend on: a
`UnitIcon` component that inlines the seven `currentColor` line-art SVGs from
[`public/icons/`](../../public/icons/) and tints them by faction (friendly `#2ad4ff` /
enemy `#ff3b4e`) or context; a **faction theming** mechanism (a subtree can be marked
friendly or enemy and its accents follow); the **four-zone accent** palette (Air purple /
Front cyan / Middle orange / Rear steel); and the **brand assets** — the two-wedge Warform
logo mark (with mono, knockout, on-light, and favicon lockups per Logo Directions) and the
`WARFORM` wordmark.

**Why this priority**: These are the identity-carrying, reused-everywhere pieces — the
Garage and Arena mockups literally reference `dc-import name="UnitIcon" type="…"`, the
faction split colors every battle and matchup view, and the logo appears in every header and
footer. They are load-bearing shared components, but P2 because they layer on US1's tokens
and are consumed by screens that come after the shell.

**Independent Test**: Render `UnitIcon` for all seven types under friendly and enemy
theming and assert the SVG inlines and takes the tint via `currentColor`; render the logo
lockups and wordmark and assert they match Logo Directions; wrap a subtree in each faction
theme and assert accents flip.

**Acceptance Scenarios**:

1. **Given** each of the seven machine types (heavy-tank, light-tank, mech, attack-helicopter, rocket-artillery, artillery, rear-support), **When** `UnitIcon` renders it, **Then** the matching `public/icons/*.svg` is inlined and colored via `currentColor`.
2. **Given** a `UnitIcon` (or any faction-themed subtree), **When** it is marked friendly vs enemy, **Then** it renders in `#2ad4ff` vs `#ff3b4e` respectively (and any other faction-accented tokens flip with it).
3. **Given** the four battlefield zones, **When** a zone accent token is used (label bar, chip, formation row), **Then** Air=purple, Front=cyan, Middle=orange, Rear=steel per the Garage/Arena mockups.
4. **Given** the Warform logo, **When** rendered as primary badge, mono/knockout, on-light, and favicon (16/32) lockups, **Then** each matches the corresponding lockup in Logo Directions, and the favicon replaces the scaffold default.
5. **Given** a screen reader, **When** it encounters a `UnitIcon` or the logo, **Then** an accessible name/label is available (or it is correctly marked decorative).

---

### User Story 5 - Accessibility & motion baseline (Priority: P3)

The system ships an accessibility and motion floor every screen inherits: visible, token-
driven focus rings on all interactive elements; full keyboard operability of the shell and
primitives; WCAG AA contrast baked into the token pairings; and a `prefers-reduced-motion`
path that disables the non-essential animation (the cyan glows/pulses, backdrop transitions)
while preserving essential feedback. The dark, high-contrast sci-fi aesthetic of the mockups
is the confirmed and *only* theme — there is no light mode to maintain — but the tokens are
structured so a theme could be added later without touching consumers.

**Why this priority**: Accessibility is a "verify before done" (Principle V) and quality
obligation, and it is cheapest to bake into the foundation rather than retrofit onto twelve
screens. P3 because it hardens US1–US4 rather than introducing new surface; much of it is
expressed as acceptance criteria on the earlier stories, but it is called out as its own
independently-verifiable slice.

**Independent Test**: Run automated a11y checks (axe/Lighthouse) on a representative
shell-wrapped page and the component gallery; assert zero serious violations, AA contrast,
visible focus on every interactive element, and that enabling `prefers-reduced-motion`
removes the flagged animations while keeping the UI fully usable.

**Acceptance Scenarios**:

1. **Given** any interactive element (nav item, button, menu trigger), **When** focused via keyboard, **Then** a visible focus indicator using the focus token appears with ≥3:1 contrast against its surroundings.
2. **Given** `prefers-reduced-motion: reduce`, **When** the shell and primitives render, **Then** decorative glow/pulse/transition animations are suppressed and no information is conveyed by motion alone.
3. **Given** the shell and component gallery, **When** an automated accessibility audit runs, **Then** there are zero serious/critical violations and color-contrast checks pass.
4. **Given** the dark theme is the only theme, **When** a consumer references a surface/text token, **Then** it need not branch on theme, yet the token structure (semantic layer over primitives) would allow a second theme to be introduced centrally.

---

### Edge Cases

- **Very small viewport (320px width)**: the bottom-tab labels/targets must still fit and stay ≥ the minimum touch target; long commander names truncate rather than push the layout.
- **Very wide / ultra-wide (≥2560px)**: content is constrained by a max-width container (the mockups cap at ~1240–1360px) and centered, not stretched edge-to-edge.
- **Landscape on a phone / short viewport height**: the shell must not let a fixed top + bottom bar swallow the whole content area; content remains scrollable and safe-area-aware (`dvh`/`svh`, not `100vh`).
- **Notched / rounded devices**: bottom tab bar and content respect `env(safe-area-inset-*)`; nothing critical hides under the home indicator.
- **`prefers-reduced-motion`**: all decorative animation is disabled; the app remains fully usable.
- **Long/overflowing labels** (squad names, nav labels, tags): truncate with ellipsis or wrap deterministically; never cause horizontal page scroll.
- **Keyboard-only and screen-reader traversal**: skip-to-content affordance; nav exposes a labelled landmark; active destination is programmatically current.
- **Fonts fail to load** (offline/blocked Google Fonts): fall back to the system stack defined in the font token with minimal layout shift (next/font self-hosting mitigates this).
- **Faction theme not set**: a `UnitIcon`/themed subtree with no faction falls back to a neutral token, never an unstyled/black icon.
- **Deep-linking directly to a sub-route** (e.g. a Battle Playback under Arena): the shell still renders the correct active top-level destination.

## Requirements *(mandatory)*

### Functional Requirements

**Design tokens (US1 — the visual source of truth, P8-analogous)**

- **FR-001**: The system MUST define the brand **color palette** as named tokens sourced from the Brand Foundation: the friendly/player family (cyan `#2ad4ff`, hover `#7fe6ff`), the enemy family (unit/red `#ff3b4e`, brand-mark magenta `#ff2fb0`, on-dark pink `#ff5da8`), the accents (orange `#ff8c1a`, purple `#7b5cff`), the dark surface ramp (`#06080b` void → `#070a0e`/`#080b10`/`#0a0e13`/`#0b0f15` panel → `#0d1218` raised → `#141922` track), the text ramp (`#eef3f8` strong / `#c4ccd6` body / `#8b97a6` muted / `#5a6472` dim / `#3d4652` faint), and the steel line color (`#6f7a8a`) with its hairline alpha variants (~`rgba(120,140,160,.1–.3)`).
- **FR-002**: The system MUST express tokens in **two tiers** — *primitive* tokens (raw values) and *semantic* tokens (role-named: `surface-*`, `text-*`, `border-*`, `faction-friendly`/`faction-enemy`, `zone-air/front/middle/rear`, `family-kinetic/energy/explosive/support`) — so consumers reference roles, not raw hex, and re-tuning is a one-line change. Where a semantic role and another collide on the same primitive (e.g. friendly = kinetic = front = cyan) they MUST remain **distinct named tokens** so they can diverge later.
- **FR-003**: The system MUST define the **typography** tokens: three families — `display` (Archivo Expanded), `sans`/body-UI (Archivo), `mono` (Space Mono) — and a type scale derived from the Brand Foundation (Display ~72/900, H1 ~40/700, H2 ~28/700, H3 ~17–18/700, Body 16/400 · line-height 1.6, Label/Stat 12 mono/700 · tracking .12em, Readout 13 mono/400, plus the ~9–11px uppercase mono micro-labels used as section eyebrows), with the fonts loaded via the framework's font pipeline (no layout-shifting swap).
- **FR-004**: The system MUST define **spacing, radii, elevation, and motion** tokens: a spacing scale on a 4px base; a radius scale (`sm` ~6 chips, `md` ~8–9 buttons/inputs, `lg` ~12–14 cards/panels, `xl` ~16–20 hero/sections, `full` pills); elevation tokens including the signature cyan **glow** (`0 0 22px rgba(42,212,255,.3)` and its .25/.28/.35 variants), the panel/popover drop shadows (`0 30px 80px rgba(0,0,0,.5)`, `0 20px 50px rgba(0,0,0,.6)`), the sticky-header backdrop-blur+translucency, and text-glow; and motion duration/easing tokens.
- **FR-005**: Every text-on-surface and interactive/focus token pairing the system ships MUST meet **WCAG AA** contrast (≥4.5:1 body text, ≥3:1 large text and non-text UI/focus indicators); pairings that cannot are not shipped as an approved pairing.

**Application shell & navigation (US2 — P7)**

- **FR-006**: The system MUST provide an **app shell** layout — sticky/compact top bar (Warform mark + wordmark, and on authenticated screens the commander identity + avatar), a primary navigation region, and a page content region — that wraps every authenticated screen.
- **FR-007**: The shell MUST present the primary destinations **GARAGE · ARENA · LADDER · PRACTICE** (with PROFILE reachable via the avatar/identity block, per the Profile mockup) as a **horizontal top-tab nav in desktop landscape** and a **fixed bottom tab bar in mobile portrait** — each designed *for* its orientation, satisfying P7; the presentation switches at a defined breakpoint.
- **FR-008**: The shell MUST render an unmistakable **active-destination** state (cyan fill + dark text per the mockups) and mark it programmatically current (`aria-current`), with exactly one destination active per view.
- **FR-009**: Every shell-wrapped view MUST render with **no horizontal page scroll** from 320px up through ultra-wide, constraining page content with a max-width container (~1240–1360px per the mockups) and centering it on very wide viewports.
- **FR-010**: The shell MUST respect mobile device chrome — **safe-area insets** (`env(safe-area-inset-*)`) and **dynamic viewport units** (`dvh`/`svh` rather than `100vh`) — so fixed bars and content are never clipped by notches, home indicators, or mobile browser UI.
- **FR-011**: The shell MUST be **keyboard- and screen-reader-operable**: a labelled navigation landmark, a skip-to-content affordance, all destinations reachable and operable by keyboard, and visible focus.
- **FR-012**: The shell MUST expose the structural regions as composable parts (header, primary-nav, content) so screen features supply page content without re-implementing chrome, and MUST keep the interactive nav a client boundary pushed as far down as practical (Server Components by default, per [`stacks/nextjs.md`](../../stacks/nextjs.md)).

**Core UI primitives (US3)**

- **FR-013**: The system MUST provide the reusable primitives the mockups are built from — at minimum: **Button** (primary/secondary/ghost variants), **Panel/Card** (surface + hairline border + radius, with eyebrow-label and actions slots), **SectionLabel** (the `NN // LABEL` mono eyebrow with a fading rule), **Chip/Tag** (mono uppercase, tintable), **StatBar** (track + cyan-gradient fill), and **Menu/Dropdown/Dialog** (raised surface + popover shadow, focus-trapped) — each consuming only tokens.
- **FR-014**: The primitives MUST be **shadcn/ui-ready**: the project is initialized so shadcn components install into the established component location, share the token-driven theme (background/foreground/primary/border/radius), and use the `cn()` class-merge convention — a shadcn component MUST render themed with no per-component color overrides.
- **FR-015**: The system MUST establish and document the **component conventions** for the codebase (where components live, naming, the variant/prop API pattern, the class-merge helper), since this is greenfield (Principle III) — later screen features follow this shape.

**Game visual layer (US4)**

- **FR-016**: The system MUST provide a **`UnitIcon` component** that inlines the seven `currentColor` line-art SVGs in `public/icons/` keyed by machine type and colors them via `currentColor`, so a parent's text color (a faction/zone token) tints them — matching the `dc-import name="UnitIcon" type="…"` usage in the Garage and Arena mockups.
- **FR-017**: The system MUST provide a **faction theming** mechanism (a subtree marked friendly or enemy adopts the faction accents — friendly `#2ad4ff`, enemy `#ff3b4e`) and the **four-zone accent** tokens (Air `#7b5cff`, Front `#2ad4ff`, Middle `#ff8c1a`, Rear `#8b97a6`) usable by any screen.
- **FR-018**: The system MUST provide the **brand assets** — the two-wedge Warform logo mark as a component with the Logo Directions lockups (primary badge, mono/knockout, on-light, favicon @16/32) and the `WARFORM` wordmark — and MUST set the app **favicon/metadata** to the Warform mark, replacing the Next.js scaffold defaults.

**Accessibility & motion (US5)**

- **FR-019**: The system MUST apply a **visible focus indicator** (a focus token) to every interactive element, meeting ≥3:1 contrast.
- **FR-020**: The system MUST honor **`prefers-reduced-motion`**, suppressing decorative animation (glows/pulses/transitions) while preserving essential feedback and never conveying information by motion alone.
- **FR-021**: The system MUST be **dark-theme-only for v1** (the mockups' aesthetic is the sole theme; no light mode is built or maintained) while keeping the token structure such that an additional theme could later be introduced centrally without editing consumers.

**Scope boundary (Principle IV)**

- **FR-022**: This feature MUST NOT implement the content of any individual screen (Garage, Arena, Ladder, Profile, Battle Playback/Summary), the marketing site's pages/nav content (Feature 11), or the Admin console (Feature 12); it provides only the shell, tokens, primitives, and brand assets those features compose. It MAY replace the throwaway scaffold homepage with a minimal placeholder that demonstrates the shell, but the real Home marketing page is Feature 11.

### Key Entities *(include if feature involves data)*

- **Design Token**: a named, typed value (color / font / size / spacing / radius / shadow / duration) in one of two tiers — *primitive* (raw) or *semantic* (role-named) — expressed as a Tailwind v4 `@theme` CSS variable that is simultaneously a CSS custom property and a utility class. The atomic unit of the whole system.
- **Token Group**: the organized sets — Color (surface / text / border / faction / zone / family / accent), Typography (family / size / weight / tracking / line-height), Spacing, Radius, Elevation (shadow / glow / blur), Motion (duration / easing).
- **Navigation Model**: the ordered set of primary destinations (Garage, Arena, Ladder, Practice; Profile as identity-linked), each with a label, icon, route, and active-state — presented as a top-tab (landscape) or bottom-tab (portrait) view of the *same* model.
- **Shell Layout**: the composed chrome — header region, primary-nav region (responsive), content region — plus the safe-area/max-width/scroll rules, wrapping every authenticated screen.
- **UI Primitive**: a reusable, token-driven, shadcn-ready component with a documented variant/prop API (Button, Panel/Card, SectionLabel, Chip/Tag, StatBar, Menu/Dropdown/Dialog, …).
- **Faction / Zone Theme**: the friendly/enemy accent context and the four-zone (Air/Front/Middle/Rear) accent palette applied to subtrees and components.
- **UnitIcon**: the component that inlines and `currentColor`-tints the seven machine-type SVGs from `public/icons/`.
- **Brand Asset**: the Warform logo mark (its lockups) and wordmark, plus favicon/metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Both orientations first-class (P7)** — every shell-wrapped view renders with **zero horizontal page scroll** and all primary destinations reachable in ≤1 interaction at **360×640 (portrait)** and **1440×900 (landscape)**, and also at 320px min and an ultra-wide width — verified by automated viewport tests.
- **SC-002**: **Token fidelity** — 100% of the color/type/spacing tokens' computed values match the corresponding Brand Foundation mockup values; no screen or primitive in the codebase references a raw brand hex instead of a token (enforced by lint/convention + review).
- **SC-003**: **Contrast (WCAG AA)** — 100% of the shipped text-on-surface pairings meet ≥4.5:1 (normal) / ≥3:1 (large & UI/focus); an automated contrast audit reports zero failures on the shell and component gallery.
- **SC-004**: **Accessibility** — an automated audit (axe/Lighthouse) on a representative shell page and the component gallery reports **zero serious/critical violations**; every interactive element is keyboard-operable with a visible focus indicator; the shell exposes a labelled nav landmark and skip-to-content.
- **SC-005**: **Nav switch correctness** — the primary nav presents as a **top-tab in landscape** and a **bottom tab bar in portrait**, switching at the defined breakpoint, with exactly one destination marked active (`aria-current`) per view — verified across the four test widths.
- **SC-006**: **Reduced motion** — with `prefers-reduced-motion: reduce`, all decorative glow/pulse/transition animations are suppressed and the app remains fully usable (verified by test).
- **SC-007**: **shadcn compatibility** — a freshly-added shadcn/ui component renders using the app's theme tokens with **no per-component color override**, proving the theme is correctly wired.
- **SC-008**: **UnitIcon + faction tint** — all seven `UnitIcon` types inline their `public/icons/*.svg` and adopt the friendly (`#2ad4ff`) or enemy (`#ff3b4e`) tint purely via `currentColor`, with no per-type color hardcoding.
- **SC-009**: **No layout shift from fonts/brand** — the shell page's cumulative layout shift attributable to font loading is ~0 (fonts self-hosted via the framework pipeline), and the Warform favicon/metadata have replaced the scaffold defaults.
- **SC-010**: **Composability** — a stub screen can be built using only the shell + exported tokens/primitives (no bespoke chrome or raw hex), demonstrating the foundation is sufficient for the screen features that follow.

## Assumptions

- **Mockups are the source of truth.** Every token/layout value is derived from the committed `.dc.html` mockups in [`reference/`](../../reference/) (Brand Foundation, Logo Directions, Home, Garage, Arena, Ladder, Profile, Battle Playback/Summary, Content Page, News). Where a mockup and a generic best practice conflict, the mockup wins (Principle III). The mockups are desktop-landscape only; the **mobile-portrait treatment is a co-equal target this feature defines** (bottom-tab nav, stacked/tabbed panes) rather than inherits — that is precisely the P7 obligation.
- **Two shells, shared system.** Feature 3 delivers the design system, the authenticated app shell, and the shared brand primitives (logo/header/footer). The **marketing shell's specific nav content is Feature 11** and composes these primitives; the **Admin console is Feature 12**. Individual screen *content* is each screen's own feature.
- **Fixed 5-unit, 4-zone, 7-type game facts** (from Feature 1 / the design doc) are stable inputs the visual layer encodes (zone accents, `UnitIcon` types, faction split) but does not define.
- **Stack** (from [`STATUS.md`](../../STATUS.md)): Next.js 16 App Router + TypeScript + Turbopack, **Tailwind CSS v4** (CSS-first `@theme`), shadcn/ui-ready, npm, Vercel. The existing app lives at the **repo root** (`app/`, `app/globals.css`); this feature evolves it in place (replacing the scaffold's placeholder palette and homepage), not a new sub-app.
- **Dark theme only for v1.** The sci-fi dark aesthetic is the sole theme; no light mode is built. Tokens are structured to *allow* a future theme, but that is not in scope.
- **Complex screen-specific responsive layouts** (e.g. the Garage's 3-column desktop rig collapsing to stacked/tabbed panes on mobile) are the responsibility of each screen feature; Feature 3 provides the *shell*, the *breakpoint tokens/conventions*, and the *primitives* those layouts use, plus a documented responsive strategy they follow.
- **Component-visual regression tooling** (Storybook/Chromatic) is *optional*; a lightweight in-app component gallery route is the assumed minimum for isolating and testing primitives. A recommendation is recorded in [`plan.md`](./plan.md)/[`research.md`](./research.md).
- **Interaction/animation depth** (battle playback animation, pixel-art rendering) belongs to Feature 5; Feature 3 supplies only the shell/motion *tokens* and the reduced-motion baseline.
