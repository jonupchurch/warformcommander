# Research: Arena (async matchmaking) + Practice sandbox

**Feature**: `008-arena-practice` | **Date**: 2026-07-19 | **Plan**: [plan.md](./plan.md)

Resolves the technical unknowns behind Feature 8's orchestration. Format per decision:
**Decision / Rationale / Alternatives considered**, sources cited inline. The engine
(Feature 1) and persistence (Feature 7) are **given**; this feature only decides *how it wires
them together on Vercel*. The unknowns cluster into four workstreams — **(A) sync vs. queued
resolution**, **(B) server match-resolution flow & WASM reuse**, **(C) random matchmaking
selection in Postgres**, **(D) the live-ruleset-loading seam** — plus a short note on the
blind/locked guarantee.

---

## Workstream A — Synchronous vs. queued resolution

### A1. Resolution model → **synchronous server resolution inside the deploy request**

- **Decision**: Resolve the Bo3 **synchronously** in the deploy request/action: select opponent
  → generate seed → load ruleset → `resolve()` (WASM) → `recordMatch()` → return the match id, all
  in one server invocation. No queue, no background job, no `after()`/`waitUntil` for the ranked
  path.
- **Rationale**:
  1. **The compute is tiny.** A Bo3 is at most `3 × 1000 ticks × 10 units` of integer/fixed-point
     work (Feature-1 tick model, §9); Feature 1 targets **≥10,000 Bo3 resolutions in minutes**
     natively (SC-006), so a *single* WASM Bo3 is sub-second. That sits **orders of magnitude**
     under Vercel's **default 300 s** function duration on Fluid Compute (and the 800 s Pro/Enter
     ceiling), so there is no timeout pressure — the exact situation the "only make users wait
     synchronously for things they actually need" guidance calls for, and the user here *is*
     waiting to watch their own battle.
  2. **Determinism removes the reasons to queue.** Queues exist to decouple slow/unreliable work,
     absorb spikes, and survive retries. A `resolve()` is pure, total, and fast (P6) — a retry is
     just a re-run of the same deterministic function, and there is no external I/O to be flaky. A
     queue would add latency (enqueue + poll/callback) and a whole new failure surface for zero
     correctness benefit.
  3. **One transaction, one result.** The player must see *their* match id and standings move
     immediately; a synchronous path writes `matches`+`replays`+`ladder_standings` in one Feature-7
     transaction and returns the id in the same response.
- **Alternatives considered**: *Vercel Queues / Workflows / `after()` background resolution* —
  rejected for the v1 single-match path (adds latency + a delivery/consistency surface for no gain).
  Kept explicitly as the **deferred** path for two future cases the design foreshadows: **batch /
  tournament / season-rollover resolution** and the **offline Monte-Carlo balancer** (Feature 2,
  native — not a request path at all). *Client-side resolution* — impossible by construction: the
  engine never ships to the browser (P6, Feature-1 engine-api).
- Sources: [Vercel — configuring function maxDuration](https://vercel.com/docs/functions/configuring-functions/duration),
  [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute),
  [Vercel Functions limits](https://vercel.com/docs/functions/limitations),
  [Vercel Queues concepts](https://vercel.com/docs/queues/concepts),
  [Inngest — long-running background functions on Vercel](https://www.inngest.com/blog/vercel-long-running-background-functions).

---

## Workstream B — Server match-resolution flow & WASM reuse

### B1. Engine invocation → **reuse Feature-1's in-process `resolveBattle()`; no self-HTTP**

- **Decision**: Feature 8's server orchestration imports the Feature-1 **WASM host wrapper**
  (`resolveBattle()` from `src/sim/`, which wraps `@wfc/engine-wasm`) and calls it **in-process**
  from the server module. It does **not** POST to Feature-1's `app/api/resolve/route.ts` over HTTP.
- **Rationale**: Both live in the same Next.js app on the same Node runtime; an in-process call
  avoids a self-HTTP hop (a second cold start, serialization round-trip, and a spurious public
  surface). Feature 1 already owns the marshaling and the byte-in/byte-out WASM boundary
  (research C1); Feature 8 hands it a `BattleInput` and gets a `BattleOutput`. The engine stays the
  single self-contained module (Feature-1 FR-023); Feature 8 imports it, it does not fork it.
- **Alternatives considered**: *Self-HTTP to `/api/resolve`* — rejected (latency, extra surface).
  *A second engine binding* — rejected outright (two engines drift → breaks determinism, P6).
- Source: [engine-api contract](../001-battle-sim-core/contracts/engine-api.md) (JS↔WASM boundary,
  server host).

### B2. Vercel WASM packaging → **extend `outputFileTracingIncludes` to Feature-8's resolve entrypoints**

- **Decision**: The resolve+record orchestration is exposed behind **Node-runtime Route Handlers**
  (`app/api/arena/resolve/route.ts`, `app/api/practice/resolve/route.ts`, `runtime='nodejs'`), and
  `next.config.ts`'s `outputFileTracingIncludes` is **extended** so `@wfc/engine-wasm`'s
  `engine_bg.wasm` is traced into **these** function bundles too — not only Feature-1's `/api/resolve`.

  ```ts
  // next.config.ts (extends Feature-1's config)
  outputFileTracingIncludes: {
    '/api/resolve':          ['./node_modules/@wfc/engine-wasm/**/*.wasm'],
    '/api/arena/resolve':    ['./node_modules/@wfc/engine-wasm/**/*.wasm'],
    '/api/practice/resolve': ['./node_modules/@wfc/engine-wasm/**/*.wasm'],
  },
  ```
- **Rationale**: Vercel traces files per function with `@vercel/nft`; the wasm-bindgen glue loads
  its `.wasm` via a `__dirname`-joined path nft does not always trace — the classic "wasm not found
  at runtime" (Feature-1 research B2). Any function that instantiates the engine needs its own
  tracing entry. A **Route Handler** (not a bare Server Action) is chosen for the resolve step
  because it gives a **stable, explicit tracing key** to attach the `.wasm` to, mirrors Feature-1's
  `/api/resolve`, and is the right shape for a **security-critical, non-form server surface** (P6) —
  the stack pack reserves route handlers for "non-UI JSON APIs / boundaries you validate every input
  at." `serverExternalPackages: ['@wfc/engine-wasm']` (already set by Feature 1) is inherited.
- **Alternatives considered**: *Resolve inside a plain Server Action* — the idiomatic mutation shape
  (stack pack), but WASM tracing folds into the *calling route's* bundle less explicitly, and this
  is a P6 boundary better modeled as an explicit endpoint. **Preview / skip / refresh** (which run
  **no** WASM — pure DB selection) **are** Server Actions. *`--target bundler` wasm import* —
  rejected (breaks under Turbopack; Feature-1 research B1).
- Sources: [Vercel WASM runtime](https://vercel.com/docs/functions/runtimes/wasm),
  [Next.js output file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
  [Feature-1 research B2](../001-battle-sim-core/research.md).

### B3. Seed generation → **server-side crypto `u64`, persisted; never client-supplied**

- **Decision**: Generate the match seed server-side from a cryptographically-strong source
  (`crypto.getRandomValues` / `crypto.randomBytes` → a `u64`, marshaled as the "u64-as-string" the
  replay/DB already use), one per match, and persist it (Feature-7 `matches.seed` /
  `replays.seed`, `numeric(20,0)`). The client never provides or previews it.
- **Rationale**: The seed is the sole driver of engine RNG (Feature-1 FR-011); letting the client
  influence it would let a player grind seeds for a favorable roll — a P6/P1 breach. A fresh
  server seed per match plus the persisted armies + `rulesetHash` make the match **reproducible**
  (SC-007) while keeping RNG out of the client's hands. `u64` matches the engine's `seed: u64` and
  Feature-7's lossless `numeric(20,0)` storage.
- **Alternatives considered**: *Daily/seasonal shared seeds* (design §9 floats them for
  reproducible events) — deferred; async ladder matches want independent per-match seeds so two
  attackers vs the same snapshot get independent battles. *Client-supplied seed* — rejected (P6).
- Source: [engine-api determinism guarantees](../001-battle-sim-core/contracts/engine-api.md),
  [Feature-7 data-model — seed as `numeric(20,0)`](../007-accounts-persistence/data-model.md).

### B4. End-to-end ranked flow (the orchestration, once)

```
deploy(attackSquadId, ticketSnapshotId)         // client → server (session-authenticated)
  ├─ ctx = resolveSession()                       // attacker identity is server-derived (never client)
  ├─ assert squad ∈ listAttackable(ctx)           // F7 ownership + attackable at deploy (A2)
  ├─ snapshot = bind(ticketSnapshotId)            // immutable frozen row by id (F7, US3/FR-008)
  ├─ { ruleset, rulesetHash } = loadCurrentRuleset()   // the ruleset seam (D1)
  ├─ seed = serverCryptoU64()                     // B3 — never client
  ├─ input = { armies:[attackerCfg, snapshotCfg], ruleset, seed,
  │            matchConfig:{ adaptation:Locked, defenderSide:defender, bestOf:3 } }
  ├─ { replay, result } = resolveBattle(input)    // F1 WASM, in-process (B1)
  ├─ { matchId } = recordMatch({ mode:'ranked', attackerUserId, defenderUserId,
  │        attackerSquadId, defenderSnapshotId, result, replay })   // F7 — writes match+replay+standings (A5)
  └─ return { matchId }                            // client fetches server-recorded replay by id (F5/F6)
```

Practice differs only in: opponent drawn from `squads` (not a snapshot), `adaptation:Free`,
`mode:'practice'`, identity concealed, and **no standing change** (Feature-7 records it but mutates
nothing).

---

## Workstream C — Random matchmaking selection in Postgres

### C1. Selection query → **filtered `ORDER BY random()` at v1 scale; two-step for per-player fairness**

- **Decision**: Select the ranked opponent in the service layer with a **filtered random pick**:
  (1) choose a random eligible **defender user** (`users` who are not the attacker and have ≥1
  active snapshot, real **or** `isBot`), then (2) choose a random **active snapshot** of that
  defender (their ≤3). At v1 cold-start scale this is a plain `ORDER BY random() LIMIT 1` over the
  filtered set — e.g.:

  ```sql
  -- step 1: a random eligible defender (real + bot pool, self excluded)
  SELECT u.id FROM "user" u
   WHERE u.id <> :attacker
     AND EXISTS (SELECT 1 FROM defense_snapshots d WHERE d.user_id = u.id AND d.active)
   ORDER BY random() LIMIT 1;
  -- step 2: a random active snapshot of that defender (blind serve; ≤3)
  SELECT * FROM defense_snapshots
   WHERE user_id = :defender AND active
   ORDER BY random() LIMIT 1;
  ```
- **Rationale**:
  - **`ORDER BY random()` is correct and fair; its only sin is speed at scale** — it sorts the whole
    candidate set to keep one row. At v1 (a cold-start pool of tens-to-low-thousands of snapshots)
    that cost is negligible, and it gives **exactly** the uniform, `WHERE`-filtered draw we need.
  - **The fast alternative can't do our filter.** `TABLESAMPLE` (SYSTEM/BERNOULLI) is ~orders of
    magnitude faster on **millions** of rows, but it samples at the **table/block scan level and
    cannot be combined with a `WHERE` clause** — and our draw is *inherently* filtered (exclude
    self, `active` only, has-snapshot). So `TABLESAMPLE` doesn't fit the v1 need; it (or keyset /
    random-offset tricks over an indexed id) is the **documented optimization to reach for only when
    the pool grows large** and profiling proves the sort a bottleneck.
  - **Two-step gives per-player fairness.** Drawing a random *snapshot* directly
    (`… WHERE active AND user_id<>:self ORDER BY random()`) is simpler but weights a defender with 3
    active snapshots 3× a defender with 1. The two-step draw makes each **player** equally likely
    (matching §13's "anyone has a shot at anyone"), then each of that player's snapshots equally
    likely — the intuitive reading of §16.2's "one is served at random." (The one-query snapshot
    draw is recorded as the simpler alternative if per-player fairness is later judged unnecessary.)
  - **Never empty (P5), never self.** `isBot` seeded accounts always hold active snapshots
    (Feature-7 cold-start), so the eligible set always has ≥1 non-self row; `u.id <> :attacker`
    guarantees self-exclusion. If the set is somehow empty, the service returns a typed
    `NO_OPPONENT` — it never falls back to self.
- **Practice draw**: identical shape over `squads` instead of `defense_snapshots`
  (`SELECT * FROM squads WHERE user_id <> :self ORDER BY random() LIMIT 1`), opponent identity
  stripped from the response.
- **Matchmaking randomness ≠ engine seed.** `ORDER BY random()` picks *who* you fight; the persisted
  **`u64` seed** (B3) drives *how* the battle rolls. They are independent — matchmaking is not
  required to be reproducible; the *battle* is.
- **Alternatives considered**: *`TABLESAMPLE BERNOULLI/SYSTEM`* — deferred (can't combine with the
  `WHERE` filter; wins only at millions of rows). *Random-offset over an indexed running count /
  keyset random* — deferred (the redpill-linpro / JetRockets "faster random" techniques) for the
  large-pool era. *One-query random snapshot* — simpler, but per-snapshot (not per-player) weighting.
- Sources: [redpill-linpro — getting random rows faster](https://www.redpill-linpro.com/techblog/2021/05/07/getting-random-rows-faster.html),
  [JetRockets — efficient random rows in Postgres](https://jetrockets.com/blog/how-to-quickly-get-a-random-set-of-rows-from-a-postgres-table),
  [Render — random samples from big Postgres tables](https://render.com/blog/postgresql-random-samples-big-tables),
  [Feature-7 data-model — pool queries / serve a defender](../007-accounts-persistence/data-model.md).

---

## Workstream D — The live-ruleset-loading seam

### D1. "The current ruleset" → **a `loadCurrentRuleset()` seam; v1 default; Feature 12 owns the store (COORDINATION)**

- **Decision**: Feature 8 reads the balance table the engine needs through a **single seam**,
  `loadCurrentRuleset(): { ruleset: Ruleset, rulesetHash: string }`. In **v1** it returns a
  **committed default ruleset** (the Feature-1 seed ruleset / a `ruleset.default.ts`) and its hash.
  The resolved match stamps that `rulesetHash` (Feature-7 `matches`/`replays`). When **Feature 12**
  (live base-stat editing, §16.2) ships an editable store, `loadCurrentRuleset()` reads from it —
  **Feature 8's resolve path does not change.**
- **Rationale / the gap being flagged**: The design makes the **ruleset an engine input**,
  admin-editable **live** and **un-versioned** (§16, §16.2, Feature-1 FR-007). Feature-7's schema
  persists a `rulesetHash` on every match/replay, **but defines no ruleset *table*** — and **no
  shipped feature yet owns the editable live ruleset the resolve path must read.** That store is a
  real cross-feature dependency: Feature 8 *needs* "the current ruleset" at resolve time; Feature 12
  *produces* it. The seam lets Feature 8 be built and tested now (against the default) without
  blocking on Feature 12, and pins the exact integration point. **Coordination ask (surfaced to
  Features 12 and 7):** decide who owns the live ruleset store — the natural options are (a) a
  **Feature-12-owned** ruleset store (row / Edge Config / KV) read via this seam, or (b) an added
  **Feature-7 `rulesets` table** (one active row) alongside the existing `rulesetHash` columns.
  Either way, the un-versioned live ruleset means a bump is a **re-emission** from persisted
  seed+armies (Feature-1 research C4), never an in-place migration.
- **Alternatives considered**: *Bake a ruleset constant into Feature 8* — rejected (violates P8 /
  Feature-1 FR-007; the engine hard-codes no numbers and neither should its caller). *Block Feature 8
  on Feature 12* — rejected (unnecessary coupling; the seam decouples them).
- Sources: [design §16 / §16.2 — ruleset as live-editable input](../../reference/warformcommandergamedesigndoc.md),
  [engine-api — ruleset is a data input](../001-battle-sim-core/contracts/engine-api.md),
  [Feature-7 data-model — rulesetHash columns, no ruleset table](../007-accounts-persistence/data-model.md).

---

## Note — the blind & locked guarantee (design, not a new mechanism)

Blindness and Bo3-locking are **inherited from Feature 7 + Feature 1**, not re-invented here:

- **Random, un-chooseable serve** — the attacker's request carries only *their* squad id; the
  opponent and snapshot are picked server-side (C1), so the attacker cannot select a favorable one.
- **Behavior fog** — the pre-battle preview projects only composition / placement / power / derived
  tags from the served snapshot; its dials/Plan-B never leave the server (FR-007, matching §3's
  "opponent behaviors are hidden" and the Arena mockup, which shows the enemy *board* but no logic).
- **Immutable & locked** — one `resolve()` call runs the whole Bo3 with `adaptation=Locked` against
  the **one** served snapshot (Feature-1 SC-007), and Feature-7 snapshots are **immutable frozen
  copies retained while referenced** (FR-014), so binding by id at deploy is always safe even if the
  defender re-designates mid-window.

---

## Cross-cutting decisions (summary for plan.md Technical Context)

| Area | Decision |
|---|---|
| **Resolution model** | **Synchronous** in the deploy request — Bo3 compute is sub-second, ≪ Vercel 300 s Fluid default; queue/Workflows deferred to batch/tournament + the native balancer |
| **Engine invocation** | Reuse Feature-1 `resolveBattle()` **in-process** (no self-HTTP); Feature 8 never forks the engine |
| **Vercel WASM packaging** | Node Route Handlers `app/api/{arena,practice}/resolve`; **extend** `outputFileTracingIncludes` with the `.wasm` for those keys; inherit `serverExternalPackages` |
| **Seed** | Server-side crypto `u64` per match, persisted; never client-supplied (P6) |
| **Matchmaking** | Filtered `ORDER BY random() LIMIT 1`, **two-step** (random eligible defender → random active snapshot) for per-player fairness; real+bot pool; self excluded; `TABLESAMPLE`/keyset deferred to large-pool era |
| **Practice draw** | Same random pick over `squads` (self excluded), identity concealed, `adaptation=Free`, `mode='practice'`, no standing change |
| **Ruleset** | `loadCurrentRuleset()` seam; v1 committed default + hash; **Feature 12 / Feature 7 must own the live editable store** (flagged) |
| **Recording** | Feature-7 `recordMatch` in one transaction (match+replay+standings); **no** client-reachable result-write path (A5, P6) |
| **Entrypoint shape** | Route Handler for resolve (tracing key + P6 boundary); Server Actions for preview/skip/refresh (no WASM) |

All spec unknowns (sync-vs-queue, resolution flow, matchmaking selection, ruleset seam) are
resolved. The one open **cross-feature** item — ownership of the live ruleset store — is a flagged
coordination note for Features 12/7, not a blocker for building Feature 8 against the seam.
