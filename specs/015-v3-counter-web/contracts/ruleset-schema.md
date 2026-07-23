# Contract — Ruleset Data Schema (engine ↔ DB ↔ TS mirror)

The ruleset is the single typed source of truth read by **sim, UI, and balancer** (Constitution P8).
This contract governs its shape and how v3 changes propagate without breaking determinism.

## Producers / consumers

- **Seed**: `crates/engine/src/content.rs` (the default ruleset).
- **Live**: a frozen `current_ruleset` DB row the arena reads — updated only via
  `scripts/reseed-current-ruleset.ts` (engine/content changes do **not** reach real battles on a wasm
  redeploy alone; see [[live-ruleset-is-a-db-row]]).
- **Mirror**: the TS derive surface (`lib/*`, `derive-battery.json`) — must stay parity-green.

## Serialization invariants (do not break)

- **Hash-stable at defaults**: new ruleset fields serialize with `#[serde(default,
  skip_serializing_if = ...)]` so a ruleset carrying defaults hashes identically to today's — existing
  replays and golden tests do not churn.
- **Fixed-point only**: all magnitudes are `Bp`/`Fixed` (no floats) — determinism (P6).
- **Additive enum changes are breaking for old deserializers**: `AuraKind::DamageTaken`,
  `TriggerCondition::NoTargetsReachable`, new `EquipmentId`s, `Stance`/`MovementMode` variant removals
  change the wire shape.

## v3 shape changes (summary — see data-model.md)

| Area | Change |
|---|---|
| `DamageMatrix` | values → ×1.6/×0.7 (tune) |
| mount defenses | populate shields; Ablative out of core; Mech Reactive only hedge |
| targeting | priority-chain fields replace `TargetRow`+`TargetRule` |
| `MovementMode` | Hold/Advance/Kite/FallBack (remove Reposition/Escort) |
| equipment catalog | domains + rider/aura effects + per-item cost + slot budgets |
| `Stance` | 3 variants (remove 5); applies to output |
| Energy dial | **removed** (`EnergyMode`/`EnergyModes`/`energy` field) |
| Plan-B | triggers ±; `DialKey`/`DialValue` → Movement/Stance only |
| `AuraKind` | + `DamageTaken` |

## Propagation contract (ORDER MATTERS — D8)

For any change that **adds/removes an enum variant** (auras, triggers, stances, movement, equipment):

1. Land + test the engine change (native `cargo test` + golden replays green).
2. **Deploy the wasm build FIRST** (so the browser/arena can deserialize the new variants).
3. **Then** re-seed the live ruleset (`reseed-current-ruleset.ts`).
4. Verify on the **arena path**, not just the seed ruleset (the arena reads the frozen row).

Re-seeding before the wasm deploy → an old wasm build deserializes an unknown variant → break.

## Parity contract

- `derive-battery.json` / the TS enum mirror (`SupportRange`, etc.) are regenerated **only when a
  stat/enum shape changes**, deliberately — never as an incidental side effect (keeps
  `derive-parity.test.ts` green; see [[derive-battery-fixture-stale]]).
