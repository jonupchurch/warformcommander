# v3 Counter-Web — completion plan (all remaining features)

> **Status: 2026-07-24.** Directive: implement **every** remaining v3 feature; **defer ALL balance/
> tuning** to a single pass once the content is in place (avoid rebalancing repeatedly). Correctness
> verification stays (tests, native==wasm, determinism, goldens); balance measurement does **not** run
> between slices. Breakage-of-gameplay is acceptable (only the owner plays); breakage-of-engine is not.
> Plan-of-record for finishing v3; supersedes the "measure each slice" cadence in `gap-analysis.md`.

## Feature inventory (what's left, from the gap register + LOCKED §10/§13/§14 design)

Already built this session: US1b weapon bake, US3-B riders (EMP/Suppress/Snare). Remaining:

- **US3-A** slot economy — per-item cost tier + per-chassis budget (§13.5).
- **US1c** cadence-welded-to-type + Heavy/Mech chassis modifier (§D6).
- **US1d** §10 per-chassis defense identities + **Camo** + **Chaff** (2 new evasion mechanics);
  retire ablative from the offered set (keep Mech Reactive); ECM as a §10 defense option.
- **US3-C** Jump Jets — temporary zone→Air state machine (§14.3).
- **US5** Commander — distinct chassis + **Shield/Ablation projectors** + **survival-gated Command**
  aura + §14.6 kit.
- **US3-D** the full ~60-item §14 class catalog + **innate auras** (Spotter Network, Coordinated
  Strike) + the bespoke item mechanics (Guardian Protocol, Adaptive Munitions, stationary-bonus,
  Rally cleanse, first-hit/ramping, etc.).
- **Movement** — verify/build Kite (design says stub) + FallBack timed-duck (design says redefine).

## Build order (systems before content; each = engine + TS mirror + wasm + tests + commit)

Ordered so shared model changes land once and downstream slices consume them:

1. **Slice A — Slot economy (US3-A).** Foundation: the catalog's items carry cost tiers, so the
   cost/budget mechanism must exist first. Add `cost: u8` to `UtilitySpec` (default 1); per-chassis
   utility **budget** (Cmdr 5 · Mech 4 · Heavy/Light 3 · Heli/Arty/RktArty 2); validation
   `sum(costs) ≤ budget` (**≤**, unspent slots legal) + no-dupes. TS mirror (`legality.ts`,
   `ruleset.ts`) + garage surfacing. Land with existing items at cost 1 (mechanism first); real costs
   assigned in Slice G. Regenerate `derive-battery.json` (shape change).
2. **Slice B — Cadence-welded-to-type (US1c).** Derive-time: `cadence = f(damage_type)` (Energy fast ·
   Kinetic medium · Explosive slow/Siege) + Heavy/Mech modifier (+1 tick, +10% dmg). Non-flat
   throughput (fast = slight DPS lead, slow = alpha) as a derive factor. Cheap-to-retune (one formula).
3. **Slice C — §10 defenses + Camo + Chaff (US1d).** Per-chassis 3-option defense identities (§10
   table). **Camo** = flat evasion defense module (existing evasion stat). **Chaff** = evasion that
   applies **only vs AA/flak** (new conditional, hooked into the `air_mods` path in `sim/damage.rs`) →
   needs a `Combatant`/stat flag. ECM-as-defense = a defense module granting the −2 target-draw
   (§12.4). Retire ablative from the offered set (keep Mech Reactive). New enum/field for Chaff ⇒ wasm.
4. **Slice D — Jump Jets (US3-C).** Clone the `FallbackPhase` state machine → `JumpJetPhase` (Ground →
   Airborne 10t [full air reach + AA-vulnerable ×1.5 taken] → Cooldown 10t). A `Capability::JumpJets`
   unlock + `Combatant` phase/timer fields. New enum variant ⇒ wasm + goldens re-bless.
5. **Slice E — Commander (US5).** New `MachineTypeId::Commander` chassis (no damage, 5 slots, projector
   weapon). **Shield/Ablation projectors** = new `SupportKind` variants in `resolve_support` (project
   onto the ally's shield / ablative pool, not hull). **Survival-gated Command:** the CommandBoost
   aura is already dynamic; make the +1 Plan-B slot only latch while a friendly Commander lives. New
   MachineTypeId + SupportKind variants ⇒ wasm + goldens + all match arms.
6. **Slice F — Catalog mechanics.** The bespoke effects the §14 items need: innate auras (Spotter
   Network = zone +acc, Coordinated Strike = self +acc on focus-fire — new `AuraKind`s), Guardian
   Protocol (redirect zone-ally damage), Adaptive Munitions (Plan-B switches damage type), stationary-
   bonus (Siege/Bulwark/Entrench: +mitigation while it didn't move), Rally (cleanse EMP/Suppress/Snare
   timers off allies), first-hit/ramping (Ambush/Alpha/Duelist). Group the new enum variants to batch
   wasm rebuilds.
7. **Slice G — Author the full §14 catalog (US3-D).** ~60 items across 7 chassis, each with its cost
   tier (§14 pins most; default single-stat 1 / capability 2 / build-definer 3), wired to the Slice
   A–F mechanics. Mostly `content.rs` data. Then assign the real per-item costs (Slice A landed cost 1).
8. **Slice H — Movement.** Verify Kite is real (not a stub) + FallBack timed-duck-return; build what's
   missing (§15.3).

## Design decisions (resolving the gap-analysis open questions — decided, since we're building all)

- **ECM slot:** ship ECM **both** ways — the existing `ECMSuite` utility **and** a §10 defense module
  that grants the −2 target-draw (the design puts ECM in the defense slot for AA/Heli/Commander). Route
  the defense's draw offset through the derive (extend `DefenseSpec` with a `target_draw` delta).
- **Cadence-welding:** **derive-time formula** (one cheap-to-retune place), not 60 hand-authored numbers.
- **Innate auras:** **free/no-slot** (chassis-intrinsic), per §14.2's LOCKED decision for Spotter Network.
- **Cost tiers:** use §14's stated costs; default single-stat = 1 · capability/counter = 2 · build-
  definer (Jump Jets) = 3. (Balance-tune later.)
- **Commander "gated behaviors unlock"** clause is **stale** (US4 removed gated stances) → redefine
  Command as: dynamic CommandBoost aura (built) + **survival-gated +1 Plan-B slot** (the extra Plan-B
  only latches while a friendly Commander lives).
- **Commander chassis:** a **new `MachineTypeId::Commander`** (distinct chassis), not a RearSupport
  variant — the design treats it as its own chassis (5 slots, no damage, projector weapon).

## Verification per slice (balance deferred)
`cargo test -p engine` + `-p balancer` green · rebuild wasm + `wasm-parity` byte-identical · re-bless
goldens **only** after proving the change is stock-battle-inert (strip-and-reproduce) or intended ·
regenerate `derive-battery.json` when the derive/validation shape changes · `vitest` green. **No
`balancer verify` field sweeps** — the balance pass runs once, after Slice H.

## Seams
_(filled from the codebase-scout recon — pending.)_
