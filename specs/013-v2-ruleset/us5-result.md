# US5 (Support stances) — Outcome

**Ships as:** ruleset v14. **Golden re-bless:** none (tripwire held — the `empower_mods` table is
skip-serialized at its default and the stock support archetypes carry Neutral, so the seed ruleset and
every battle golden are byte-identical). **Deploy-before-reseed still applies:** `SupportKind::Aura` is
now *emitted* for the first time, so a variant-aware engine must be live before any ruleset that can
produce it — but nothing in the seed catalog produces it, so the deploy is not gated on this slice.

## The mechanic works — proven at the battle level

Five engine tests in `crates/engine/tests/stance.rs`, all green, cover every FR:

| Behaviour | FR / scenario | Test |
|---|---|---|
| Triage and Sustain service *different* allies from the same state | FR-020, scenarios 1+2 | `triage_and_sustain_service_different_allies` |
| Empower strengthens (shield) and never repairs | FR-021, scenario 3 | `empower_strengthens_without_repairing` |
| Stance options are role-partitioned; the two sets are disjoint | FR-019, scenario 4 | `stance_options_are_partitioned_by_role` |
| An out-of-role stance still loads and degrades to neutral behaviour | FR-022 | `an_out_of_role_stance_degrades_to_neutral_behaviour` |
| Empower with no allies in range is well-defined (no panic) | edge case | `empower_with_no_allies_in_range_is_well_defined` |

The three support behaviours re-rank the *same* selector (`resolve_support`):

- **Triage** — most-damaged (lowest hull fraction). This is the pre-v2 hardcoded behaviour, so it is
  the catch-all: Neutral, and any *combat* stance held out-of-role by a support machine, degrade to it.
  That is why the stock all-Neutral field is byte-identical to before this slice.
- **Sustain** — highest combat effectiveness (raw `damage`) among the wounded, so the heaviest hitters
  stay in the fight rather than pouring output into a unit that is going to die anyway.
- **Empower** — no repair at all; raises every serviceable ally's shield toward a ruleset-tunable
  overshield ceiling (`empower_mods.shield_cap_bp`, default +30% of max hull) and emits
  `SupportKind::Aura`.

The role split is enforced in **two** places, deliberately:

1. **Offering** (`lib/garage/dials.ts::stanceOptionsForRole` + the Garage dial editor) — a combat
   machine is never *offered* a support stance and vice versa (FR-019). Neutral is in both sets.
2. **Runtime degradation** (engine) — a *saved* army holding an out-of-role stance is never rejected
   (FR-022). A support machine's aggro offset is forced neutral so it cannot bait fire out-of-role, and
   its support action falls through to Triage; a combat machine's support stance carries a neutral
   offset and fires no support action. Both directions are proven byte-identical to Neutral.

Validation stays **permissive** on purpose: `validate.rs` / `sim/legality.ts` add no role rejection,
because rejecting would break the very saved armies FR-022 protects.

## The measurement — US5 is balance-neutral by construction (and could not be otherwise)

The balancer field is unchanged from the v11 baseline, and this is structural, not a null result to
explain away:

- Every stock archetype uses `stock_dials()` → Neutral stance.
- A Neutral support machine takes the **Triage / default** branch, which is the exact pre-v2
  most-wounded behaviour.
- Therefore every stock battle is byte-identical (the goldens held without re-bless; native == wasm on
  all four seeds), and the balancer standings reproduce the prior field exactly.

**Confirmed against the post-US1 field** (`cargo run -p balancer --release -- verify --field all`,
seed 1, 132 matchups): the seed **ruleset hash is unchanged** (`55c0225b…`, i.e. `empower_mods`
skip-serialized at its default) and the `matchups`, `flagged`, and `invariants` blocks are
**byte-identical** to `us1-result/balance-report.json` — the only difference in the whole report is the
`generatedAt` timestamp.

Support stances only change anything when a player *explicitly* sets one — and even then, on today's
field the change would be the same kind of change US2 measured: a re-ordering of who gets repaired,
inside matchups that are 92% decided walls. Reordering repairs no more moves a settled matchup than
reordering casualties did. **This is the third lever (after damage tuning and fire-allocation) to be
correct, live, and provably unable to move a degenerate field.**

So US5 adds a real, tested player choice and the `SupportKind::Aura` strengthening mechanic the later
content pass needs — without touching the stock field at all. It breaks nothing and moves nothing,
exactly as intended for infrastructure that the content expansion will make matter.

## Honest conclusion

Support stances are a correct, live, role-partitioned dial with a working strengthen mechanic, shipped
and tested. Backward compatibility is guaranteed by degradation, not rejection. On the stock field it
is a no-op by construction; its value appears only once players use it and the field carries contested
matchups. Reported as infrastructure, not a fix — the same posture as US2.
