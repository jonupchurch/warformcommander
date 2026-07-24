# Warform Commander — Balance Readout

## v3 Phase 1 probe — "wake the dormant matrix" via defenses (2026-07-24, reverted)

First measured slice of the v3 correction plan (`specs/015-v3-counter-web/gap-analysis.md`), testing the
highest-leverage content hypothesis: **put real shields/armor on the stock field so the already-built
sharpened matrix (K ×1.6 vs shields / E ×1.6 vs armor) can bite.** Two probes, `verify --field all
--seed 1 --samples 120`, against the v3 baseline (~125/132 walls; kinetic-tanks 0.6%; the flagship
`kinetic-tanks vs energy-mechs` a hard 0/100).

| Probe | Change | Walls | flagship kin-vs-mech | kinetic-tanks | air walls (ca-aa/air-alpha) |
|---|---|---:|---|---:|---|
| Iter 1 | Mech default → §10 heavy shield (one variable) | 130/132 | still 0/100 | 0.3% | 90.9 / 81.8 (unchanged) |
| Iter 2 | full §10-lite (Heavy→armor, Mech→shield, fragile→light shield) | 130/132 | still 0/100 | 0.1% | 90.9 / 81.8 (unchanged) |

**Result: defenses do NOT dissolve the walls.** Kinetic ×1.6 into a fresh 450 shield moved the flagship
matchup **zero** (still 120/0); the reshaping reshuffled exactly one matchup into a near-tie
(`energy-mechs ⇄ artillery-line` ~50/46) while the aggregate wall rate held/worsened. Crucially, the
**biggest dominants are untouched** — ca-aa (90.9%) and air-alpha (81.8%) are *engagement/reach* walls
that no defense choice can affect. This **reproduces the v2 "shields don't create counter-play" finding
under the v3 sharpened matrix**, and confirms the structural read: the walls are super-linearity +
reach/engagement, not a thin damage matrix. A key structural note surfaced: **a shield large enough to
matter to the matrix is also a durability buff** (the defense module can't remove hull), so "populate
shields" changes power levels, not just matchup shapes — which is why it can't cleanly create a counter.

**Decision taken:** per the locked "content-first, measure, then decide" plan, the cheapest content
lever (defenses) is measured insufficient for the matrix walls and irrelevant to the air walls, so we
opened the super-linearity/engagement investigation next (below). The experimental `content.rs` change
was **reverted** (did not earn a keep).

## v3 Phase 1 probe — super-linearity root cause + a "leak-through" fix experiment (2026-07-24, reverted)

**Diagnosis (code, `sim/`):** the walls are a **binary step function in the reach code**. `Occupancy::has`
(`sim/target.rs`) is a *boolean* per zone, so the instant an enemy Front row holds ≥1 living unit, a
short-reach attacker's Middle/Rear pool is excluded **entirely** — reach flips 0→100% when a row clears.
That is the dominant super-linearity source (it gates the target *pool* before any damage math). Two
amplifiers ride on it: splash overlap is linear-but-uncapped (`splash_cap` only clamps a weapon's own
splash, not per-victim incoming), and the design's "overkill-avoiding disperse" default (§12.5/P16) is
**never implemented** (`grep overkill` → 0 hits) — a designed-but-unbuilt gap the US2 audit missed.

**Experiment — graded row-screening ("leak-through"):** a short-reach unit's pool becomes every occupied
ground row, but hits landing PAST its free-reach floor take a leak accuracy + damage penalty (mirrors the
air plink). Built in `sim/target.rs` (`reach_zones`) + `sim/damage.rs` (`resolve_attack`).

| Check | Result |
|---|---|
| Engine tests + golden battery | all green; **golden byte-identical** (inert for default-targeting full-screen battles → screening preserved, zero regression) |
| Aggregate field (`verify --field all`) | **125/132 walls, 7 contested — identical to baseline** (archetypes all use default `Closest`, so nothing ever *chooses* a leaked shot) |
| Controlled counter probe: kinetic vs support-ball with a `Target Support` leak-raider | **0.0% → 0.0%** at ×0.5 leak **and** ×0.8 leak — the healers out-sustain penalised chip; abandoning the screen to snipe is a losing trade |

**Read:** graded row-screening is the *right class* of change (an engagement rule, the only lever that
ever moved this field) and is **safe/surgical** (inert until a build targets past a screen), but **alone
it is too weak** to crack the deep walls — a penalised short-reach shot can't beat sustain/durability, and
the archetype **measurement field can't even exercise reach counters** (all default `Closest`; no
back-targeting or `Furthest` builds). Consistent with the v9 finding that even *full-reach* raiders
couldn't crack the toughest backlines. A real fix is bigger than one localised change: leak-through +
overkill-avoidance (to auto-spill fire) + stronger/tunable magnitude + **new measurement fixtures that
field reach-counter builds**. Experiment reverted; findings kept here.

**Instrument fixed + trustworthy re-test (kept):** added the `reach` field + a `reach-raider` archetype
(a holding screen + short-reach back-snipers on Target Support/Indirect + Furthest + an artillery tube)
to `crates/balancer/src/archetypes.rs` (committed) — the field can now *express* reach counter-play,
which the mono/combined fields structurally could not. Baseline `reach-raider` beats the double-support
turtle `ca-attrition` 99.2% (its **artillery**'s real reach), loses the other five combined builds 0/100.
Re-ran leak-through (×0.8) against this trustworthy field: `reach-raider`'s turtle matchups **did not
move** (still 0/100 vs ca-line/ca-mobile/ca-air/ca-siege/ca-aa; ca-attrition 100%) — though battle
**durations dropped** (ca-line 552→434 ticks), so leak-through IS chipping the backlines, just nowhere
near enough to flip an outcome. **Conclusion: the walls are over-determined** — power gaps + durability +
sustain all reinforce the total order, so no single lever (defense content OR graded reach) moves it.
The counter-web needs a coordinated multi-lever redesign measured against the now-fixed `reach` field, or
the field is accepted as a documented limitation.

---

## Investigation — the counter-web is made of walls (2026-07-22, nothing shipped)

Went after the two open structural items (populate the shield side; give aa-rocket a second
matchup). The shield redesign was built, simulated across a 20-point grid — and **rejected on the
evidence**. In finding out why, the sim turned up the thing that explains every tuning round from v7
to v11.

### The headline: 24 of 30 matchups are deterministic

The archetype "win rates" this project has been tuning for months are not continuous quantities.
Reading the raw matchup grid instead of the aggregates:

| decisiveness (v11 live, 400 samples × 2 roles) | count |
|---|---:|
| matchups resolving 0.0% or 100.0% | **24 / 30** |
| won 2–0 in **every** sample (no 2–1 game ever) | **17 / 30** |
| genuinely contested (5–95%) | **6 / 30** |

`kinetic-tanks vs energy-mechs` is `winsA: 0, winsB: 400`, `matchSplit {twoZero: 400, twoOne: 0}` —
mechs win both roles in all 800 games. RNG never comes close.

**So an archetype's aggregate win rate ≈ (how many of the other 5 it hard-counters) / 5.** That is
why the standings quantize to 20.0 / 40.0 / 60.0, why **aa-rocket has read exactly 20.0 in every
single experiment this session** (it beats air 100–0 and loses the other four 0–100), and why
air-alpha sits at exactly 60.0 (beats 3, loses 2).

**The consequence is uncomfortable: you cannot tune a 0/100 matchup with a damage number.** v7–v11
each moved roughly one matchup across the wall and the aggregate jumped by ~20/5 = 4 points a time.
The "see-saw" was never a see-saw — it was single matchups flipping sides.

### Why the shield redesign was rejected

Built as pure ruleset content: Mech / AttackHeli / RocketArtillery move a fraction `f` of their
neutral effective HP into a regenerating shield, sized so **Explosive-neutral effective HP is
preserved exactly** (a counter-web change, not a nerf), plus a matrix normalisation.

It does move the aggregates — shielding mechs alone gives the best spread of the session (44.2 →
40.5, energy-mechs 64.2 → 58.8, kinetic 51.8 → 55.8, Dominant flag gone). **But it does not create
counter-play**, which was the entire point:

| | contested matchups | clean 2–0 sweeps |
|---|---:|---:|
| v11 live | 6 / 30 | 17 / 30 |
| shield mechs (f = 0.45) | **4 / 30** | **19 / 30** |

`kinetic-tanks vs energy-mechs` stays exactly 0.0/100.0 *even with mechs shielded and kinetic getting
×1.4 into that shield*. The redesign reshuffles which side of the wall two borderline matchups fall
on and makes the field **less** contested. Shipping it would have bought a prettier spread number and
a worse game, so it was not shipped.

### Supporting findings

**The matrix is decorative.** Weighted by effective HP, v11's shielded share is **3.3%**, so the
field-average multipliers are Energy **1.229** / Explosive **1.000** / Kinetic **0.868** — a flat 41%
spread applied uniformly, with no counter-play in it. Note this is the *corrected* version of the
"3 of 21 variants" note under v11 below: variant count badly understates it, because three HeavyTank
variants (Bulwark alone is 3.27M effective HP) dominate the field's durability.

Even so, a 41% family-wide swing **does not flip a single degenerate matchup**. The power gaps
between archetypes are an order of magnitude larger than anything the damage matrix expresses.

**`SkillBeatsGear` does not measure what its name says.** Its "skilled" fixture is 100% Energy
weapons (2 SiegeLaser Grizzlies + 3 PulseLaser Mechs) against a mono-Kinetic armored blob, so its
entire edge is Energy's ×1.25 vs armor. Measured values:

| ruleset | SkillBeatsGear |
|---|---:|
| v11 live | **+0.005** (passing by a hair) |
| matrix normalised (energy ×1.25 → ×1.01 vs armor) | **−0.600** |
| mechs shielded, matrix untouched | −0.308 |
| v11 + mech damage restored ×1.14 | +0.266 |
| v11 + mech damage restored ×1.28 (= v10 level) | +0.441 |

It tracks **mech damage**, not plan-vs-gear. And v11's own −22% lockstep nerf is what drove it to
+0.005 — the invariant has been sitting one nudge from failure ever since, which is what made "−22%
is a hard ceiling" true. Any structural change to the matrix fails this check by construction.

### Diagnosis: is it the game, or the six mono fixtures?

Added a **combined-arms field** to the balancer (`--field mono|combined|all`, commit `4fe5e34`):
six plausible player builds, each with a front screen, a damage source and an answer to air —
against the same live v11 ruleset.

| field | 0/100 walls | clean 2–0 sweeps | contested (5–95%) |
|---|---:|---:|---:|
| mono (reference, 30 matchups) | 24 / 30 (80%) | 17 / 30 | 6 / 30 (20%) |
| combined-arms (30 matchups) | 21 / 30 (70%) | 12 / 30 | 8 / 30 (27%) |
| both pools (132 matchups) | 95 / 132 (72%) | 69 / 132 | 28 / 132 (21%) |

**Answer: the decisiveness is the game, not the fixtures.** Mixed armies barely help — 80% → 70%.
Battles are settled at composition time regardless of how representative the armies are.

### But the diagnostic found something much worse: a hidden dominant strategy

The combined-arms field is *far* more lopsided than the reference field — spread **78.0** vs 44.2,
and `NoDominantUnit` **fails**. In the merged 12-archetype pool:

| build | win rate vs the other 11 |
|---|---:|
| **ca-air** | **97.7** |
| ca-line | 78.5 |
| ca-mobile | 62.3 |
| artillery-line / air-alpha / kinetic-tanks / energy-mechs | 56.7 / 56.0 / 45.8 / 45.5 |
| ca-siege / ca-aa / ca-attrition | 40.8 / 39.6 / 36.8 |
| support-ball / aa-rocket | 22.1 / 18.2 |

`ca-air` beats **eight** opponents 100–0, including the dedicated anti-air builds (`aa-rocket` 100%,
`ca-aa` 99%). Isolated with a controlled comparison — `ca-line` and `ca-air` are the *same list* but
for one slot:

| list | 5th slot | win rate |
|---|---|---:|
| ca-line | Longbow artillery | 78.5 |
| **ca-air** | **one Gunship** | **97.7** |

**Swapping one artillery piece for one gunship is worth +19 points across 11 opponents.**

Meanwhile the mono `air-alpha` (two helis + a light screen) loses to `aa-rocket` **0%**, `ca-aa` 0%,
`support-ball` 0% — it is properly counterable. So **AA counters the all-in air *archetype* but not a
one-heli *splash***: a single gunship tucked into a solid ground line gets air's targeting immunity
while the line does the fighting, and the AA that shreds a 2-heli glass cannon cannot kill one heli
fast enough while also fighting a full ground army.

**The reference field could not see this**, because it only ever tested 2-heli glass cannons against
zero-heli lines. Every balance number from v5 through v11 was tuned on a field that excluded the
game's strongest strategy.

### RETRACTED: the "air-splash dominance" reading above was wrong

Follow-up controlled matchups (`balancer matchup --army-a/--army-b`, live v11, 400 samples) show the
`ca-air` result was **not** about air at all:

| matchup | side-A wins |
|---|---:|
| `ca-air` vs `ca-line` | 81.3% |
| `ca-air` **with the Gunship swapped for a Grizzly** vs `ca-line` | **100.0%** |
| `ca-air` vs `ca-line` **+ a 2nd flak platform** | **0.0%** |
| `ca-air` vs `ca-line` + a 3rd flak | 0.0% |

`ca-air` is **stronger without the helicopter**, and one extra flak platform flips the matchup from
81–19 to 0–100. **Air is fragile, not dominant.** It only looked unanswerable because *no archetype in
either field brings more than one flak platform* — the counter exists and is cheap, the pool just
never fields it. Lesson: a whole-field sweep says which list wins, never *why*; that needs controlled
one-slot swaps.

### The actual finding: artillery is dead weight, and unit value is super-linear in count

Swapping `ca-line`'s Longbow for **any** other unit wins **100–0** against the artillery version
(heavy tank *or* mech — both 100.0%). At live v11 values a Rear artillery piece contributes less than
nothing to a combined-arms list. The break-even, sweeping artillery damage:

| artillery damage | no-artillery list wins |
|---|---:|
| ×1.00 (v11 live) | **100.0%** |
| ×1.28 (= v10 level) | 56.8% |
| ×1.42 (= pre-v8) | 5.3% |
| ×1.75 / ×2.20 | 0.0% |

An **11% damage change swings this matchup 51 points** — the same cliff as everywhere else. v8 (×0.90)
and v11 (×0.78) compounded to ×0.70 and pushed artillery off the edge.

**But restoring it does not work either.** At ×1.28 the *mono* `artillery-line` jumps 56.7 → **88.6**
and contested matchups *drop* 28 → 23:

| ruleset | artillery-line | ca-air | contested |
|---|---:|---:|---:|
| v11 live | 56.7 | 97.7 | 28/132 |
| artillery ×1.28 | **88.6** | 89.5 | 23/132 |
| artillery ×1.42 | **90.7** | 84.4 | 20/132 |

So artillery is **worthless as one piece and overwhelming as two**. That is a *scaling* problem, not a
level problem — no damage number fixes it, it only picks which regime is broken. This is the same
super-linearity that makes every counter binary (1 flak → lose, 2 flak → win 100–0) and produces the
72% wall rate. **It is the root cause underneath every tuning round from v5 to v11.**

### What this means for the plan

1. **Do not promote combined-arms to the default field yet.** It fails `NoDominantUnit`, but partly
   because of a dud slot in a list *I* built (`ca-line`'s Longbow) — baking that into the tool's
   contract would enshrine my own error. Keep it behind `--field` until the artillery/scaling issue is
   resolved, then re-derive the field.
2. **Do not ship an artillery number.** Both directions are wrong. The question to answer first is
   *why* two of a unit are worth so much more than one — likely the Rear-row screen plus splash
   overlapping — because that is what makes counters all-or-nothing.
3. **aa-rocket (18.2) and support-ball (22.1) are downstream of the same thing** and should not be
   tuned until it is understood.

Shipped alongside this investigation: `fix/aa-fire-discipline` (commit `913e84b`) caps AA engagements
at `airMods.aaFocusPerAir` (default 2) per enemy aircraft, because uncapped, five SAM launchers would
all fire on one Gunship and never touch the enemy ground line. It fixes a real targeting pathology and
is **balance-neutral** — standings are identical across cap 1/2/3/99, since nothing in either field
brings 3+ AA. Honest scope: a correctness fix, not the balance fix I set out to make.

---

## Previous — v11 · Breaking the mech↔artillery see-saw (2026-07-22)

**Live ruleset: v11 · `0062f62e`** — Mech **and** Artillery damage both ×0.78, applied **in lockstep**.

| Field | mechs | artillery | air | kinetic | support | aa-rocket | spread | flags |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| v10 (before) | 72.1 ◤ | 68.2 ◤ | 59.7 | 36.6 ▽ | 43.3 | 20.1 ▽ | 51.9 | 4 |
| **v11 (live)** | **63.9** | **60.8** | 60.0 | **51.9** | 43.4 | 20.0 ▽ | **43.9** | **2** |

Kinetic-tanks climb into the fair band, both dominants come down, support's v10 gain is preserved,
and all four invariants pass.

**The lockstep is the whole trick.** v7 nerfed mechs alone (75→63) and artillery re-inflated; v8
nerfed artillery alone (77→69) and mechs re-inflated. They must move *together* — the sim shows any
asymmetry hands the field to whichever side was nerfed less:

| nerf | mechs | artillery |
|---|---:|---:|
| mech ×0.82 / arty ×0.72 | **78.0** ↑↑ | 45.9 |
| mech ×0.80 / arty ×0.75 | 71.4 | 52.8 |
| **mech ×0.78 / arty ×0.78** | **63.9** | **60.8** |

**−22% is a hard ceiling, not a preference.** At −26% and deeper the **`SkillBeatsGear` invariant
fails**: the "skilled" fixture is built from Pulse-Laser mechs, so over-nerfing mechs makes a
well-planned base-gear army lose to a sloppy max-gear one. That inverts the core design rule, so it
is the stopping point.

### The deeper finding — half the counter-web is dead content

**Only 3 of 21 variants have any shield** (all RearSupport). With the matrix at Kinetic ×1.4
vs-shields / ×0.85 vs-armor and Energy ×0.6 / ×1.25, that means **Energy enjoys a permanent ×1.25
against the entire field while Kinetic eats a permanent ×0.85 with almost nothing to point it at.**
The intended damage triangle has collapsed into a flat ordering — the root reason energy-mechs
dominate and kinetic tanks lag.

### Three experiments that failed (and why they're useful)

1. **Give mechs shields** (populate the shield side): mechs 72→60, but **artillery jumped to 80** and
   kinetic *still* went 0% vs mechs. `armorPct` only mitigates hull — not shields — so moving hull
   into a shield pool was really a durability nerf, and kinetic's problem was never the damage layer.
2. **Buff aa-rocket's SAM ground damage**: mechs and artillery sat at *exactly* 72.1/68.2 at every
   value. It only cannibalized the other underdogs (kinetic 37→19, support 43→23). The top tier is
   robust to bottom-cluster buffs.
3. **Asymmetric nerfs**: see the table above — the see-saw simply tips the other way.

**Still open — aa-rocket at 20%.** It is a pure hard-counter specialist (beats air 100%, loses to
everything else), and an equal-weight round-robin inherently punishes specialists. Its one buff lever
(SAM ground damage) trades against support-ball almost 1:1, which would undo v10's support fix. The
real answer is to give rocket-artillery a genuine dual-purpose identity — a content redesign, not a
number. Same for populating the shield side of the counter-web.

---

## Previous — v10 · Anti-air flak (2026-07-21)

**Live ruleset: v10 · `e6f8d8e7`** — adds the **Flak Battery** utility, which grants the new
`AntiAir` capability: a *ground* unit can now engage the Air zone **and** fires on air at
`airMods.flakDmgMult` (tuned to **×1.2**) instead of taking the plink penalty. "Target air without
losing damage to plinking."

**This finally broke air's dominance**, which three rounds of stat nerfs could not:

| Field | air-alpha | mechs | artillery | support | kinetic | aa |
|---|---:|---:|---:|---:|---:|---:|
| v9 (before) | **80.0** ◤ | 71.7 | 68.3 | 27.8 ▽ | 32.2 | 20.0 |
| **v10 (live)** | **59.7** | 72.1 | 68.2 | **43.3** | 36.6 | 20.1 |

Air-alpha drops off the Dominant flag list and support-ball off the Underpowered list — **two flags
removed, none added**, all four invariants still passing. The reason a stat nerf never worked: air
was protected by an *engagement rule*, not by numbers. Only `Air`-reach SAMs could touch the Air
zone, so air stayed ~80% even at −75% heli damage. Flak changes who can *reach* air.

**The tuning has a knife-edge — ×1.2 is deliberate, not arbitrary:**

| flak | air | mechs | artillery | support | mech-beats-air |
|---|---:|---:|---:|---:|---:|
| off | 80.0 | 71.7 | 68.3 | 27.8 | 0% |
| **×1.2** | **59.7** | **72.1** | **68.2** | **43.3** | **2%** |
| ×1.3 | 57.0 | 74.7 | 68.4 | 43.3 | 15% |
| ×1.5 | 34.6 | 88.8 ◤ | 75.9 ◤ | 43.3 | 87% |
| ×2.16 | 0.5 | 91.8 ◤ | 88.2 ◤ | 43.3 | 100% |

Past ×1.2, flak stops being an equalizer and becomes a gift to the *dominant* tier: mechs and
artillery use it to escape air — their **only** counter — and re-inflate to 89%/76% while air is
deleted outright. ×1.2 is the last point where air comes down **without** the top of the field
going up.

**Honest caveats:**
- At ×1.2 a *lone* flak tank still loses to air. The archetype that actually converts flak into
  wins is **support-ball**, because it *heals* its flak platform so it survives to keep firing.
  Flak is a composition tool, not a free air-answer — you must keep the platform alive.
- **Air is tamed, not fixed into the band** (59.7%, just under the 0.60 ceiling). Getting it lower
  requires the trade above, which is worse.
- **The mech (72%) / artillery (68%) dominance is untouched** — that's the separate mech↔artillery
  see-saw, not an air problem.

**Reproduce:** `cargo run -p balancer --release -- --ruleset <v10.json> --samples 1000 --seed 1 verify`
(each air-losing archetype auto-fields a flak platform when the ruleset carries `FlakBattery`).

---

## Previous — v9 · Light-tank raider (2026-07-21)

**Live ruleset: v9 · `247ce676`** — adds the **Skirmish Cannon** (Light mount, `AnyGround`
reach — the *reach* half) and a **LightTank role-damage bonus of +45%** vs artillery /
rocket-artillery / support (the *payoff* half). Sim-tuned over 1,000 samples/matchup, seed 1.

**What it does — a light tank that reaches the enemy backline (Skirmish Cannon + `LastReachable`
dial) snipes the fragile rear.** Field effect (aggregate win%, kinetic fielding two raiders):

| Field | Kinetic | Support | Artillery | AA | Mechs | Air | Kinetic vs Support |
|---|---:|---:|---:|---:|---:|---:|---:|
| v8 (before) | 21.1 | 38.4 | 68.3 | 20.5 | 71.7 | 80.0 | 11.3 |
| **v9 (live)** | **32.2** | 27.8 | 68.3 | 20.0 | 71.7 | 80.0 | **71.7** |

All four invariants still pass (FamilyBonusBand +12%, PowerGapCap 0.43, NoDominantUnit 0, SkillBeatsGear).

**Three findings the sim locked down:**

1. **It's a *support* counter, not an *artillery* counter.** Killing the healers collapses the
   support ball's sustain — that's the whole effect. Against the artillery line it stays ~0% **even
   at +100%**: the front screen + siege damage out-races two Medium-cadence light tanks before they
   grind down two tanky howitzers. A damage bonus can't crack artillery — the same "front screen
   protects the backline" wall as air. Cracking it needs a different lever (raider *volume* /
   survivability), deliberately out of scope here.
2. **Reach and payoff only work as a pair.** Weapon-only (reach, no bonus) *lowers* kinetic to
   11.3% — the raiders abandon fast front DPS to plink the backline weakly. The +45% bonus is what
   turns the trade positive.
3. **It's a build, not a birthright.** Stock light tanks (Autocannon, `Nearest` reach) can't reach
   the backline, so they never earn the bonus. Only a player-built raider (Skirmish Cannon +
   `LastReachable`) does — a counter-pick that rewards scouting a support-heavy defense, self-limited
   by the weapon slot + dial it costs. The aggregate above *overstates* the hit to support-ball,
   which only appears when a raider build actually faces support.

This makes **light tanks useful** (their niche = anti-support raiders). It does **not** touch the
dominant tier — air (80%), mechs (72%), artillery (68%) are unchanged and remain the open problem.

**Reproduce:** `cargo run -p balancer --release -- --ruleset <v9.json> --samples 1000 --seed 1 verify`
(the `kinetic-tanks` archetype auto-fields raiders when the ruleset carries `SkirmishCannon`).

---

## Historical baseline — v5 Monte-Carlo pass

**Monte-Carlo balance pass · after-action report**

- **Battles simulated:** ~12,000 (≈9,000 archetype sweep + invariants, ≈3,000 per-machine pass)
- **Ruleset:** live **v5 · `9acf456d`** (the actual arena table — aa ×2.16, plink ×0.84, sam-vs-ground ×0.56, mech buff)
- **Engine:** 0.1.0, deterministic · best-of-three per battle
- **Field:** 6 counter-web archetypes, full round-robin, both attack/defend roles

---

## Top-line verdict

| | Machine | Why |
|---|---|---|
| ◤ **Over-powered** | **Attack Heli** | Tops every metric — 2,531 dmg/game, 1.92 kills, 80% survival, near-zero damage taken. Beats the entire field **except** dedicated anti-air. The one machine that warps the meta. |
| ◣ **Under-powered** | **Rear Support** | 0% side-win rate, 0.1% survival, no offense. The heal (693/game) never offsets a spent combat slot — a support-led squad loses to **everything**. |

**Your three design goals hold:** outcomes are decided by composition, not the dice; planning beats raw gear; and nothing is unbeatable. What's off is **field spread** — air dominates, support collapses, and the recent mech buff runs a little hot.

---

## 01 · Design-intent check

The four balance invariants, measured against the engine's own distributions. **All four clear their bands.**

| Invariant | Measured | Band | Verdict |
|---|---:|---|---|
| **Skill beats gear** | +0.59 | [0 – 1] | ✅ a well-composed base-gear squad out-survives a sloppy max-gear one by ~59% of a squad |
| **No dominant unit** | 0 | [0 – 0] | ✅ no archetype clean-sweeps the field |
| **Power-gap cap** | 0.43 | [0 – 0.5] | ✅ gear edge is bounded — you can't buy a win |
| **Native-family bonus** | +12.0% | [10 – 15%] | ✅ on target |

### Does RNG decide battles? — **No.**
- Of 30 matchups, **24 resolve 100% / 0%** with tight 95% intervals — the same side wins regardless of seed.
- Only 6 matchups are contested, and even those have a clear favorite (worst is 72/28), never a 50/50.
- The seed is a tiebreaker in close fights, never the decider in mismatched ones. **Composition is destiny.**

### Does skill win? — **Yes.**
- A well-composed **base-gear** squad out-survives a sloppy **max-gear** squad by ~59% of a squad.
- Gear advantage is capped at 0.43 (below the 0.5 blowout line).
- Picking the countering composition — and bringing anti-air — is what wins games.

---

## 02 · The counter-web

Win rate of the **row** archetype vs the **column**, pooled over both roles. `Field` = across-field win rate (fair band = 40–60%). The blocks of 100/0 are the counter-web working — hard counters, not soft edges.

| row ▸ vs ▾ | Kinetic | Mechs | AA-rkt | Air | Arty | Support | **Field** |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Kinetic tanks** | — | 0 | 92 | 0 | 0 | 100 | **38** ▽ |
| **Energy mechs** | 100 | — | 100 | 0 | 77 | 100 | **75** ◤ |
| **AA rocket** | 14 | 0 | — | 100 | 0 | 100 | **42** ◦ |
| **Air alpha** | 100 | 100 | 0 | — | 100 | 100 | **80** ◤ |
| **Artillery line** | 100 | 28 | 100 | 0 | — | 100 | **65** ◤ |
| **Support ball** | 0 | 0 | 0 | 0 | 0 | — | **0** ▽ |

**Healthy core:** `Air › Mechs › AA rocket › Air` — a clean rock-paper-scissors triangle at the top of the field.

**The problem** isn't that cycle — it's that **Air also beats the other three archetypes 100%**, so "bring AA or lose to air" becomes forced, and Air's field rate balloons to 80%.

**Flags (worst first):** `support-ball` Underpowered (0%) · `air-alpha` Dominant (80%) · `energy-mechs` Dominant (75%) · `artillery-line` Dominant (65%) · `kinetic-tanks` Underpowered (38%, borderline).

---

## 03 · Per-machine effectiveness

Every unit type pooled across 3,000 battles, attributed from replay events — a machine is judged on its **own** output, not just its squad's result. Sorted by damage per game.

| Machine | Verdict | Dmg/game | Kills/game | Survive % | Dmg taken/game | Heal/game | Side win % |
|---|---|---:|---:|---:|---:|---:|---:|
| **Attack Heli** | ◤ Over-powered | **2,531** | 1.92 | **80.0** | 135 | — | 80.0 |
| **Artillery** | Strong | 1,500 | 1.17 | 64.2 | 210 | — | 64.9 |
| **Mech** | Strong · hot | 1,025 | 0.82 | 46.1 | 700 | — | 67.9 |
| **Rocket Artillery** | Fair · specialist | 984 | 0.82 | 41.5 | 448 | — | 43.1 |
| **Heavy Tank** | Anvil · under-rewarded | 849 | 0.56 | 15.9 | **1,624** | — | 33.3 |
| **Light Tank** | Screen | 432 | 0.30 | 16.3 | 563 | — | 62.7 |
| **Rear Support** | ▽ Under-powered | 0 | 0.00 | **0.1** | 1,179 | **693** | 0.0 |

**Read the roles, not just the rows:**
- **Side-win% is confounded by squad** — Light Tank's 63% is riding Air's coat-tails; Heavy Tank's 33% is dragged down by the losing kinetic/support squads it screens for. Trust dmg / survival / soak for the individual read.
- **Heavy Tank is a true anvil** — soaks the most fire (1,624/game) and dies most (16% survive). That's its job, but it's **under-rewarded**: kinetic squads land at 38% field.
- **Rocket Artillery reads "average"** on raw stats but is the game's only hard counter to Air — its value is structural, not statistical.

---

## 04 · Strategies that dominate

- **◤ Air alpha — 80% field.** Beats Kinetic, Mechs, Artillery, and Support **100%**. Only AA rocket answers it. Forces a rock-paper-scissors tax: every list must budget anti-air or auto-lose to helis. Even after the +20% AA-damage pass, air still rules the non-AA field — the counter got sharper, air's reach didn't shrink.
- **◤ Energy mechs — 75% field.** Pulse-laser mechs melt armor: beat Kinetic and AA **100%**, Artillery 77%. Fold only to Air. The recent mech buff is the likely cause of the jump into "dominant."
- **△ Artillery line — 65% field.** Safe backfield damage: 1,500 dmg/game at 210 taken. Beats everything but Mechs (28%) and Air (0%).
- **▽ Support ball — 0% field.** The trap pick. Trading a combat slot for a medic loses every matchup; the medic dies first (0.1% survival).

---

## Where the numbers point (advisory — nothing changed in-game)

1. **Attack Heli** takes almost no damage (135/game) while dealing the most — trim survivability (hull/evasion), not just let AA punish it. This is the single biggest lever.
2. **Rear Support** is a spent slot at 0.1% survival — needs durability or a stronger/wider heal to justify the seat.
3. **Mech** — the recent +10% dmg / +20% hull buff pushed it to 75% field; worth a slight walk-back.
4. **Heavy Tank / kinetic** are under-rewarded for their soak role — a small durability or damage nudge would lift the game's most underused frontline.

---

## Methodology & caveats

- **Engine:** the live deterministic engine at ruleset `v5 · 9acf456d` (the real arena table, read-only). Best-of-three per battle.
- **Sample:** ~9,000 resolutions for the archetype sweep + invariants; ~3,000 for the per-machine pass (30 ordered matchups × 100 samples). Wilson 95% intervals; fair band [40%, 60%] across-field.
- **Field:** six counter-web archetypes, each themed on a machine class and built legal (helis cap at 2 in Air; support runs a protected tank core). Light Tank appears only as a screen, never its own list — read its row with that caveat.
- **Reproduce:** `cargo run -p balancer --release -- --ruleset <v5.json> --samples 300 --seed 1 verify` (sweep + invariants) and the `unit_effectiveness` example (per-machine pass).
- **Advisory only:** this names what to tune; it does not touch the balance table.
