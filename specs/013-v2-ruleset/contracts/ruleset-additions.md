# Contract: Ruleset Additions (v12+)

The `Ruleset` is this project's one shared content contract — the simulation core, the balancer, the
Garage UI, and the `current_ruleset` database row all read the same typed structure (P8). Any change
to it is a change to a four-consumer interface, so each addition is specified here with its wire form,
its default, whether it is visible to the seed-ruleset hash, and its validation rule.

## Compatibility rules that govern every entry

1. **Unknown fields are ignored; unknown enum variants are a hard error.** A frozen ruleset row
   containing a variant the deployed engine does not know fails deserialization for every live battle.
   Additive fields are therefore always safe; new variants are never safe until the engine ships first.
2. **`skip_serializing_if` at the default keeps the hash stable.** A field omitted from the seed
   ruleset's serialization does not change its hash, so the golden replay suite does not re-bless.
3. **A field whose serde default *is* the new behaviour needs no re-seed.** The frozen row omits it,
   the engine supplies the default, and the change reaches production on deploy alone. This has been
   verified in production twice.

## New fields

| Path | Type | Default | Hash-visible | Validation |
|---|---|---|---|---|
| `stanceAggro.aggressive` | int8 | `-1` | No | integer, `-8 ≤ v ≤ 8` |
| `stanceAggro.neutral` | int8 | `0` | No | as above |
| `stanceAggro.defensive` | int8 | `+1` | No | as above |
| `stanceAggro.protector` | int8 | `-1` | No | as above |
| `stanceAggro.{opportunist,triage,sustain,empower}` | int8 | `0` | No | as above |
| `executeMods.threshold` | bp | `4000` | No | `0 ≤ v ≤ 10000` |
| `executeMods.bonus` | bp | *tuned* | No | finite, `≥ 0` |
| `ablativeMods.saveChance` | bp | `2000` | No | `0 ≤ v ≤ 10000` |
| `mountScale.{heavy,light,mech,heli,rktArty,artillery,support}` | bp | per mount | No | finite, `> 0` |
| `airMods.energyAirDmgMult` | bp | *tuned* | No | finite, `≥ 0`, **and** `plinkDmgMult < v < flakDmgMult` |
| `equipment.<id>.ablativeDelta` | `{cap}` \| absent | absent | **Yes** (catalog) | `cap` finite, `≥ 0` |

Every table above must be **entirely present or entirely absent**. A partially-specified
`stanceAggro` is rejected rather than merged with defaults, matching how `energyModes` is validated
today — a half-populated balance table is far more likely to be an editing mistake than an intention.

## New enum variants

These are the compatibility-hazardous changes. Each requires the engine to deploy **before** any
re-seed introducing it.

| Variant | Enum | Introduced in | Consumer impact |
|---|---|---|---|
| `Ablative` | `DamageLayer` | Slice 1 | Replay readers must handle a third layer in `Hit` events |
| `Aura` (now emitted) | `SupportKind` | Slice 3 | Already declared; becomes reachable for the first time |
| Rocket Pack capability | `Capability` | Slice 4 | Gates the Mech anti-air module |

## Changed catalog entries

| Change | Slice | Consumer impact |
|---|---|---|
| 7 × `StandardHull*` **removed** | 1 | `base_defense_id` repoints to the Balanced module; every stock loadout's derived stats shift |
| 28 × defense modules **added** | 1 | Garage defense pickers gain options on all seven mount classes |
| 1 × reactive plating **added** | 4 | Offered only where `mountClass == Mech` |
| 1 × Rocket Pack **added** | 4 | Mech utility slot |
| ~21 chassis base stats **rebased** | 1 | All derived stats shift; this is the balance change, not a side effect |

## Consumer obligations

**Simulation core** — must treat every new field as optional and supply the documented default, so a
v11 row keeps resolving correctly after the engine ships.

**Balancer** — reads the ruleset as data and needs no change for the new fields, but its archetype
fixtures must be extended to vary stance before stance can be measured at all (R8).

**Garage UI** — must compute displayed effects from live ruleset values rather than authored copy, so
a balance change can never leave the interface misdescribing the game (FR-033). This is the existing
contract of `lib/garage/explain.ts` and it extends to every new option.

**Admin / persistence** — `validateRuleset` is the trust boundary and must reject out-of-range values
*before* persistence, never coerce them. An invalid ruleset must leave the current pointer unmoved.

## Versioning

Each slice publishes its own ruleset version rather than batching, so a regression can be traced to
one change and reverted independently. Live is currently **v11 `0062f62e`**; this feature spans
**v12 through v19**, with the four air changes deliberately occupying four separate versions (FR-030).
