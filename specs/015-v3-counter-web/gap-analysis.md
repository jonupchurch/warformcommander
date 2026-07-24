# v3 Counter-Web — Gap Analysis & Correction Plan

> **Status: 2026-07-24.** Reconciles the v3 *design intent*
> (`../014-counter-web/weapons-design.md` + the wiki) against what is *actually built* in the
> engine / TS mirror / garage. Produced from a six-domain read-only code audit. This is the
> **plan of record** for finishing v3; the wiki and `tasks.md` point here.

## TL;DR — v3 is **mechanics-complete, content-incomplete**

The v3 rewrite (spec 015) shipped its **behavioral spine** — well, tested, and deployed to prod.
What never landed is the **content vocabulary that makes counters bite**. That split is why the
live field is still ~90% walls: the engine now *can* express a counter-web, but almost nothing is
populated for it to counter.

- **Behavior/mechanic slices landed clean & tested:** damage matrix + native bonus (US1a),
  priority-score targeting chain + 4 movement modes (US2), 3-stance collapse + energy-cut + Plan-B
  rewrite (US4), and the two aura kinds (`CommandBoost`, `DamageTaken`).
- **Content slices barely landed:** per-chassis defense identities (US1d), the full weapon roster
  baked+tuned (US1b/c), the equipment/slot economy (US3), and the distinct Commander (US5) are
  mostly missing — so the sharp ×1.6/×0.7 matrix has almost no shields to shred, there are no graded
  soft counters, and the "weapons" that were hot-added are `damage:0` type-sidegrades.

## Current live state

- **Live ruleset:** first v3 deploy `0b4cd0f2…`, then `+10` primary weapons hot-added
  (`scripts/add-v3-weapons.ts`, all `damage:0`) → so every combat chassis *can* field K/E/X, but as
  untuned pure sidegrades. Weapons are hot-added ruleset **data** (existing enums, no wasm rebuild);
  they are **not** baked into `content.rs`.
- **Measured field** (`balance-reports/balance-report.md`, hash `0b4cd0f2`): still a near-total
  order — kinetic-tanks **0.6%**, `ca-aa` **90.9%** & air/`ca-air` **81.8%** flagged Dominant, most
  matchups 0/100. All four balance invariants still pass. The subsequent `damage:0` weapon add is
  not expected to have moved the walls (field recorded elsewhere at ~94.7% walls).

## Gap register (design → code)

| v3 slice | Design intent | Status | Evidence | Fix type |
|---|---|---|---|---|
| **US1a** matrix + native | K 1.6/0.7 · E 0.7/1.6 · X 1.0 · native +12% · Mech no-native | ✅ BUILT + tested | `content.rs:52-65`; `damage.rs` `for_type`; native `army.rs:311`; stat-block tests `damage.rs:562-606` | — |
| **US1b** 18-weapon roster | 6 chassis × 3 types | 🟡 PARTIAL | 8/18 in `content.rs:682-805`; other 10 only in `scripts/add-v3-weapons.ts`, live-DB-only, `damage:0` | content data + rebuild + **tune** |
| **US1c** cadence-welded-to-type · non-flat throughput · Heavy/Mech +1tick/+10% | P19/P20/D6 | 🔴 MISSING | cadence still keyed to chassis (`content.rs:237,699,758`); throughput flat; no chassis-modifier code anywhere | **Rust mechanic** + rebuild |
| **US1d** defenses §10 identities | per-chassis 3-option · shields populated · ablative retired · Camo/Chaff/ECM | 🔴 mostly MISSING | generic v2 4-family-per-mount `content.rs:807-899`; ablative still emitted for all mounts; **Camo/Chaff = zero code**; ECM is a utility not a §10 defense (`content.rs:987-996`) | content data + **2 new mechanics** (Camo/Chaff) |
| **US2** targeting + movement | priority-score chain · ±2 offsets · Follow · Hold/Advance/Kite/FallBack | ✅ BUILT + tested | `target.rs:87-217`; `types.rs:548-608`; movement `behavior.rs:174-284`; tests `targeting.rs`, `movement.rs` | ⚠ **Kite has no engine test** |
| **US3** equipment / slot economy | budgets 5/4/3/3/2/2/2 · cost tiers 1/2/3 · common pool · riders · class kits · Jump Jets | 🔴 mostly MISSING | **10 of ~60 items** (`content.rs:963-1050`); flat 3-slot `SlotLayout::STANDARD` (`types.rs:198-219`); no cost field; 1/4 riders (Paint only); no Jump Jets / class kits / innate auras | **own spec cycle** — mechanic + data + UI |
| **US4** stances + energy-cut + Plan-B | 3 stances · energy dial gone · 5 triggers | ✅ BUILT + tested | `types.rs:615-681`; stance %s `ruleset.rs:311-338`; energy removed (air-mult kept `ruleset.rs:463`); tests `stance.rs` | ⚠ delete dead v2 validator `server/ruleset-validate.ts:184-226` |
| **US5** Commander | distinct chassis · 5 slots · Command-while-alive · Heal/Shield/Ablation · DamageTaken aura · §14.6 kit | 🟡 PARTIAL/MISSING | auras built + dynamic (`content.rs:575-582`, `damage.rs:36-52,230`); **no distinct Commander chassis** (still v2 RearSupport, 4 slots `content.rs:566-583`); heal-only projector; Command Plan-B grant is a static `CombatAI` perk not tied to survival; §14.6 kit absent | mechanic + data + **design reconcile** |

**Tuning (the actual goal) is not achieved** — see Current live state.

## Documentation gaps

1. **Every wiki page banners "v3 — not yet built, live runs v2."** False: live runs an **untuned
   v3**. The binary framing understates what shipped (targeting/movement/stances/matrix) and hides
   what's missing (defenses/equipment/Commander). → re-banner per-system (Phase 0).
2. **`tasks.md` T001–T053 all unchecked** despite US2/US4 fully shipping. → reconcile (Phase 0).
3. **`STATUS.md` / `CHANGELOG.md` have no v3 section** (stop at the "12 v1 features" world). → add
   a v3 section (Phase 0).
4. **`balance.md`'s newest entry is v11 (v2-era)** — documents the investigation that *motivated*
   v3, not the deployed v3 field (which lives only in the untracked `balance-reports/`).

## Correction plan (locked 2026-07-24)

Decisions taken: **docs first, then defenses**; **content-first, measure, then decide** on the
super-linearity root cause.

- **Phase 0 — Reconcile docs (this doc + wiki re-banner + `tasks.md` + STATUS v3 section).**
  Cheap; prevents inheriting a false map.
- **Phase 1 — Wake the dormant matrix (highest leverage).** Build the §10 per-chassis defense
  identities + populate shields (mostly `content.rs` data), retire ablative from the offered set,
  add Camo/Chaff (2 small mechanics), and **bake + tune** the 18-weapon roster off `damage:0`. This
  gives the already-built ×1.6/×0.7 matrix something to bite. Measure with
  `balancer verify --field all`.
- **Phase 2 — Equipment / slot economy (US3).** Its own spec cycle: per-chassis budgets, cost
  tiers, riders (EMP/Suppress/Snare), Jump Jets, class kits, innate auras. Where the *graded soft
  counters* live.
- **Phase 3 — Commander (US5) + US1c cadence/throughput mechanics**, once the field has substance
  to justify them.
- **Root-cause fork (deferred):** `balance.md` argues the walls come from **super-linearity**
  (1 counter loses / 2 win 100-0) driven by binary row-screening + splash overlap + focus-fire
  compounding. Per the locked decision, we finish content and **measure each slice**; open an engine
  pass on those mechanics **only if walls persist** after content lands.

## Open build-time design questions (resolve when scoping each phase)

- **ECM slot:** §10 puts ECM in the *defense* slot; it shipped as a *utility*. Which is intended?
  (Phase 1 defense pass.)
- **Cadence-welding:** derive-time formula (`cadence = f(type)`, one cheap-to-retune engine change)
  vs. hand-authored per weapon (18+ numbers to keep in sync)? (Phase 1/3.)
- **Innate auras** (Spotter Network, Coordinated Strike): truly free vs. slot-costly like every
  other signature? (Phase 2.)
- **Cost-tier assignment** per item — only Jump Jets is pinned (3); the other ~60 need a pass.
  (Phase 2; see `../../` memory `equipment-slot-economy-todo`.)
- **Commander "gated behaviors unlock"** is stale: US4 already removed the gated stances it was
  meant to unlock. Drop that clause or redefine the unlock surface. (Phase 3.)
