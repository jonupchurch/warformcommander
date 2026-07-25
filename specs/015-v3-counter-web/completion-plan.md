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

## Resolved open calls (from the recon)
- **ECM-as-defense: pure data** — `DefenseSpec.tradeoff: StatDeltas` already carries `target_draw`
  (the `ECMSuite` utility proves it). Author a defense module with `tradeoff.target_draw = -2`. (The
  earlier "extend DefenseSpec" note above is superseded.)
- **Autoloader: KEEP** as a slot-costly `cadence_shift` exception — it stacks on the derived cadence
  coherently (base from type+chassis, then the utility nudges).
- **Cadence overrides on the ~28 baked weapons: derive formula WINS** — cadence = f(type, chassis)
  ignores each weapon's `cadence_tier` (type-welding is the point of D6). The weapon `cadence_tier`
  becomes vestigial (still carries `reach` via `gun()`); don't hand-edit 28 modules.
- **Commander projector: build the weapon-slot plumbing** (Heal/Shield/Ablation Guns as projector
  weapons whose support stats flow into derive) — the design's live counter-pick intent, not 3 fixed
  variants. This is the sleeper cost (support_power/range bypass the loadout today).

## Seams (from recon)
- **Economy (A):** `UtilitySpec.cost: u8` (`#[serde(default=one)]`) `model/types.rs:490`; validate
  `sum(costs) > budget` at `validate.rs:246` + TS `sim/legality.ts:200`; budgets via
  `slot_layout`/`slot_layout_override` in `content.rs`; TS `sim/ruleset.ts:206`; garage
  `lib/garage/preset-catalog.ts:85`.
- **Cadence (B):** derive in `model/army.rs` after family resolved (~:242), before `cadence_shift`
  (~:286); `CadenceTier::faster/slower` `types.rs:165`. Put the type→tier map + Heavy/Mech modifier in
  a new `Ruleset` sub-struct (mirror `StanceMods`).
- **Defenses (C):** replace the generic loop `content.rs:917-1002` with explicit per-mount ×3 via the
  `defense()` helper `content.rs:598`; **Camo** = `tradeoff.evasion` (pure data); **Chaff** = new
  `evasion_vs_air` field through `StatDeltas`→`Accum`→`EffectiveStats`, applied only in the AA/flak
  branch `sim/damage.rs:178-206`; ablative retire = stop emitting ablative modules; defaults
  `base_defense_id()` `content.rs:1206` + TS `lib/garage/preset-catalog.ts:57`.
- **Jump Jets (D):** clone `FallbackPhase` (`sim/mod.rs:94`, `behavior.rs:218-293`, `FALLBACK_DUCK_TICKS`);
  own trigger in `apply_behavior` (`behavior.rs:25`); `c.zone=Air`/`=home_zone` direct; ground-reach +
  AA-vuln are AUTOMATIC once `zone==Air`; need dynamic `can_air` (`target.rs:224`) + a `jumped` flag on
  `AttackProfile` (`sim/mod.rs:120`) for full air-to-air; `Capability::JumpJets` (append).
- **Commander (E):** new `MachineTypeId::Commander` (Rust `content.rs`/`base_weapon_for`/`stock_instance`
  + TS `sim/model.ts:16` + ~14 TS readers); survival-gated Plan-B = runtime gate in `latch_plan_b`
  (`behavior.rs:39`) via a `commander_alive(side)` scan (clone `aura_mult` living-source loop);
  projectors = new discriminator on `WeaponSpec` + support stats into `Accum`/`EffectiveStats` (new
  pathway — today `support_power/range` come straight from `BaseStats` `army.rs:348`) + branch
  `resolve_support` (`sim/mod.rs:445-501`) to write shield/ablative; `SupportKind::ShieldBoost` exists
  (`replay/mod.rs:100`), add `Ablation` (+ TS `sim/replay-reader.ts:43`).
