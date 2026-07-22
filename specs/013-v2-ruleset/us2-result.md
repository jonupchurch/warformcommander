# US2 (Stance) — Outcome

**Ships as:** ruleset v13. **Golden re-bless:** none (tripwire held — the stance tables are
skip-serialized and the archetypes carry stock Neutral, so the seed ruleset and all battle goldens are
byte-identical).

## The mechanic works — proven at the battle level

Six engine tests in `crates/engine/tests/stance.rs`, all green, cover every FR:

| Behaviour | FR | Test |
|---|---|---|
| Aggressive draws fire, Defensive sheds it | FR-012 | `aggressive_draws_fire_and_defensive_sheds_it` |
| Uniform stance == all-Neutral (zero-sum) | FR-017 | `a_uniform_stance_army_is_identical_to_all_neutral` |
| A lone Defensive unit is still targeted | FR-015 | `a_lone_defensive_unit_is_targeted_normally` |
| Aggressive attacker cannot be baited | FR-014 | `an_aggressive_attacker_cannot_be_baited` |
| Protector intercepts for an adjacent zone | FR-016 | `a_protector_intercepts_for_an_adjacent_zone` |
| Opportunist executes wounded targets | FR-018 | `opportunist_executes_wounded_targets` |

Stance narrowing sits between the Target Row and Target Rule picks, so it works with all eight target
rules. Everything reads from the ruleset (`stance_aggro`, `execute_mods`) — tunable, no code change.

## The measurement — stance cannot move a wall (SC-006 not met, and this matters)

Role-based stance applied to the combined-arms field (front → Protector, rear → Defensive), swept at
500 samples against the plain neutral field:

- **28 of 30 matchups are degenerate sweeps** (0% or 100%).
- **Stance moved the win rate on 0 of 30.** Standings are identical to the neutral field, to the
  decimal.

This is not a failure of the mechanic — it is the **same finding the whole feature is built on**, now
confirmed for a second lever. Damage tuning couldn't move the 0/100 walls across eleven passes;
fire-*allocation* can't either. Reordering who dies in a matchup that is already decided does not
change who wins.

**So SC-006 ("every stance produces a measurable change in outcome") is not met at the win-rate
level, and cannot be on a field that is 92% walls.** What stance provably changes is casualty *order*
(SC-007 territory), which the engine tests demonstrate per-matchup. Its win-rate value will appear
only once the field carries contested matchups — which needs the broader content expansion, not this
dial.

## Honest conclusion

Stance is a correct, live, zero-sum allocation dial, shipped and tested. On today's degenerate field
it is balance-neutral — it breaks nothing and moves nothing, exactly like every other lever, because
the degeneracy is structural. It is infrastructure the later content pass will make matter, not a fix
in itself. Reported as a mixed result, not oversold.
