# Research & Technical Decisions — v3 Counter-Web

The design is already decided (`../014-counter-web/weapons-design.md` §11 registry P1–P27); there are
**no open `NEEDS CLARIFICATION`**. This file consolidates the *technical* decisions — how each decided
mechanic maps onto the existing engine — in Decision / Rationale / Alternatives form.

## D0. Foundational — re-fixture the balancer's `SkillBeatsGear` (FR-030)

- **Decision**: Before any matrix change, re-author the `SkillBeatsGear` fixture (crates/balancer) so
  its "skilled" side is a **composition-quality** advantage, not a single-damage-type edge.
- **Rationale**: Today its skilled fixture is 100% Energy vs a mono-Kinetic armored blob, so its whole
  edge is Energy's ×1.6-vs-armor — **any** structural matrix change fails it by construction, making it
  useless as a gate on a counter-web redesign (diagnosis / Balance-State). P4 requires a working gate.
- **Alternatives**: (a) delete the invariant — rejected, we still want a skill>gear guardrail; (b)
  ignore it during v3 — rejected, silently disabling a fairness gate violates P4.

## D1. Damage triangle + defenses (US1)

- **Decision**: Sharpen `DamageMatrix` to ×1.6 same-layer / ×0.7 cross (Explosive ×1.0) as **ruleset
  data** in `content.rs`/`model/ruleset.rs`; give each mount a real shield/armor defense so the field
  carries enough shields for Kinetic's advantage to bite.
- **Rationale**: P8 (data, tunable without a deploy) and the diagnosis (matrix too weak + ~3% shielded
  → triangle dormant). Matrix multipliers are already data; this is a value change + defense-catalog
  population, not new mechanics.
- **Alternatives**: hardcode multipliers (rejected, P8); normalize the matrix (rejected — collapses
  the counter, and fails SkillBeatsGear by construction).

## D2. Targeting priority chain (US2)

- **Decision**: Rebuild `sim/target.rs` as a numeric **priority-score** selector — 2 declarative
  filters + Closest/Furthest fallback, base 1–5, Decoy +2 / ECM −2 offsets, recomputed per shot —
  replacing the `TargetRow`+`TargetRule` two-dial pick. Retire the smart selectors.
- **Rationale**: design §12; the chain is self-reactive (Target Air fires only while air exists), which
  is why Plan-B need not touch targeting.
- **Alternatives**: keep the two-dial system (rejected — can't express graded/counter targeting);
  probabilistic draw (rejected — determinism + no "smart" hand-holding, P17).

## D3. Movement modes (US2)

- **Decision**: In `sim/behavior.rs`, keep Hold/Advance, **rebuild Kite** (forward→shoot→fallback
  oscillation) and **redefine FallBack** (duck ~10 ticks → return to home zone if a slot is free);
  make Advance **self-terminating**. Add a `home_zone` + small timers to `Combatant`. Cut
  Reposition/Escort.
- **Rationale**: fixes the observed flee-and-rot degeneracy; self-terminating modes let Plan-B stay a
  one-shot latch (no while-true state machine). Zone caps (3/2) already exist in `validate.rs`.
- **Alternatives**: while-true Plan-B semantics (rejected — new stateful layer, oscillation bugs);
  leave the stubbed modes (rejected — 4/6 modes inert, reach never becomes playable).

## D4. Equipment model (US3)

- **Decision**: Extend the equipment catalog + `SlotLayout` (utility budgets Commander 5 · Mech 4 ·
  Heavy/Light 3 · Heli/Arty/RktArty 2) and per-item cost tiers in `content.rs`; add the on-hit rider
  and aura effects; validate in `validate.rs`. Three domains: Self buffs / Enemy riders / Ally auras.
- **Rationale**: P1 (every item a trade-off, cost-priced), P8 (catalog is data). Reuses the existing
  `EquipmentModule`/`Loadout`/`Capability` machinery.
- **Alternatives**: secondary weapons (rejected, P3 — one weapon; capability picks the target); flat
  slots for all chassis (rejected — slot economy is a balance lever).

## D5. Behaviors — stances, energy, Plan-B (US4)

- **Decision**: `Stance` → 3 (`Aggressive`/`Neutral`(="Balanced")/`Defensive`); **remove**
  Protector/Opportunist/Triage/Sustain/Empower and the `Stance::COMBAT/SUPPORT/is_support/fits_role`
  machinery + `OpportunistStance` unlock. **Remove the Energy dial** (`EnergyMode`, `EnergyModes`,
  `energy_damage_mult`/`_taken_mult`, the `energy` field on `BehaviorDials`) — *not* the Energy damage
  type or `energy_air_dmg_mult`. Apply stance as a two-sided multiplier on **output** (weapon damage,
  or Commander projection). Plan-B: drop `AirEnemyExists`/`EnemyInZone`, add `NoTargetsReachable`,
  restrict `DialKey`/`DialValue` to Movement/Stance (drop Targeting + Energy).
- **Rationale**: design §15; stance is a superset of the energy dial (removes duplication); Plan-B
  reads own-state only (targeting watches the enemy).
- **Alternatives**: keep energy as a distinct tempo dial (rejected — duplication); keep 8 stances
  (rejected — targeting/equipment already own what they encoded).

## D6. Commander keystone (US5)

- **Decision**: Add `AuraKind::DamageTaken` (the one new aura kind) and wire **Command** as an
  army-wide while-alive buff (+1 Plan-B slot + advanced-behavior unlock); the Commander weapon slot is
  a Heal/Shield/Ablation **projector** (support-weapon output, scaled by stance). Make it a first-class
  assassination target via Target Support + deep reach (already expressible).
- **Rationale**: design §14.6; existing `AuraKind` variants (DamageDealt/CommandBoost/StartShield)
  cover most, only DamageTaken is new. `plan_b_slots` already supports the +1 grant path.
- **Alternatives**: bake Command into base stats (rejected, P8 — keep it data/aura); multiple support
  chassis (rejected — one Commander hub, roster stable, P3).

## D7. Determinism & parity strategy (P6, cross-cutting)

- **Decision**: All new logic stays fixed-point (`Fixed`/`Bp`) + seeded; **every slice** merges only
  with `cargo test -p engine` (golden replays) green AND native==wasm parity AND the TS derive-parity
  suite green. Regenerate `derive-battery.json` only deliberately when a stat/enum shape changes.
- **Rationale**: P6 is never waived; behavior changes (targeting recompute, movement timers, riders)
  are the highest determinism risk.
- **Alternatives**: defer parity checks to the end (rejected — a determinism regression is cheapest to
  localize at the slice that introduced it).

## D8. Live-ruleset propagation (cross-cutting)

- **Decision**: New enum variants (e.g. `AuraKind::DamageTaken`, `TriggerCondition::NoTargetsReachable`,
  and any new EquipmentId) require the **wasm deploy FIRST**, then re-seed `current_ruleset` via
  `scripts/reseed-current-ruleset.ts`. Measurement uses the seed ruleset; *live* verification uses the
  re-seeded arena path.
- **Rationale**: [[live-ruleset-is-a-db-row]] — content changes reach real battles only via re-seed,
  and a new variant deserialized by an old wasm build breaks. Order matters.
- **Alternatives**: re-seed before deploy (rejected — deserialization break); rely on the wasm redeploy
  alone (rejected — arena reads the frozen row, not the seed).

## Open tuning questions (measure, not blockers)

Carried from the registry as **start-value → measure** (not design unknowns): P2 matrix magnitude ·
P25 Defensive −20% (duration risk) · P21 movement/kite value (post-content) · P24 aura stacking ·
P27 Plan-B slot count · P5 equipment cost/Target-Radar pricing. Each is resolved by the per-slice
balancer read, not on paper.
