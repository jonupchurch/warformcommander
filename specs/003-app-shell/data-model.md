# Data Model: App Shell + Design System

**Feature**: `003-app-shell` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

The "data" of a design system is its **token taxonomy, navigation model, theme model, and
component taxonomy**. This is the shared *visual* source of truth every screen feature binds
to — the UI analogue of Feature 1's game-data schema (constitution **P8**, applied to the
presentation layer). Every value here is **derived from the committed mockups** in
[`reference/`](../../reference/); the mockup that informs each block is cited. The
machine-readable contracts live in [`contracts/design-tokens.md`](./contracts/design-tokens.md)
(token names + values) and [`contracts/components.md`](./contracts/components.md) (component
APIs).

## Layering — two tiers of tokens (mirrors Feature 1's tiered model)

Per FR-002 and [research.md](./research.md) A2, tokens separate into two tiers so consumers
bind to **roles**, not raw values:

1. **Primitive tokens** — the raw Warform palette and scales (a color ramp, the type scale,
   spacing, radii, shadows). Named by *what they are* (`--color-cyan-500`, `--color-void`).
2. **Semantic tokens** — role-named aliases that *point at* primitives (`--color-surface-panel`,
   `--color-faction-friendly`, `--color-zone-front`). Screens reference **only these**.

**Collision rule (FR-002):** where multiple roles resolve to the same primitive today
(friendly = kinetic = front = cyan `#2ad4ff`), each stays a **distinct semantic token** so it
can diverge later without touching consumers. This indirection is the deliberate greenfield
convention (Principle III).

---

## Tier 1 — Primitive tokens

### Color primitives

*Source: Brand Foundation §02 (Color Families), and the surface/text values used across
Garage, Arena, Home.*

**Brand & accent ramp**

| Token | Value | Origin |
|---|---|---|
| `--color-cyan-500` | `#2ad4ff` | Player/friendly primary (Brand Foundation "CYAN") |
| `--color-cyan-300` | `#7fe6ff` | Cyan hover/bright (Brand `a:hover`, stat-bar gradient end) |
| `--color-cyan-200` | `#8fe6ff` | Air-unit label tint (Arena player air) |
| `--color-red-500` | `#ff3b4e` | Enemy unit tint (Brand "RED"; `public/icons` faction enemy) |
| `--color-magenta-500` | `#ff2fb0` | Brand-mark enemy wedge / enemy panels (Brand "MAGENTA") |
| `--color-pink-400` | `#ff5da8` | Enemy/EXPLOSIVE on-dark accent (Garage/Arena) |
| `--color-pink-300` | `#ff6b8f` | Enemy on-dark text (Arena enemy units) |
| `--color-orange-500` | `#ff8c1a` | Accent / ENERGY / rank / Middle zone (Brand "ORANGE") |
| `--color-purple-500` | `#7b5cff` | Accent / AIR zone / tech (Brand "PURPLE") |

**Surface ramp (dark-first)**

| Token | Value | Role origin |
|---|---|---|
| `--color-void` | `#06080b` | Page background (Brand "VOID"; every mockup `body`) |
| `--color-abyss` | `#070a0e` | Header/hero/main backdrop (Home hero, Garage main) |
| `--color-rail` | `#080b10` | Side-rail / sunken panel (Garage left/right rails) |
| `--color-sunken` | `#0a0e13` | Recessed row/section (Garage formation rows, Home CTA) |
| `--color-panel` | `#0b0f15` | Default card/panel surface (Brand "PANEL"; everywhere) |
| `--color-raised` | `#0d1218` | Popover/dropdown surface (Arena deployment dropdown) |
| `--color-track` | `#141922` | Progress/stat-bar track (Garage stat bars) |
| `--color-steel-800` | `#1a2028` | Scrollbar thumb / elevated chip (Garage/Arena scrollbar) |

**Text & line ramp**

| Token | Value | Role origin |
|---|---|---|
| `--color-ink-100` | `#eef3f8` | Strong text / headings (Brand "WHITE"; all H*) |
| `--color-ink-150` | `#e9eef4` | Strong text alt (Brand body base) |
| `--color-ink-300` | `#c4ccd6` | Body text (Home/Brand body copy) |
| `--color-ink-500` | `#8b97a6` | Muted / secondary (Brand "TEXT MID") |
| `--color-ink-700` | `#5a6472` | Dim / eyebrow labels (Brand section labels) |
| `--color-ink-800` | `#3d4652` | Faintest / disabled / em-dashes (Garage empty states) |
| `--color-steel-500` | `#6f7a8a` | Steel line / corner-bracket color (Brand brackets) |
| `--steel-rgb` | `120 140 160` | Base for hairline borders at alpha (see below) |

**Hairline border alphas** (all `rgb(var(--steel-rgb) / α)` — the pervasive `rgba(120,140,160,α)`):

| Token | Alpha | Use |
|---|---|---|
| `--border-hairline` | `.10` | Default divider / card border |
| `--border-subtle` | `.14` | Card/panel border (most common) |
| `--border-strong` | `.18`–`.30` | Emphasized border / dashed "new" buttons |

### Typography primitives

*Source: Brand Foundation §03 (Type Scale) + usage across mockups.*

| Token | Value |
|---|---|
| `--font-display` | `"Archivo Expanded", system-ui, sans-serif` (weights 500–900; headings use 700–900) |
| `--font-sans` | `"Archivo", system-ui, sans-serif` (weights 400–700; body/UI) |
| `--font-mono` | `"Space Mono", ui-monospace, monospace` (400/700; labels, stats, readouts) |

**Type scale** (size / weight / line-height / tracking — semantic names map to these):

| Step | Font | Size | Weight | LH | Tracking | Origin |
|---|---|---|---|---|---|---|
| `display` | display | 72 (hero 64–76) | 900 | .92–.95 | −.02em | Brand DISPLAY |
| `h1` | display | 40 | 700–800 | 1.0 | −.01em | Brand H1 |
| `h2` | display | 28 | 700–800 | 1.05 | −.01em | Brand H2 |
| `h3` | display | 17–18 | 700 | 1.15 | 0 | Home pillar/news titles |
| `body-lg` | sans | 19–20 | 400 | 1.55 | 0 | Home hero copy |
| `body` | sans | 16 | 400 | 1.6 | 0 | Brand BODY |
| `body-sm` | sans | 13–14 | 400–600 | 1.55 | 0 | card copy, loadout rows |
| `label` | mono | 12 | 700 | 1 | .12–.14em | Brand LABEL/STAT (uppercase) |
| `readout` | mono | 13 | 400 | 1.5 | .05em | Brand READOUT (`// TICK 0142 …`) |
| `eyebrow` | mono | 10–11 | 400–700 | 1 | .20–.28em | section labels (`NN // …`, uppercase) |
| `micro` | mono | 9 | 700 | 1 | .08–.16em | unit dmg tags, zone caps |

### Spacing, radii, elevation, motion primitives

*Source: measured from mockup paddings/gaps/radii/shadows.*

- **Spacing** — 4px base (`--spacing: 0.25rem`); scale steps used: 1,1.5,2,2.5,3,3.5,4,5,6,7,8,
  10,11,12,14,18,22 (×4px → 4…88px) plus section rhythm 72/80/88/96.
- **Radii** — `--radius-sm: 6px` (chips/tags, `4–7`), `--radius-md: 9px` (buttons/inputs,
  `8–10`), `--radius-lg: 14px` (cards/panels, `12–14`), `--radius-xl: 18px` (hero/large
  sections, `16–20`), `--radius-full: 9999px` (pills/dots).
- **Elevation** —
  - `--shadow-glow-cyan: 0 0 22px rgb(42 212 255 / .30)` (+ `.25`/`.28`/`.35` variants) — the
    signature energized glow on primary CTAs and active markers.
  - `--shadow-glow-dot: 0 0 10px currentColor` — status dots.
  - `--shadow-panel: 0 30px 80px rgb(0 0 0 / .5)` — floating hero art / large cards.
  - `--shadow-popover: 0 20px 50px rgb(0 0 0 / .6)` — dropdowns/menus.
  - `--text-glow-cyan: 0 0 30px rgb(42 212 255 / .18)` — hero headline glow.
  - `--blur-chrome: 8px`–`10px` + `--surface-chrome: rgb(6 8 11 / .8)` — sticky-header
    backdrop.
- **Motion** — `--ease-standard: cubic-bezier(.2,.6,.2,1)`; durations `--dur-fast: 120ms`,
  `--dur-base: 200ms`, `--dur-slow: 320ms`. All decorative animation gated by
  `prefers-reduced-motion` (FR-020).
- **Breakpoints** — mobile-first; the shell nav switches at `--breakpoint-lg` (~64rem/1024px).
  Content max-width container `~1240–1360px` (Home 1240, Arena 1360, Brand 1280).

---

## Tier 2 — Semantic tokens (the roles screens consume)

*These alias Tier 1. Full name/value list in
[contracts/design-tokens.md](./contracts/design-tokens.md).*

### Surface / text / border roles

| Semantic token | → primitive | Meaning |
|---|---|---|
| `--color-bg` | `void` | app background |
| `--color-surface` | `panel` | default card/panel |
| `--color-surface-rail` | `rail` | side rails / sunken |
| `--color-surface-raised` | `raised` | popovers/menus |
| `--color-surface-chrome` | `rgb(6 8 11 / .8)` | sticky header (blurred) |
| `--color-text` | `ink-300` | body |
| `--color-text-strong` | `ink-100` | headings |
| `--color-text-muted` | `ink-500` | secondary |
| `--color-text-dim` | `ink-700` | eyebrows/meta |
| `--color-border` | steel/.14 | default border |
| `--color-ring` | `cyan-500` | focus ring |

### Faction roles (FR-017)

| Token | → primitive | Meaning |
|---|---|---|
| `--color-faction-friendly` | `cyan-500` | player forces (icons, panels, seams) |
| `--color-faction-friendly-soft` | `rgb(42 212 255 / .06–.20)` | friendly fills/borders |
| `--color-faction-enemy` | `red-500` | enemy unit tint (`public/icons`) |
| `--color-faction-enemy-brand` | `magenta-500` | enemy in the brand mark / enemy panels |
| `--color-faction-enemy-soft` | `rgb(255 47 176 / .05–.22)` | enemy fills/borders |

> The **logo mark** uses cyan vs **magenta** `#ff2fb0`; in-**game unit tint** uses cyan vs
> **red** `#ff3b4e` (the `public/icons` currentColor tint, per STATUS.md). Both live in the
> enemy family; keep them as separate tokens (`-enemy` vs `-enemy-brand`) — do not collapse.

### Zone roles (FR-017) — the 4 battlefield zones

*Source: Garage `zc` map + Arena zone accents.*

| Token | → primitive | Zone |
|---|---|---|
| `--color-zone-air` | `purple-500` `#7b5cff` | Air |
| `--color-zone-front` | `cyan-500` `#2ad4ff` | Front |
| `--color-zone-middle` | `orange-500` `#ff8c1a` | Middle |
| `--color-zone-rear` | `ink-500` `#8b97a6` | Rear |

### Damage-family roles — for chips/tags/bars

*Source: Garage/Arena `dmgColor` map.*

| Token | → primitive | Family |
|---|---|---|
| `--color-family-kinetic` | `cyan-500` | Kinetic |
| `--color-family-energy` | `orange-500` | Energy |
| `--color-family-explosive` | `pink-400` `#ff5da8` | Explosive |
| `--color-family-support` | `ink-500` | Support |
| `--color-family-flex` | `ink-300` | Mech/generalist |

### shadcn base-token bindings

shadcn's `--background/--foreground/--primary/--secondary/--muted/--accent/--destructive/
--border/--input/--ring/--radius/--card/--popover` are **re-pointed at Warform semantics** so
its primitives render on-brand: `--primary → faction-friendly`, `--background → bg`,
`--card/--popover → surface/surface-raised`, `--border → border`, `--ring → ring`,
`--destructive → faction-enemy`, `--radius → radius-md`. (See
[contracts/design-tokens.md](./contracts/design-tokens.md).)

---

## Navigation Model

*Source: Garage/Arena/Ladder/Profile/Battle top bars (authenticated app shell) vs Home/News/
Content marketing shell.*

### App shell (authenticated) — the shell this feature owns

| Field | Type | Notes |
|---|---|---|
| `destinations` | `NavDestination[]` | ordered primary set |
| `NavDestination` | `{ id, label, href, icon }` | label in `--font-mono` uppercase |
| — primary set | `Garage · Arena · Ladder · Practice` | the 4 top-level tabs (all mockups agree) |
| `profile` | identity-linked | reached via the commander/avatar block (Profile mockup) |
| `active` | derived from route | exactly one; `aria-current` + cyan-fill/dark-text treatment |
| `identity` | `{ commander, rank, mmr, avatar }` | e.g. `CMDR_JUPCHURCH · GOLD III · 1486 MMR` |

**Presentation (one model, two chromes — P7):**

| Region | Desktop landscape (`lg:`) | Mobile portrait (default) |
|---|---|---|
| Primary nav | horizontal **top-tab** row in the header | fixed **bottom tab bar** (thumb reach) |
| Brand | mark + `WARFORM` wordmark, header left | mark (compact), top bar |
| Identity | commander block + avatar, header right | avatar → sheet/menu; rank compacts |
| Content | full-height area under sticky header | scroll area between compact top bar + bottom tabs, safe-area padded |

Sub-routes (Battle Playback / Summary under Arena or Ladder) still resolve the correct
top-level active destination (spec edge case).

### Marketing shell (Feature 11 — composes these primitives, not owned here)

Destinations `Overview · News · Roadmap · Community` + `Wishlist` CTA (Home/News/Content).
Feature 3 provides the shared header/footer/logo primitives it uses.

---

## Component Taxonomy

The reusable primitives (FR-013–FR-016). Full prop APIs in
[contracts/components.md](./contracts/components.md).

| Component | Purpose | Key tokens | Mockup origin |
|---|---|---|---|
| **AppShell** | header + responsive nav + content regions | surface-chrome, border, blur | Garage/Arena top bar |
| **PrimaryNav** | the top-tab/bottom-tab nav from the Nav Model | faction-friendly (active), font-mono | all app mockups |
| **Logo** | two-wedge Warform mark, lockups | faction-friendly/-enemy-brand, steel | Brand/Logo Directions |
| **Wordmark** | `WARFORM` text lockup | font-display 900, ink-100 | headers/footers |
| **Button** | primary / secondary / ghost | faction-friendly + glow / border / bare | Home/Garage/Arena CTAs |
| **Panel / Card** | surface + hairline border + radius; eyebrow + actions slots | surface, border-subtle, radius-lg | everywhere |
| **SectionLabel** | `NN // LABEL` eyebrow + fading rule | eyebrow type, ink-700, gradient rule | Brand/Home sections |
| **Chip / Tag** | mono uppercase, tintable by family/zone/faction | family-*/zone-* border+text | faction/stat tags |
| **StatBar** | labeled track + cyan-gradient fill | track, cyan-500→cyan-300 | Garage stats |
| **Stat / KeyValue** | label + value pair (stat tiles) | eyebrow + display | Arena overall stats |
| **Menu / Dropdown** | raised surface, focus-trapped | surface-raised, shadow-popover | Arena deployment picker |
| **Dialog / Sheet** | modal / mobile sheet | surface-raised, shadow-popover, safe-area | (mobile identity/menu) |
| **BracketFrame** | corner-bracket "reticle" wrapper | steel-500 | Brand badges/hero |
| **GridBackdrop** | grid + scanline battlefield texture | steel/.04 grid, scanline | Brand/Home/Arena bg |
| **UnitIcon** | inline `currentColor` machine SVG, faction/zone-tinted | faction/zone via `currentColor` | Garage/Arena `dc-import` |
| **Avatar / IdentityBadge** | commander mark + rank/MMR | faction-friendly border, orange rank | Garage/Arena header |

### UnitIcon type map (FR-016)

`UnitIcon` maps a machine-type key to a file in [`public/icons/`](../../public/icons/), inlined
so `currentColor` tints it:

| `type` (mockup key) | File | Machine type |
|---|---|---|
| `heavytank` | `heavy-tank.svg` | Heavy Tank |
| `lighttank` | `light-tank.svg` | Light Tank |
| `mech` | `mech.svg` | Mech |
| `heli` | `attack-helicopter.svg` | Attack Helicopter |
| `rocketarty` | `rocket-artillery.svg` | Rocket Artillery |
| `artillery` | `artillery.svg` | Artillery |
| `support` | `support.svg` | Rear Support |

Tint = the ambient text color: wrap in `text-faction-friendly` / `text-faction-enemy` (or a
`--color-zone-*`) and the icon follows. No per-type color is hardcoded (SC-008).

---

## Entity relationship summary

```
PrimitiveToken 1──* SemanticToken            (alias via @theme inline; deferred resolution)
SemanticToken  ──consumed-by──> UI Primitive / Screen   (screens bind to semantics only)
NavModel { NavDestination[] } ──rendered-as──> PrimaryNav (top-tab lg: | bottom-tab default)
AppShell = Header(Logo + Wordmark + IdentityBadge) + PrimaryNav + Content
FactionTheme / ZoneAccent ──tints──> UnitIcon, Chip, Panel border, seams
shadcn base tokens ──re-point-at──> Warform SemanticTokens   (on-brand primitives)
Brand assets: Logo(lockups) + Wordmark + favicon/metadata
```

## Consumers (what later features import)

- **Every screen feature (4,5,6,8,9,10)** imports `AppShell`, `PrimaryNav`, the primitives,
  `UnitIcon`, and binds to semantic tokens — never raw hex (SC-002, SC-010).
- **Feature 11 (Marketing)** composes `Logo`, `Wordmark`, `Button`, `Card`, `SectionLabel`,
  `GridBackdrop` into the marketing shell chrome.
- **Feature 12 (Admin)** composes the same primitives + `AppShell`.
- **Faction/zone tokens & `UnitIcon`** encode Feature 1's fixed game facts (7 types, 4 zones,
  friendly/enemy) — imported, not redefined.
