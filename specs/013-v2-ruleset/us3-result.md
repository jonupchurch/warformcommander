# US3 (Mech identity) — Outcome

**Ships as:** ruleset v15. **Golden re-bless:** **required and done** — the catalog gained the
reactive-plating module, so the seed ruleset hash shifts (`55c0225b…` → `e9150f41…`) and the four
battle goldens re-blessed. Crucially, the **tick streams are byte-identical** on all four battery seeds
(verified `games`-array diff pre/post) — only the embedded `meta.ruleset_hash` changed, so the re-bless
is the hash moving, not behaviour. Native == wasm byte-identical on all four seeds (P6).

**Deploy-before-reseed applies** (engine ships before the v15 re-seed): the reactive-plating module is a
new catalog entry, and a `DefenseSpec.reactive` field the deployed engine must understand.

## What shipped

1. **Reactive plating** — a Mech-exclusive fifth defense (`MechReactive`). It opens with exactly the
   Balanced module's armour + shield, plus a `reactive` flag: once it has absorbed hull damage from a
   family, further hits of that *currently dominant* family are scaled by `reactive_mods.rate`
   (default ×0.8). Punished by burst (nothing absorbed yet → no bonus), rewards attrition. Ties in the
   absorbed history resolve to the lowest family index, deterministically (R9).
2. **Native behavioural flexibility** — the Mech, the sole generalist (`native_family == None`),
   natively carries the `ExtraPlanBSlot` capability (two Plan-B slots) that every other chassis buys
   with a Combat-AI utility (FR-025). It is the mechanical compensation for forfeiting the
   native-family weapon bonus (FR-027).

**Mount-gating gives exclusivity for free:** reactive plating is a `Mech`-mount defense, so the
existing mount check rejects it on any other chassis (FR-023, scenario 5) with no new code.

## Scope decision — the Rocket Pack (T056) moves to US4

FR-026's Rocket Pack (Mech full-rate anti-air) is **deferred to US4**, a reasoned deviation from the
task file's placement. Reason: a utility that grants anti-air is inert without an *air-reach* path,
and that plumbing (`reach_zones`, T066) lives entirely in US4 — as does the Rocket Pack's own staged
measurement (T071). Shipping the module in US3 would add a mechanic that cannot engage air until US4,
which violates the staging principle ("don't add what you can't measure"). US3 therefore delivers the
Mech's self-contained *defensive/behavioural* identity; US4 adds its air answer alongside the reach
work. A Mech-AA variant (`Sentinel`, `AnyGround` reach) already exists for players who want AA today.

## The mechanic works — proven at the battle level

Engine tests, all green:

| Behaviour | FR / scenario | Test |
|---|---|---|
| Opens as Balanced, then takes less from a repeated family | FR-023/024, scenario 1 | `reactive_plating_opens_neutral_then_reduces_repeated_family` |
| The reactive rate is tunable data (×1.0 disables it) | FR-024, P8 | `the_reactive_rate_is_tunable_data` |
| Reproduces byte-identically on replay | R9, FR-032 | `reactive_plating_is_deterministic` |
| Mech-exclusive; rejected on every other mount | FR-023, scenario 5 | `reactive_plating_is_mech_exclusive` |
| Mech natively has the extra Plan-B slot | FR-025/027 | `the_mech_natively_has_the_extra_plan_b_slot` |
| Family index + tie-break to lowest index | R9 | `dominant_family_is_argmax_with_ties_to_the_lowest_index` (unit) |

The "worse in a short fight, better in a long one" identity (scenarios 2/3) is exactly what the
opens-neutral-then-reduces test measures: identical opening hit, strictly more hits endured over
sustained same-family fire.

## The measurement — balance-neutral by construction, and confirmed

Both new mechanics are **opt-in / trigger-gated**, so the stock archetype field cannot move:

- Reactive plating is a defense a player must *choose*; every stock archetype keeps its Balanced
  default, so no archetype is reactive.
- Native flexibility grants a Plan-B *slot*; with no Plan-B triggers in the stock dials, an extra empty
  slot changes no behaviour.

**Confirmed against the post-US1 field** (`verify --field all`, seed 1, 132 matchups): the `matchups`,
`flagged`, and `invariants` blocks are **byte-identical** to `us1-result/balance-report.json`. Only the
ruleset hash differs (`e9150f41…`), from the new catalog entry.

This is the **fourth lever** — after damage tuning, fire-allocation (US2), and support re-ranking (US5)
— to be correct, live, and provably unable to move a 92%-wall field on its own. The reactive Mech's
value is a real per-battle identity the engine tests demonstrate; its *field* value appears only once
the content expansion gives the damage matrix contested matchups to discriminate.

## Honest conclusion

The Mech now has a genuine identity — a defense that adapts and native behavioural flexibility, both
tested and deterministic, both tunable from the ruleset. On today's field it is balance-neutral by
construction. Reported as identity + infrastructure, not a field fix — the same posture as US2/US5. The
Rocket Pack (the Mech's air answer) is deferred to US4 where its reach dependency and measurement live.
