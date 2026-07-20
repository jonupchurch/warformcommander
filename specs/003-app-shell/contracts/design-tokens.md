# Contract: Design Tokens (`app/globals.css`)

**Feature**: `003-app-shell` | **Spec**: [../spec.md](../spec.md) | **Data model**:
[../data-model.md](../data-model.md)

The canonical token contract — the shape of `app/globals.css` after this feature. Every value
is the exact Brand Foundation / mockup value (SC-002). Screens bind to the **semantic** tokens
(and shadcn's re-pointed base tokens); they MUST NOT reference raw brand hex (FR-002, SC-002).
Structure follows [../research.md](../research.md) A2/B2: primitive `@theme` → semantic
`:root` → `@theme inline` mapping → shadcn base re-point → reduced-motion reset. This file is
illustrative of the contract (names + values + ordering), not a drop-in build artifact.

```css
@import "tailwindcss";

/* Dark-only v1 (FR-021); structured so a theme could be added centrally later. */
@custom-variant dark (&:where(.dark, .dark *));

/* ============================================================
   TIER 1 — PRIMITIVE TOKENS  (raw palette + scales; generate utilities)
   ============================================================ */
@theme {
  /* brand & accent */
  --color-cyan-500:    #2ad4ff;   /* friendly / kinetic / front */
  --color-cyan-300:    #7fe6ff;   /* hover, stat-bar gradient end */
  --color-cyan-200:    #8fe6ff;
  --color-red-500:     #ff3b4e;   /* enemy unit tint (public/icons) */
  --color-magenta-500: #ff2fb0;   /* enemy brand wedge / enemy panels */
  --color-pink-400:    #ff5da8;   /* explosive / enemy on dark */
  --color-pink-300:    #ff6b8f;
  --color-orange-500:  #ff8c1a;   /* accent / energy / middle / rank */
  --color-purple-500:  #7b5cff;   /* accent / air / tech */

  /* surface ramp (dark-first) */
  --color-void:      #06080b;
  --color-abyss:     #070a0e;
  --color-rail:      #080b10;
  --color-sunken:    #0a0e13;
  --color-panel:     #0b0f15;
  --color-raised:    #0d1218;
  --color-track:     #141922;
  --color-steel-800: #1a2028;

  /* text & line ramp */
  --color-ink-100:   #eef3f8;
  --color-ink-150:   #e9eef4;
  --color-ink-300:   #c4ccd6;
  --color-ink-500:   #8b97a6;
  --color-ink-700:   #5a6472;
  --color-ink-800:   #3d4652;
  --color-steel-500: #6f7a8a;

  /* fonts (bound to next/font CSS vars in layout.tsx) */
  --font-display: var(--font-archivo-expanded), system-ui, sans-serif;
  --font-sans:    var(--font-archivo), system-ui, sans-serif;
  --font-mono:    var(--font-space-mono), ui-monospace, monospace;

  /* type scale (size / line-height) — pair with weight/tracking utilities */
  --text-display: 4.5rem;   --text-display--line-height: .92;
  --text-h1:      2.5rem;   --text-h1--line-height: 1;
  --text-h2:      1.75rem;  --text-h2--line-height: 1.05;
  --text-h3:      1.125rem; --text-h3--line-height: 1.15;
  --text-body-lg: 1.25rem;  --text-body-lg--line-height: 1.55;
  --text-body:    1rem;     --text-body--line-height: 1.6;
  --text-body-sm: 0.875rem; --text-body-sm--line-height: 1.55;
  --text-label:   0.75rem;  --text-label--line-height: 1;
  --text-readout: 0.8125rem;--text-readout--line-height: 1.5;
  --text-eyebrow: 0.6875rem;--text-eyebrow--line-height: 1;
  --text-micro:   0.5625rem;--text-micro--line-height: 1;

  --tracking-tightest: -.02em;
  --tracking-label:     .12em;
  --tracking-eyebrow:   .24em;

  /* spacing base (drives p-/m-/gap-/w-/h-) */
  --spacing: 0.25rem;

  /* radii */
  --radius-sm:   6px;
  --radius-md:   9px;
  --radius-lg:   14px;
  --radius-xl:   18px;
  --radius-full: 9999px;

  /* elevation */
  --shadow-glow-cyan:  0 0 22px rgb(42 212 255 / .30);
  --shadow-glow-soft:  0 0 16px rgb(42 212 255 / .25);
  --shadow-panel:      0 30px 80px rgb(0 0 0 / .5);
  --shadow-popover:    0 20px 50px rgb(0 0 0 / .6);

  /* motion */
  --ease-standard: cubic-bezier(.2,.6,.2,1);

  /* shell breakpoint (nav chrome switch); Tailwind default lg=64rem is used */
  --breakpoint-lg: 64rem;

  /* content container max width (mockups: 1240–1360) */
  --container-shell: 1360px;
}

/* steel line base for hairline borders at alpha */
:root { --steel-rgb: 120 140 160; }

/* ============================================================
   TIER 2 — SEMANTIC TOKENS  (roles; bare vars, re-pointable, theme-ready)
   ============================================================ */
:root {
  color-scheme: dark;

  /* surfaces */
  --bg:              var(--color-void);
  --surface:         var(--color-panel);
  --surface-rail:    var(--color-rail);
  --surface-sunken:  var(--color-sunken);
  --surface-raised:  var(--color-raised);
  --surface-chrome:  rgb(6 8 11 / .8);        /* sticky header bg (blur) */

  /* text */
  --text:            var(--color-ink-300);
  --text-strong:     var(--color-ink-100);
  --text-muted:      var(--color-ink-500);
  --text-dim:        var(--color-ink-700);
  --text-faint:      var(--color-ink-800);

  /* borders (hairline at alpha) */
  --border:          rgb(var(--steel-rgb) / .14);
  --border-hairline: rgb(var(--steel-rgb) / .10);
  --border-strong:   rgb(var(--steel-rgb) / .30);
  --ring:            var(--color-cyan-500);

  /* faction (FR-017) */
  --faction-friendly:       var(--color-cyan-500);
  --faction-friendly-soft:  rgb(42 212 255 / .10);
  --faction-enemy:          var(--color-red-500);      /* in-game unit tint */
  --faction-enemy-brand:    var(--color-magenta-500);  /* brand mark / enemy panels */
  --faction-enemy-soft:     rgb(255 47 176 / .08);

  /* zones (FR-017) */
  --zone-air:    var(--color-purple-500);
  --zone-front:  var(--color-cyan-500);
  --zone-middle: var(--color-orange-500);
  --zone-rear:   var(--color-ink-500);

  /* damage families */
  --family-kinetic:   var(--color-cyan-500);
  --family-energy:    var(--color-orange-500);
  --family-explosive: var(--color-pink-400);
  --family-support:   var(--color-ink-500);
  --family-flex:      var(--color-ink-300);
}

/* ============================================================
   PUBLISH SEMANTICS AS UTILITIES  (deferred resolution — research A2)
   → bg-surface, text-strong, border-border, text-faction-friendly, text-zone-air, …
   ============================================================ */
@theme inline {
  --color-bg:             var(--bg);
  --color-surface:        var(--surface);
  --color-surface-rail:   var(--surface-rail);
  --color-surface-sunken: var(--surface-sunken);
  --color-surface-raised: var(--surface-raised);
  --color-surface-chrome: var(--surface-chrome);

  --color-text:        var(--text);
  --color-text-strong: var(--text-strong);
  --color-text-muted:  var(--text-muted);
  --color-text-dim:    var(--text-dim);
  --color-text-faint:  var(--text-faint);

  --color-border:          var(--border);
  --color-border-hairline: var(--border-hairline);
  --color-border-strong:   var(--border-strong);
  --color-ring:            var(--ring);

  --color-faction-friendly:      var(--faction-friendly);
  --color-faction-friendly-soft: var(--faction-friendly-soft);
  --color-faction-enemy:         var(--faction-enemy);
  --color-faction-enemy-brand:   var(--faction-enemy-brand);
  --color-faction-enemy-soft:    var(--faction-enemy-soft);

  --color-zone-air:    var(--zone-air);
  --color-zone-front:  var(--zone-front);
  --color-zone-middle: var(--zone-middle);
  --color-zone-rear:   var(--zone-rear);

  --color-family-kinetic:   var(--family-kinetic);
  --color-family-energy:    var(--family-energy);
  --color-family-explosive: var(--family-explosive);
  --color-family-support:   var(--family-support);
  --color-family-flex:      var(--family-flex);
}

/* ============================================================
   shadcn BASE TOKENS — re-pointed at Warform semantics (research B1/B2)
   (shadcn init writes these; we bind them on-brand)
   ============================================================ */
:root {
  --radius: var(--radius-md);
  --background: var(--bg);
  --foreground: var(--text-strong);
  --card: var(--surface);
  --card-foreground: var(--text-strong);
  --popover: var(--surface-raised);
  --popover-foreground: var(--text-strong);
  --primary: var(--faction-friendly);
  --primary-foreground: var(--color-void);
  --secondary: var(--surface-sunken);
  --secondary-foreground: var(--text);
  --muted: var(--surface-sunken);
  --muted-foreground: var(--text-muted);
  --accent: var(--surface-raised);
  --accent-foreground: var(--text-strong);
  --destructive: var(--faction-enemy);
  --border: rgb(var(--steel-rgb) / .14);
  --input: rgb(var(--steel-rgb) / .18);
  --ring: var(--faction-friendly);
}
/* @theme inline for the shadcn --color-* mapping is emitted by `shadcn init`. */

/* ============================================================
   BASE + REDUCED MOTION
   ============================================================ */
body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Contract guarantees

1. **Fidelity (SC-002)** — every listed color equals its Brand Foundation value; changing a
   primitive updates all consumers.
2. **Semantic indirection (FR-002)** — consumers reference `--color-surface`,
   `--color-faction-*`, `--color-zone-*`, `--color-family-*`; colliding roles stay distinct
   tokens.
3. **Utilities exist (research A1/A6)** — every semantic token yields `bg-*`/`text-*`/`border-*`
   utilities via `@theme inline`, with opacity modifiers.
4. **Contrast (SC-003)** — approved text/surface pairings meet WCAG AA:
   `text-strong`/`text`/`text-muted` on `bg`/`surface`, `--color-void` foreground on
   `faction-friendly` (button), and `--ring` focus all pass; `text-faint` is decorative
   (dividers/placeholders) only.
5. **Dark-only (FR-021)** — no `.dark` block ships in v1; the structure supports adding one
   centrally with zero consumer edits.
6. **Reduced motion (FR-020/SC-006)** — the global reset plus `motion-safe:`/`motion-reduce:`
   gate all decorative animation.

## Approved contrast pairings (WCAG AA reference)

| Foreground | Background | Ratio (approx) | Use |
|---|---|---|---|
| `--color-ink-100` #eef3f8 | `--color-void` #06080b | ~16:1 | headings |
| `--color-ink-300` #c4ccd6 | `--color-panel` #0b0f15 | ~11:1 | body on cards |
| `--color-ink-500` #8b97a6 | `--color-void` #06080b | ~6:1 | muted/secondary |
| `--color-void` #06080b | `--color-cyan-500` #2ad4ff | ~9:1 | primary button label |
| `--color-cyan-500` #2ad4ff | `--color-void` #06080b | ~8:1 | links / active tab / focus ring |

> `--color-ink-700` #5a6472 on void ≈ 3.4:1 — **use for large/uppercase eyebrow text only**,
> not body. `--color-ink-800` is decorative (never load-bearing text).
