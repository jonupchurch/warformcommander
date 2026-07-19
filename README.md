# Warform Commander

A deliberately **non-pay-to-win** sci-fi tactics wargame. Assemble a 5-unit army, kit
and position it, dial in each unit's autonomous behavior, then watch the battle
auto-resolve. Skill lives in *planning* — composition, counters, loadouts, and
positioning — not twitch reflexes or wallet size.

**Live:** [warformcommander.vercel.app](https://warformcommander.vercel.app) ·
**Status:** pre-alpha, foundation build — see **[STATUS.md](STATUS.md)** first.

> ⚠️ Early development. No product feature is implemented yet; the design is locked and
> the deterministic battle-sim core is being specced/built first (everything imports it).

## What it is

- A **configurable auto-battler / tactics wargame** for the browser — mobile portrait
  *and* desktop landscape, both first-class.
- **Depth from configuration, not roster size:** 7 unit types × 3 chassis variants ×
  equipment (1 weapon / 1 defense / 3 utility) × behavior dials × 4-zone positioning.
- **Async, non-P2W competitive ladder:** you attack AI-piloted snapshots of other
  players' defenses; battles resolve server-side and are watched back as replays.
- **Fairness is verified, not hoped:** a Monte-Carlo auto-balancer runs the same engine
  offline to flag degenerate combos before players find them.

Closest comparable is **Mechabellum** — differentiated by per-unit **behavior dials +
conditional triggers**, an **async non-P2W ladder**, and a real **air layer** in the
4-zone battlefield.

## Architecture

- **Meta-game** (roster, garage, arena, ladder, marketing): **Next.js 16** (App Router,
  TypeScript, Tailwind v4) on **Vercel**.
- **Battle engine:** a **Rust core compiled to WebAssembly** — a pure
  `resolve(armies, ruleset, seed) → Replay`. The **server** runs it (via WASM) to resolve
  matches authoritatively; the **balancer** runs the same core **natively**; the
  **client only replays** the emitted per-tick snapshot stream — it never simulates.
- **Determinism:** seeded, fixed-tick (10 ticks/sec), fixed-point math → battles are
  byte-for-byte reproducible. Replays are stored as data and scrubbed/played by indexing.
- **Observability:** Vercel Web Analytics + Sentry.

## Repository layout

| Path | What |
|---|---|
| `app/` | Next.js application (meta-game UI) |
| `public/icons/` | Unit SVG icons (one per machine type, `currentColor` faction tint) |
| `reference/` | Design source of truth — game design doc, first-pass stats, screen mockups, brand |
| `specs/` | Feature specs (Spec-Kit) — e.g. `001-battle-sim-core` |
| `.specify/` | Spec-Kit engine + the project **constitution** (`memory/constitution.md`) |
| `.claude/`, `stacks/` | Portable agent toolkit + repo-local stack conventions |
| `STATUS.md` | Living project status — **read this first** |
| `CHANGELOG.md` | What's shipped |
| `MANIFEST.md` | Catalog of the portable agent toolkit |

## Key documents

- **[Game Design Document](reference/warformcommandergamedesigndoc.md)** — the master plan
  (mechanics, systems, and the decision log).
- **[First-pass stat block](reference/warformcommander-firstpass-stats.md)** — placeholder
  unit numbers calibrated to the tick budget (the balancer tunes the finals).
- **[Constitution](.specify/memory/constitution.md)** — product & architecture invariants
  (P1–P8) plus the engineering process.
- **[STATUS.md](STATUS.md)** — where the build is and what's next.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

Requires Node.js. Environment variables are documented in `.env.example` (Sentry DSN, etc.).

## Development workflow

Spec-driven, per feature, on a feature branch: `speckit-specify → speckit-plan →
speckit-tasks → speckit-implement`, following the operating rules in
**[AGENTS.md](AGENTS.md)** / **[CLAUDE.md](CLAUDE.md)**. Current focus: the battle-sim
core (feature `001-battle-sim-core`).
