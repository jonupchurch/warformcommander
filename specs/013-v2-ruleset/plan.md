# Implementation Plan: v2 Ruleset — Second-Generation Content

**Branch**: `013-v2-ruleset` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-v2-ruleset/spec.md`

## Summary

Five independently-shippable content slices on the unchanged simulation core. The technical shape is
dictated by three facts about this codebase:

1. **Live battles read a frozen ruleset row, not the compiled engine.** Content reaches production
   through a re-seed, so each slice ships as its own ruleset version. A wasm deploy alone changes
   nothing a player sees.
2. **The seed ruleset is hashed and golden-tested.** New ruleset *fields* can be made hash-invisible
   with `#[serde(default, skip_serializing_if = ...)]`, but new *catalog entries* cannot — the
   defense rebuild necessarily re-blesses the goldens once.
3. **Determinism is bit-exact across native and wasm.** The ablative save is the feature's only new
   random draw, and it shifts the RNG stream for every battle that consumes it.

The build order follows the spec's dependency chain: defenses first (they make the damage matrix
discriminate, which everything else needs), then stance and support stances in parallel, then the
Mech, then air staged one change at a time.

## Technical Context

**Language/Version**: Rust 2021 (engine, balancer) · TypeScript 5 (app, mirror types)

**Primary Dependencies**: `serde` (ruleset wire format), `rand_pcg` (pinned — determinism contract),
`wasm-pack` (nodejs target), Next.js 15 App Router, Drizzle + Neon Postgres, Vitest

**Storage**: Neon Postgres. The `current_ruleset` row is the live balance table; `saveRuleset()` plus
a re-seed is the only path content takes to production.

**Testing**: `cargo test` (engine + balancer), the golden-hash replay suite,
`scripts/wasm-parity.mjs` (native vs wasm byte-identity across 4 seeds), Vitest via `npm test`, and
the Monte-Carlo balancer as the measurement instrument for every success criterion.

**Target Platform**: native x86-64 (balancer, tests) and wasm32 (browser + server routes) from one
source. Both must produce byte-identical replays.

**Project Type**: deterministic simulation core (Rust → wasm) plus a Next.js application reading the
same typed content.

**Performance Goals**: unchanged. A battle resolves in milliseconds; a balancer field sweep is 132
matchups × 400 samples and must stay within its current runtime envelope.

**Constraints**:

- Fixed-point arithmetic only (`Bp` = basis points, `Fixed` = milli). No floats anywhere in the sim.
- No `usize`/`isize` RNG draws (width differs between wasm32 and native64).
- New enum variants break deserialization of a frozen ruleset — **wasm must deploy before any
  re-seed that introduces one.**
- Balance magnitudes live in the ruleset as data, never as literals in engine code (P8).

**Scale/Scope**: 7 mount classes × 4 defense families = 28 generated modules; 8 stance options across
2 role sets; 1 new damage layer; 1 new equipment module; 4 staged air changes; ~21 chassis variants
rebased.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Gate |
|---|---|---|
| **P1** Non-P2W | Content adds configuration, not purchasable power. Every new option is available to every player at no cost. | PASS |
| **P2** Planning over twitch | Directly served: the feature replaces stat-check outcomes with pre-battle decisions, and explicitly targets the Mech for winning on arithmetic rather than on choices. | PASS |
| **P3** Depth from configuration | This *is* the P3 repair. No new chassis, variants, or machine types — depth comes from options on existing axes. | PASS |
| **P4** Fairness verified | Every success criterion is balancer-measurable. **Gate condition:** the archetype field never varies stance today, so SC-006/SC-007 are unverifiable until stance-varying fixtures exist. Those fixtures are a prerequisite task, not an afterthought. | PASS *with prerequisite* |
| **P5** Content from players | Not applicable — no ladder or player-content surface changes. | N/A |
| **P6** Determinism (NON-NEGOTIABLE) | The ablative save adds the first new RNG draw since Feature 1. **Gate conditions:** the draw sits at one fixed point in the pipeline; `mitigate` stays a pure function by receiving a pre-rolled outcome rather than an RNG handle; parity re-verified on all seeds after every slice. | PASS *with conditions* |
| **P7** Both platforms | Customize-screen additions must read correctly in mobile portrait and desktop landscape. | PASS |
| **P8** Data-driven content | All magnitudes — scale factors, aggro tiers, save probability, execute threshold, air rates — are ruleset fields. No balance literal enters engine code. | PASS |

**Process principles**: VII (plan the whole set first) is satisfied by this document preceding all
implementation. IX (branch per feature, atomic commits) means one branch and one ruleset version per
*slice*, not one for the whole feature.

**No unjustified violations.** Two justified complexities are recorded below.

### Post-design re-check

Re-evaluated after Phase 1. All gates still pass, and the two conditional ones now have concrete
mechanisms rather than intentions:

- **P6 conditions are satisfied by design, not by discipline.** R3 keeps `mitigate` pure by passing a
  pre-rolled boolean instead of an RNG handle, so the counter-web unit tests survive untouched. R4
  caps absorption at the remaining pool, which keeps the save worth ~25% extra capacity — bounded
  texture rather than a coin flip that decides battles. R9 resolves family ties by declaration order,
  so reproducibility holds when two families land in one tick.
- **The P4 prerequisite is now a scheduled task.** R8 places the stance-varying archetype fixtures
  inside slice 2, ahead of the mechanic they measure. Without them the balancer would report stance as
  inert no matter how well it worked, because a uniform-stance army is by design identical to an
  all-Neutral one.
- **P8 held under design pressure.** Every magnitude that surfaced during Phase 1 — save chance,
  execute threshold and bonus, mount scale factors, aggro tiers, the energy air rate — landed in a
  ruleset table. No balance literal reached engine code.
- **One new risk surfaced and was accepted**: `DamageLayer::Ablative` is a new enum variant, which
  puts slice 1 under R7's deploy-before-re-seed rule. This was not visible at the pre-design check and
  is now recorded in both the contract and the quickstart.

## Project Structure

### Documentation (this feature)

```text
specs/013-v2-ruleset/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — resolved technical unknowns
├── data-model.md        # Phase 1 — entities, state, transitions
├── quickstart.md        # Phase 1 — how to validate each slice
├── contracts/
│   └── ruleset-additions.md   # The Ruleset wire contract for v12+
├── checklists/
│   └── requirements.md  # Spec quality checklist (passed)
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
crates/engine/src/
├── model/
│   ├── types.rs         # DefenseSpec (+ablative), Stance, Capability, MountClass
│   ├── ruleset.rs       # StanceAggro, MountScale, AblativeMods, AirRates (new tables)
│   └── army.rs          # derive_effective_stats — ablative capacity derivation
├── sim/
│   ├── mod.rs           # Combatant state (+ablative pool, +absorbed-by-family); support stances
│   ├── target.rs        # aggro-tier narrowing before the Target Rule
│   ├── damage.rs        # ablative layer in mitigate(); reactive mitigation; execute bonus
│   └── behavior.rs      # unchanged — stance is not a magnitude dial
├── content.rs           # 28 generated defenses; chassis rebase; Rocket Pack; laser air rate
└── replay/mod.rs        # MachineSnapshot — additive ablative field

crates/engine/tests/
├── counterweb.rs        # existing — extended for the three defensive layers
├── stance.rs            # new — aggro tiers, role split, execute
└── defenses.rs          # new — layer behaviour, ablative depletion + save

crates/balancer/src/
└── archetypes.rs        # stance-varying fixtures (P4 gate prerequisite)

sim/                     # TypeScript mirrors — ruleset.ts, model.ts, legality.ts
server/ruleset-validate.ts   # trust boundary for the new fields
lib/garage/explain.ts    # Customize copy, computed from live ruleset values
components/garage/       # dial + loadout editors — role-filtered stance options
```

**Structure Decision**: No new top-level modules. Every change lands in an existing file that already
owns that concern — targeting in `target.rs`, the damage pipeline in `damage.rs`, content in
`content.rs`, balance tables in `ruleset.rs`. This is deliberate: the feature is content plus five
narrow mechanics, and inventing new modules for it would misrepresent its shape and violate III
(match existing conventions). The only genuinely new surface is two test files.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A third damage layer (ablative) inside `mitigate`, the engine's most carefully-tested pure function | The spec requires three defensive identities that fail to different threats. Two layers cannot express "does not regenerate, resists penetration, streaky" without collapsing into shields. | Flat splash mitigation (what Blast Plating does today) was rejected: it is a modifier on an existing layer, so it produces no distinct survival profile and leaves the matrix with only one layer to discriminate against — the exact problem this feature exists to fix. |
| An additive `ablative` field on `MachineSnapshot`, brushing the "replay format unchanged" boundary | Without it the battle UI cannot show a defensive layer that players chose and that visibly decides fights. | Deriving the pool from events was rejected: the client would have to re-run mitigation math, duplicating engine logic in TypeScript and violating P6's single-simulation-core rule. The field is additive, so existing replays still parse. |

## Phase 0 & 1 Artifacts

- **[research.md](./research.md)** — eight resolved decisions covering RNG placement, layer ordering,
  hash stability, the enum-variant deploy hazard, and the balancer measurement gap.
- **[data-model.md](./data-model.md)** — new ruleset tables, new per-combatant battle state, the
  stance tier model, and state transitions for the ablative pool and reactive mitigation.
- **[contracts/ruleset-additions.md](./contracts/ruleset-additions.md)** — every new field, its serde
  default, whether it is hash-visible, and its validation rule.
- **[quickstart.md](./quickstart.md)** — the verification procedure per slice, including the engine
  cascade and the production differential.

## Slice Order

| # | Slice | Ships as | Depends on | Golden re-bless? |
|---|---|---|---|---|
| 1 | Defense catalog + chassis rebase | v12 | — | **Yes** (catalog changes) |
| 2 | Stance allocation (combat) | v13 | — | No (skip-serialized table) |
| 3 | Support stances + Empower | v14 | slice 2 (role split) | No |
| 4 | Mech identity | v15 | **slice 1** (matrix must discriminate) | Yes (new module) |
| 5a–5d | Air changes, one at a time | v16–v19 | slice 1 (heli rebase) | Varies |

Slices 2 and 3 may run concurrently with 1 — they touch targeting and support, not the damage
pipeline. Slice 4 must not start before 1 lands and is measured.
