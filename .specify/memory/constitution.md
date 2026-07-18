<!--
Sync Impact Report
==================
Version: 3.0.0 (was 2.0.0)
Bump rationale (MAJOR): the document is re-homed from a portable, general
  engineering-process *reference* into Warform Commander's own project
  constitution, and a new first-class layer — Product & Architecture
  Invariants (P1–P8) — is added above the engineering rules. Re-scoping the
  document's identity/applicability (general → this specific product) plus
  adding a governing principle layer is a redefinition, hence MAJOR. No
  existing engineering principle was removed or reworded.
Modified:
  - Title: "Reference Constitution — Working in a Codebase, Fast and Well"
    → "Warform Commander Constitution".
  - Intro re-scoped to describe the two layers (product invariants + the
    retained engineering process).
  - Governance: adds precedence of the product invariants and their
    non-waivability.
Added:
  - "Product & Architecture Invariants" section (P1–P8), sourced from
    reference/warformcommandergamedesigndoc.md (§2 pillars, §14 balancer,
    §16 technical shape) and reference/Warform Commander Brand Foundation.
Retained verbatim (identities preserved — referenced by number in AGENTS.md,
  STATUS.md, and stacks/*.md):
  - Engineering Process Principles I–IX (Clarify … Commit) and the Workflow.
Templates / dependent artifacts checked:
  - .specify/templates/plan-template.md — Constitution Check gate is generic
    ("[Gates determined based on constitution file]"); it now naturally
    covers P1–P8. ✅ no edit required.
  - .specify/templates/spec-template.md — no principle-specific references. ✅
  - .specify/templates/tasks-template.md — no principle-specific references. ✅
  - .claude/commands/*, stacks/*.md, AGENTS.md — reference engineering
    principles I–IX by number, all preserved. ✅
Deferred / TODO: none.
-->

# Warform Commander Constitution

This constitution governs Warform Commander in two layers:

- **Product & Architecture Invariants (P1–P8)** — what *this game* must always
  be, and the technical shape that guarantees it. These are project-specific and
  take precedence over convenience; the non-negotiable ones (P1, P6) are never
  waived. Source of truth for the product design: `reference/`.
- **Engineering Process (Principles I–IX)** — the tool-neutral working rules for
  *how* we build here, carried from the team's general engineering reference and
  also stated in `AGENTS.md`. They are retained verbatim and referenced by
  number across the repo.

## Product & Architecture Invariants

These say what Warform Commander must always be. A design or implementation
choice that violates one is wrong by definition, not a trade-off to weigh.

### P1. Non-P2W by Construction (NON-NEGOTIABLE)

Power is capped and mostly lateral. Every equipment choice MUST be a
trade-off / sidegrade, never a straight power upgrade — most strictly on the
Weapon and Defense slots. The best gear is **earned-only** and never
purchasable. Real money may buy only: cosmetics, *capped* convenience (e.g.
daily-capped attack-fuel), a mostly-earnable battle pass, and a *capped* number
of non-overpowered mid-tier sidegrade items — store gear never reaches peak
power. Ladder rewards are cosmetic, never power. The total power gap between a
fresh and a fully-progressed army stays within a moderate (~25%) cap.

Rationale: the anti-pay-to-win promise is the product's core differentiator and
its brand ("Skill lives in the plan — never the wallet"). It must be enforced
structurally, so that spending *cannot* buy dominance — not merely discouraged.

### P2. Planning Over Twitch, Skill Over Stats

The human's edge is **pre-battle decisions** — composition, counters, loadouts,
positioning — not reflexes and not spending. The skill/composition swing MUST
exceed the gear gap: a sharp newcomer on base gear beats a sloppy veteran on max
gear; between equally-skilled players, dedication (progression) breaks the tie.
No twitch/real-time input decides a ranked battle.

Rationale: this fixes where mastery lives. Every mechanic is judged by whether it
rewards thinking before the shooting starts.

### P3. Depth from Configuration, Not Roster Count

Variety comes from ~7 unit types × 3 variants × equipment × behavior dials ×
positioning — not a bloated roster. Adding depth means new *configuration axes
and options*, not an ever-growing unit count to art and balance. Variants define
a unit's fixed base-stat identity; equipment defines its loadout; behavior dials
define its logic — keep these axes orthogonal so balance stays legible.

Rationale: combinatorial depth is sustainable for a small team; roster sprawl is
not. It also keeps the counter-web readable to players.

### P4. Fairness Is Verified, Not Hoped

Because battles are simulatable, matchup fairness MUST be *provable*. A
Monte-Carlo auto-balancer runs each matchup (unit × variant × loadout × dials ×
positioning) thousands of times, reads win-probability distributions, and flags
degenerate or dominant combinations before players find them. Balance claims —
the native-family bonus band, the power-gap cap, "no dominant unit," "skill beats
gear" — are validated numerically, not asserted.

Rationale: the game deliberately creates a large combinatorial space; automated
verification is what lets one team keep it fair at that scale.

### P5. Content from Players and Puzzles

The renewable content is player-generated: async PvP turns every player's defense
squad into fresh opposition, so the ladder is **never empty** (cold-start seeded
with hand-made / AI armies). Design for emergent variety over authored volume and
minimize the content treadmill.

Rationale: player-as-content sustains engagement without a large ongoing content
pipeline — a structural fit for a small team.

### P6. Deterministic, Seeded, Server-Authoritative Simulation (NON-NEGOTIABLE)

One **simulation core** powers both the live game and the offline auto-balancer.
Battles are fully reproducible from a seed plus inputs (seeded PRNG, fixed-tick
advance). The **server is authoritative** for any ranked/competitive result;
clients MUST NOT be able to fabricate or alter outcomes. Randomness is bounded
texture (crit jitter, small variance), never a decider of key outcomes.

Rationale: determinism is what makes replays, the balancer (P4), and reproducible
bug reports possible; server authority is mandatory for ladder integrity and is
inseparable from the non-P2W promise (P1).

### P7. Both Platforms First-Class

The app is fully responsive; **mobile portrait AND desktop landscape are both
first-class** design targets — each designed *for*, never one grudgingly adapted
from the other. Every screen must work and feel native in both orientations.

Rationale: the audience plays on both; a second-class platform halves reach and
undercuts the product's credibility.

### P8. Data-Driven Content

Units, variants, equipment, behavior dials, and presets are expressed as **typed
data**, not hardcoded logic. The simulation, the UI, and the balancer read the
*same single source of truth* for game content and stats. Adding or tuning
content is a data change, validated by types.

Rationale: a shared data model keeps sim, UI, and balancer consistent, and makes
balance tuning (P4) a data operation rather than a code rewrite.

## Engineering Process

How we build. These nine principles are retained verbatim from the team's general
engineering reference; they are referenced by number elsewhere in the repo.

### I. Clarify Before Building (NON-NEGOTIABLE)

Before writing code, capture — even in a few bullet points, even just
said out loud — what's actually being asked: the user story, the
acceptance criteria, and what's explicitly OUT of scope. If a
requirement is ambiguous, ask whoever owns it (client, teammate, PM, or
your own product judgment made explicit) rather than silently picking an
assumption; if asking isn't possible in the moment, state the assumption
out loud before proceeding so it can be corrected early rather than
discovered at the end.

Rationale: the single most common way a technically-correct solution
still fails is solving the wrong problem confidently. A five-second
clarifying question is always cheaper than a wrong solution.

### II. Validated Trust Boundaries

Anything crossing a trust boundary — form input, API request bodies,
query params, anything a user or another system controls — gets
validated before use, following whatever validation convention the
codebase already has (Zod, a schema library, manual checks — match
what's there; on a greenfield project, pick one and apply it
consistently). Never trust client-side state for authorization; check
it server-side.

Rationale: this is universal, not project-specific — the existing
pattern is usually right there to follow, so this principle is about
finding and matching it, not inventing a new one each time.

### III. Match Existing Conventions

Whether it's someone else's codebase or your own established project, its
design system, code style, file layout, and UX patterns are the source
of truth — not momentary preference. Before writing new code in an
unfamiliar area, find the nearest existing analog (a similar component, a
similar route, a similar test) and follow its shape. On a brand-new
project with no conventions yet, establish them deliberately and then
hold to them. Deviating is sometimes right, but say why out loud when it
happens.

Rationale: consistency with what's already there reads as competence and
keeps a codebase legible; a stylistically-foreign addition reads as not
having actually understood the surrounding code, even when the logic is
correct.

### IV. Scope Discipline (NON-NEGOTIABLE)

Ship the smallest complete slice that actually satisfies what was
asked. Resist gold-plating or solving adjacent problems nobody raised.
If a good idea surfaces mid-build that's outside the current ask,
name it out loud ("worth doing, but separate from this") rather than
silently expanding scope.

Rationale: scope creep is the fastest way to end up with a lot in
flight and nothing finished; a narrow, complete change is easier to
review, verify, and trust than a broad, half-built one.

### V. Verify Before Calling It Done

Before saying "done," actually check it: run the test suite, manually
exercise the golden path (and the one most obvious edge case), and read
back your own diff once. If the codebase has a build/typecheck step, run
it. "I believe this works" and "I checked this works" are different
claims — say which one you're making.

Rationale: a change that breaks the moment someone else touches it is
worse than admitting a rough edge honestly; verification is cheap
insurance against exactly that.

### VI. Narrate the Reasoning

Make the reasoning visible: say what you're about to do and why before
doing it, especially for a non-obvious call (why this approach over an
alternative, why this scope boundary, what you're explicitly deferring).
Keep a short running list of decisions/assumptions. In a live setting
with no commit history to reconstruct intent from later, this narration
IS the record; in normal work it complements the commit history
(Principle IX) rather than replacing it.

Rationale: the reasoning is often more valuable than the diff itself and
is frequently what's actually being evaluated — make it visible as you
go, don't save it for a retrospective explanation.

### VII. Plan the Whole Feature Set Before Building

For a project's initial set of features, plan ALL of them to completion —
specifications and implementation plans — before writing implementation
code for any single one. Use the Spec-Kit chain across the full set
(`speckit-specify` then `speckit-plan` for every feature) so shared data
models, cross-feature dependencies, and the right build order surface on
paper. Implementation of the set begins only once the set is planned.

Rationale: planning features one at a time is how you discover in week
three that feature A's data model can't support feature C. Surfacing those
collisions up front, while they're still cheap to fix, is the entire point.
(Time-boxed single-task work is the exception — see Governance.)

### VIII. Test at the Right Level

Write appropriate **unit tests** for any code where they carry real signal
— logic, edge cases, data transformations, anything with branching a later
change could silently break — using the language/framework's standard
tooling and matching the repo's existing test conventions (location,
naming, runner). Include **end-to-end tests** wherever they're feasible and
appropriate, covering the critical user paths a unit test can't reach, with
the stack's standard E2E tool (e.g. Playwright for web). Not every line
needs a test; skip the ones where a test adds no signal (trivial glue,
generated code) — but skip them deliberately, not silently.

Rationale: tests are the executable, durable form of "I checked this works"
(Principle V) — they're what lets the next change be made safely. Choosing
the level (unit vs. e2e) is about putting the check where the risk lives.

### IX. Commit Often, Atomically; Branch per Feature

Work on a feature branch, never directly on the default branch. Commit
often in small, **atomic** commits — each a single coherent change that
builds and passes tests, with a message in the repo's convention. Merge
back only once the feature is complete and verified (Principles V and VIII).

Rationale: atomic commits are a reviewable, revertible history and the
durable record of intent — the counterpart to Principle VI's live narration
whenever there IS a repo to commit to. A feature branch keeps the default
branch releasable while work is still in flight.

## Workflow

**Starting the project (its initial feature set):** plan the whole set first
(Principle VII) — `speckit-specify` + `speckit-plan` across every feature —
before implementing any. Each feature's plan MUST pass a Constitution Check
against both the Product & Architecture Invariants (P1–P8) and the Engineering
Process principles. Then take each feature through the loop below.

**Per feature or change:**

1. **Fast orientation pass** (minutes, not hours) — stack, entry
   points, directory conventions, how a request flows, and the handful
   of existing patterns you'll need to match. Delegate this to a
   background investigation agent (see `.claude/agents/codebase-scout.md`
   in this repo) so it runs while you keep talking through requirements —
   don't block the conversation on your own manual exploration.
2. **Clarify scope** — the actual ask, acceptance criteria, explicit
   non-goals (Principle I). A 3-bullet mini-spec is enough; don't
   over-invest in ceremony the moment doesn't warrant.
3. **Plan** — the full-set plan (Principle VII) at project inception, or a
   lightweight per-change plan (approach, files touched, the one or two
   real tradeoffs) for a single change. Skip the lightweight plan only for
   genuinely trivial changes.
4. **Implement on a feature branch, matching existing conventions**
   (Principle III), **writing unit/e2e tests alongside the code**
   (Principle VIII) and **committing often in atomic commits**
   (Principle IX).
5. **Verify** (Principle V) before presenting it as finished — including
   the tests you wrote.
6. **Merge the feature branch** once the feature is complete and verified
   (Principle IX).
7. **Narrate throughout** (Principle VI) — don't save the explanation
   for the end.

## Governance

The **Product & Architecture Invariants (P1–P8)** are the project's own,
non-inherited law: they take precedence over convenience, and P1 (Non-P2W) and
P6 (Deterministic, server-authoritative sim) are **never waived**, in any mode.
Any deviation from a non-NON-NEGOTIABLE invariant must be named explicitly and
justified in the plan's Complexity Tracking, with the simpler compliant
alternative recorded.

The **Engineering Process principles (I–IX)** govern how we build. They are a
working reference, and where this repo later develops its own conventions, those
conventions win on *style* — but never in a way that breaches P1–P8.

**Time-boxed / live mode:** under a genuinely time-boxed, single-task engagement,
Engineering Principles VII and IX may be relaxed (plan lighter; commit/branch as
the setting allows). The verification and testing bar (V and VIII), the process
non-negotiables (I and IV), and **all** Product & Architecture Invariants (P1–P8)
still hold.

**Amendments** require: a written change with rationale, a semantic-version bump
(MAJOR = principle removal/redefinition or re-scope; MINOR = principle/section
added or materially expanded; PATCH = clarifications), and a refreshed Sync
Impact Report at the top of this file. Dependent templates (`.specify/templates/`)
must be re-checked for alignment on each amendment.

**Version**: 3.0.0 | **Ratified**: 2026-07-18 | **Last Amended**: 2026-07-18
