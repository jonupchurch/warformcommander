# Spec 014 — Weapon & Counter System Redesign (planning)

> Living design doc. Status tags: **[DECIDED]** = agreed, build it · **[OPEN]** = needs a
> decision before building · **[DRAFT]** = illustrative, numbers to be tuned/measured.
> Companion to `diagnosis.md` (why the field is degenerate) and `spec.md` (the formal ask).

---

## 1. Why we're here (context)

The field is a **93.9% total order**: 125 of 132 matchups are 0/100 sweeps, decided by which
army ranks higher on a single power ladder. Only 4 counter-relationships survive, all AA→air.

Two prior conclusions reshaped the plan:

- **Axis A (flatten power) was falsified.** Diminishing-returns-on-stacking was built, measured,
  and made the field *slightly worse*. Power-flattening is symmetric — it can't create the cycles
  a healthy field needs. The coordination infrastructure remains in-tree as a dormant no-op.
- **The goal is intransitivity, not parity.** (See §2.)

The real lever is **content/counters (Axis B)** — and the audit below shows the weapon system is
where the counters are supposed to live but currently don't.

## 2. The goal — what "balanced" means here **[DECIDED]**

- **No build wins forever. Every build must have a counter.**
- **Decisive wins are fine if they're *strategic*** — a 100-0 is healthy as long as the loser
  could have beaten a *different* army by bringing the right thing.
- **Not coin-flips.** This is async PvP with no in-battle input, so a 50/50 result is pure luck,
  not skill. We are *not* chasing 40–60% near-ties. We are chasing **cycles**.
- **Success signals** (replacing the old "near-ties ≥ 20" target):
  - No army wins more than ~8 of its 11 matchups (today the king wins ~10–11).
  - Every top build has **≥2 counters that aren't traps** (a counter that itself loses to the
    whole field, like today's bottom-tier AA specialist, doesn't count).
  - Monotone rate drops from **93.9% → ~70%**; upsets rise from **4 → many**.

## 3. What the audit found (current weapon system)

### 3.1 Stock weapon roster (chassis defaults)
Throughput = damage per tick. Fire rate: Fast=1t, Medium=3t, Slow=5t, Siege=10t.

| Variant | Chassis | Dmg | Rate | Type | Thru | Hull | Armor |
|---|---|--:|---|---|--:|--:|--:|
| Grizzly / Cavalier / Bulwark | Heavy Tank | 35/40/26 | Slow | Kinetic | 5–8/t | 1183–1849 | 28–35% |
| Scout / Hunter / Outrider | Light Tank | 5 | Fast | Kinetic | 5/t | 484–572 | 6% |
| Vanguard / Striker / Sentinel | Mech | 12–19 | Medium | Kinetic | 4–6/t | 713–1000 | 12% |
| Gunship / Interceptor / Warhog | Attack Heli | 14–21 | Medium | Explosive | 5–7/t | 504–630 | 4–6% |
| Sentry / Aegis / Deluge | Rocket Arty | 30–36 | Slow | Explosive | 6–7/t | 638 | 10% |
| Longbow / Siege / Marksman | Artillery | 58–82 | Siege | Explosive | 6–8/t | 442–527 | 6% |
| Medic / Warden / CommandPost | Rear Support | 0 | — | — | — | 370–801 | 12–18% |

### 3.2 Damage matrix (the counter triangle)
**Current v2** (too weak — never overturned a rank gap, per diagnosis):
| Type | vs Shields | vs Armor |
|---|--:|--:|
| Kinetic | ×1.4 | ×0.85 |
| Energy | ×0.6 | ×1.25 |
| Explosive | ×1.0 | ×1.0 |

**v3 sharpened [DECIDED start value — measure & tune]:** symmetric, wide enough that the right type
*swings* a matchup (≈2.3× spread same-layer). Explosive stays neutral; its edge is splash + reach,
not the matrix.
| Type | vs Shields | vs Armor |
|---|--:|--:|
| Kinetic | ×1.6 | ×0.7 |
| Energy | ×0.7 | ×1.6 |
| Explosive | ×1.0 | ×1.0 |

### 3.3 Weapon-swap options (equipment) — where energy hides
Energy = **only two guns in the game**: Siege Laser (Heavy) and Pulse Laser (Mech).

| Mount | Kinetic | Energy | Explosive |
|---|---|---|---|
| Heavy | default + Heavy Cannon + Railgun(pierce/Deep) | **Siege Laser** | — |
| Light | default + Autocannon + Gauss | — | — |
| Mech | default + Assault Cannon | **Pulse Laser** | — |
| Heli | — | — | default + Rocket Pods |
| Rocket Arty | — | — | default + SAM + Barrage |
| Artillery | — | — | default + Howitzer |

### 3.4 The three findings that drive the redesign
1. **Damage type is welded to the chassis.** Ground direct-fire = Kinetic, everything that
   flies/lobs = Explosive. You can't counter-pick your type; it comes bundled with the role you
   chose for other reasons. So the matrix is never a *decision*.
2. **The triangle is dormant.** Almost nobody fields shields, so kinetic's ×1.4-vs-shields
   identity never fires, and everyone's shooting armor — where kinetic is *penalized* (×0.85).
3. **Throughput is already flat** (~5–8/t everywhere). Raw-damage tuning is inert (proven over 11
   rounds). Power gaps come from durability, reach, evasion — not DPS.

---

## 4. Design directions

### D1 — Damage type becomes a real choice (the *primary* weapon) **[DECIDED]**
- Every combat chassis can field **one weapon of each damage type** (kinetic / energy / explosive).
- **(A) The three type-variants differ in damage type *and* their welded firing profile** (cadence +
  DPS/alpha — see D6); accuracy/splash stay uniform. Per-shot damage derives from throughput ÷ the
  type's cadence, tilted by the DPS/alpha tradeoff and the Heavy/Mech chassis modifier — the matrix
  (B) is the only bespoke new number.
- **(C) Native +12% kept** as the tradeoff: native type keeps +12%; off-type trades it for the
  matrix swing → counter-picking your type is a *read*, not a free upgrade.
- **(B) Matrix sharpened** to ×1.6 same-layer / ×0.7 cross-layer (§3.2) so the right type *swings* a
  matchup; measure & tune.
- **Mech = no native → free flex-picker** (its identity).
- **Weapon type × armor family = one counter loop:** your weapon counters their *defense*, their
  weapon counters *your* defense — the counter-pick mind-game. Neither is RPS alone; together they
  are. (Avoidance defenses — camo/ECM/chaff — are matrix-immune; countered by accuracy/splash/reach,
  which live in equipment/secondary, not the primary.)

### D2 — Secondary weapon slot, one-at-a-time **[DECIDED in principle]**
- Each unit carries a **primary + a secondary**; they **share the firing clock**, so the secondary
  is *redirected* DPS, not extra DPS. Using it costs you the shot you'd have fired otherwise.
- Property this buys: **a capability (e.g. AA) is countered in proportion to how much of its target
  is on the field.** No air present → secondary never fires → zero cost.
- **Plugs into existing machinery:** `aa_focus_per_air` fire discipline stops one aircraft from
  soaking a whole army's fire; `flak_dmg_mult`/`plink`/`aa_dmg_mult` already exist; Rocket Pack
  already precedents front-only AA.
- **Graded, not binary:** secondary flak = *soft* AA (front reach, partial damage); dedicated SAM =
  *hard* AA (whole field, full damage). Specialists keep their edge; the "counter is a trap"
  problem dies because a competitive army can carry latent AA cheaply.
- **The secondary menu is GENERAL, not AA-only** — see D3.

### D3 — Don't one-side it: a general secondary menu + air's own answers **[DECIDED in principle]**
The trap: *if the only secondary is AA, we just nerf helis globally.* Fix, two parts:
- **Ground secondaries are a menu with internal opportunity cost:** flak (AA) / pierce round
  (anti-shield) / spotter (reach) / smoke-ECM (defense). An army that all took flak has nobody who
  took pierce → folds to a shield-wall. The secondary is a *decision with its own counters*.
- **Air plays the same game.** Helis get their own secondaries and stay a threat:
  - **SEAD** — hunts the flak-carriers (air's counter to AA; costs the heli its main-target shot).
  - **Evasion/flare** — drops incoming *secondary* flak accuracy, so casual AA whiffs and only
    *dedicated* AA reliably connects.
  - **Ground-attack** — an un-threatened heli switches to ground, so ignoring it is punished.
- **Load-bearing rule: keep heli ground lethality HIGH.** The opportunity-cost engine only works if
  *skimping* on AA is dangerous. Air's job is to punish armies that spent their slots elsewhere.

### D4 — Rear Support: four modes **[DECIDED]**
| Mode | Effect | Engine mapping |
|---|---|---|
| Heal | restore hull to wounded allies | `support_power`/`support_range` — **exists** |
| Shield projector | confer a shield pool to allies | `AuraKind::StartShield` — **exists** |
| Damage boost | allies deal more | `AuraKind::DamageDealt` (positive) — **exists** |
| Damage reduction | allies take less | new `AuraKind::DamageTaken` — **the one new piece** |

- **Shield projector is a keystone:** it's what finally puts shields on the field, turning its army
  **kinetic-bait but energy-proof** — which makes the enemy's damage-type choice suddenly matter.
  One unit switches the dormant half of the triangle back on.
- Each mode is itself a node in the web: Heal → attrition (loses to burst); Shield → arms
  kinetic/pierce counters; Boost → tempo/glass; Reduction → durability (loses to pierce +
  sustained; `min_damage_floor` 10% already prevents invulnerability).

### D5 — Defenses must be a real choice too (dependency) **[OPEN]**
Type-counters only bite if targets actually *vary* their defense family. Families already exist
(Balanced / Armor / Shield / Ablative per mount, + Mech Reactive). Likely needs the same
"make-the-choice-matter" pass as weapons, or the triangle stays dormant even after D1.

### D6 — Fire cadence & firing profile **[DECIDED]**
Cadence is a **property welded to damage type** (P19 = firing-profile config, *not* separate weapons):

| Type | Cadence | Profile |
|---|---|---|
| Energy | Fast | slight **DPS lead**, low alpha |
| Kinetic | Medium | balanced |
| Explosive | Slow (Artillery → Siege) | lower DPS, high **alpha** + splash |

- **DPS↔alpha tradeoff (P20):** throughput is *not* flat — fast carries a slight sustained-DPS lead,
  slow trades DPS for big per-shot alpha. No type is independently best: fast grinds non-regen
  targets; slow **bursts through** shield-regen / healing / overkill-thresholds. *(Amends D1-A.)*
- **Chassis modifier — Heavy Tank & Mech: +1 tick firing time, +10% damage across all weapon types.**
  The "heavy platform" identity — ponderous but punchy, pushed toward the alpha end (a Heavy's fast
  energy still fires slow-ish and hits hard). Consequence: fast weapons lose relatively more sustained
  DPS on heavy chassis (reinforces "heavies don't machine-gun"), and **battles run a bit longer**
  (accepted — watch median-duration in measurement).

**Completed offense → defense counter map** (every defensive family now has an offensive answer):
| Offensive axis | Counters defensive family |
|---|---|
| **Type** (K/E/X matrix) | Armor vs Shield — *which layer* |
| **Cadence/alpha** (rides on type) | Shield-**regen** & Healing — *regeneration* (burst) |
| **Delivery** (accuracy/splash — equip & secondary) | Evasion / Camo / ECM — *avoidance* |
| **Sustained attrition** (either) | Ablative / Reactive — *the hedge* |

---

## 5. Proposed weapon menu **[DRAFT — numbers TBD]**
Native type in **bold**. Throughput held ~flat within a chassis so the choice is *type*, not power.

| Chassis | Kinetic | Energy | Explosive | Secondary (situational) |
|---|---|---|---|---|
| Heavy Tank | **Heavy Cannon** | Siege Laser | Siege Mortar | Railgun (pierce+reach) / Flak |
| Light Tank | **Autocannon** | Arc Repeater | Grenade Launcher | Flak / Spotter |
| Mech (*no native*) | Assault Cannon | Pulse Laser | Rocket Salvo | Rocket Pack (AA) / pierce |
| Attack Heli | Chaingun | Beam Cannon | **Rocket Pods** | SEAD / evasion / ground-attack |
| Rocket Arty | Railcannon | Ion Battery | **SAM Battery** | Guided (Deep reach) |
| Artillery | Siege Railgun | Beam Artillery | **Howitzer** | Saturation (max splash) |
| Rear Support | — | — | — | Heal / Shield / Boost / Reduction (D4) |

---

## 6. Open decisions (knock these down next)
1. **[OPEN] Native +12% bonus — keep?** (Lean: keep — it's what makes off-type a tradeoff and
   Mech-as-flex depends on it.)
2. **[OPEN] Secondary selection rule.** Proposed: auto-fire secondary at its target class whenever
   such a target is in reach *and* fire-discipline allows, else primary; plus a per-unit priority
   dial ("prioritize air" / "hold ground"). Set at build → no in-battle input.
3. **[OPEN] Secondary menu scope for v1.** Which capabilities beyond flak (pierce? spotter? SEAD?
   evasion?). Air's answer must ship in the *same* slice as ground AA (see §7).
4. **[OPEN] Which chassis get a secondary slot** — all, or some? Slot-cost model?
5. **[OPEN] Hold throughput flat within a chassis?** (Lean: yes — keep the choice about type/role.)
6. **[OPEN] Matrix magnitudes** — keep ±25/40%, or sharpen so off-type reliably overturns a small
   rank gap? (Measure before changing.)
7. **[OPEN] Defense-choice pass (D5)** — in scope for this spec, or a follow-on?

## 7. Slice order **[DRAFT]**
Each slice ends with `balancer verify --field all` + `scripts/field-metrics.js`.

1. **Secondary-weapon plumbing** — the one-at-a-time firing mechanism + selection dial (D2).
2. **First real test: the air⇄AA pair** — ground flak secondary **and** air's answer
   (SEAD/evasion), shipped together, heli ground damage held *up*. Measure whether accessible-
   but-answerable AA **bends** the air matchups instead of flattening them. *(Do NOT ship AA
   alone — that measures a one-sided nerf.)*
3. **Widen the menu** — primary damage-type weapons (D1) + remaining secondaries (pierce, spotter).
4. **Support modes** (D4) — especially shield projector, to wake the triangle.
5. **Defense-choice pass** (D5) if needed.

## 8. Measurement instrument (unchanged)
`cargo run -p balancer --release -- verify --field all --seed 1 --samples 250`
→ `node scripts/field-metrics.js <report.json>` → walls / contested / near-ties / monotone / spread.
Re-baseline before slice 1. **Revise `spec.md` success criteria** to the §2 signals (drop the
near-ties target) before building.

---

## 9. Rebalance punch list — the full surface area

Six systems to re-examine. Enumerated from the current code so we know the real scope. Each is a
lever that can *create counters* (or is dead weight we should cut). Status: **[DECIDED]** structure
agreed · **[OPEN]** needs design/audit.

### 9.1 Primary weapons **[structure DECIDED · numbers OPEN]**
- **Now:** type welded to chassis — 18 stock loadouts, but only Kinetic (ground) + Explosive
  (air/arty); Energy = 2 guns (Siege/Pulse Laser). Throughput flat ~5–8/t; raw damage inert.
- **Rebalance:** 6 combat chassis × 3 damage types = **~18 primary weapons** to spec, throughput
  held flat, native +12% kept as the off-type tradeoff, Mech = no-native flex.
- **Decisions:** per-shot numbers · matrix magnitude (keep ±25/40% or sharpen).

### 9.2 Secondary weapons **[NEW — design OPEN]**
- **Now:** doesn't exist. Nearest analogs are utilities: Rocket Pack (front AA), Sensor Suite
  (TargetAir), SAM (dedicated AA).
- **Rebalance:** design the **one-at-a-time secondary slot** + its menu — Flak (AA), Pierce
  (anti-shield), Spotter (reach), and the **air answers** SEAD / Evasion / Ground-attack.
- **Decisions:** selection rule + priority dial · which chassis get the slot · v1 menu scope · air's
  answer ships in the *same* slice as ground AA (never AA alone). **Tightly coupled to 9.5.**

### 9.3 All equipment (utilities) **[audit OPEN]**
- **Now (8):** Autoloader (cadence +1) · Fire Control (+acc) · Drive Servos (+move) · ECM Suite
  (+evasion) · Combat AI (unlocks 2nd Plan-B slot / Adaptive energy / Opportunist) · Sensor Suite
  (unlocks TargetAir) · Rangefinder (unlocks ExtendReach) · Rocket Pack (unlocks front AA).
- **Rebalance:** which of these *migrate into the secondary-weapon slot* (Rocket Pack, arguably
  Sensor Suite) vs stay utilities? Are the flat stat bumps counters or just power? Cut the inert.
- **Decisions:** utility-vs-secondary split · which bumps survive.
- **Recon (Commander equipment) [DECIDED: in-battle only]:** without recon, enemies show plain
  **friend/foe** colors in the battle view; **with** recon they're color-coded by **armor type during
  the battle** — *not* on the arena/build screen (pre-build reveal would let a player **swap squads**
  to hard-counter before committing, killing the committed-read that makes the counter-pick
  strategic). So recon is a **scouting/learning** tool
  (study replays, learn an opponent's armor tendencies → informs *future* builds), which keeps the
  live counter-pick a genuine read. **Combat tie-in [DECIDED]:** equipping recon also grants an
  **army-wide +5% damage on hits where your type is advantaged vs the target's defense** (energy→armor,
  kinetic→shield — the matrix-strong matchups) — a "found the weak points, hit them harder" bonus that
  *amplifies correct counter-picks* (stacks on the ×1.6, pairs with the `Target Armor` filter) and
  justifies the slot. Must be an **army-wide aura** (Commander has no guns). **Explosive gets no recon
  bonus** (matrix-neutral). Future counter = intel-denial (stealth/jammer).
- **New idea — variable slot cost:** equipment consumes *different numbers of slots* (1, 2, …), so
  powerful pieces (recon, hedge defenses, AA, strong secondaries) carry a real **opportunity cost** —
  forcing specialization (can't stack every counter). Reinforces "no single build wins." **Likely
  subsumes P5** (which chassis get a secondary): any chassis *can*, but a secondary costs slots — a
  universal cost, not a chassis gate. **Open:** slot budget per chassis · which equipment costs what ·
  does variable cost cover weapons/defense too, or just utilities? Design alongside secondary weapons.

### 9.4 All stances / dials **[audit OPEN]**
- **Now — Stance (8):** Neutral (shared) · Combat: Aggressive, Defensive, Protector, Opportunist ·
  Support: Triage, Sustain, Empower.
- **Adjacent dials:** Energy (Offense/Balanced/Defense/Overdrive/Fortify/Adaptive) · Movement
  (Hold/Advance/FallBack/Kite/Reposition/Escort) · TargetRow (4) · TargetRule (8, incl. TargetAir/
  TargetSupport/SmartCounter).
- **Rebalance:** do stances create real tradeoffs or are they inert like damage tuning? How do
  Defensive/Protector interact with the new shield/mitigation support modes (9 = armor)?
- **Decisions:** which stances matter · gating · interaction with support modes.

### 9.5 All secondary orders (Plan-B triggers) **[audit OPEN — the async counter engine]**
- **Now:** `when [condition] → set [dial] to [value]`, latches once. **6 conditions:** HullBelowPct
  · ShieldDown · AfterTick · AllyLostInZone · **AirEnemyExists** · EnemyInZone. Slots: 1 (+1 w/ Combat AI).
- **Why it's central:** this *is* the "planning beats gear" mechanism, and `AirEnemyExists → fire
  secondary flak` is literally how the secondary-weapon doctrine (9.2) gets expressed. The secondary
  weapon and Plan-B are the same idea from two directions — unify them.
- **Decisions:** expand the trigger menu? more slots? how the secondary-weapon switch is authored
  (a dedicated dial, or a Plan-B trigger).

### 9.6 All armor (defense families) **[audit OPEN — the D5 dependency]**
- **Now — per-mount families (4–5):** Balanced (default, +5% armor +150 shield) · Armor Plating
  (+20% armor, −1 move) · Shield Array (450 cap) · Ablative Plating (600 one-time) · Mech-only
  Reactive. **Heavy specials:** Composite (+12%) · Deflector (250 shield) · Blast (+8%, −40%
  explosive splash). **Light special:** Fast-Cycle Shield.
- **Rebalance:** defense must become a *real choice*, or the damage triangle (9.1) stays dormant —
  today everyone runs armor, nobody runs shields, so kinetic's ×1.4 never fires. Shield projector
  (support mode, 9.4-adjacent) helps put shields on the field.
- **Decisions:** family tradeoffs + `mount_scale` tuning so armor/shield/ablative each win somewhere.

### 9.7 Targeting **[audit OPEN — the hub, added mid-discussion]**
- **Now:** deterministic — `TargetRow` (FrontReachable/Last/Fullest/Weakest) + `TargetRule`
  (FocusFire/Disperse/Nearest/Weakest/BiggestThreat/TargetSupport/TargetAir/SmartCounter). Units
  pick a row then a rule; no probabilistic "draw."
- **Why it's the hub:** the secondary-weapon switch (9.2), the Plan-B air trigger (9.5), **ECM**
  (10, "harder to target"), and the target dials (9.4) all resolve *through* targeting. ECM in
  particular can't exist until targeting reads a "don't pick me" signal.
- **Decisions (deferred to a dedicated targeting discussion):** does targeting become
  priority/threat-weighted? how does ECM lower target-draw? how do secondary weapons pick their
  target class? **ECM (10.3 #2) is blocked on this.**

### Dependency map (build order isn't the list order)
```
9.6 armor (defense a real choice) ──► makes 9.1 primary type-counters bite
9.2 secondary  ◄── unify ──►  9.5 Plan-B (the switch is a trigger)
9.4 support modes (shield projector) ──► puts shields on field ──► wakes 9.1 + 9.6
9.3 equipment: prune inert, migrate AA/reach into 9.2
```
So the natural first move is **9.2 + 9.5 together** (secondary weapon = a Plan-B-triggered switch),
tested on the air⇄AA pair — then **9.6 + 9.1** (defense choice + damage types) as the triangle pass,
with **9.4** (support/shields) waking both.

---

## 10. Chassis defense identities (item 9.6, detailed) **[DECIDED in principle]**

Three defense options per chassis, each a distinct *character*, not a generic family. Two axes:
**matrix** (armor/shield → countered by damage type) and **avoidance** (camo/ECM/chaff → countered
by accuracy/volume/splash). Only the front-line (Heavy, Mech) get *heavy* mitigation; backline / air
/ support survive by **not being hit**.

| Chassis | Option 1 | Option 2 | Option 3 |
|---|---|---|---|
| **Heavy Tank** | Heaviest armor | Moderate armor + moderate shield | Light armor + heavy shield |
| **Light Tank** | Light armor + light shield | Light armor + **camo** (↑evasion) | Medium armor − mobility |
| **Mech** | Light armor + heavy shield | Medium armor + light shield | Heavy armor |
| **AA / Artillery** | Light armor + **camo net** (↑evasion) | Light armor + **ECM** (harder to target) | Light armor + medium shield |
| **Attack Heli** | Light armor + **chaff** (↑evasion *vs AA*) | Light armor + small shield | Light armor + **ECM** |
| **Commander** (Support) | Light armor + **ECM** | Light armor + small shield | Medium armor |

### 10.1 Engine mapping — three new mechanics
| Mechanic | Means | Engine status |
|---|---|---|
| Armor / Shield / (Ablative) | matrix mitigation | **exists** (defense families, `mount_scale`) |
| **Camo** | flat evasion bump | evasion stat exists; **new as a defense module** (easy) |
| **Chaff** | evasion **only vs AA/flak** | **new** — conditional evasion hooked into `air_mods` (flak path). *This is air's built-in answer to the secondary-AA — ships in the same slice.* |
| **ECM** | **harder to target** (enemies pick someone else) | **new & deepest** — needs targeting to weight by threat/draw. Today targeting is deterministic (FrontReachable/FocusFire), so "less likely to be targeted" needs a priority hook. Distinct from evasion: ECM = *not picked*, evasion = *picked but missed*. |

### 10.2 Each defense sits in the web (every option has a counter)
- **Shield-heavy** (Heavy 3, Mech 1) → kinetic ×1.4 + Railgun pierce; but **energy-proof** (×0.6).
- **Armor-heavy** (Heavy 1, Mech 3) → energy ×1.25 + pierce; but **kinetic-resistant** (×0.85).
- **Camo/evasion** → high-accuracy (Fire Control), fast cadence (volume saturates a dodge), splash
  (can't dodge AoE).
- **ECM** → AoE/splash, disperse-fire, or targeting that ignores threat; also just more attackers.
- **Chaff** → *dedicated* high-accuracy AA (SAM) still connects; only *casual* secondary flak whiffs.

### 10.3 Open questions
1. **[DECIDED] Ablative retired from the core** armor set — the only "hedge" (anti-counter-pick)
   defense is Mech Reactive, keeping type-countering meaningful for the other five chassis.
2. **[PARKED → targeting] ECM targeting model** — the one mechanic with real engine cost. How
   universal is it (only vs threat-based targeting, or a global target-draw reduction that all rules
   weight)? **Deferred to the dedicated targeting discussion (9.7); do not decide until then.**
3. **[DECIDED] Mech Reactive kept** as Mech's exclusive 4th — the flex chassis's anti-counter-pick
   hedge (adapts mitigation toward whatever's hitting hardest).
4. **[DECIDED] AA & Artillery** each get the same three (shared fragile-backline identity).

---

## 11. Pending decisions registry

This is a **ground-up system rewrite** (v3), not incremental tuning — driven by the lessons from
the v2 pass and the diagnosis (raw-number tuning is inert; the field needs *structural* counters).
Tracking every open decision here so nothing is lost across the many interdependent surfaces.

| # | Decision | Lean | Status / blocker |
|---|---|---|---|
| P1 | Native +12% bonus | Keep | **DECIDED** |
| P2 | Matrix magnitude | **sharpen** → start ×1.6 same-layer / ×0.7 cross-layer, explosive ×1.0 | **DECIDED (start value; measure)** |
| P3 | Secondary weapons | **ABANDONED** — one weapon per unit; all situational kit → equipment (§13) | **DECIDED** |
| P4 | AA / control delivery | AA = capability-unlock equip (targeting aims it); control = on-hit riders / auras | **DECIDED (dir)** |
| P5 | Slot economy | variable slots per chassis + variable cost per equipment (point-buy) | **DECIDED (dir); numbers open** |
| P6 | Throughput within a chassis | **not flat** — fast slight DPS lead, slow more alpha (D6/P20) | **DECIDED (supersedes "flat")** |
| P7 | Ablative | **retire from core** — hedge limited to Mech Reactive | **DECIDED** |
| P8 | ECM mechanic | −2 target-rank offset; Decoy = +1 (§12.4) | **DECIDED (dir); magnitude tunable** |
| P9 | Mech Reactive Plating | **keep as Mech's 4th** — flex/anti-counter hedge | **DECIDED** |
| P10 | AA vs Artillery defenses | each gets the 3 | **DECIDED** |
| P11 | Support: add `AuraKind::DamageTaken` | Add | decided (D4) |
| P12 | Targeting model | 2 filters + fallback selector, priority-score (§12) | **structure DECIDED** |
| P13 | Does this re-scope spec 014, or become a new spec (v3)? | — | meta — revisit once design settles |
| P14 | "Target Armor" definition | by `armor_pct` | **DECIDED (§12.6 Q1)** |
| P15 | "Ally's-target" (Follow) resolution (Q2) | no-chain, resolve independents first, same-tick | **DECIDED (§12.6 Q2)** |
| P16 | Concentration | dropped — Follow = focus; default = overkill-avoid disperse | **DECIDED (§12.5)** |
| P17 | Smart selectors | **none** — retire BiggestThreat/SmartCounter/Most-Least-HP/Threat | **DECIDED (§12.7)** |
| P18 | Fallback selector pool | positional only: Closest / Furthest | **DECIDED (§12.7)** |
| P19 | Cadence delivery | firing-profile (#1) welded to **type**: Energy Fast / Kinetic Med / Explosive Slow / Arty Siege | **DECIDED (D6)** |
| P20 | Cadence tradeoff + chassis mod | fast +slight DPS/low alpha, slow −DPS/high alpha; **Heavy+Mech +1 tick & +10% dmg** all types | **DECIDED (D6)** |
| P21 | Movement value | does positioning change outcomes? mobility kit (§14.2) + MovementMode dials depend on it | **PARKED → behaviors surface**; measure |
| P22 | Spotter Network — innate vs slot | **innate** (free zone-accuracy aura, Light's namesake) | **DECIDED** |

**Surfaces DONE:** targeting · primary weapons (incl. cadence) · armor.
**Open:** secondary-weapon menu (P4/P5) · stances · equipment prune · support-mode numbers ·
matrix+cadence measurement.

---

## 12. Targeting — the priority-chain model (item 9.7) **[DECIDED in principle]**

Replaces the two-dial `TargetRow` + `TargetRule` system with a **3-slot priority chain + Closest
fallback**. Each slot holds one target rule; resolve top-down.

### 12.1 Structure — two filters + a fallback selector
The menu splits into two pools, and the **structure enforces a valid chain by construction**:
- **Filter pool** (class filters — *can fail* when none exist): Target Air, Target Armor, Target
  Support, Target Indirect, Ally's-target.
- **Selector pool** (positional, always resolves): **Closest, Furthest** — *no enemy-state "smart"
  selectors* (Most/Least HP, Most Threat retired; see 12.7).

Three slots, typed:
- **Priority 1** — a *filter*: what do I hunt first? (skipped if none present)
- **Priority 2** — a *filter*: what do I hunt if the first isn't there? (skipped if none present)
- **Fallback** — a *selector*: how do I pick among whatever's left? (defaults to **Closest**)

> **Rule:** pool = reachable enemies → apply Priority-1 filter if non-empty → apply Priority-2 filter
> if non-empty → **the Fallback selector picks one** from the survivors. (Reach gates the pool first.)

**Two wins over three equal slots:**
1. **Valid by construction** — the fallback is always a resolving selector, so a chain can never find
   nothing. UI teaches itself: two "hunt this" pickers + one "otherwise pick by" picker.
2. **The fallback selector applies *inside* whichever filter caught** — so `Target Indirect →
   (Furthest)` = "the *deepest* enemy artillery." One knob governs both the filtered and the
   no-filter case.

Cost: you can't stack *three* class filters (`Air → Support → Indirect`). Two filters + a smart
tiebreak covers every real doctrine (AA platform, counter-battery, assassin, anti-screen), so this
is accepted.

**Optional depth (broad ↔ specific):** fill only as deep as you care to. Leaving both filters unset
and Fallback = Closest is a complete, valid doctrine (≈ today's behavior). Because the game has no
in-battle input, **the chain *is* the skill surface**: a broad-only army is more predictable and
thus more exploitable, so tuning priorities well is where "planning beats gear" is rewarded.

### 12.2 The nine options
| Option | Kind | Engine | Note |
|---|---|---|---|
| Target Air | filter | exists — **needs air-reach** | inert unless unit has AA/flak |
| Target Armor | filter | by `armor_pct` (Q1) | pairs with energy weapons |
| Target Support | filter | exists | kill the healer |
| Target Indirect | filter | new (type / `can_fire_from_rear`) | counter-battery |
| Follow (ally-in-zone's target) | dynamic filter | new — resolved (Q2) | focus-fire |
| Closest | selector (positional) | `Nearest` exists | the default fallback |
| Furthest | selector (positional) | new | reach the backline |

*Retired (12.7): Most HP · Least HP · Most Threat · BiggestThreat · SmartCounter — no auto-optimizing
targeting.*

### 12.3 Payoff — targeting unifies three surfaces
1. **Priority chain picks the *target*; the unit fires whichever weapon can engage it** (flak→air,
   cannon→ground). So the **secondary-weapon selection rule (P3) disappears** — you fire flak exactly
   when the chain hands you an air target.
2. **Graded AA commitment falls out for free:** Target Air *primary* = dedicated AA; Target Air
   *tertiary* = casual AA. Same chassis, different doctrine, no new machinery.
3. **Plan-B makes it reactive:** `AirEnemyExists → set slot-1 = Target Air`. Targeting + secondary
   weapons + Plan-B are **one system**.

### 12.4 ECM + Decoy — target-priority offsets (unparks P8)
Targeting becomes **priority-score-based** (the load-bearing engine change): rank candidates by a
score, offsets adjust it. Two matched modules:
- **ECM = −2 rank** (self): drops you ~2 places in an attacker's target queue (#1 → ~#3).
- **Decoy / Taunt = +1 rank** (self): pulls fire *toward* you. Home = durable front-line chassis
  (Heavy/Mech); pairs with heavy armor/shield + Protector stance + shield-projector support.

*(Magnitudes −2 / +1 are the starting point, tunable.)*

**Emergent screening (why this is good, not just a stat):** rank offsets only matter when there are
*other* targets to swap with. A lone ECM unit is still the only thing to shoot → ECM protects the
backline **only behind a screen**, useless when exposed. The "hide fragile units behind a front
line" behavior falls out for free.

**Built-in counter:** a **class filter bypasses the offset** — `Target Indirect` (counter-battery)
or `Target Support` narrows the pool to *just* that class first, so the ECM'd unit tops a one-item
list and gets hit regardless of −2. ECM hides you from *lazy* targeting, not a *dedicated hunter*.
This gives the class-filter target rules (12.2) their job: **anti-concealment.**

### 12.5 Fate of the old dials
- `TargetRow` + `TargetRule` (2 dials) → replaced by the 3 priority slots. Plan-B `DialKey` updates
  to "priority slot N."
- **FocusFire / DisperseFire (concentration) [DECIDED — dropped as a dial]:** focus = opt in per-unit
  via **Follow ally's target** (more granular than a squad toggle); **disperse is the default** — a
  non-Follow unit takes its own chain's pick with **soft overkill-avoidance** (skip a target already
  assigned lethal damage this tick, take next-best). Spreading is the baseline, concentration the
  deliberate act.
- **BiggestThreat / SmartCounter [DECIDED — retired]** along with Most/Least HP and Most Threat: no
  auto-optimizing selectors at all (12.7). "Kill their DPS" = hunt the *class* that carries it.

### 12.6 Open questions
- **Q1 — "Target Armor" [DECIDED]:** by `armor_pct` (prefer high-armor targets — the energy-weapon
  partner). A declarative filter, not an auto-optimizer, so it fits 12.7.
- **Q2 — "Ally's-target" (Follow) resolution [DECIDED]:** a Follow unit anchors only to a zone ally
  who chose their target **independently** (not itself following this pick). **Follows never chain →
  no circularity.** Resolve independent units first, then followers read their picks **same-tick, no
  lag.** If the would-be anchor is also following, try another independent zone ally; if none exists,
  the Follow tier **fails → fall through** to Priority 2 → Fallback. Tiebreak among multiple anchors
  = deterministic by slot index. Emergent: a zone of Followers self-organizes into focus fire on the
  lead independent unit's target.
- **Q3 — concentration dial [DECIDED]:** dropped — Follow = focus, default = overkill-avoiding
  disperse (see 12.5). Default stacking rule = soft overkill-avoidance (pending final confirm).
- **Q4 — smart selectors [DECIDED — none]:** retire BiggestThreat, SmartCounter, Most/Least HP,
  Most Threat. See 12.7.
- **Q5 — Target Air requires air-reach** (secondary flak / air-capable), else inert for that unit —
  confirmed intended gating.

### 12.7 Design stance — no auto-optimizing targeting **[DECIDED]**
Targeting expresses **player intent (declarative), never game optimization.** Filters say *what to
hunt* (class/role); the positional fallback says *from which end to sweep*. The game never scans
enemy state to pick the "optimal" target for you (no finish-the-wounded, no snipe-the-threat).
Rationale: **configuring the team well *is* the strategy — no hand-holding.** Consequence: the two
behaviors auto-selectors used to give move to deliberate acts —
- *Finish the wounded* → **Follow** (concentrate fire); default is overkill-avoiding disperse.
- *Kill their DPS* → hunt the **class** that carries the threat (Target Indirect / Target Air).

### 12.8 Numeric priority-score model **[DECIDED — concretizes 12.1 / 12.4]**
The **priority list** (the 1–5 category ranking) is set at match start; the **scoring against live
enemies is dynamic — recomputed each fire opportunity.** A unit fires at the highest-scoring *valid*
target, ties → positional fallback (Closest/Furthest). So when a category empties (all air dead) its
targets just leave the pool and the next-highest wins — **no explicit "reset" needed** — and a
higher-priority target that appears (fresh air, a Decoy in range) is picked up on the next shot.
*(Re-score per fire opportunity, not sticky-until-invalid — responsive; overkill-avoidance handles
any switching waste.)*

`score(target) = base(1–5) + target-equipment offset`
- **Base 1–5** from the shooter's **ranked priority list** (top category = 5 … 5th = 1; unranked = 0).
  Declarative (fits 12.7); *supersedes the strict 2-filter chain* with up to 5 ranked tiers.
- **Target-equipment offsets, symmetric ±2:** **Provocation / Decoy +2** (bigger target to *all*
  enemies), **ECM −2** (smaller to all). Applied to the target's own score.

**Emergent anti-concealment (pure arithmetic):** a dedicated hunter ranking your class 5 still sees
5−2 = **3** through ECM (shot); incidental fire ranking you 2 sees 2−2 = **0** (ignored). And Decoy
pulls +2 but base-2+2 = 4 < base-5, so provocation is **strong, not absolute**. The ±2 range being
smaller than the 1–5 spread is what keeps declared priorities dominant.

**Concealment = two distinct tools [DECIDED]:**
- **ECM** → **−2 targeting score** (they shoot someone else). Countered by a *dedicated hunter*.
- **Camo net** → **+evasion** (they shoot but *miss*). Countered by *accuracy / splash*.
Distinct axes, distinct counters — consistent with the §10 defense identities.

---

## 13. Equipment model — one weapon + equipment slots **[DECIDED in principle]**

Secondary weapons are **abandoned** (P3). A unit = **one primary weapon** + **equipment** that
competes for **slots** (variable count per chassis, variable cost per item — P5). Equipment adjusts
values across **three target domains**:

### 13.1 Self — buff your own unit
| Axis | Notes |
|---|---|
| Damage | raw magnitude |
| Reach | ground depth (front/any/deep) **+ air-capability** (the AA unlock; targeting aims it) |
| Accuracy | vs evasion |
| Evasion / Concealment | camo; **chaff** = evasion vs AA only |
| Mitigation | armor / shield / ablative / reactive (§10 defense families) |
| **Mobility / speed** | kite, reposition, reach, escape |
| **Splash / AoE** | anti-cluster; partly beats evasion; defensive side = splash *taken* (Blast Plating) |
| **Penetration** | bypass armor% / pierce shields — beats mitigation instead of out-damaging it |
| Target-draw | **ECM (−rank)** / **Taunt·Decoy (+rank)** — steer enemy targeting (§12.4) |
| *(minor)* Crit | chance / mult; may fold into Damage |

### 13.2 Enemy — debuff them via **on-hit riders** ✔ liked
Ride your **primary's hits** (no separate weapon, no separate targeting — the targeting chain aims
them). Resolves the "when/what target" problem that killed secondary weapons.
| Rider | Effect | Counters |
|---|---|---|
| **EMP / Shield-strip** | drop enemy shields for N ticks | shield-heavy (strip the layer, hull exposed) |
| **Suppress** | −enemy damage/accuracy for N ticks | alpha / burst dealers |
| **Snare** | −enemy move | mobility / kiters / backline-divers |
| **Paint** | marked enemy takes +X% from *all* your units | tanky anchors (focus-fire multiplier) |

### 13.3 Ally — auras (the Commander's domain)
| Aura | Notes |
|---|---|
| Heal / Shield-projection / Damage-boost / Damage-reduction | the four support modes (§D4) |
| **Recon** | armor-type vis in battle + army-wide +5% on matrix-advantaged hits (§9.3) |
| Command boost | C2 buff |

### 13.4 Not equipment
- **Damage TYPE** = the primary weapon choice (not an equipment mod).
- **Cadence / fire-rate** = determined by type + Heavy/Mech modifier (D6). **Autoloader retired**
  (fire-rate is no longer an equipment lever) — *confirm, or keep as a slot-costly exception.*

### 13.5 Slot layout **[DECIDED in principle]**
- **Weapon slot** (dedicated): 1 primary (type).
- **Defense slot** (dedicated): 1 of the chassis's 3 identities (§10) — armor/shield/**camo/ECM/chaff**
  live here, already chassis-gated.
- **Utility slots** (variable pool, per-chassis budget, per-item cost): the common/specific split (13.6).

**Budgets [DECIDED]:** Mech **4** · Commander 4 · Heavy 3 · Light 3 · Heli/RktArty/Artillery 2.
**Cost tiers:** **1** = stat · **2** = capability/counter-defining · **3** = build-defining ability (Jump Jets).

### 13.6 Common vs specific utilities **[DRAFT]**
Organizing principle: **common = soft/accessible counters · specific = the hard, dedicated
specialist.** (Exemplar: common **AA-unlock** = soft front-only air; Rocket Arty's exclusive **SAM**
= hard whole-field air. Same threat, two tiers, gated by chassis.)

**Common pool — a universal attribute point-buy [DECIDED]:** one **+single-stat** booster per stat,
**1 slot each**. One per stat, each stat covered:
`+Damage · +Reach · +Accuracy · +Evasion · +Speed · +Splash · +Penetration · +Armor · (+Crit)`.
*Capabilities/riders are NOT common* (they're not single-stat): **AA-unlock, on-hit riders (Suppress
etc.), big Pierce → class equipment.** Consequence: keeping **air accessible** means AA-unlock must
appear on **several** classes' specific lists (park for the class pass).

**Specific / signature (exclusive, the role identity):**
| Chassis | Signature |
|---|---|
| Heavy Tank | **Decoy** — draw fire (anchor) |
| Light Tank | **Spotter / Paint** — mark targets for the army (scout) |
| Mech | **Combat AI** — extra Plan-B / adaptivity (flex) *(Reactive = its defense-slot exclusive)* |
| Attack Heli | **SEAD** — anti-AA on-hit rider *(chaff = its defense-slot)* |
| Rocket Arty | **SAM** — hard, whole-field AA |
| Artillery | **Saturation** — max splash (anti-stack) |
| Commander | **Recon + Heal / Shield / Boost / Reduction + Command** |

---

## 14. Class-specific equipment **[DRAFT — in progress]**

### 14.1 Heavy Tank — durable front-line anchor / protector **[LOCKED — 10 items · 3 utility slots]**
Theme: soak fire, protect the line, outlast.
| Equipment | Effect | Slots |
|---|---|--:|
| **Lure** | +2 targeting priority (Decoy) — draw fire | 2 |
| **Low-Heat Exhaust** | +25% evasion **vs air** (dodge AA/missiles) | 2 |
| **Rangefinder** | target +1 row (extended reach) | 1 |
| **Extra Batteries** | +25% shield output | 2 |
| **Improved Tread** | +2 move **+ negates armor move-penalty** (distinct from common +Speed) | 1 |
| **Smoke Canisters** | +25% evasion **to tank + zone allies** (zone effect, distinct from common) | 2 |
| **Guardian Protocol** | redirect a share of a zone ally's incoming damage to this tank | 2 |
| **Siege Mode** | go immobile → large mitigation / +accuracy | 1 |
| **Spall Liner** | −40% splash damage taken (anti-artillery) | 2 |
| **Field Repair** | slow self-hull regen (outlast attrition) | 2 |

### 14.2 Light Tank — fast fragile scout / harasser / designator **[LOCKED — 10 equipment + 1 innate · 3 utility slots]**
Theme: designate, flank, skirmish; survive by speed not armor. The **anti-screen** chassis.
| Equipment | Effect | Slots |
|---|---|--:|
| **Target Painter** *(signature)* | marked enemy takes +X% damage from **all** your units | 2 |
| **Target Radar** | paints a backline target → **any** unit from anywhere can hit it (army-wide reach) | 2 |
| **Scout Optics** | +accuracy (land hits on evasive targets) | 1 |
| **Nitrus** | burst of mobility / reposition dash | 1 |
| **Hit-and-Run Protocol** | after firing, +evasion / free reposition | 2 |
| **Flanking Package** | target the enemy backline / +dmg vs rear (the Light's own reach) | 2 |
| **Ambush** | +damage on the first hit vs a full-HP target | 2 |
| **Snare Shot** | on-hit: pin the target's movement (lock a kiter / fleeing backline-diver) | 2 |
| **Jammer** | enemies in the Light's zone suffer −accuracy (EW screen for it + zone allies) | 2 |
| **Decoy Drone** | deploy a disposable fake target that draws enemy fire | 1 |
| **Spotter Network** *(innate)* | friendly units **in the Light's zone** get +10% accuracy (scouting aura) | — |

**Spotter Network is innate [DECIDED]:** free, always-on zone-accuracy aura, no slot — the Light's
namesake force-multiplier and the reason to field the fragile scout. Movement-independent (P21-proof).
**Dual-role placement (aura is zone-based):** a **front** Light scouts/designates; a **rear** Light is
an **accuracy battery** for artillery + AA (both accuracy-starved — artillery fires low-accuracy siege,
AA must hit evasive air). Placement is a real choice; a rear scout is fragile and vulnerable to enemy
backline pressure (flankers / Target Radar) — counterplay intact.

Combo: **Target Radar + Flanking** = the anti-turtle key (flank in, tag the backline, whole army
reaches it). **Painter + Radar** = tag it *and* everyone hits it harder.
**⚠ Movement-value risk (P21):** Nitrus, Hit-and-Run, Snare, Flanking, common +Speed, Improved Tread,
and the MovementMode dials all assume positioning changes outcomes. If the balancer shows mobility is
inert, fork: make movement meaningful (kite/advance/retreat engine pass) or de-emphasize mobility kit.

### 14.3 Mech — the flex bruiser / adaptability **[LOCKED — 10 items · 4 utility slots]**
Theme: no native type = the flex-picker; **equip toward your army's *gap*.** The answers-anything chassis.
| Equipment | Effect | Slots |
|---|---|--:|
| **Combat AI** *(signature)* | extra Plan-B slot + adaptivity | 2 |
| **Jump Jets** | enter **Air** for 10 ticks → **full** air-to-air damage + whole-battlefield reach; airborne = an AA target (×1.5); then **10-tick ground cooldown** (50% duty cycle). **P21-proof** | **3** |
| **Adaptive Munitions** | Plan-B trigger switches the Mech's **damage type** mid-battle (e.g. EnemyShielded → Kinetic) — the flex-picker made literal | 2 |
| **EMP Ammo** | on-hit rider: stops the target's **healing & shield regen** for 5 ticks (anti-sustain — the answer to healers) | 2 |
| **Suppressing Fire** | on-hit rider: −enemy damage/accuracy | 1 |
| **Repair Nanites** | self-hull regen (durable flex) | 2 |
| **Overdrive** | burst window: +damage, −defense | 2 |
| **Bulwark Mode** | brace: +mitigation while stationary (a lighter Siege Mode) | 1 |
| **Duelist Servos** | ramping +damage the longer it fires at one target | 1 |
| **Modular Hardpoint** | +1 utility slot — literal extra flexibility | 1 |

Air gradient: **SAM** (Rocket Arty ×1.5, whole-field, hard) > **Jump-Jet Mech** (×1.0 full, risky/flexible)
> **soft front-AA** (plink). Jump Jets = air answer **+** self-serve backline striker; balanced by
airborne-exposure + a recharge cooldown.

Note: **Lure = the Heavy's Decoy signature; Guardian + Lure + shield = the true anchor** (Lure pulls
targeting, Guardian eats leak-through). Overlaps with the common pool (Improved Tread, Smoke) are
kept only because the Heavy versions add something common can't (penalty-negation, zone scope).
