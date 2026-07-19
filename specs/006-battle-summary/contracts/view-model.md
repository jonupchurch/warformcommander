# Contract: Battle Summary ViewModel + Page Props

**Feature**: `006-battle-summary` | **Spec**: [../spec.md](../spec.md) | **Data model**:
[../data-model.md](../data-model.md)

The TypeScript-shaped contract for the **display-only ViewModel**, the **pure derivation function** that
produces it, and the **route props**. Signatures are illustrative (the shape + guarantees), not the
implementation. The `MatchResult`/`GameResult`/`Replay` types are **imported from Feature 1's TS mirror**
(`src/sim/`) — reused, never redefined here ([replay-format](../001-battle-sim-core/contracts/replay-format.md),
[data-model](../001-battle-sim-core/data-model.md)).

## Imported types (Feature 1 — reference only)

```ts
// from src/sim/ (Feature 1's TS mirror of the Rust result types)
import type { MatchResult, GameResult, Side, Replay } from "@/sim";
// MatchResult: { winner: Side; games: GameResult[]; perMachineFates; perSideDamageTotals; survivorCounts }
// GameResult:  { winner: Side | null; condition: "Conquest" | "Time"; rewardTier: "Full" | "Lesser"; durationTicks: number }
// Replay.meta.unitOrder: { side: Side; instanceId: number; typeId: string; variantId: string }[]
```

## The ViewModel

```ts
import type { MachineTypeKey } from "@/components/brand/unit-icon"; // Feature 3 shared enum

export interface BattleSummaryViewModel {
  outcome: {
    verdict: "VICTORY" | "DEFEAT";
    bestOf: number;                      // 3
    seriesLabel: string;                 // "2 – 0" | "2 – 1"
    gamesWon: number;
    gamesLost: number;
    opponent: { name?: string; href?: string; hidden: boolean };  // hidden=true → practice (§16.1)
  };
  series: { game: number; result: "W" | "L" }[];   // length === games actually played (2 or 3)
  perGame: {
    game: number;                        // 1-based
    result: "W" | "L";
    condition: "CONQUEST" | "TIME";
    conditionDetail?: string;            // "DMG" | "exact tie → defender"
    rewardTier: "FULL" | "LESSER";
    survivors: { viewer: number; opponent: number };
    durationSeconds: string;             // "8.2s"
  }[];
  totals: {
    damageDealt:  SidePair;              // equals MatchResult.perSideDamageTotals (SC-003)
    unitsKilled:  SidePair;              // 5 − enemySurvivors
    unitsLost:    SidePair;              // 5 − ownSurvivors
    avgHullLeft:  SidePair;              // % (0 on a total wipe)
  };
  perMachine: {
    side: "viewer" | "opponent";
    typeKey: MachineTypeKey;             // → Feature 3 UnitIcon
    variant: string;
    fate:
      | { kind: "destroyed"; atTick: number; atSeconds: string }
      | { kind: "survived"; hullPct: number };
  }[];
  mvp?: {                                // present iff per-machine damage available (FR-010; else omitted)
    typeKey: MachineTypeKey; variant: string; side: "viewer" | "opponent";
    damageDealt: number; kills: number; damageAbsorbed: number;
  };
  standing?: {                           // ranked only; practice → { mode:"practice", label:"UNRANKED" }
    mode: "ranked" | "practice";
    delta?: number; before?: number; after?: number;
    label: string;                       // "+1 NET VICTORY" | "UNRANKED"
  };
  actions: {
    watchReplayHref: string;             // → Battle Playback (Feature 5), keyed to matchId
    findNextOpponentHref: string;        // → Arena (Feature 8)
    backHref: string;                    // → Arena / Garage
  };
}

interface SidePair { viewer: number; opponent: number; }
```

## The derivation function (pure, total — the SC-001/003 core)

```ts
export interface DeriveContext {
  viewerSide: Side;                      // perspective (FR-003) — supports A or B
  unitOrder: Replay["meta"]["unitOrder"];// machine identity for perMachine + mvp
  tickRate: number;                      // durations → seconds (10 t/s, §9)
  opponent: { name?: string; href?: string; hidden: boolean };
  standing?: { mode: "ranked" | "practice"; delta?: number; before?: number; after?: number };
  replayRef: { matchId: string };        // → watchReplayHref
  perMachineDamage?: PerMachineDamage[];  // optional: from result field OR the D3 event reduction; enables mvp
}

/** Pure & total: no I/O, no engine, no re-sim. Represents EVERY MatchResult field (SC-001). */
export function deriveSummaryViewModel(
  result: MatchResult,
  ctx: DeriveContext,
): BattleSummaryViewModel;
```

### Contract guarantees

1. **Full-field representation (SC-001).** Every `MatchResult` field is present in the output (unit-tested
   over a fixture battery); a field added to `MatchResult` upstream surfaces here or fails the test.
2. **Totals equality (SC-003).** `totals.damageDealt` deep-equals `result.perSideDamageTotals`;
   `unitsKilled/unitsLost/avgHullLeft` are exact functions of `survivorCounts` + per-machine fates — zero
   drift.
3. **Perspective (FR-003).** Output is a function of `ctx.viewerSide`; swapping it flips `verdict` and every
   `SidePair`.
4. **Purity.** No side effects, no `Date.now()`, no network, no engine import — deterministic in its inputs
   (mirrors Feature 1's determinism ethos at the display layer).
5. **Graceful MVP (FR-010).** `mvp` is emitted **iff** `ctx.perMachineDamage` is provided; its absence
   changes no other field.
6. **Shape coverage (SC-005).** Total over the enumerated shapes — 2-0, 2-1, Time-tiebreak, exact-tie→
   defender, total wipe, all-survivors, defeat — with no missing fields.

## Route props (the page contract)

```ts
// app/(app)/matches/[matchId]/summary/page.tsx  — Server Component (stacks/nextjs.md)
export default async function BattleSummaryPage(
  { params }: { params: Promise<{ matchId: string }> }  // async params (Next.js 16)
): Promise<JSX.Element>;
```

Guarantees:
- **Server-side fetch (P6, Principle II).** The `MatchResult`, replay reference, `unitOrder`/`tickRate`, and
  the ladder-standing delta are read **server-side** via Feature 7 for `matchId`, scoped to the viewing
  user; the client never supplies or recomputes the outcome/standing.
- **Derive then render.** The page calls `deriveSummaryViewModel(...)` and passes the ViewModel to the
  `src/components/battle-summary/*` presentational components — which hold no logic.
- **Reader, not simulator (SC-007).** The page mounts **no** replay player and runs **no** simulation; the
  replay is only *referenced* via `actions.watchReplayHref`.
- **Not-found / unsupported (FR-018, edge cases).** A missing match, a match not owned by the viewer, or an
  unrenderable result resolves to `error.tsx` / `not-found`, never a broken render.
- **Shell + tokens (FR-014).** Rendered inside the Feature 3 `AppShell`; every color flows through Feature 3
  semantic tokens (no raw hex).

## Consumers

- `src/components/battle-summary/*` render the ViewModel (Feature 3 primitives: `Panel`, `StatBar`, `Stat`,
  `Chip`, `Button`, `SectionLabel`, `UnitIcon`).
- `src/lib/battle-summary/view-model.ts` implements `deriveSummaryViewModel`; `view-model.test.ts` pins the
  guarantees above (SC-001/002/003/005/006).
