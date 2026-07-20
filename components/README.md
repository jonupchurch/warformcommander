# Components

Shared UI for Warform Commander, split by concern. Screens compose these — they don't restyle
them. Browse them live at `/gallery`.

## Layout

- **`ui/`** — token-driven design-system primitives (`Button`, `Panel`, `SectionLabel`, `Chip`,
  `StatBar`, `Stat`, `BracketFrame`, `GridBackdrop`) plus shadcn-derived overlays
  (`dropdown-menu`, `dialog`, `sheet`).
- **`shell/`** — the authenticated app shell (`AppShell`, `PrimaryNav`, `IdentityBadge`).
- **`brand/`** — logo, wordmark, and unit icons (Feature 3 US4).

## Conventions (FR-015)

- **Token-only styling.** No component hardcodes a brand hex; color flows through the semantic
  utilities (`bg-surface`, `text-faction-friendly`, `border-border`, …) or shadcn's re-pointed base
  tokens (`bg-primary`, `bg-popover`, …). The `lint:tokens` guard enforces this (SC-002).
- **`cn()`** (`@/lib/utils`) merges class names; every primitive forwards `className`.
- **Variants** via `cva` (see `button.tsx`); shadcn-derived files keep the `data-slot` convention.
- **Server Components by default.** Interactivity lives in small `"use client"` leaves
  (`PrimaryNav`, the shadcn overlays) — see [`stacks/nextjs.md`](../stacks/nextjs.md).
- **Accessible by default** — visible `focus-visible` ring (`--ring`), keyboard operability,
  decorative marks `aria-hidden`, decorative animation gated behind `motion-safe:` (FR-019/020).

## Adding a shadcn component

```bash
npx shadcn@latest add <name> --yes
```

It lands in `ui/` and inherits the Warform theme from the base tokens in `app/globals.css` — no
per-component color override needed (SC-007). Re-theme only via those tokens, never inline hex.
