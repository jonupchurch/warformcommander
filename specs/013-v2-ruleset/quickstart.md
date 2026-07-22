# Quickstart: Validating v2 Ruleset Slices

How to prove a slice actually works. Every slice runs the full cascade — this feature changes the
damage pipeline and the content catalog, so partial verification is not meaningful.

> `cargo` needs `export PATH="$HOME/.cargo/bin:$PATH"` under the POSIX shell. Run the balancer from
> the repository root with absolute paths.

## The engine cascade

Run in order. Each step gates the next.

```bash
# 1. Engine + balancer suites
cargo test

# 2. Goldens — re-bless ONLY if the seed-ruleset hash legitimately changed (see below)

# 3. Lint + format
cargo clippy --all-targets -- -D warnings
cargo fmt

# 4. Rebuild wasm from the same source
wasm-pack build crates/engine --target nodejs --out-dir ../../packages/engine-wasm --release
git checkout -- packages/engine-wasm/.gitignore packages/engine-wasm/package.json

# 5. Native/wasm byte-identity across all seeds  (P6, NON-NEGOTIABLE)
cargo run -q -p engine --example emit_battery -- <dir>
node scripts/wasm-parity.mjs <dir>

# 6. TypeScript
npx tsc --noEmit
npm test        # NOT bare `npx vitest` — DB-backed tests need the dotenv wrapper
npm run build
```

### When a golden re-bless is legitimate

| Slice | Expected | If it differs |
|---|---|---|
| 1 — defenses | **Re-bless required** (catalog + rebase) | — |
| 2 — stance | **No re-bless** | A hash change means a field was made hash-visible by mistake. Investigate; do not re-bless. |
| 3 — support stances | **No re-bless** | As above |
| 4 — Mech | Re-bless (new module) | — |
| 5a–5d — air | Varies per change | — |

The "no re-bless" rows are a deliberate tripwire (R6). A hash change where none was expected means the
change is larger than intended.

## Per-slice acceptance

### Slice 1 — Defenses (SC-003, SC-004, SC-005, SC-008)

```bash
cargo test -p engine --test defenses
cargo run -p balancer -- sweep --field all
```

- Every mount class offers four options, none a no-op → **SC-004**
- Shielded + ablative capacity ≥ 25% of field effective HP → **SC-003**
- Median battle duration within 10% of the v11 baseline → **SC-005**, the redistribution check
- Heli / Artillery / RktArty survive focused fire no longer than on v11 → **SC-008**

**Capture the v11 baseline before starting.** Duration and survival are comparisons, and the
comparison point disappears the moment the catalog changes.

### Slice 2 — Stance (SC-006, SC-007)

Requires the stance-varying archetype fixtures (R8) — without them the balancer reports no effect no
matter how well the mechanic works.

```bash
cargo test -p engine --test stance
cargo run -p balancer -- sweep --field all
```

- Armies differing only in stance produce different casualty orders in ≥80% of matchups → **SC-007**
- Every stance option changes an outcome → **SC-006**
- A uniform-stance army resolves identically to all-Neutral → **FR-017**, the zero-sum guarantee

### Slice 4 — Mech

- Reactive mitigation measurably shifts toward the family absorbed → **FR-024**
- Mech underperforms a specialist in short battles, outperforms in long ones → US3
- Reactive plating is not offered on any non-Mech chassis → **FR-023**

### Slices 5a–5d — Air, one change at a time

**Do not batch these.** Four changes all pushing the same direction on an archetype at 60% is how air
gets deleted with no way to tell which change did it.

```bash
# after EACH change, independently:
cargo run -p balancer -- sweep --field all
```

- Aircraft remain inside the viability band after **each** stage → **SC-010**
- Dedicated anti-air is no longer last → **SC-009**

Leave `aaFocusPerAir` untouched throughout. It is a confounding variable while other air changes are
being measured.

## Shipping a slice

```bash
# 1. Engine deploys FIRST when the slice adds an enum variant (R7) — slices 1, 3, 4
#    Field-only and catalog-only slices may deploy in either order.

# 2. Re-seed: content does NOT reach live battles via a wasm redeploy.
#    The arena reads the frozen `current_ruleset` row.

# 3. Production differential — the cheapest proof a deployed engine honours a new field
curl -X POST https://warformcommander.vercel.app/api/resolve \
  -H 'content-type: application/json' \
  -d @<battle-input-with-explicit-field>.json
```

Compare the returned replay hash against the same input resolved locally: omitted-field and
explicit-default inputs must produce identical hashes, and a deliberately-off-default value must
produce a different one. If they match when they should differ, the deployed engine is ignoring the
field.

> **Deploy lag is real.** A static page can go live ~25 seconds before the serverless function rolls
> over, so the first differential attempt after a deploy can report a false negative. Poll again
> before concluding anything.

## Final gate

A slice is done when all of the following hold — not when the code compiles:

- [ ] `cargo test` green, clippy clean, `cargo fmt` applied
- [ ] Native/wasm parity byte-identical on all four seeds
- [ ] Goldens re-blessed **only** where the table above expects it
- [ ] `tsc` clean, `npm test` green, production build succeeds
- [ ] Balancer run and its success criteria met — **and recorded**, so the next slice has a baseline
- [ ] Ruleset published and the production differential confirms the deployed engine honours it
- [ ] The Customize screen describes the new options from live values (FR-033)
