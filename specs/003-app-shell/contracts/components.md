# Contract: Component APIs

**Feature**: `003-app-shell` | **Spec**: [../spec.md](../spec.md) | **Data model**:
[../data-model.md](../data-model.md)

The public API surface of the design system's shell + primitives — the shapes later screen
features (4,5,6,8,9,10) and the marketing/admin features (11,12) import. Conventions
(FR-015): components live under `src/components/` (`ui/` for token primitives, `shell/` for
the app shell, `brand/` for logo/icon); every primitive is token-driven, uses the `cn()`
class-merge helper (`src/lib/utils.ts`), forwards `className`, and — for shadcn-derived
primitives — follows the `data-slot` + variant convention ([../research.md](../research.md)
B1). Server Components by default; interactivity in small `"use client"` leaves
([`stacks/nextjs.md`](../../../stacks/nextjs.md)).

Signatures are TypeScript-shaped contracts (illustrative, not the implementation).

---

## Shell

### `AppShell` — `src/components/shell/app-shell.tsx` (Server Component)

Wraps every authenticated screen: header (Logo + Wordmark + IdentityBadge) + responsive
`PrimaryNav` + content region. Implemented as the App Router layout for the authenticated
route group (`app/(app)/layout.tsx`).

```ts
interface AppShellProps {
  children: React.ReactNode;          // routed page content
  identity?: IdentityBadgeProps;      // commander/rank/avatar (omit on unauthenticated)
}
```

Guarantees: sticky/blurred header (`surface-chrome` + `--blur-chrome`); content constrained to
`--container-shell` and centered (FR-009); `min-h-dvh`, safe-area padding (FR-010); renders a
skip-to-content link + `<nav aria-label>` landmark (FR-011); **no horizontal overflow 320px→∞**
(SC-001).

### `PrimaryNav` — `src/components/shell/primary-nav.tsx` (`"use client"` leaf)

Renders the Nav Model as **top-tab in landscape, bottom-tab in portrait** — both in the DOM,
toggled by `lg:` utilities (research C1/C2). Active state via `usePathname`.

```ts
interface NavDestination { id: string; label: string; href: string; icon: React.ReactNode; }

interface PrimaryNavProps {
  destinations?: NavDestination[];    // defaults to GARAGE·ARENA·LADDER·PRACTICE
}
```

Guarantees: exactly one active destination, cyan-fill/dark-text treatment + `aria-current`
(FR-008, SC-005); bottom bar is `sticky bottom-0` + safe-area padded; targets ≥44px; labels
truncate, never overflow (SC-001, edge cases).

### `IdentityBadge` / `Avatar` — `src/components/shell/identity-badge.tsx`

```ts
interface IdentityBadgeProps {
  commander: string;     // e.g. "CMDR_JUPCHURCH"
  rank?: string;         // e.g. "GOLD III"  (orange)
  mmr?: number;          // e.g. 1486
  href?: string;         // → Profile (identity-linked destination)
}
```

Commander in `font-display`; rank/MMR in `font-mono` `--color-orange-500`; avatar tile uses a
`faction-friendly` border. Truncates long names.

---

## Brand

### `Logo` — `src/components/brand/logo.tsx`

The two-wedge mark (cyan player wedge · white divider+node · magenta enemy wedge) with the
Logo Directions lockups.

```ts
interface LogoProps {
  variant?: "badge" | "mono" | "knockout" | "on-light" | "favicon";  // default "badge"
  size?: number;              // px height; default per variant
  withBracket?: boolean;      // wrap in the corner-bracket frame (BracketFrame)
  title?: string;             // accessible name; omit → decorative (aria-hidden)
}
```

Guarantees: `badge` = cyan/magenta fills + strokes; `mono`/`knockout` = single `currentColor`;
`on-light` = dark strokes on light; `favicon` = simplified @16/32. Used to generate the app
favicon/metadata (FR-018, SC-009).

### `Wordmark` — `src/components/brand/wordmark.tsx`

```ts
interface WordmarkProps { size?: "sm" | "md" | "lg"; }   // "WARFORM", font-display 900, ink-100
```

### `UnitIcon` — `src/components/brand/unit-icon.tsx`

Inlines the machine SVG so `currentColor` tints it (FR-016, SC-008).

```ts
type MachineTypeKey =
  | "heavytank" | "lighttank" | "mech" | "heli"
  | "rocketarty" | "artillery" | "support";

interface UnitIconProps {
  type: MachineTypeKey;               // → public/icons/*.svg (map in data-model)
  faction?: "friendly" | "enemy";     // sets currentColor to faction token (optional)
  className?: string;                 // or tint via an ambient text-* / zone token
  title?: string;                     // accessible name; omit → decorative
}
```

Guarantees: the SVG is **inlined** (not `<img>`) so `currentColor` applies; with no
`faction`/class it inherits ambient text color and never renders unstyled (edge case); no
per-type color is hardcoded (SC-008). Type→file map is the single source in
[../data-model.md](../data-model.md).

---

## Primitives (`src/components/ui/*`)

### `Button` — `button.tsx`

```ts
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";   // default "primary"
  size?: "sm" | "md" | "lg";
  asChild?: boolean;                               // Slot pattern (shadcn)
}
```

`primary` = `bg-faction-friendly text-[--color-void]` + `shadow-glow-cyan` (glow gated by
`motion-safe:`); `secondary` = `border-border-strong` outline; `ghost` = bare. Visible focus
ring (`--ring`, FR-019). Matches the Home/Garage/Arena CTAs.

### `Panel` / `Card` — `panel.tsx`

```ts
interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;             // default "section"
  inset?: "rail" | "sunken" | "raised";  // surface variant; default = surface
  bordered?: boolean;                 // default true (hairline)
  radius?: "lg" | "xl";               // default "lg"
}
// slots: <Panel.Eyebrow>, <Panel.Actions> (or eyebrow/actions props)
```

`bg-surface` + `border-border` + `rounded-[--radius-lg]`, per the pervasive `#0b0f15`-on-void
card.

### `SectionLabel` — `section-label.tsx`

```ts
interface SectionLabelProps { index?: string; children: React.ReactNode; rule?: boolean; }
// renders:  NN // LABEL   ──────────────  (mono eyebrow + fading gradient rule)
```

### `Chip` / `Tag` — `chip.tsx`

```ts
interface ChipProps {
  tone?: "kinetic" | "energy" | "explosive" | "support" | "flex"
        | "friendly" | "enemy" | "air" | "front" | "middle" | "rear" | "neutral";
  variant?: "outline" | "solid";     // default "outline" (border+text tint)
  children: React.ReactNode;
}
```

Mono uppercase; `tone` selects the family/faction/zone token for border+text (the faction/stat
tags everywhere in the mockups).

### `StatBar` — `stat-bar.tsx`

```ts
interface StatBarProps {
  label: string;
  value: number;            // 0–100 (or provide max)
  max?: number;
  display?: string;         // right-aligned readout (e.g. "2400")
  tone?: ChipProps["tone"]; // fill color; default cyan gradient
}
```

Track = `bg-track`; fill = `linear-gradient(90deg, --color-cyan-500, --color-cyan-300)`
(Garage stat bars); label in `font-mono`.

### `Stat` / `KeyValue` — `stat.tsx`

```ts
interface StatProps { label: string; value: React.ReactNode; }  // eyebrow label + display value tile
```

### `Menu` / `Dropdown` / `Dialog` / `Sheet` — shadcn-derived (`dropdown-menu.tsx`, `dialog.tsx`, `sheet.tsx`)

Installed via shadcn, re-themed by the base-token binding (research B1). Guarantees:
`surface-raised` + `shadow-popover`; focus-trapped; Escape/outside-click close (FR-013 AS5);
`Sheet` used for the mobile identity/menu, safe-area padded.

### `BracketFrame` — `bracket-frame.tsx`

```ts
interface BracketFrameProps { size?: number; children: React.ReactNode; }  // steel corner "reticle"
```

### `GridBackdrop` — `grid-backdrop.tsx`

```ts
interface GridBackdropProps { scanlines?: boolean; glow?: "cyan" | "split" | "none"; }
```

The grid + scanline battlefield texture (Brand/Home/Arena backgrounds); decorative, no motion.

---

## Consumption examples (what a screen feature writes)

```tsx
// A Garage-like screen composes shell + primitives + tokens only — no raw hex, no chrome.
export default function GaragePage() {
  return (
    <Panel inset="rail">
      <SectionLabel index="01">YOUR SQUADS</SectionLabel>
      <div className="text-faction-friendly">
        <UnitIcon type="heavytank" title="Heavy Tank" />
      </div>
      <StatBar label="HULL" value={75} display="2400" />
      <Chip tone="kinetic">KINETIC</Chip>
      <Button variant="primary">Set as Active</Button>
    </Panel>
  );
}
```

## Contract guarantees (summary)

- **Token-only styling** — no primitive hardcodes a brand hex; all color flows through
  semantic tokens (SC-002, SC-010).
- **shadcn-themed** — a freshly-added shadcn component renders on-brand with zero per-component
  color override (FR-014, SC-007).
- **Accessible by default** — visible focus (FR-019), keyboard operability, accessible
  names/decorative marking on `Logo`/`UnitIcon`, reduced-motion-safe decoration (FR-020).
- **Responsive-safe** — nothing in a primitive forces horizontal overflow; the shell owns the
  max-width + safe-area + nav-switch guarantees (SC-001, SC-005).
- **Stable keys** — `MachineTypeKey` and the `tone`/zone vocabularies are the shared enums
  screens and Feature 1 agree on.
