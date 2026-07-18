# Warform Commander — Game Design Document

> **Title:** Warform Commander  ·  short-hand brand: **"Warform"**
> **Genre:** Sci-fi tactics wargame / configurable auto-battler
> **Platform:** Browser (Next.js), fully responsive — mobile portrait *and* desktop landscape, both first-class
> **Art direction:** Retro / pixel art, modernized for readability
> **Audience:** Strategy enthusiasts (Mechabellum / Advance Wars / auto-battler fans)
> **Version:** v0.10 — v1 scope locked (core + PvP; PvE/economy/progression/monetization backlogged) 2026-07-18
> **Status:** Core design locked; name locked; **combat = real-time tick sim. v1 build target = core sim + full army toolset (all unlocked) + async PvP ladder + backend; PvE, fuel economy, progression & monetization backlogged (see §16.1).** See "Open Items" at the end.

> **Naming notes:** "Warform" is the distinctive, trademark-carrying element (no game/studio/trademark clash found as of 2026-07-18); "Commander" describes the genre. Verify domains on a registrar — `warform.com`, `warformcommander.com`, `warform.gg`, `warform.io`, `playwarform.com`.

---

## 1. One-line pitch

A deliberately **non-pay-to-win** sci-fi tactics wargame: assemble a 5-unit army, kit and position it, dial in each unit's behavior, then watch the battle auto-resolve. Skill lives in *planning* — composition, counters, loadouts, and positioning — not in twitch reflexes or wallet size.

## 2. Design pillars (the north stars every decision serves)

- **Non-P2W by construction, not by willpower.** Power is capped and mostly lateral; money buys convenience, breadth, and looks — never dominance. The design makes cheating-with-your-wallet structurally hard.
- **Planning over twitch, skill over stats.** The human's edge is pre-battle decisions. A sharp newcomer should be able to beat a sloppy veteran; between equally-skilled players, dedication (progression) breaks the tie.
- **Depth from configuration, not hero-count.** ~7 unit types (growing) × variants × equipment × behavior dials × positioning generate enormous variety without a giant roster to art and balance.
- **Fairness is verified, not hoped.** Because battles are simulatable, a Monte-Carlo auto-balancer proves matchups are fair and flags degenerate combos before players find them.
- **Content comes from players and puzzles.** Async PvP turns every player's defense into fresh content; PvE turns every enemy team into a solvable puzzle. Minimal content treadmill.

**North star & differentiation.** Closest existing game: **Mechabellum**. Warform Commander differentiates on three axes it should protect: (1) **per-unit behavior dials + conditional switches**, (2) an **async, non-P2W competitive ladder**, and (3) the **4-zone battlefield with a real air layer**.

## 3. Core loop

1. **Build** a 5-unit army from the unit pool (types → variants).
2. **Kit** each unit (1 weapon, 1 defense, 3 utility modules) — usually via a named preset.
3. **Configure** each unit's four behavior dials (+ optional conditional switch).
4. **Position** units freely across the four zones.
5. **Battle** auto-resolves as a **best-of-3 match**. Adaptation is *locked within a ranked match* (your army, presets, and positioning ride all three games) but free *between* matches and in PvE/practice. Opponent behaviors are hidden (fog), so it's a prediction game. (Full rule in §9.)
6. **Earn** rewards → unlock new options via targeted missions/achievements → refine the army.

Two modes share this loop:
- **PvE Campaign** — each enemy team is a handcrafted, solvable puzzle. Generates **attack-fuel**.
- **Async PvP Arena** — you attack AI-piloted **snapshots** of other players' defense teams. Spends attack-fuel.

> **v1 note:** PvE, the attack-fuel economy, and progression unlocks are **backlogged** (see §16.1). v1 is: build an army from the *full, all-unlocked* toolset → battle on the **async PvP ladder** or in a **practice-vs-AI sandbox**. No fuel gate.

## 4. Battlefield

Four zones, front to back: **Air · Front · Middle · Rear.**

- **Free placement, with per-zone caps.** You distribute your 5 units across the zones however you like, subject to hard caps: **ground zones (Front/Middle/Rear) hold up to 3 each**, and **Air holds up to 2** (the tighter Air limit prevents air-stacking exploits → ≤2 aircraft per army). Within those caps, Explosive splash remains the organic counter to clustering.
- **Air is its own zone and a soft counter, not a hard wall.** Any unit with reach can shoot at aircraft, but **AA (Rocket Artillery) deals more damage and hits more often** against air. This avoids the feel-bad of "forgot AA → auto-lose" while keeping AA a rewarded pick.
- **Targeting reach (working assumption):** direct-fire units (tanks, light tanks, mechs) can plink at air at an accuracy/damage penalty; **indirect artillery cannot hit air** (it lobs at ground); rear support doesn't attack.
- Front zones absorb fire first; rear/support are protected until reached (by artillery, air, or once the front collapses).

## 5. Unit roster (starter pool — more types added later)

| Unit | Home zone(s) | Can hit | Air? | Profile |
|---|---|---|---|---|
| **Heavy Tank** | Front | Nearest ground | plink only | Durable, high damage, slow firing — the wall |
| **Light Tank** | Front / Middle | Nearest ground | plink only | Faster firing, less HP, evasive (harder to hit) |
| **Mech** | Front / Middle | Nearest ground | plink only | Fast-acting, good damage, somewhat fragile — breakthrough |
| **Attack Helicopter** | Air | Any ground zone | — | Fragile, high damage; only well-countered by AA |
| **Rocket Artillery** | Middle / Rear | **Air** + Front & Middle | anti-air specialist | The hard counter to helicopters |
| **Artillery** | Rear | **Any** zone incl. Rear | no | High damage, slowest firing, weak when hit — snipes turtles/backline |
| **Rear Support** | Rear | Heals / buffs allies | — | Force multiplier, minimal offense |

**Counter web (emergent):** helis beat ground → rocket artillery beats helis → artillery punishes backline turtles → artillery is fragile & slow, dies to anything that reaches it → tanks hold the front to shield your own artillery/support. No dominant unit.

### 5.1 Chassis variants

Each unit type ships with **three chassis variants at launch — all available from the start** (more added in later content updates). **Design law:** variants define *who the unit is* (a fixed base-stat identity); equipment defines *how you kit it* (loadout). They trade along axes equipment doesn't control:

- **Durability ↔ Mobility/Evasion** (primary)
- **Role-lean** within the class
- **Fire cadence vs impact**
- Occasionally **slot count** or **mount flexibility** (a few specialist chassis)

No variant shifts a unit's native damage family — this preserves the "Energy has no native specialist" balance rule.

- **Heavy Tank** — *Grizzly* (standard: high HP/damage, slow) · *Cavalier* (~20% less HP, faster, pushes well) · *Bulwark* (max HP + small damage-reduction aura for allies in its zone; slowest, low fire rate).
- **Light Tank** — *Scout* (fast, evasive, fragile) · *Hunter* (higher fire rate + accuracy vs evasive, slightly less evasive) · *Outrider* (fastest, free cross-zone reposition, frailest — kiter).
- **Mech** — *Vanguard* (balanced flex bruiser) · *Striker* (more damage/speed, less HP — glass cannon) · *Sentinel* (+HP + **4th utility slot**, lower damage — tech platform).
- **Attack Helicopter** — *Gunship* (balanced) · *Interceptor* (faster/evasive, better vs air, lighter ground payload) · *Warhog* (+HP + **heavier weapon mount**, slower, easier for AA to hit).
- **Rocket Artillery** — *Sentry* (balanced) · *Aegis* (better AA, weaker ground) · *Deluge* (bigger ground splash/reach, weaker AA).
- **Artillery** — *Longbow* (balanced) · *Siege* (max splash/damage, slower, frailer) · *Marksman* (accurate + faster fire, less splash — precision vs mobile targets).
- **Rear Support** — *Medic* (balanced) · *Warden* (tougher, shorter support range — frontline medic) · *Command Post* (+**4th utility slot** + boosts Command & Control modules; very fragile, immobile).

Variants stack with equipment into archetypes — e.g., a *Bulwark* + Blast Plating + Aggro Broadcaster = an unkillable Protector; an *Outrider* + Fast-Cycle Shield + Jump Jets = a relentless kiter.

## 6. Damage & defense matrix

Three damage types × two defenses. Arrows are tunable; the *shape* is locked.

| Damage type | Sources | Strong vs | Weak vs | Notes |
|---|---|---|---|---|
| **Kinetic** | Cannons, autocannons | Shields | Armor | Reliable, all-rounder |
| **Energy** | Lasers, plasma | Armor | Shields | Fast fire; lasers can tag air |
| **Explosive** | Missiles, artillery | (splash) | — | Punishes clustered units / turtling; normal vs both defenses |

| Defense | Soaks | Folds to |
|---|---|---|
| **Armor** | Kinetic | Energy |
| **Shields** | Energy | Kinetic |

Explosive is the "counter to stacking a zone," which neither defense fully stops — reinforcing the free-placement/positioning game.

## 7. Equipment — 5 slots per unit

**1 Weapon · 1 Defense · 3 Utility.** "Both-tiered": common stat modules form the earnable baseline; rarer modules grant *capabilities*. **Non-P2W law (applies hardest here):** all equipment is *trade-offs*, never straight power upgrades — especially Weapon and Defense.

### 7.1 Mount + family framework ("limit, but with crossover")

- **Mount class** gates what physically fits: **Heavy / Medium / Light / Aircraft / Artillery / Support.** A heavy siege cannon won't bolt onto a light tank.
- **Within** what fits, a unit picks across the three damage families (Kinetic / Energy / Explosive) — that's the crossover, enabling counter-builds (an armor-busting Energy heavy, a shield-shredding Kinetic light).
- A few weapons are **class-exclusive for identity**: SAMs (Rocket Artillery), indirect howitzers (Artillery), rotor weapons (Helicopter).
- **Native-family bonus:** each unit has one native damage family granting a small bonus (**~10–15%, tunable**). Off-family weapons work but forgo the bonus, so counter-building *costs* something. **The Mech is the exception — the generalist:** full family access, no native bonus. **Energy has no native specialist** — it's the universal anti-armor crossover tech everyone can reach but no one boosts (a deliberate balance lever).
- **Reach:** default = a weapon strikes the **nearest occupied enemy ground zone**, carrying deeper as fronts collapse. Tags below flag exceptions: `any-ground`, `deep` (Middle/Rear), `air`, `front+mid`.

### 7.2 Weapon list — starter + progression, per class

**Heavy Tank** — *native: Kinetic · Heavy mount*
- *Starter:* **Heavy Cannon** (Kinetic, slow, high, `nearest`) · **Twin Autocannon** (Kinetic, med RoF, med; good vs evasive, `nearest`).
- *Progression:* **Siege Laser** (Energy, slow, very high, melts Armor, `nearest`) · **Mortar Pack** (Explosive, slow, splash, `front+mid`) · **Railgun** (Kinetic, very slow, extreme shot, pierces Shields, `deep`) — finisher.

**Light Tank** — *native: Kinetic · Medium/Light mount*
- *Starter:* **Autocannon** (Kinetic, fast, low-med; volume beats evasion, `nearest`) · **Light Laser** (Energy, fast, low, `nearest` + plinks `air`).
- *Progression:* **Gauss Repeater** (Kinetic, very fast, shreds Shields, `nearest`) · **Flak Cannon** (Explosive, fast, splash, soft-`air`) · **Guided Missiles** (Explosive, homing, high accuracy vs evasive/`air`, low ammo).

**Mech** — *native: GENERALIST (all families, no bonus) · Medium mount*
- *Starter:* **Assault Cannon** (Kinetic, med, `nearest`) · **Pulse Laser** (Energy, med, `nearest` + `air`).
- *Progression:* **Plasma Lance** (Energy, med-slow, high, armor-melt, short range→Front, `nearest`) · **Missile Pod** (Explosive, med, splash + `air`) · **Arc Projector** (Energy, chains across a zone) — anti-cluster capability.

**Attack Helicopter** — *native: Explosive · Aircraft mount (class-exclusive)*
- *Starter:* **Chin Gun** (Kinetic, fast, low, `any-ground` strafe) · **Rocket Pods** (Explosive, med, ground splash, `any-ground`).
- *Progression:* **ATGM** (Explosive/AP, slow, huge vs armored ground, `any-ground`) — tank-killer · **Beam Cannon** (Energy, med, armor-melt, `any-ground`) · **Air-to-Air Missiles** (Explosive, homing, `air`) — lets helis dogfight other aircraft.

**Rocket Artillery** — *native: Explosive · Artillery/AA mount · the AA specialist*
- *Starter:* **SAM Battery** (Explosive/AA, homing, `air`) — premier anti-air · **Rocket Barrage** (Explosive, slow, splash, `front+mid`).
- *Progression:* **Cluster Rockets** (Explosive, wide splash, anti-turtle, `front+mid`) · **Flak Screen** (area `air`-denial, cuts enemy air accuracy) — team-AA capability · **Long-Range MLRS** (Explosive, very slow, `deep`).

**Artillery** — *native: Explosive · Artillery mount · no air, ever*
- *Starter:* **Howitzer** (Explosive, very slow, big splash, `any-ground`) · **Field Gun** (Kinetic, slow, high single-target, shreds Shields, `any-ground`).
- *Progression:* **Railgun Battery** (Kinetic, extreme-slow, massive, pierces Armor+Shields, `any-ground`) — finisher · **Incendiary Shells** (Explosive DoT / zone-denial, `any-ground`) · **Guided Shells** (Explosive, slower but accurate vs evasive, `any-ground`) — patches artillery's whiff-on-mobile weakness.

**Rear Support** — *native: Support systems · Support mount · minimal offense*
- *Starter:* **Repair Beam** (heals lowest-HP ally) · **Shield Projector** (grants/regens shields to ally or zone).
- *Progression:* **Overcharge Emitter** (buffs ally fire rate/damage) · **Targeting Uplink** (marks a target → allies deal bonus damage) · **Nano-Swarm** (weaker heal across a whole zone) · **Point-Defense Laser** (shoots down incoming missiles + plinks `air`) — its only teeth.

*Coverage check:* every class has an answer to each threat — anti-Armor via Energy crossover, anti-Shield via Kinetic (Gauss/Field Gun/Railgun), anti-evasion via volume or homing, anti-air layered from soft (Flak, Missile Pod) to hard (SAM).

### 7.3 Defense slot — mitigation identity

Your defense slot's *primary* layer — **Armor, Shields, or Hybrid** — gated by a **weight class** (a heli can't carry a heavy tank's plating) with crossover inside what fits. Sidegrades, never straight upgrades. **No native-defense bonus** — weight-class gating + base stats carry defensive identity. Note: **Armor and Shields are separate, coexisting stats** (§9.1) — the slot sets your main layer, but shields can also stack on an armored unit from buffs, support, or modules.

Core behaviors the sim relies on:
- **Armor** — always-on flat reduction / large HP. Strong vs **Kinetic**, folds to **Energy**. Heavy (lowers speed/evasion) and permanent (no mid-battle regen unless a support repairs it). The steady wall.
- **Shields** — a rechargeable buffer on top of HP. Strong vs **Energy**, folds to **Kinetic**. **Recharges after a few ticks of not being hit** (the recharge-gap is an exploitable vulnerability; rewards kiting). Adds little raw HP.
- **Blast/Spaced** — the answer to **Explosive** splash (artillery/rockets), at the cost of less vs direct fire — how a stacked zone buys insurance.

Synergy: armor wants to **Hold** (slow); shields want to **Kite** (regen rewards disengaging) — defense and movement orders reinforce each other.

**Defense options — starter + progression, per class:**

- **Heavy Tank** *(Heavy mount; native: Armor)* — *Starter:* Composite Armor (heavy, anti-Kinetic, folds to Energy, slow) · Deflector Shield (medium regen, anti-Energy). *Progression:* Reactive Armor (negates first big hit + bonus vs Explosive, then degrades) · Ablative Plating (huge front-loaded pool that erodes) · Blast Plating (spaced, anti-Explosive).
- **Light Tank** *(Light mount; native: light Armor)* — *Starter:* Light Armor (modest, stays fast) · Compact Shield (small regen, anti-Energy). *Progression:* Sloped Plating (chance to deflect Kinetic) · Fast-Cycle Shield (small pool, very fast recharge — kiting) · Spall Liner (light anti-Explosive).
- **Mech** *(Medium mount; balanced)* — *Starter:* Plated Frame (medium armor) · Barrier Field (medium shield). *Progression:* Hybrid Plating (part armor/part shield) · Overshield Capacitor (big burst shield, no recharge) · Reactive Frame (negates first hit).
- **Attack Helicopter** *(Aircraft mount; native: avoidance)* — *Starter:* Light Airframe (small reduction) · Flare Dispensers (cuts incoming homing/AA accuracy). *Progression:* Composite Rotor Guard (more armor, slower) · Countermeasure Suite (stronger flares + reduces SAM lock) · Energy Diffuser (small anti-Energy shield).
- **Rocket Artillery** *(Medium mount; fragile)* — *Starter:* Field Plating (light-med armor) · Deflector Shield (anti-Energy). *Progression:* Dug-In Emplacement (big mitigation but immobile) · Blast Baffles (reduces counter-battery Explosive) · Ablative Plating.
- **Artillery** *(Artillery mount; fragile, stationary)* — *Starter:* Field Plating (light armor) · Sandbag Emplacement (bonus vs Kinetic, immobile). *Progression:* Dug-In Bunker (large mitigation, fully immobile) · Counter-Battery Baffles (anti-Explosive) · Reinforced Casemate (strong front-arc, weak from flank/air).
- **Rear Support** *(Support mount; native: Shields)* — *Starter:* Shield Array (solid self-shield) · Light Armor. *Progression:* Bunker Plating (durable but immobile) · Shield Overflow (excess self-shield spills to nearby allies) · Redundant Systems (keeps functioning at low HP).

### 7.4 Utility slots ×3 — capability + stat modules

Not damage-family or weight gated — mix any 3. Clearest "both-tiered" slot: common **stat** modules (baseline) + rarer **capability** modules that unlock order options (§8.3). **Rules:** no duplicate modules on one unit; **Plan-B trigger slots cap at 2 total** (base 1 + at most one from Combat AI/Tactical Computer).

- **Targeting & sensors** — *Starter:* Fire Control (+accuracy vs evasive) · Rangefinder (reach one zone deeper). *Progression:* **Targeting Computer** (→ Smart-Counter targeting) · Sensor Suite (reveals some fogged info; unlocks Target Air for non-AA) · Spotter Uplink (paints target for allied Focus Fire).
- **Fire systems** — *Starter:* Autoloader (+fire rate) · Ammo Hopper (longer sustained fire). *Progression:* Heat Sinks (removes Overdrive drawback) · Overcharger (periodic burst shot) · Stabilizers (accuracy while moving).
- **Mobility** — *Starter:* Drive Servos (+speed, responsive movement orders). *Progression:* Jump Jets (→ Reposition across zones) · Escort Protocol (→ Escort order) · Recon Treads (speed + evasion). *(Immobile builds like Dug-In artillery can't use these.)*
- **Electronic warfare & survivability** *(distinct from Defense slot)* — *Starter:* ECM Basic (small accuracy debuff on attackers) · Repair Nanites (slow self-repair of Armor). *Progression:* ECM Suite (breaks target locks / strong accuracy debuff) · Point-Defense System (shoots down a fraction of incoming missiles/Explosive) · Shield Booster (faster recharge + bigger pool).
- **Command & control** — *Progression:* **Combat AI Core** (→ Adaptive energy + Opportunist stance + **+1 Plan-B slot**) · Tactical Computer (just the extra Plan-B slot) · Aggro Broadcaster (→ Protector stance) · Comms Relay (boosts a zone's Focus Fire coordination).

*Dedup:* ECM (utility) = broad accuracy debuff on all attackers; Flares (defense) = specifically defeats homing/AA. Different jobs.

**Guardrail:** with up to 25 loadout decisions per army, **presets** (§8.4) are mandatory so newcomers aren't drowned; enthusiasts crack them open to hand-tune.

## 8. Behavior configuration — dials, not scripting

No code editor, no if/then authoring. Everything is a **menu pick**.

### 8.1 The four dials (starter · unlockable)

1. **Target Priority** *(who to shoot)* — *Starter:* Focus Fire (pile onto allies' target), Nearest, Weakest, Strongest/Biggest Threat, Backline-first. *Unlockable:* Target Support, Target Air, **Smart-Counter** (shoot enemies your damage type counters — via Targeting Computer).
2. **Energy Allocation** *(offense/defense slider)* — *Starter:* Offense (energy→weapons: +damage/RoF, −mitigation), Balanced, Defense (energy→shields). *Unlockable:* Overdrive (extreme offense, take extra damage), Fortify (near-max mitigation, minimal fire), **Adaptive** (auto-shifts with incoming damage — via Combat AI).
3. **Position & Movement** *(where you start + when you move)* — *Starter:* Hold, Advance (push as the zone ahead clears), Fall Back. *Unlockable:* Escort (shadow an ally), Kite (back off after firing), Reposition (slide to a less-contested zone) — via mobility module; limited by unit speed.
4. **Stance** *(decision logic — what to prioritize doing)* — *Starter:* Aggressive, Neutral, Defensive. *Unlockable:* Protector (body-block/taunt — via taunt module), Opportunist (hold fire for high-value openings — via Combat AI). Support flavors: Triage (heal most-wounded), Sustain (spread heals), Empower (buff attackers first).

**Dial hygiene law:** Energy = *mechanical numbers* (damage out vs. mitigation); Stance = *decision logic* (which action to choose). Keep them orthogonal or they blur and muddy balance.

### 8.2 Plan-B conditional switch

**One trigger slot to start** (one extra via Combat AI/Tactical Computer; **capped at 2 total**). When its condition fires, it flips a dial to a chosen Plan-B setting.
- *Starter conditions:* HP < X% · an ally falls · I'm the last one standing · my zone is breached · after tick T.
- *Unlockable conditions:* enemies cluster (3+) · **air detected** (→ swap to AA behavior) · my shields/armor break · a watched ally drops low (reactive support).
- Triggers must be **trade-offs**, not free turtles; the auto-balancer flags abusive Plan-A/Plan-B combos.

### 8.3 Gear ↔ orders interlock

Utilities don't just tweak stats — they *expand how a unit can think*. The Targeting Computer unlocks smarter targeting orders; Combat AI unlocks reactive/opportunist behaviors and extra Plan-B slots; the mobility module unlocks movement orders; the taunt module unlocks Protector. This is the "depth from configuration" pillar made mechanical.

### 8.4 Presets (named builds)

- A **preset bundles a unit's whole setup**: weapon + defense + 3 utilities + all four dials + the Plan-B trigger, saved under a name (**Breacher, AA Screen, Siege**, …).
- **Stock presets** (game-made, per unit-class) let a brand-new player field a coherent army in a few taps — the casual on-ramp. **Custom presets** save to a personal library for enthusiasts to reuse across battles.
- Presets are **per unit-class** (gear is mount-gated), so a "Siege" heavy-tank preset and a "Siege" mech preset are different builds sharing an archetype name.

## 9. Combat resolution

- **Resolution model: real-time tick simulation.** Each unit acts on its own cooldown (its *fire rate*) rather than in discrete turns — "slow firing" vs. "fast acting" are literal. The sim advances in fixed ticks; the client renders/animates the resulting tick stream.
- **Auto-resolving**, watchable, snappy. The joy is in the plan executing; conditional switches create narrative beats ("Plan B triggered!").
- **Minor bounded randomness** — crit chance, small damage variance, tick-timing jitter. *Texture, not decider.* No swingy misses on key abilities, no random-target ultimates.
- **Best-of-3 matches + adaptation rule.** Terminology: a **match** = one Bo3 series vs one opponent; a **game** = one of the three. In **ranked PvP you are locked within a match** — army, presets, and positioning ride all three games, so Bo3 simply smooths the minor RNG (a fluke can't decide the ladder); you adapt *between* matches and across the ladder. In **PvE/practice, adaptation between games is free** (sideboarding a fixed puzzle is fair). This keeps async PvP fair against a static defender snapshot, which cannot respond mid-match.
- **Deterministic-enough for tooling:** seeded PRNG so battles are reproducible (and daily/seasonal seeds are possible), while still feeling alive.
- Optional single **manual override** per battle is on the table (parked) if playtests show "watch-only" feels passive.

### 9.1 Unit stat schema

Every unit tracks these values (base from unit type + variant; modified by equipment). **Armor and Shields are independent, coexisting stats** — a unit can have both (e.g., an armored tank that also receives shields from a buff, a support unit, or a Deflector module); neither forces the other to zero. Each layer applies its own §6 type-interaction to whatever damage it absorbs.

- **Survivability:** **Hull (HP)** (dies at 0) · **Shield Capacity** (rechargeable buffer, absorbed before hull; strong vs Energy, weak vs Kinetic) · **Shield Recharge Rate** · **Shield Recharge Delay** (ticks untouched before recharge starts) · **Armor Rating** (mitigation on hull damage; strong vs Kinetic, weak vs Energy; permanent unless ablative).
- **Offense:** **Damage** · **Damage Type** (Kinetic/Energy/Explosive) · **Fire Rate / cooldown** (ticks between shots) · **Accuracy** · **Crit Chance / Multiplier** · **Splash/AoE** · **Penetration** (skips a portion of shields and/or armor) · **Reach** (targetable zones).
- **Mobility & positioning:** **Move Speed** (0 = immobile) · **Evasion** · **Threat/Aggro** (enemy target weighting; raised by taunt).
- **Support units also:** **Support Power** · **Support Range/Targets**.
- **Config (non-combat):** mount class · native damage family · slot layout (1 wpn / 1 def / 3 util; 4-util variants) · home-zone eligibility · weight class.
- **Derived:** **Power Rating** (from stats + gear tiers) — drives matchmaking brackets + the ~25% power-gap cap; never used in combat math.
- **Deferred (v1):** ammo/reload, heat, signature/detection — modeled as simple stat modifiers for now.

### 9.2 Damage resolution pipeline (per hit)

1. **Accuracy vs Evasion** → hit or miss.
2. **Base Damage** × crit × native-family bonus.
3. Absorbed by **Shields** first (shield §6 multiplier; Penetration may skip part) → overflow…
4. …to **Hull**, reduced by **Armor Rating** (armor §6 multiplier; Penetration may skip part).
5. **Splash** repeats a reduced hit on other targets in the zone.

No army-unit cost: every player fields exactly **5 units** — a level slot playing field.

### 9.3 Win conditions

- **Conquest** — destroy all enemy units → **full win, full reward**.
- **Time** — a fixed, tunable number of cycles elapses with both sides still standing → **whoever dealt the most damage wins**, at a **lesser reward**. Using *damage dealt* (not survivors or remaining HP) as the tiebreak discourages camping the clock — a turtle that survives but does little loses the tiebreak.
- **Exact damage tie at Time → the defender wins** (in PvE, the enemy/AI counts as the defender).
- Same rules across all modes (PvE, practice, ranked PvP).

## 10. Progression & unlocks

- **Mostly breadth + a slight, capped vertical power gain.** Unlocks are primarily *new options and capabilities* (a bigger toolbox), with a **moderate (~25%) total power gap** between a fresh army and a fully-progressed one as a dedication reward.
- **Governing law:** the **skill/composition swing must exceed the gear gap**. A great player on base gear beats a sloppy player on maxed gear; equal skill → dedication decides. The auto-balancer verifies this (skilled base-gear vs. sloppy max-gear → skill wins).
- **Targeted unlocks** via missions/achievements ("clear this mission → unlock the laser"). **No RNG lootboxes.** Players always know what they're working toward.
- **The best gear is earned-only** — never purchasable.
- *v1: this entire progression/unlock layer is **backlogged** — all equipment & variants are available from the start. It returns alongside PvE.*

## 11. Economy

- **Attack-fuel** is the connective currency. **PvE generates it; PvP spends it.** A clean source→sink loop that gives PvE purpose, builds a daily comeback cadence, and — crucially — stops attackers from brute-forcing a defense (each attack *costs* something, so attacks are planned).
- **Free, passively-regenerating baseline** of attack-fuel so PvP is *always* accessible; PvE earns *extra*. Framing matters: fuel is a **booster**, never a **toll gate**.
- *v1: the fuel economy is **backlogged** — players battle freely with no gate until PvE (its source) ships.*

## 12. Monetization (non-P2W)

Real money may buy:
- **Cosmetics** — faction paint, camo, decals, battle VFX (the core, cleanest revenue).
- **Convenience** — attack-fuel refills, **capped per day** so no one can buy unlimited attacks.
- **Battle pass** — mostly-earnable rewards.
- **Limited mid-tier gear** — a *capped* number of *non-overpowered* sidegrade items. **Store gear is capped at mid-tier; peak gear is earned-only**, so cash never reaches max power.

**Ladder rewards are cosmetic, never power** — otherwise buying fuel → more climbs → more power = soft P2W.

*v1: monetization is **future-state** — with everything unlocked and no fuel gate, there's nothing to sell yet.*

## 13. Matchmaking & fairness

- **Bracketed matchmaking** by a **progression/power score** (sum of unlocked gear tiers), so casuals face casuals and newcomers aren't fed to veterans.
- Combined with the moderate power gap and the "skill > gear" law, this rewards dedication without shutting casual players out.
- A fully **normalized/"Standard" equalized ladder** was considered and **deferred** — bracketing is the chosen v1 approach.

## 14. Balance tooling (a solo-dev superpower)

Because battles are simulatable, build a **Monte-Carlo auto-balancer**: run each matchup (unit × variant × loadout × dials × positioning) thousands of times, read **win-probability distributions**, and automatically flag degenerate/dominant combos. Given the large combinatorial space this game intentionally creates, this tool is not optional — it's what lets one person keep it fair. It also verifies the native-family-bonus and power-gap numbers stay within their intended bands.

## 15. Commanders (architected-for, added later)

Ship v1 as **army + equipment only**, but architect the data model so a **Commander layer** can slot in later: collectible commanders granting army-wide passives/abilities and faction identity — a "face" to collect, level, and buy cosmetic skins for. This is the long-term identity + collection + monetization hook, deferred to keep early scope sane.

## 16. Technical shape (high level)

- **Next.js** carries the entire meta-game — roster, variant/loadout screens, team builder, shop, campaign/arena menus — as a data-driven web app.
- **Battle** renders in React with a pixel-art animation layer, driven by a **seeded, server-authoritative real-time tick simulation**.
- **Backend + database** required for: accounts, persistent rosters, **snapshotting defense teams** for async PvP, matchmaking, and the economy. (Suggested: Postgres/Supabase, but open.)
- **Server-authoritative combat is mandatory for PvP integrity** — clients must not be able to fabricate results on a ranked/monetized ladder.
- The same simulation core powers the **auto-balancer** offline.

### 16.1 v1 scope & backlog (build target)

**In v1 (first build):**
- Full **real-time tick sim** + the **Monte-Carlo auto-balancer** on the same core.
- Complete **army-building toolset, all unlocked**: 7 unit types × 3 variants each, full weapon/defense/utility sets, all four order dials + Plan-B triggers, presets (stock + custom).
- **Free placement + zone caps** (ground 3 / Air 2) and **win conditions** (Conquest / Time).
- **Async PvP ladder**: accounts, roster + defense-snapshot persistence, bracketed matchmaking, Bo3 locked-in-match, damage-tiebreak. **Cold-start seeded** with hand-made/AI defense armies so the ladder is never empty.
- **Practice-vs-AI sandbox** (same tech as PvP snapshots) for testing armies.
- **Server-authoritative** sim for PvP integrity.

**Backlogged (future — "the other systems," shipped together later):**
- **PvE** (campaign, operations, roguelite, procedural skirmish beyond the sandbox).
- **Attack-fuel economy** (v1: battle freely, no gate).
- **Progression / targeted unlocks** (v1: everything available).
- **Monetization** (cosmetics, store gear, battle pass) — nothing gated to sell yet.
- **Commanders.**
- **Optional single manual-override** — design the sim to *allow* it, but off in v1.
- **Onboarding** — video tutorial, authored later.

Suggested build phases: sim core → army/loadout meta (all unlocked) → battle resolution + win conditions → accounts/persistence → async PvP ladder + practice sandbox.

## 17. Open items / to decide

- ~~Soft per-zone placement cap~~ — **Resolved:** ground zones hard-cap 3, Air hard-cap 2 (see §4).
- Equipment set (weapons, defense, utilities) and all order menus are now specified. Remaining equipment work is **numeric tuning** via the auto-balancer, not more content.
- ~~PvE structure & onboarding~~ — **Backlogged/deferred:** PvE is future-state (§16.1); onboarding = video tutorial authored later.
- ~~Single manual-override~~ — **Resolved:** design the sim to *allow* it, but **off in v1** (add only if playtests feel passive).
- ~~Exact starter set of unit variants~~ — **Resolved:** 3 per class at launch (see §5.1); numeric trade-offs tuned via the auto-balancer.
- ~~Battle win condition~~ — **Resolved:** Conquest (full reward) / Time → most-damage-dealt wins (lesser reward), exact tie → defender (see §9.3).
- ~~Full vision vs. first-playable-slice split~~ — **Resolved:** **v1 = core sim + full unlocked toolset + async PvP ladder + backend** (accounts, roster/snapshot persistence, matchmaking, practice sandbox). PvE, fuel economy, progression, and monetization are **backlogged** (see §16.1 for the full in-v1-vs-backlog split and build phases).

## 18. Decision log (locked this session)

**Title: Warform Commander** · **combat = real-time tick sim** · **first build target = full vertical slice w/ backend** · genre & platform · pixel art · fully responsive · 4 zones (Air/Front/Middle/Rear) with free placement · air as soft-countered own-zone · 7 starter unit types + variants · 3×2 damage/defense matrix · 5 equipment slots (1 weapon / 1 defense / 3 utility), both-tiered, sidegrades-only · **weapon system: mount+family gating with crossover, native-family bonus (~10–15%, Mech = generalist, Energy = no-native crossover tech), reach tags; full starter+progression weapon lists per class** · **4 order dials (Target / Energy / Position / Stance) with starter+unlockable menus, Plan-B trigger menu, gear↔orders interlock** · **presets: named builds bundling full setup; stock + custom; per unit-class** · **adaptation locked within a ranked match (Bo3 = RNG-smoothing), free in PvE/practice** · **defense slot: Armor/Shields/Hybrid + Blast, weight-gated, no native bonus, shields recharge after a few untouched ticks; full lists per class** · **utility slots ×3: 5 categories (targeting/fire/mobility/EW/command), starter+progression, no duplicate modules, Plan-B slots capped at 2** · mostly-breadth progression with a moderate (~25%) capped power gap · targeted unlocks, no lootboxes, best gear earned-only · monetization = cosmetics + capped convenience + limited mid-tier gear · bracketed matchmaking · Monte-Carlo auto-balancer · **unit variants: 3 per class at launch (all available), more in later updates; trade on durability/mobility/role/cadence, a few alter slot-count or mount; no native-family shift** · **stat schema (§9.1): Hull + separate coexisting Armor & Shield values + offense/mobility/support stats + derived Power Rating; damage pipeline shields→armor→hull; ammo/heat/signature deferred; no unit cost (fixed 5)** · **zone caps: ground 3, Air 2 (hard; ≤2 aircraft/army)** · **win conditions: Conquest (full reward) / Time → most-damage wins (lesser reward), exact tie → defender** · commanders deferred · async PvP (core v1 mode); puzzle PvE + attack-fuel economy = future · **v1 scope: core sim + full unlocked toolset + async PvP ladder + practice sandbox + backend; PvE, fuel economy, progression unlocks, monetization, commanders & manual-override all backlogged (§16.1)**.
