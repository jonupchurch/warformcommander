# US3 — Equipment / graded soft counters — build plan

> **Status: 2026-07-24 (draft).** Slice 2 of the v3 gap-correction (`gap-analysis.md`).
> User chose US3 specifically because it is the **one lever aimed at the diagnosed
> super-linearity root cause** (binary counters: a screen clears 0→100%). Defense reshaping and
> graded reach were both *measured* wall-neutral this session; damage tuning too. US3's graded,
> opt-in soft counters (riders + Jump Jets) are the untested lever.

## Hypothesis & acceptance criterion

**Hypothesis:** graded on-hit soft counters (degrade the enemy instead of out-damaging them) +
opt-in graded reach (Jump Jets) can **soften** the over-determined walls — turn some 0/100 turtle
matchups into contested ones — where flat stat/damage/defense changes cannot.

**Acceptance (measured, per sub-slice):** against the `baseline` field (captured pre-US3), a
rider/Jump-Jet-equipped archetype **flips at least one previously-0/100 matchup into the contested
band** (per the balancer's wall/contested/spread metrics). If after riders **and** Jump Jets the
walls do **not** move, US3 is recorded as **depth-only** (like defenses/reach/tuning) and we stop
chasing walls — finishing the catalog + economy becomes depth work, not a wall fix.

This is a **falsifiable** slice: it either moves the instrument or it's documented as another
over-determined confirmation. Either outcome is a real result.

## Design (from LOCKED §13–14 of `../014-counter-web/weapons-design.md`)

### The four on-hit riders (§13.2 / §14) — ride the primary's hits; the targeting chain aims them
| Rider | Effect | Pillar it attacks | Status |
|---|---|---|---|
| **Paint** | marked enemy takes +X% from *all* your units | durability / focus-fire | ✅ BUILT (`PAINT_*` in `sim/damage.rs`) |
| **EMP Ammo** | stops enemy **healing + shield regen** for N ticks | **sustain** (the healer/shield pillar) | 🔴 build |
| **Suppress** | −enemy **damage/accuracy** for N ticks | **power** (alpha/burst dealers) | 🔴 build |
| **Snare** | −enemy **move speed** for N ticks | **mobility** (kiters / backline-divers) | 🔴 build |

**EMP semantics — DECISION.** §13.2 (older) says "drop enemy shields" (shield-strip); §14.3 (LOCKED,
newer) says "stops healing & shield regen for 5 ticks" (anti-sustain). **Chosen: §14 anti-sustain** —
it's the LOCKED version, it's the referenced counter to the Commander's Heal/Shield projectors, and
it attacks the **sustain pillar** of the over-determined walls (kill regen → durability collapses)
without out-damaging. Shield-strip is a different (additive) rider we can add later if wanted.

### Jump Jets (§14.3, Mech signature, cost 3) — the graded-reach root-cause lever
Enter **Air** for 10 ticks → full air-to-air damage + whole-battlefield reach; airborne = an AA
target (×1.5 taken); then a 10-tick ground cooldown (50% duty cycle). This is the **opt-in, costed,
risk-bearing** version of the "leak-through" idea prototyped this session — a ground unit can
temporarily bypass a screen instead of the screen being binary-impassable. **Most direct attack on
the diagnosed root cause.**

### Slot economy (§13.5, memory `equipment-slot-economy-todo`) — the trade-off framework
Per-chassis utility **budget** (Cmdr 5 · Mech 4 · Heavy/Light 3 · Heli/Arty/RktArty 2) + per-item
**cost** tier (1 = stat · 2 = capability/counter · 3 = build-definer). Today: flat 3 slots, every
item cost 1, validation = `count == N`. Agreed 2-phase plan: (A) land the cost/budget *mechanism*
with cost=1/budgets=current → **zero balance change**; (B) tune real costs/budgets as data.

## Build order (scope-disciplined sub-slices — each verified + measured)

1. **US3-B · the 3 riders (EMP, Suppress, Snare).** Clone the Paint mechanism ×3: a per-unit status
   with a tick-decrementing duration, applied on the attacker's hit, read at the right pipeline stage
   (EMP → sustain step; Suppress → the target's outgoing damage/accuracy; Snare → move speed). Add
   the carrying equipment items. **Highest signal / lowest mechanical risk** (Paint is the template).
   Measure EMP + Suppress first (they hit damage/durability directly); **Snare depends on movement
   mattering — flagged P21 risk** (movement may be near-inert under sequential resolution).
2. **US3-C · Jump Jets.** Temporary air-state + cooldown + AA-vulnerability mechanic. Richer, but the
   single most promising lever for the actual wall problem. Measure.
3. **US3-A · slot economy.** Only after we know whether B/C move the field — because the economy is
   the *balancing* layer for choices that (B/C) must first be shown to matter. Phase A = zero-balance
   mechanism; Phase B = tune costs/budgets. (Building B/C ungated first also gives the cleanest
   "do graded counters work AT ALL" signal — freely stackable = max effect.)
4. **US3-D · fill the catalog + class kits + innate auras.** Depth. Only if B/C justify the model.

## Measurement plan
Extend the balancer instrument (as with the `reach` field): add rider/Jump-Jet-equipped archetypes
and a `control` field so the harness can *see* graded-counter play (the stock archetypes can't express
it — same instrument gap the `reach` field fixed).

**Baseline (pre-US3, post weapon-bake, `verify --field all --seed 1 --samples 250`, 12 archetypes /
132 matchups):**
- walls (0/100): **125 (94.7%)** · contested 5–95%: 7 (5.3%) · near-ties: 0 · monotone 95.5% ·
  spread 90.3 pts.
- Confirms the `damage:0` bake was field-inert (matches the pre-bake 94.7%). This is the "before"
  every US3 sub-slice is measured against. **Target: walls < 125 / contested > 7.**

## Open decisions to confirm with the user
1. **Snare P21 risk** — build it anyway (shares the mechanism, cheap) or skip until movement is shown
   to matter? (Recommend: build all 3; it's the same code path, and Snare's data can stay dormant.)
2. **Economy timing** — riders ungated-first-then-gate (recommended, cleanest signal) vs. economy-first.
3. **Cost-tier assignment** (Phase B, later) — §14 mostly pins these; only edge cases (Suppressing
   Fire is cost 1 in §14.3 but riders are "counter-defining = 2" in §13.5) need a call.

## Code seams (from recon — US3-B, riders, is BUILT against these)
The three riders clone the **Paint** template exactly:
- **Declare:** a `Capability` enum variant (`model/types.rs`), unlocked by a pure-unlock `UtilitySpec`
  (`content.rs`, mirroring `Spotter`). Riders = `EMPAmmo` / `SuppressingFire` / `SnareShot`.
- **State:** a per-`Combatant` absolute-tick field (`sim/mod.rs`) — `emp_until` / `suppressed_until` /
  `snared_until`, read as `field > tick` (no per-tick decrement, like `painted_until`).
- **Apply on hit:** capture the attacker's caps before mutation, set `target.X_until =
  tick + DURATION` after the hit lands if `!died` (`sim/damage.rs`, beside the Paint re-mark).
- **Effect seams:** EMP → gate shield-regen (`sim/mod.rs`) + heal (`resolve_support`, `tick` threaded);
  Suppress → cut the *attacker's* own acc + d0 (`sim/damage.rs`); Snare → halve move speed
  (`sim/behavior.rs`, `tick` threaded into `resolve_movement`).
- **Magnitudes** (const start-values in `sim/damage.rs`, move to ruleset in the balance pass): EMP 30t
  no-sustain; Suppress ×0.75 dmg / −10% acc for 30t; Snare ½ speed for 30t.
- **TS mirror:** `sim/ruleset.ts` `Capability` union + `CAPABILITY_ORDER` (appended in Rust order —
  serialization parity). No `derive.ts` change (capabilities are unlock-only; the effect is Rust-sim).
- **Enum-variant addition ⇒ wasm rebuild** (done); goldens re-blessed (proved stock-battle-inert by
  reproducing the committed digests with the 3 items stripped). derive-parity stays green (frozen
  fixture, appended variants).

**Jump Jets (US3-C)** is *not* a data tweak — it's a temporary `zone → Air` state machine (clone the
`FallbackPhase` pattern in `sim/mod.rs`/`behavior.rs` + a timer + AA-vulnerability). Heavier slice.
