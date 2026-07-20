# Contract: Persistence Service API

**Feature**: `007-accounts-persistence` | **Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

The server-side persistence surface Features 8–12 call. Implemented as **Next.js Server Actions**
(and/or Node route handlers) under `src/server/` — never client-callable DB access. **Every**
operation runs the trust-boundary checks in [data-model §Trust-boundary rules](../data-model.md)
(A1–A6): authenticated session required, ownership enforced, admin checked server-side, squad
configs validated by the shared Feature-1 `validate()` before write, and results written only by
the server (P6, Principle II).

Signatures are TypeScript-shaped; `Result<T>` = success `T` or a typed `{ error, reason }`.
`ctx` = the resolved server session (`{ userId, role }`) — **not** a client argument.

## Squad roster (US2)

```ts
// Create/save into a roster slot. Validates config; enforces 8-slot baseline; ownership implicit.
saveSquad(ctx, input: {
  slotIndex: number;            // 0..7 baseline (schema allows 0..63)
  name: string;
  config: SquadConfig;          // Feature-1 Army — validated by validate() BEFORE insert (A4)
}): Result<Squad>               // errors: VALIDATION_FAILED(reason), SLOT_CAP_EXCEEDED, SLOT_TAKEN

updateSquad(ctx, id, patch: { name?; config?; slotIndex? }): Result<Squad>  // re-validates config; bumps updatedAt
loadSquad(ctx, id): Result<Squad>                 // A2 ownership
listSquads(ctx): Result<Squad[]>                  // the user's roster
deleteSquad(ctx, id): Result<void>                // A2; snapshots/matches referencing it are retained (FK set null)
listAttackable(ctx): Result<Squad[]>              // squads WHERE defenseSlot IS NULL (US3-AS5)
```

`powerRating` is derived server-side from `config` on write (Feature-1 derivation); callers never
set it. `saveSquad`/`updateSquad` reject an illegal army with the validator's reason and write
nothing (SC-003).

## Defense designation & snapshots (US3)

```ts
// Transactional: freeze a copy → deactivate prior slot snapshot → mark squad as defender.
designateDefense(ctx, input: {
  squadId: string;
  slot: 0 | 1 | 2;              // ≤3 cap + slot distinctness enforced by partial-unique index (A6)
}): Result<DefenseSnapshot>     // errors: NOT_OWNER, SLOT_OCCUPIED_RACE, ALREADY_DESIGNATED

undesignateDefense(ctx, squadId): Result<void>    // squad → attack pool; snapshot soft-deactivated, retained if referenced
listDefense(ctx): Result<DefenseSnapshot[]>       // active snapshots (≤3)
redesignateDefense(ctx, squadId): Result<DefenseSnapshot>  // new snapshot of current config; old deactivated (immutability)
```

**Snapshot immutability is structural** — the snapshot `config` is an insert-only frozen copy;
editing the source squad (`updateSquad`) never touches it (SC-004). Matchmaking's blind, Bo3-locked
**serve** of one active snapshot is Feature 8; this API guarantees the served row is stable and
immutable.

## Match recording & replays (US4) — server-only (P6)

```ts
// Called by Feature 8 AFTER the server sim resolves. Writes matches + replays + standings in ONE tx.
recordMatch(ctx_server, input: {
  mode: "ranked" | "practice";
  attackerUserId: string;
  defenderUserId: string | null;      // null for some seeded/practice cases
  attackerSquadId: string | null;
  defenderSnapshotId: string | null;  // the served snapshot
  result: MatchResult;                // Feature-1 MatchResult (winner, Bo3 games, per-side damage, duration)
  replay: Replay;                     // Feature-1 Replay (stored as jsonb; provenance columns extracted)
}): Result<{ matchId: string }>       // ranked ⇒ also updates ladder_standings (US5); practice ⇒ no standing change

getMatch(ctx, matchId): Result<MatchSummary>            // scalar columns only (no blob parse)
listMatches(ctx, filter: { userId?; mode?; limit? }): Result<MatchSummary[]>  // recent/history (Profile)
getReplay(ctx, matchId): Result<Replay>                 // jsonb → typed Replay; gates on formatVersion,
                                                        // regenerates from seed+armies+rulesetHash if unsupported (FR-018)
```

- **Trust boundary A5**: `recordMatch` is invoked only by the server-side resolution path; the
  client can never submit or alter an outcome. Provenance (`seed`, `rulesetHash`, `formatVersion`,
  `winner`) is extracted into scalar columns so summaries/leaderboards never touch the jsonb.
- **Practice** matches (`mode='practice'`) change no standing and mark the opponent identity as
  hidden for downstream screens (FR-019).

## Ladder standing (US5)

```ts
getStanding(ctx, userId): Result<LadderStanding>        // net victories + career counters
getLeaderboard(ctx, opts: { limit; offset }): Result<LadderRow[]>  // ORDER BY netVictories DESC (Feature 9)
recomputeStanding(userId): Result<LadderStanding>       // reconciliation oracle from matches (SC-007; admin/CI)
```

`netVictories = attackWins − defenseLosses` (§13). Standings mutate only inside `recordMatch` for
`ranked` matches; `recomputeStanding` re-aggregates `matches` and must equal the cache (SC-007).

## News posts (shared; written by Features 11/12)

```ts
createPost(ctx, input: { slug; title; body; type; excerpt?; metadata?; status? }): Result<Post>
  // editorial ⇒ requires role check per Feature 11/12; balance/devlog auto-posts pass authorId=null
publishPost(ctx_admin, id): Result<Post>                // sets status='published', publishedAt=now()
listPublished(opts: { type?; limit; offset }): Result<Post[]>  // status='published' ORDER BY publishedAt DESC (News index)
getPostBySlug(slug): Result<Post>                       // article page
```

`listPublished` / `getPostBySlug` are the only **public** (no-session) reads in this API (the News
index and article pages are marketing pages). Authoring/publishing is gated (editorial → author or
admin; balance/devlog → server/admin). `authorId` is nullable for auto-published system posts.

## Presets (provided for Feature 4)

```ts
savePreset(ctx, input: { name; machineTypeId; config: PresetConfig }): Result<Preset>  // config validated per type
listPresets(ctx, machineTypeId?): Result<Preset[]>
deletePreset(ctx, id): Result<void>
```

## Cross-cutting

- **Transactions** (postgres-js `db.transaction`): `designateDefense`, `redesignateDefense`, and
  `recordMatch` are atomic — the interactive transactions this needs are exactly why the repo uses
  **postgres-js**, not neon-http (research C3).
- **Validation**: every `config` input passes the shared Feature-1 `validate()` before persistence
  (A4) — the same function the Garage and engine call (P8).
- **Errors** are typed reasons, never raw DB errors, so callers (and tests) can assert on them.

## Non-goals

Matchmaking selection logic, the Bo3 run loop, season/tier/MMR computation, the admin/editor UIs,
and the practice-draw algorithm — all downstream features. This API stores, retrieves, and
guards; it does not decide who fights whom or how the ladder is dressed.
