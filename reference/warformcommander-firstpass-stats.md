# Warform Commander — First-Pass Stat Block (v0, for review)

> **Status: PLACEHOLDER for review.** Starting numbers, hand-authored to (a) make the
> sim engine runnable, (b) give the counter-web tests something to assert against, and
> (c) seed the Monte-Carlo auto-balancer (P4 / GDD §14). **Not** final balance — the
> balancer tunes the values; humans lock the *shape*. Companion to
> `warformcommandergamedesigndoc.md` (schema §9.1, matrix §6, variants §5.1, gear §7).
>
> **Locked tick budget:** 10 ticks/sec · **hard cap 1000 ticks (100 s)** · **target
> average battle 30–45 s (300–450 ticks)**, resolved by Conquest well before the cap.
> See §5 for the worked time-to-kill proofs.

---

## 1. Global constants & the damage model

| Constant | Value | Note |
|---|---|---|
| Tick rate | **10 ticks / sec** | Locked. |
| Time-limit cap | **1000 ticks** (100 s) | Hard ceiling; Conquest normally ends it far sooner. |
| Target avg battle | **300–450 ticks** (30–45 s) | What the numbers below are calibrated toward. |
| Damage variance | ±5% | Texture only; omitted from TTK math. |
| Crit | 5% chance, ×1.5 | Texture; omitted from TTK math. |
| Native-family bonus | **+12%** damage | Weapon family == unit native family. Mech = generalist, no bonus. |
| Hit chance | `clamp(Accuracy − Evasion, 0.05, 0.95)` | Plus air modifiers below. |
| Min-damage floor | 10% of the hit | A hit always lands ≥10% → no stalls. |
| Splash cap | **≤25%** of the hit | To *other* enemy units in the target's row; primary takes full. |

**Fire cadence — four tiers** (ticks between shots). With fixed tiers, *within-type*
offense variation comes from **per-shot damage**, not fire rate.

| Tier | Cooldown | Shots/sec | Typical users |
|---|---|---|---|
| **Fast** | 1 t | 10 | Light Tank autocannons |
| **Medium** | 3 t | 3.3 | Mech, Attack Heli |
| **Slow** | 5 t | 2 | Heavy Tank, Rocket Artillery |
| **Siege** | 10 t | 1 | Artillery (the big lob) |

**Type × defense-layer multipliers** (the §6 matrix, as numbers):

| Damage type | vs **Shields** | vs **Armor/Hull** |
|---|---|---|
| **Kinetic** | **×1.4** (shreds shields) | **×0.85** (folds to armor) |
| **Energy** | **×0.6** (bounces off shields) | **×1.25** (melts armor) |
| **Explosive** | ×1.0 | ×1.0 (+ splash) |

**Air modifiers:** AA (Rocket Arty) vs air → **Acc +0.10, Dmg ×1.5**; direct-fire
"plink" vs air → **Acc −0.25, Dmg ×0.5**; indirect Artillery → **cannot target air**.

**Per-hit pipeline** (attacker A → target T), matching GDD §9.2:

```
D0        = Weapon.Dmg × (A.native == Weapon.family ? 1.12 : 1.00)  [× air dmg mod]
hit       = clamp(A.Accuracy − T.Evasion [+ air acc mod], 0.05, 0.95)
# Shields first (if up):
shieldDmg = D0 × shieldMult(type)
  if shieldDmg ≤ shieldPool:  shieldPool −= shieldDmg;  hullIn = 0
  else:                       hullIn = (shieldDmg − shieldPool) / shieldMult(type);  shieldPool = 0
# Hull (ArmorPct = percentage reduction; scales with hit size so Fast weapons aren't zeroed):
hullDmg   = max( hullIn × armorMult(type) × (1 − ArmorPct),  hullIn × 0.10 )
# Splash: a reduced hit (× Splash) repeats on other units in T's zone.
```

Shields recharge **`ShldDelay` ticks after last hit**, at **`ShldRegen`/tick**. Armor
and Shields coexist (§9.1). **Movement = discrete zone-to-zone only** (no x/y); a
unit's replay "position" is *which zone it's in*. `Move` below = zone-transition
capability (0 = immobile; — = N/A). **Helicopters are air-locked → no Move.**

**Targeting & reach — by the firing unit's row.** A unit's eligible targets depend on
*which row it occupies*; the Target Priority dial then picks among them. Rows fire at
the enemy's mirrored rows.

- **Front row** → the enemy's **nearest occupied ground row** (Front → Middle → Rear,
  collapsing forward as each clears). One row deep.
- **Middle row** → enemy **Front + Middle** (two rows); reaches enemy **Rear only after
  both are cleared**.
- **Rear row** → **cannot fire** unless the unit is **Artillery or Rocket Artillery**,
  which reach **anything**.
- **Air** → always targetable by any air-capable weapon (AA full · direct-fire plink at
  −0.25 acc / ×0.5 dmg · indirect Artillery never), **independent** of the ground-row collapse.

*Overrides:* Artillery (`any-ground`) and Rocket Artillery (air + long ground) carry
their reach from any row via indirect weapons; utilities extend base reach (Rangefinder
+1 zone; Sensor Suite unlocks Target-Air for non-AA). *Splash* lands on **every enemy
unit in the targeted row**, capped at **≤25%** of the hit, confined to that one zone.

---

## 2. Base stats — 7 types (standard variant)

`cd` = cadence tier. `raw DPS` = `Dmg × shots/sec` (pre-mitigation/accuracy), scale ref only.

| Type (std variant) | Hull | ArmorPct | Shield (cap/regen/delay) | Wpn Dmg | Type | cd | Acc | Splash | Reach | Move | Evasion | raw DPS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Heavy Tank** (Grizzly) | 1700 | 30% | — | 35 | Kinetic | Slow | .80 | — | nearest | 2 | .02 | 70 |
| **Light Tank** (Scout) | 650 | 6% | — | 5 | Kinetic | Fast | .82 | — | nearest | 6 | .25 | 50 |
| **Mech** (Vanguard) | 1000 | 12% | — | 15 | Kinetic* | Med | .85 | — | nearest | 5 | .10 | 50 |
| **Attack Heli** (Gunship) | 600 | 4% | — | 17 | Explosive | Med | .80 | .15 | any-ground | **—** | .30 | 57 |
| **Rocket Arty** (Sentry) | 750 | 10% | — | 30 / 28 | Explosive | Slow | .85 / .78 | .20 | air / front+mid | 3 | .06 | 60 / 56 |
| **Artillery** (Longbow) | 620 | 6% | — | 65 | Explosive | Siege | .70 | .25 | any-ground | 1 | .03 | 65 |
| **Rear Support** (Medic) | 700 | 12% | 250 / 6 / 30 | heal 15 / 3 t | Support | Med | — | — | own+adj zone | 3 | .05 | — |

\* Mech = **generalist**, full family access, **no native bonus** (§7.1). Rocket Arty
carries SAM (air) + Rocket Barrage (ground). Support does **no offense** at baseline
(Repair Beam heals ~5/tick to the lowest ally in range).

---

## 3. Chassis variants — 3 per type (advantage / deficiency)

Per §5.1: each variant is **an edge in one axis paid for in another**; native damage
family never changes. With fixed cadence tiers, "harder-hitting / weaker offense" is
expressed as **per-shot Dmg**, not fire rate. Only moved stats shown; rest = §2 base.

### Heavy Tank — *Slow · Kinetic · the wall*
| Variant | Hull | ArmorPct | Dmg | Move | Evasion | Edge ↔ Cost |
|---|---|---|---|---|---|---|
| **Grizzly** (std) | 1700 | 30% | 35 | 2 | .02 | Balanced reference wall. |
| **Cavalier** | 1360 | 28% | 40 | 4 | .05 | **+** hits harder, mobile pusher · **−** −20% hull, less armor |
| **Bulwark** | 2125 | 35% | 26 | 1 | .02 | **+** max tank, −8% dmg aura to zone allies · **−** weak offense, near-immobile |

### Light Tank — *Fast · Kinetic · skirmisher*
| Variant | Hull | Acc | Move | Evasion | Edge ↔ Cost |
|---|---|---|---|---|---|
| **Scout** (std) | 650 | .82 | 6 | .25 | Fast, evasive, fragile reference. |
| **Hunter** | 650 | .90 (+vs evasive) | 6 | .20 | **+** accuracy, hits evasive targets · **−** less evasive itself |
| **Outrider** | 550 | .82 | 8 (free reposition) | .28 | **+** fastest, kiter · **−** frailest |

### Mech — *Medium · generalist · bruiser*
| Variant | Hull | Dmg | Move | Utility | Edge ↔ Cost |
|---|---|---|---|---|---|
| **Vanguard** (std) | 1000 | 15 | 5 | 3 | Balanced flex reference. |
| **Striker** | 820 | 19 | 6 | 3 | **+** more damage & speed (glass cannon) · **−** fragile |
| **Sentinel** | 1150 | 12 | 5 | **4** | **+** durable + 4th utility · **−** lower damage |

### Attack Helicopter — *Medium · Explosive · air-locked alpha*
| Variant | Hull | ArmorPct | Dmg (grnd) | Evasion | Edge ↔ Cost |
|---|---|---|---|---|---|
| **Gunship** (std) | 600 | 4% | 17 | .30 | Balanced reference. |
| **Interceptor** | 600 | 4% | 14 | .35 | **+** air superiority, more evasive · **−** lighter ground payload |
| **Warhog** | 750 | 6% | 21 | .22 | **+** durable, heavy payload · **−** easier AA target (less evasive) |

### Rocket Artillery — *Slow · Explosive · the AA specialist*
| Variant | Hull | SAM (air) | Barrage (ground) | Edge ↔ Cost |
|---|---|---|---|---|
| **Sentry** (std) | 750 | 30 | 28 | Balanced AA + ground reference. |
| **Aegis** | 750 | **36** | 22 | **+** premier anti-air · **−** weak ground |
| **Deluge** | 750 | 24 | **34, splash+** | **+** ground bombardment · **−** weak AA |

### Artillery — *Siege · Explosive · backline sniper (no air, ever)*
| Variant | Hull | Dmg | Acc | Splash | Edge ↔ Cost |
|---|---|---|---|---|---|
| **Longbow** (std) | 620 | 65 | .70 | .25 | Balanced reference. |
| **Siege** | 520 | 82 | .70 | .25 | **+** max alpha & splash (wider radius) · **−** frailer |
| **Marksman** | 620 | 58 | .85 | .25 | **+** accurate, hits mobile · **−** small splash (poor vs clusters) |

### Rear Support — *Shields · force multiplier*
| Variant | Hull | ArmorPct | Support range | Utility | Move | Edge ↔ Cost |
|---|---|---|---|---|---|---|
| **Medic** (std) | 700 | 12% | own + adjacent | 3 | 3 | Balanced heal reference. |
| **Warden** | 910 | 18% | own zone only | 3 | 3 | **+** durable frontline medic · **−** short support range |
| **Command Post** | 420 | 12% | own + adjacent | **4** (+C&C boost) | **0** | **+** 4th utility, boosts C&C · **−** very fragile, immobile |

---

## 4. Representative equipment (subset)

Deltas on top of the base weapon/stat. Not the full §7 catalog — enough for counter-builds.

### Weapons
| Weapon | Class | Type | Dmg | cd | Reach | Note |
|---|---|---|---|---|---|---|
| Heavy Cannon *(base)* | Heavy | Kinetic | 35 | Slow | nearest | reliable |
| Siege Laser | Heavy | Energy | 40 | Slow | nearest | melts armor, off-family |
| Railgun | Heavy | Kinetic | 60 | Siege | deep | Pen 50% (pierces shields) |
| Autocannon *(base)* | Light | Kinetic | 5 | Fast | nearest | volume |
| Gauss Repeater | Light | Kinetic | 4 | Fast | nearest | +shield-shred |
| Assault Cannon *(base)* | Mech | Kinetic | 15 | Med | nearest | generalist |
| Pulse Laser | Mech | Energy | 15 | Med | nearest + air | anti-armor crossover |
| Rocket Pods *(base)* | Heli | Explosive | 17 | Med | any-ground | splash .15 |
| SAM Battery *(base)* | Rkt Arty | Explosive | 30 | Slow | air | premier AA |
| Howitzer *(base)* | Artillery | Explosive | 65 | Siege | any-ground | splash .25 |

### Defense (sets primary layer)
| Module | +ArmorPct | +Shield (cap/regen/delay) | Trade |
|---|---|---|---|
| Composite Armor | +12% | — | −1 Move |
| Deflector Shield | — | +250 / 6 / 25 | anti-Energy; folds to Kinetic |
| Fast-Cycle Shield | — | +120 / 12 / 12 | small pool, fast regen (kiting) |
| Blast Plating | +8% | — | −40% Explosive splash taken |

### Utility (mix any 3; no dupes; Plan-B slots cap 2)
| Module | Effect |
|---|---|
| Autoloader | weapon fires **one cadence tier faster** (min Fast) |
| Fire Control | +0.08 Accuracy vs evasive |
| Drive Servos | +2 zone-transition speed |
| ECM Suite | −0.10 Accuracy on attackers |
| Combat AI Core | +1 Plan-B slot, unlocks Adaptive energy + Opportunist stance |

---

## 5. Calibration — time-to-kill vs the budget

TTK via the §1 model (variance/crit omitted). `TTK = Hull ÷ (hullDmg × hit) × cd_ticks`.
Proves the scale closes and the counter-web shows up in the numbers.

| # | Attacker (weapon) | Target | dmg/shot | 1v1 TTK | 2–3× focus | Reads as |
|---|---|---|---|---|---|---|
| A | Light Scout (Autocannon, Kin) | Mech Vanguard | 3.0 | **331 t** | 165 t | fast unit grinds a bruiser ✓ |
| B | Mech (Assault Cannon, **Kin**) | Heavy Grizzly | 7.4 | 688 t | 229 t (3×) | **Kinetic folds to armor — slow** ✓ |
| C | Mech (Pulse Laser, **Energy**) | Heavy Grizzly | 10.9 | **468 t** | 156 t (3×) | **Energy melts armor — ~32% faster than B** ✓ |
| D | Heavy Grizzly (Heavy Cannon, Kin) | Light Scout | 17.2 | **189 t** | 63 t (3×) | huge alpha, but whiffs the evasive ✓ |
| E | Rocket Arty (SAM, AA) | Attack Heli | 31.5 | **95 t** | 48 t | **AA hard-counters air** ✓ |
| F | Attack Heli (Rocket Pods, Expl) | Artillery Longbow | 13.8 | **135 t** | 68 t | air deletes fragile backline (+splash) ✓ |
| G | Light (Gauss, **Kin**) → shields | Support Medic (250 shield) | — | strips shield in **~52 t**; Energy ~104 t | — | **Kinetic shreds shields 2× faster** ✓ |

**How this makes a 5v5 land in budget:** unfocused 1v1s *against a counter* are
intentionally slow (B at 688 t) — that's the counter-web working. But battles aren't
1v1: as fronts trade and units drop, fire **concentrates**, and the focus column
(48–229 t) is the real pace. A 5v5 with normal focus-fire behavior resolves to
Conquest in roughly **~300–450 ticks** (the mech-mirror attrition baseline is ~356 t).
Pure-defense turtles that never commit ride toward the **1000-tick cap → damage-dealt
tiebreak** (§9.3) — intended, not a failure.

**First-pass rough edges (for the balancer, not fixed here):**
- Kinetic-vs-heavy-armor (B, 688 t) runs long even accounting for focus — may want a
  touch more Kinetic base damage or slightly less heavy ArmorPct so Kinetic stays
  *viable vs armor*, not just *slow*.
- Support heal (~5/tick) vs incoming DPS (~2–3/tick per attacker) means one healer can
  roughly negate one attacker — forces focus/kill-the-healer, but it's a prime tuning knob.
- Artillery's value is **splash on clustered backlines + reach**, which 1v1 TTK can't
  show; its Siege cadence (1 shot/sec) makes each shot an event, per the design intent.

---

## 6. What the balancer consumes from here

This block becomes the **initial balance table** (P8 data-driven; admin-editable, decision
#5). The auto-balancer (Feature 2) runs matchups over these values, reads win-probability
distributions, and tunes them — this doc is the *starting point it optimizes from* and the
source of the counter-web assertions (SC-003) the sim tests check. It does **not** cover the
roster/defense/matchmaking model (8 squad slots, ≤3 blind-random defense) — that's Feature 7/8.
