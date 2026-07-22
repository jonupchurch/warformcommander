# Phase 0 Research: v2 Ruleset

Technical unknowns resolved before design. Each decision was verified against the current source, not
assumed — file references are the evidence.

---

## R1. Where the ablative layer sits in the mitigation pipeline

**Decision**: Ablative sits **between shields and hull**, absorbing at a flat rate with no damage-matrix
multiplier applied.

The current pipeline in [`mitigate`](../../crates/engine/src/sim/damage.rs#L217) is: split off the
penetrating fraction → remainder hits shields at `× vs_shields` with overflow converted back → the
combined remainder hits hull at `× vs_armor × (1 − armor_pct)` with a minimum-damage floor. Ablative
inserts as a fourth step between the shield resolution and the hull application.

**Rationale**: The matrix's two axes are *vs shields* and *vs armour*. Giving ablative its own matrix
column would mean a third axis on every weapon and a much larger balance surface. Absorbing flat makes
ablative the layer that is *indifferent* to damage family — which is exactly its identity: it does not
care what is shooting it, only how long. That indifference is what makes it fail to attrition rather
than to a counter, and it keeps the matrix a 2×3 table.

**Alternatives considered**: A third matrix column (rejected — triples the tuning surface and makes the
counter-web harder for players to read, against P3's legibility goal). Ablative as a hull modifier
rather than a layer (rejected — cannot express depletion).

---

## R2. Whether penetration bypasses ablative

**Decision**: **No.** Penetration bypasses shields only. Ablative absorbs penetrating damage normally.

**Rationale**: This is what completes the counter-web. Each layer now has a distinct, non-overlapping
weakness:

| Layer | Countered by |
|---|---|
| Shield | penetration, and Energy via the matrix (`vs_shields` ×0.60) |
| Ablative | duration — it never comes back |
| Armor | Energy via the matrix (`vs_armor` ×1.25), and the minimum-damage floor |

Making ablative *the* answer to penetrating weapons gives it a reason to exist beside shields rather
than being a worse version of them, and it gives penetration a counter, which it currently lacks
entirely.

**Alternatives considered**: Penetration bypassing both (rejected — ablative becomes strictly inferior
to shields, since it also fails to attrition). Partial bypass (rejected — a second tuning knob for no
additional expressive power).

---

## R3. RNG placement for the ablative save, and keeping `mitigate` pure

**Decision**: Roll the save in `apply_damage`, **pass the outcome into `mitigate` as a pre-rolled
`bool`**. `mitigate` keeps its current signature shape and stays a pure function with no RNG handle.
Draw the roll **only when the target has a non-empty ablative pool**.

**Rationale**: [`mitigate`](../../crates/engine/src/sim/damage.rs#L217) is the engine's most carefully
tested pure function — the counter-web unit tests call it directly with no simulation around it.
Threading an `&mut Rng` through it would destroy that test surface for no benefit, since the roll does
not depend on any value computed inside it.

Drawing conditionally is safe here: the condition is itself deterministic battle state, so both build
targets consume the stream identically. It is also the minimal-disruption choice, since battles with no
ablative machines consume exactly the stream they do today.

The existing draw order is documented as *hit → crit → variance*
([damage.rs:5](../../crates/engine/src/sim/damage.rs#L5)); the save becomes a fourth position,
consumed per damage application — once for the primary target and once per splash victim that has a
pool.

**Alternatives considered**: Unconditional draws (rejected — shifts the stream for every battle in the
game including those with no ablative machine, maximising golden churn for no gain). Rolling once per
attack rather than per victim (rejected — splash victims would share one save outcome, which is
observably wrong and creates correlation between unrelated machines).

---

## R4. Ablative save semantics

**Decision**: Absorption is `min(incoming, pool_remaining)`. On a save, the pool is **not reduced**;
on a non-save it is reduced by the amount absorbed. **The save preserves capacity — it never grants
absorption beyond what the pool holds.**

**Rationale**: The naive reading ("the hit is free") would let a 10-point pool absorb a 500-point hit
one time in five, which is a hard counter to alpha strikes and precisely the binary outcome the spec
forbids. Capping absorption at the pool first and only then deciding depletion keeps the save worth
roughly 25% extra effective capacity — texture, not a coin-flip that decides battles (P6: randomness
is bounded texture, never a decider).

This also resolves two spec edge cases directly: overflow beyond the pool carries to hull, and a save
on a pool-emptying hit leaves the pool intact without any path to a negative value.

**Alternatives considered**: Full absorption on save (rejected as above). Save rolled once per battle
rather than per hit (rejected — turns a texture mechanic into a pre-battle coin flip).

---

## R5. Aggro-tier narrowing: insertion point and ruleset threading

**Decision**: Insert narrowing in [`select_target`](../../crates/engine/src/sim/target.rs#L65)
**between `pick_row` and `pick_unit`**. Thread `&Ruleset` into `select_target` — it does not currently
receive one.

**Rationale**: Placing narrowing after row selection and before rule selection is what makes stance work
with **all eight** target rules rather than only `BiggestThreat` (the only rule that reads threat
today). `pick_row` narrows reachable enemies to one zone; narrowing that set by tier before
`pick_unit` chooses means every rule operates on the survivors.

Two call sites need the new parameter: the stalemate probe at
[mod.rs:215](../../crates/engine/src/sim/mod.rs#L215) and the main attack loop at
[mod.rs:312](../../crates/engine/src/sim/mod.rs#L312). Narrowing can never empty a non-empty row (the
minimum tier group always has at least one member), so the stalemate probe's reachability answer is
unchanged — but it must receive the ruleset anyway for signature consistency.

**Alternatives considered**: Precomputing tiers onto `Combatant` at setup (rejected — stance is
Plan-B-flippable mid-battle, so tiers must be read live from active dials). Biasing each rule's
comparator individually (rejected — eight separate changes, each needing its own scoring blend, versus
one narrowing step).

---

## R6. Hash stability per new ruleset field

**Decision**: Every new *field* uses `#[serde(default, skip_serializing_if = "...is_default")]` so the
serialized seed ruleset is byte-identical while values sit at their defaults. Every new *catalog
entry* (defenses, Rocket Pack) is unavoidably hash-visible.

| Addition | Kind | Hash-visible? | Golden re-bless |
|---|---|---|---|
| `stance_aggro` table | field | No | Not required |
| `ablative_mods` (save chance) | field | No | Not required |
| `execute_threshold` / bonus | field | No | Not required |
| `mount_scale` table | field | No | Not required |
| air rate for energy weapons | field | No | Not required |
| 28 defense modules | catalog | **Yes** | **Required** |
| Rocket Pack module | catalog | **Yes** | **Required** |
| Chassis base-stat rebase | catalog | **Yes** | **Required** |

**Rationale**: This is the established pattern in this codebase — `role_damage_bonuses`,
`flak_dmg_mult`, `aa_focus_per_air`, and `energy_modes` all use it, and it has repeatedly let balance
mechanics ship without touching the goldens. It has a second, larger benefit already proven in
production: **a field whose serde default is the new behaviour reaches production on a wasm deploy
alone, with no re-seed**, because the frozen ruleset simply omits it.

Slice 1 re-blesses the goldens once, deliberately, because a catalog rebuild cannot avoid it. Slices 2
and 3 should not re-bless at all — if they do, something was made hash-visible by mistake, and that is
a useful tripwire.

**Alternatives considered**: Accepting a re-bless per slice (rejected — it discards the tripwire that
tells us when a change is larger than intended).

---

## R7. The enum-variant deploy hazard

**Decision**: Any slice introducing a new enum variant — a `Capability`, a `DamageLayer`, a
`SupportKind` usage — **deploys wasm before the re-seed**, never the reverse. Slices introducing only
new fields or catalog entries may deploy in either order.

**Rationale**: Serde ignores unknown *fields* but hard-errors on unknown *enum variants*. A frozen
ruleset row containing a variant the deployed engine does not know is an immediate deserialization
failure for every live battle. This has bitten this project before and is recorded as a standing
operational rule.

Affected slices: **1** (`DefenseSpec` gains an ablative shape), **3** (`SupportKind::Aura` becomes
emitted, and `DamageLayer` may gain an `Ablative` member), **4** (a `Capability` for the Rocket Pack).

**Alternatives considered**: A compatibility shim tolerating unknown variants (rejected — it would
silently degrade a ruleset rather than failing loudly, and correctness of the live balance table is
worth more than deploy convenience).

---

## R8. The balancer cannot currently measure stance

**Decision**: Stance-varying archetype fixtures are a **prerequisite task inside slice 2**, not a
follow-up.

**Rationale**: Every balancer archetype is built through
[`stock_instance`](../../crates/engine/src/content.rs#L954), which applies `stock_dials()` — stance
`Neutral` for every machine in every archetype. A uniform-stance army is, by the feature's own design
(FR-017), *identical to an all-Neutral army*. So the balancer would report stance as having zero
effect no matter how well it works, and SC-006 and SC-007 would be unverifiable.

This is a P4 gate condition: fairness must be verified, and the instrument currently cannot see the
thing being built. The fixtures must exist before the mechanic is measured, or the measurement is
meaningless.

**Alternatives considered**: Measuring stance only through engine unit tests (rejected — unit tests
prove the mechanic fires, not that it changes outcomes across a field, which is what SC-007 claims).

---

## R9. Reactive mitigation state and deterministic tie resolution

**Decision**: Track absorbed damage per family as a fixed-size array on `Combatant`, indexed by damage
family in declaration order. Ties resolve to the **lowest-ordered family**, never to whichever arrived
last.

**Rationale**: `Combatant` currently holds no per-family history
([mod.rs:33](../../crates/engine/src/sim/mod.rs#L33)), so this is new state. A fixed-size array
indexed by enum order avoids a map, keeps it `Copy`-cheap, and — critically — makes iteration order
deterministic. Resolving ties by declaration order rather than arrival order is what makes a battle
reproducible when two families land in the same tick, which the spec calls out as an edge case.

The baseline is "no adaptation": an untouched Mech mitigates exactly as its Balanced equivalent would,
so the option is never worse than neutral at battle start.

**Alternatives considered**: A `BTreeMap<DamageFamily, Fixed>` (rejected — heap allocation per
combatant and no benefit over three slots). Decaying the history over time (rejected for v2 — an
additional tunable with no evidence yet that it is needed; the spec's "rewards attrition" identity
works without it).

---

## R10. Blast radius of removing the no-op Standard Hull

**Decision**: Repoint [`base_defense_id`](../../crates/engine/src/content.rs#L904) at the Balanced
module per mount class and delete the seven Standard Hull entries in the same change.

**Rationale**: `base_defense_id` is the single chokepoint — `stock_instance` uses it to build every
stock loadout, which means every balancer archetype, every test fixture, and every seeded defender
flows through it. Repointing it is a one-line change that correctly updates all of them at once.

The consequence to plan for is that **every derived stat in the game shifts**, because the default
defense stops granting nothing. That is intended (it is the whole point of FR-002) but it means slice
1's golden re-bless is large and must be reviewed as a genuine balance change rather than rubber-
stamped.

**Alternatives considered**: Keeping Standard Hull as a hidden legacy entry for old saved armies
(rejected — it would preserve the dead-slot default for any army not re-saved, so the fix would not
actually reach existing players).
