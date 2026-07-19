# Contract: Replay Format (wire schema)

**Feature**: `001-battle-sim-core` | **Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

The serialized shape of a **Replay** — the engine's primary output (**FR-021**),
produced by Rust (`serde`) and consumed by the TypeScript client (Feature 5) and the
balancer (Feature 2). This is the artifact the previous game got wrong (event/delta
streams that forced re-simulation to seek); the format here is designed so the
**scrubber seeks any tick by array-indexing and never re-simulates** (Revision Notes,
**SC-002**).

## Decisions (from [research.md](../research.md))

| # | Decision | Rationale |
|---|---|---|
| 1 | **Plain JSON**, stored in a Postgres **`jsonb`** column | Meets the hard constraint (instant TS random-access seek, cross-language Rust↔TS, versioned) with zero binary friction; every binary codec buys nothing at this size. |
| 2 | **Full per-tick state snapshots + events** (not deltas) | Seeking = array index; no reconstruction, no re-sim. |
| 3 | **Positional / columnar arrays** keyed by a `unitOrder` dictionary | Cuts raw size ~2–3× vs keyed objects and compresses better, while keeping `snapshots[tick]` trivial. |
| 4 | **Tick-indexed arrays**: `snapshots[tick]`, `events[tick]` | O(1) seek; decode the whole replay once into memory, then index. |
| 5 | Integer **`formatVersion`** + supported-range gate | Explicit accept/reject; no silent mis-render. |
| 6 | Persist **seed + army inputs + rulesetHash** alongside | Enables server-side **regenerate-not-migrate** on a format bump (deterministic engine); client stays a pure player. |

Size envelope (research): typical 300–450-tick battle ≈ **70–150 KB raw**, worst case
(1000-tick cap) ≈ 250–400 KB compact raw, all **5–10× smaller stored** (Postgres TOAST
auto-compresses jsonb over ~2 KB). No `bytea`, no gzip-by-hand, no Blob offload at this
scale — documented escape hatch: MessagePack-in-`bytea` (postgres-js handles binary
natively) *only if* replays ever exceed multiple MB and profiling proves it.

## Top-level shape

```jsonc
{
  "formatVersion": 1,                 // integer; player gates on a supported range
  "meta": {
    "seed": "1234567890",             // u64 as string (JSON-safe)
    "rulesetHash": "…",               // provenance of the balance table used
    "tickRate": 10,
    "tickCap": 1000,
    "matchConfig": { "adaptation": "Locked", "defenderSide": "B", "bestOf": 3 },
    "unitOrder": [                     // column dictionary → makes positional rows self-describing
      { "side": "A", "instanceId": 0, "typeId": "HeavyTank", "variantId": "Grizzly" },
      // … all 10 units, stable order …
    ],
    "armies": { /* the exact Army inputs (data-model), for debug/repair + regeneration */ }
  },
  "games": [                          // 1–3 GameReplays (Bo3)
    {
      "gameResult": { "winner": "A", "condition": "Conquest", "rewardTier": "Full", "durationTicks": 412 },
      "snapshots": [                  // index === tick; row order matches meta.unitOrder
        // tick 0: one positional row per unit → [hull, shield, zoneIdx, aliveFlag]
        [ [1700, 0, 1, 1], [650, 0, 1, 1], /* … 10 units … */ ],
        // tick 1 …
      ],
      "events": [                     // index === tick; small array per tick
        [ { "t": "shot", "a": 0, "d": 5, "dmg": 172 },
          { "t": "hit",  "a": 0, "d": 5, "dmg": 172, "layer": "hull" } ],
        // tick 1 …
      ]
    }
  ],
  "result": { /* MatchResult — see data-model; reconcilable from events (SC-002) */ }
}
```

### Snapshot row (positional)

`[hull, shield, zoneIdx, aliveFlag]` per unit, in `meta.unitOrder` order.
- `hull`, `shield`: fixed-point rendered as integers at the ruleset scale (research.md pins the scale; client divides for display).
- `zoneIdx`: `0=Air, 1=Front, 2=Middle, 3=Rear`.
- `aliveFlag`: `1|0`.

Cooldowns / active-dial state are **engine-internal** and not snapshotted per tick
(they're not needed to render playback); they can be reconstructed from events if a
tool ever needs them. Snapshots carry exactly what the renderer draws.

### Event kinds (`t`)

`shot` · `hit` · `miss` · `damage` · `death` · `move` · `planb` · `support` — each with
`a` (actor instance index into `unitOrder`), optional `d` (defender/target index), and
compact magnitudes (`dmg`, `layer`, `fromZone`/`toZone`, `slot`, `effect`). The full
per-kind field list lives with the Rust `TickEvent` enum (single source of truth) and
its TS mirror.

## Consumer contract (TS playback reader — Feature 5)

```ts
// Pure, no engine, no re-sim. Parses once, indexes forever.
const replay = ReplaySchema.parse(rowJson);        // validate formatVersion in range
if (!supported(replay.formatVersion)) reject();
const frame = replay.games[g].snapshots[tick];     // O(1) seek — the whole point
const events = replay.games[g].events[tick];
```

The reader is the seek primitive the scrubber (spec: "scrubber/playback controls like
in the wireframes") sits on. **Reconstructability (SC-002)** is a test: for every tick,
the reader's frame must equal the engine's computed state, and `Σ events.dmg` must equal
`result` damage totals.

## Storage (Feature 7 schema; noted here as the contract's other consumer)

One `replays` row: `jsonb` replay column + first-class scalar columns for the fields a
query filters/joins on — `seed`, `rulesetHash`/`rulesetVersion`, `formatVersion`,
`winner` — so the server can gate/select without parsing the blob. Army inputs live in
the jsonb `meta` (and/or their own columns). Drizzle: `.$type<Replay>()` on the jsonb
column gives end-to-end TS typing.

## Versioning policy

- **Additive change** within a major: add fields as optional (`Option<T>` in Rust,
  optional in the TS schema); old players tolerate absence.
- **Breaking layout change**: bump `formatVersion`. Players reject unknown versions
  explicitly.
- **Migration is regeneration**: because `seed + armies + rulesetHash` are persisted, an
  old replay is re-emitted server-side by re-running the deterministic engine at the
  current format — never migrated in place, never re-simulated on the client.
