# v2 Ruleset — Final Outcome (all 12 success criteria)

The measured result of the whole feature, honest about what was and was not met. Five user stories
shipped as independent, reversible ruleset versions (v12–v17); the field measurements are `verify
--field all`, seed 1, 132 matchups. **Nothing has been re-seeded to production** — every version is
built and locally verified, awaiting sign-off on the balance diff.

## The one finding that frames everything

The v11 baseline field is **structurally degenerate**: 123 of 132 matchups are 0/100 sweeps, decided
by hard-counter relationships before a shot is fired. Across five slices, **every mechanical lever —
defense choice, fire-allocation, support re-ranking, adaptive mitigation, and air contestability —
proved correct in isolation and unable to move that wall.** This is the feature's central, repeatedly
confirmed result: the walls are a *content* problem (the damage matrix has too few contested
matchups), not a numbers problem, so no single dial fixes them. The v2 pass built the **infrastructure
and content options** the later weapons/roster expansion needs; it did not, and structurally could
not, close the field on its own.

## Scorecard

| SC | Target | Result | Verdict |
|---|---|---|---|
| **SC-001** | Contested matchups 8 → ≥26 of 132 | **9 of 132** | ❌ not met — the wall did not open |
| **SC-002** | Spread ≤50 pts, none <20% or >80% | **83.7 pts (7.2%–90.9%)** | ❌ not met |
| **SC-003** | Shielded/ablative EHP ~3% → ≥25% | Balanced default gives **every** stock machine a shield; Shield/Ablative on all 7 mounts | ✅ met (structural — every unit now carries shield EHP) |
| **SC-004** | Single-option mount classes 5 → 0 | **0** — four families on all 7 mounts | ✅ met |
| **SC-005** | Median duration within 10% of 484.8 | **491.1 ticks** (+1.3%) | ✅ met — redistribution, not inflation |
| **SC-006** | Every stance changes an outcome | Stance moved **0 of 30** win rates on the wall | ❌ not met at win-rate level — cannot be, on a 92%-wall field |
| **SC-007** | ≥80% of matchups differ in casualty order | Proven per-battle by engine tests; not measured field-wide | ◐ partial — demonstrated, not field-quantified |
| **SC-008** | Squishy chassis no tankier on best defense | Heli lands **level** (0% survival, no headroom); Arty/RktArty **below** | ✅ met (Heli level per the narrowed FR-011) |
| **SC-009** | Dedicated AA no longer field's lowest | aa-rocket **21.2%**, support-ball 7.2% → not lowest | ✅ met literally (was already true at baseline); ✗ intent (inversion) unaddressed |
| **SC-010** | Aircraft viable after every air change | air-alpha **81.8% at every stage** (unmoved) | ✅ met — no air change deleted air (they couldn't move it) |
| **SC-011** | Deterministic across environments | native == wasm **byte-identical** on all 4 seeds, every slice | ✅ met |
| **SC-012** | Customize screen matches the battle | `explain.ts` reads live ruleset values; covered by tests each slice | ✅ met |

**8 of 12 met** (SC-003/004/005/008/009/010/011/012), one partial (SC-007), **three not met**
(SC-001/002/006) — and the three misses are the *field-rebalancing* criteria, which the measurement
shows no single-pass mechanical change could hit.

## What shipped, by slice

- **US1 (v12) — defenses.** Four families (Armor/Shield/Ablative/Balanced) × 7 mounts from one scale
  loop; Balanced replaces the dead Standard Hull default; chassis rebased ~13% so lighting up dead
  slots redistributes survivability (median 484.8 → 491.1, within 10%). *The only slice that reshaped
  the field* — and it reshaped survivability texture, not the win-rate walls.
- **US2 (v13) — stance.** A zero-sum fire-allocation dial (aggro tiers narrow the row before the
  Target Rule). Proven at the battle level; balance-neutral on the wall (moved 0/30 win rates).
- **US5 (v14) — support stances.** Triage/Sustain/Empower + role split; `SupportKind::Aura` now
  emitted. Byte-identical to the prior field by construction.
- **US3 (v15) — Mech identity.** Reactive plating (Mech-exclusive adaptive mitigation) + native
  behavioural flexibility. Opt-in content; field-neutral by construction.
- **US4 (v16/v17) — air.** Energy weapons contest air (shipped **off by default**, measured inert:
  air 81.8% → 81.8%) + the Rocket Pack (Mech front-line AA, opt-in content). `aa_focus_per_air`
  deliberately skipped as a pointless knob. Details in [air-staging.md](./air-staging.md).

## Not done, and why

- **SC-001/002/006 (field rebalance):** structurally out of reach for a mechanics pass — needs the
  content expansion (new weapons/roster) to create contested matchups. This *is* the headline finding,
  not a shortfall to paper over.
- **T089 (responsive check):** the Customize changes are text-only additions to existing effect lists
  (no new layout), so the responsive risk is low, but a device pass was not run — flagged, not claimed.
- **T090 (production differential):** requires a production re-seed, which is **gated on the user's
  sign-off of the balance diff** and has not been performed. The re-seed sequence per slice is the
  standard one (engine deploy first for the variant-bearing slices US1/US3/US4, then re-seed).

## Recommendation

Ship the v2 **content and infrastructure** (it is correct, tested, deterministic, and reversible), but
do not expect it to move the standings — the measurements say it won't. Point the next pass at the
**content** that creates contested matchups (the damage-matrix/roster expansion these mechanics were
built to serve). The five levers are now in place for that pass to use.
