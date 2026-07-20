# Contract: Matchmaking & Resolve API

**Feature**: `008-arena-practice` | **Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Research**: [../research.md](../research.md)

Feature 8's own orchestration surface — the transient service DTOs and functions
`src/server/{matchmaking,arena,practice,ruleset,seed}.ts` expose. This feature adds **no persisted
entities** (spec Key Entities) — it **composes** [Feature 1's engine
API](../001-battle-sim-core/contracts/engine-api.md) (`resolveBattle`) and [Feature 7's persistence
API](../007-accounts-persistence/contracts/persistence-api.md) (`listAttackable`, `recordMatch`, …).
Signatures are TypeScript-shaped contracts (illustrative, not the implementation); `Result<T>` =
success `T` or a typed `{ error, reason }`, as in Features 1/7. `ctx` = the resolved server session
(`{ userId, role }`, Feature-7 convention) — **never** a client argument.

The one rule every signature below encodes: **the only thing a client supplies is which of its own
squads to attack with** (P6, US5). Opponent, snapshot, seed, ruleset, and outcome are always
server-decided.

---

## 1. Client-supplied inputs (the trust boundary)

```ts
// The ONLY body Feature 8 accepts to start a ranked match. No userId, opponent, seed, ruleset, or
// outcome field exists on this type — there is nothing for a forged field to overwrite (US5, FR-009/010).
interface RankedMatchRequest {
  attackSquadId: string;      // which of the caller's own squads attacks
  ticketSnapshotId: string;   // the defenderSnapshotId bound by a prior previewRankedMatch (US3/FR-008)
}

// The ONLY body Feature 8 accepts to start a practice match.
interface PracticeMatchRequest {
  opponentSquadId: string;    // the squad id bound by a prior draw/refresh (drawPracticeOpponent)
}
```

`app/api/arena/resolve/route.ts` and `app/api/practice/resolve/route.ts` parse the request body by
**destructuring exactly these fields** — any other field (`result`, `winner`, `seed`, `opponentId`,
`ruleset`, …) is structurally unreadable, not merely discarded by convention (US5 Acceptance
Scenario 1–2).

---

## 2. Server-only DTOs

```ts
// The server-side matchmaking result. `servedConfig` is the full army config of the served
// snapshot — it is NEVER serialized to the client as-is; only the fogged preview projection
// (below) reaches the browser (US3 blind guarantee, FR-007).
interface MatchmakingSelection {
  defenderUserId: string;
  defenderSnapshotId: string;
  poolSource: "real" | "bot";     // real player vs. Feature-7 cold-start bot (P5)
  servedConfig: SquadConfig;      // Feature-1 Army — server-only
}

// The opaque handle returned by preview and consumed by deploy. Binds the served snapshot BY ID
// (US3/FR-008) and carries only the fogged projection for display.
interface MatchTicket {
  defenderSnapshotId: string;
  preview: {
    composition: SquadComposition;   // unit types/variants only
    placement: Placement;            // zone layout
    power: number;                   // derived power rating
    damageFamilyTags: DamageFamily[]; // derived tags
    // deliberately ABSENT: BehaviorDials, PlanBTrigger, or any other hidden-logic field (FR-007)
  };
}

// A practice opponent draw. Identity (owner/handle) is always stripped (FR-014).
interface PracticeDraw {
  opponentSquadId: string;
  opponentConfig: SquadConfig;   // Feature-1 Army — identity-free
}
```

`SquadConfig` / `SquadComposition` / `Placement` / `DamageFamily` are the Feature-1 typed shapes
(TS mirror under `src/sim/`) — not redefined here (P8).

---

## 3. `src/server/matchmaking.ts` — random selection (research C1)

```ts
// Two-step random select: (1) a uniformly random ELIGIBLE defender — a user ≠ ctx.userId holding
// ≥1 active defense_snapshots row, drawn from the combined real+isBot pool — then (2) a random
// ACTIVE snapshot of that defender. Never self-matches; NO_OPPONENT only if the pool is truly
// empty (should not occur once Feature-7 cold-start bots exist, P5).
pickRankedOpponent(ctx): Result<MatchmakingSelection>   // errors: NO_OPPONENT

// A random squad from `squads`, owner ≠ ctx.userId and id ∉ exclude (self-exclusion always
// applied regardless of `exclude`; `exclude` additionally lets a refresh avoid immediately
// re-serving the squad just shown — a UX judgment call, not a spec requirement).
drawPracticeOpponent(ctx, exclude?: string[]): Result<PracticeDraw>
```

Both query the shared Feature-7 schema (`db/schema.ts` / `getDb()`) directly for the filtered
random read — the same "read module against the shared schema" shape [Feature 9](../009-ladder/plan.md)
already established for the Ladder; Feature 8 owns no schema and performs no *write* outside
Feature 7's `recordMatch` (plan.md Technical Context — Storage).

---

## 4. `src/server/arena.ts` — ranked preview & resolve (research B4)

```ts
// Server Action — no WASM. Validates the caller has ≥1 attackable squad (FR-001), runs
// pickRankedOpponent, and projects the selection to a fogged MatchTicket. Records nothing.
previewRankedMatch(ctx): Result<MatchTicket>   // errors: NOT_ATTACKABLE

// Node Route Handler body (behind app/api/arena/resolve/route.ts) — the ONLY WASM-invoking,
// P6 boundary in this feature. One synchronous call resolves + records the whole Bo3:
//   ctx = resolveSession()                                   // never client-supplied
//   assert input.attackSquadId ∈ listAttackable(ctx)          // F7 A2, re-checked at deploy
//   snapshot = bind(input.ticketSnapshotId)                   // immutable frozen row, F7 FR-014
//   { ruleset, rulesetHash } = loadCurrentRuleset()            // the ruleset seam (§6)
//   seed = serverSeed()                                        // never client-supplied (§7)
//   { replay, result } = resolveBattle({ armies:[attackerCfg, snapshot.config], ruleset, seed,
//       matchConfig:{ adaptation:"Locked", defenderSide:"defender", bestOf:3 } })  // F1, in-process
//   { matchId } = recordMatch({ mode:"ranked", attackerUserId:ctx.userId,
//       defenderUserId:snapshot.userId, attackerSquadId:input.attackSquadId,
//       defenderSnapshotId:snapshot.id, result, replay })       // F7, one tx (A5)
//   return { matchId }
startRankedMatch(ctx, input: RankedMatchRequest): Result<{ matchId: string }>
  // errors: NOT_ATTACKABLE, INVALID_TICKET (snapshot no longer resolvable), VALIDATION_FAILED
```

`startRankedMatch` never accepts (or reads) an opponent, seed, ruleset, or outcome from `input` —
`RankedMatchRequest` structurally has no such fields (§1).

---

## 5. `src/server/practice.ts` — practice draw & resolve

```ts
// Server Action — re-draws via drawPracticeOpponent, excluding the currently-shown squad.
refreshPracticeOpponent(ctx, currentDrawSquadId?: string): Result<PracticeDraw>

// Node Route Handler body (app/api/practice/resolve/route.ts). Same shape as startRankedMatch
// with three differences: the opponent is a `squads` config (not a snapshot), `matchConfig.
// adaptation = "Free"`, and `recordMatch({ mode:"practice", … })` — which writes a match+replay
// but changes NO ladder_standings value and marks the opponent identity hidden (F7 FR-019).
startPracticeMatch(ctx, input: PracticeMatchRequest): Result<{ matchId: string }>
```

---

## 6. `src/server/ruleset.ts` — the live-ruleset seam (research D1)

```ts
// v1: returns a committed default Ruleset (the Feature-1 seed ruleset) + its hash. The resolve
// path (§4/§5) reads "the current ruleset" through this ONE seam so Feature 12's future editable
// store — or an added Feature-7 `rulesets` table — swaps in with ZERO change to startRankedMatch/
// startPracticeMatch (plan.md Cross-feature coordination notes; flagged, not blocking).
loadCurrentRuleset(): { ruleset: Ruleset; rulesetHash: string }
```

## 7. `src/server/seed.ts` — the match seed (research B3)

```ts
// A fresh cryptographically-strong u64 per match, marshaled to match Feature-7's numeric(20,0)
// seed columns. Never accepts, previews, or derives from any client-supplied value (P6).
serverSeed(): bigint
```

---

## 8. Route Handlers (Node runtime — the WASM-invoking, P6 boundary)

```
POST /api/arena/resolve
  body: RankedMatchRequest                 // { attackSquadId, ticketSnapshotId } — the ONLY fields read
  → 200 { matchId: string }
  → 4xx { error: "NOT_ATTACKABLE" | "INVALID_TICKET" | "VALIDATION_FAILED" | "NO_OPPONENT", reason }

POST /api/practice/resolve
  body: PracticeMatchRequest                // { opponentSquadId }
  → 200 { matchId: string }
  → 4xx { error: string, reason }
```

Both routes run on `runtime = "nodejs"` and are the two entrypoints `next.config.ts`'s
`outputFileTracingIncludes` traces `@wfc/engine-wasm`'s `.wasm` into (research B2); the client
obtains the outcome only by fetching the **server-recorded** replay/summary by `matchId` (Feature
5/6 `getReplay`) — never as a payload this response carries directly.

---

## 9. Trust boundary summary (P6 — NON-NEGOTIABLE)

| Determined by | Never determined by |
|---|---|
| **Attacker identity** — `ctx.userId` from the server session | A client-supplied user id |
| **Opponent + snapshot** — `pickRankedOpponent`/`drawPracticeOpponent` | Any `opponentId`/`defenderUserId` field in the request |
| **Seed** — `serverSeed()`, crypto-strong, fresh per match | Any `seed` field in the request |
| **Ruleset** — `loadCurrentRuleset()` | Any `ruleset`/`rulesetHash` field in the request |
| **Outcome** — `resolveBattle()` run server-side, in-process | Any `result`/`winner`/`replay` field in the request |
| **The write** — `recordMatch` called once, inside the orchestrator, immediately after `resolveBattle` | Any client-reachable function signature (Feature-7 rule A5) |

## 10. Reused types (not redefined here)

- `BattleInput` / `BattleOutput` / `MatchConfig` / `Ruleset` — [Feature-1 engine-api](../001-battle-sim-core/contracts/engine-api.md).
- `Squad` / `DefenseSnapshot` / `Match` / `Replay` / `LadderStanding` — [Feature-7 data-model](../007-accounts-persistence/data-model.md) / [persistence-api](../007-accounts-persistence/contracts/persistence-api.md) (`listAttackable`, `recordMatch`, `getReplay`, …).

## Non-goals

Engine internals, persistence/standings internals, the Garage/Ladder/Playback/Summary screens, and
live ruleset **editing** — all downstream/upstream features this contract calls or hands off to,
never reimplements (spec FR-016, plan.md Scale/Scope).
