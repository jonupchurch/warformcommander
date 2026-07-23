# Phase 0 Research — Counter-Web

Resolves the open design decisions the spec left to planning. Grounded in the measured evidence in
[diagnosis.md](./diagnosis.md); constants are tuned empirically per slice (P4), but the *mechanisms*
are decided here.

## D1 — Axis A flattening mechanism (the linchpin)

**Decision: "Coordination" — diminishing returns on stacking identical units, applied at derive time
from a typed ruleset curve.**

A unit's effective offensive output is scaled by a per-duplicate factor: the 1st copy of a
type-in-army at full effectiveness, the 2nd/3rd/… at diminishing factors from a ruleset curve
(e.g. `[1.00, 0.85, 0.75, 0.70, 0.70]`). Same derive-time shape as the existing `mount_scale`.

**Rationale**:

- **It targets the measured super-linearity directly.** The diagnosis's cliffs are duplication cliffs:
  "1 flak loses 0–100, 2 flak wins 100–0"; "artillery worthless as one piece, overwhelming as two";
  the mono archetypes (5 mechs, 3+2 tanks) are the field's steepest power sources. Taxing the Nth copy
  converts those cliffs into gradients (FR-001/FR-004) and pulls the mono end of the ladder down toward
  the middle — flattening a large share of the 87-point spread.
- **It is P1/P2/P3 all at once.** Lateral by construction (specialization is taxed, diversity is not —
  a trade-off, not a nerf); it makes composition *planning* pay (P2); and it rewards using the
  configuration space — combined arms over mono-stacks — which is exactly P3's "depth from
  configuration."
- **It stays data-driven.** The curve is ruleset data (P8); only the application is a small,
  deterministic derive hook mirroring `mount_scale`. No new unit types.
- **It's legible to players.** Framed as *coordination / supply* — "a lance of mixed machines fights at
  full effectiveness; five of one thing steps on its own supply lines." A single, explainable rule.

**Alternatives considered**:

| Alternative | Why not (as the primary lever) |
|---|---|
| **Squad power budget** (each army spends a power budget; units cost power) | Directly flattens power, but it is a large army-building UX change (points, costs, a new Garage constraint) and risks feeling like a deckbuilder bolt-on. The squad is already slot-budgeted (5) and P1-capped; coordination achieves the flattening with far less surface. Kept as a fallback if coordination undershoots. |
| **Per-unit stat tuning** (buff weak comps / nerf strong) | Tried 11× (v5–v11) and by the whole v2 pass — cannot create *diminishing returns*, only shifts one matchup across the wall at a time. The diagnosis is explicit this is a dead end. |
| **Concentration soft-cap** (generalize the AA focus cap to all targets) | The disperse experiment showed fire concentration is **not** the driver (125→121 walls). Would add complexity for ~no effect. |
| **Durability diminishing returns only** (tax stacked hull/armor) | A real contributor (Bulwark's 3.27M effective HP), but narrower than duplication and harder to make lateral. Folded in as an *option* of the coordination curve (scale survivability too, if offense-only undershoots), not a separate mechanism. |

**Open constants (tuned on the field, not guessed here)**:

- The **curve** values (how steep the falloff).
- **"Identical" grain**: same *type* vs same *type+variant*. Leaning **type** (a Grizzly and a Cavalier
  are both HeavyTank → coordination counts them together), because the super-linearity is about role
  redundancy, not exact stat lines — but this is an A1 measurement question.
- **What it scales**: offense only, or offense + survivability. Start **offense only** (simplest, most
  legible); extend to survivability only if A1 undershoots the flattening target.

## D2 — Axis B counter levers (make counters graded-but-strong)

**Decision: amplify the existing counter axes, in priority order — (1) damage-family matrix, (2) role
bonuses, (3) reach/defense-family effectiveness — tuned to *tilt* (55–70%), never *switch* (100/0).**

**Rationale**:

- **The matrix is currently decorative but no longer has to be.** In v11 the shielded share of the
  field was 3.3%, so the matrix was a flat ×1.25/×0.85 with nothing to point at. **v2 changed this** —
  every stock machine now carries a defense family (Balanced = shield), so the kinetic/energy/explosive
  × armor/shield/ablative matrix finally has real targets. Raising its swing from ±40% toward a
  stronger (but sub-lethal) spread is now a live lever, not a dead one.
- **Graded, not binary, is the whole point.** The 4 surviving counters (AA→air) work *because* they are
  strong, but they are 100/0 *because* they are binary capability gates. A matrix/role tilt is
  continuous — a countered comp takes more damage but still fights — so on a flattened ladder it
  produces 55–70%, i.e. *contested*, not swept (SC-001/SC-009).
- **Lateral by construction (P1/FR-007).** Matrix and role counters are symmetric: energy beats armor
  *and* loses to shields; a role bonus vs the backline costs nothing but is only situationally live.
  Strengthening the counter strengthens *both* directions, so it can't become a straight upgrade.

**Alternatives considered**:

- **New counter *weapons/units*** — rejected by P3 (no roster growth) and by the diagnosis (new content
  on a steep ladder = more walls). Axis A must come first regardless.
- **Buffing the underdog archetypes** (support, aa-rocket) directly — that's per-unit tuning (D1's
  rejected alternative); it cannibalizes other underdogs (shown in balance.md) rather than creating
  counter-play.

## D3 — Sequencing (why A before B)

**Decision: A1 (flatten) ships and is measured *before* any Axis B slice.**

**Rationale**: soft counters are invisible on a steep ladder — a ±40% (or even ±100%) matrix tilt can't
overturn a rank gap that decides the matchup 100/0, so it just relocates walls. Only after coordination
has pulled matchups toward parity does a counter *tilt* land in the contested band. This is the
diagnosis's central sequencing claim, and it is falsifiable: if A1 does **not** raise the near-tie
count above 0, the mechanism is wrong and we revisit D1 (squad budget fallback) before touching Axis B.

## D4 — Measurement & acceptance (the instrument)

**Decision: the balancer `verify --field all` (12 archetypes, 132 matchups, seed 1) is the field of
record**, extended with the two diagnostic metrics this feature is defined by — **near-tie count**
(40–60%) and **monotone rate** (higher-rank-wins fraction) — computed from the report's matchup win
rates.

**Rationale**: these two metrics, not the aggregate standings, are what distinguish "contested" from
"cycled walls" (the trap in SC-001 vs SC-002). The wall/contested/near-tie/monotone counters already
exist as the throwaway `count-walls.js` / `order-check.js` probes used for the diagnosis; Phase 1
promotes them to a committed measurement the slices are graded against (see quickstart.md). Whether to
fold them into the balancer's own report or keep them as a sidecar script is a Phase-1/tasks detail.

## Resolved unknowns

- Axis A mechanism → **coordination (per-duplicate diminishing returns)**, derive-time, data-driven.
- Axis B levers → **matrix > role > reach**, amplified to tilt not switch, lateral.
- Order → **flatten (A) strictly before counter (B)**, with A1 as a falsifiable go/no-go gate.
- Instrument → **`verify --field all` + near-tie & monotone metrics**, seed 1, baseline in diagnosis.md.
- No remaining `NEEDS CLARIFICATION`.
