<!--
Sync Impact Report
==================
Version: 2.0.0 (was 1.0.0)
Status: General engineering-process constitution for building software
  well — whether greenfield in a project you own or dropped into someone
  else's existing, unfamiliar codebase. Adapted from the playm8z project's
  own ratified constitution (D:\Codelib\playm8z\.specify\memory\
  constitution.md, v1.0.0), which traced its process shape back through
  InterruptVector and PrintingSite. Per that lineage rule: this is a
  starting point for PROCESS, not product content — no tech stack, ADRs,
  or feature scope are carried over, since it's meant to travel into a
  different codebase every time it's used.
Amendment (2.0.0): re-centered from an interview-only frame to a general
  build reference, and added Principle VII (plan the whole feature set
  first), VIII (test at the right level — unit + e2e), and IX (commit
  atomically, branch per feature). The time-boxed / live-interview
  scenario is now one documented mode (Governance + docs/
  interview-cheat-sheet.md), not the default voice.
-->

# Reference Constitution — Working in a Codebase, Fast and Well

This is a general reference for how to build: it applies to a greenfield
project you own and to being dropped into an unfamiliar codebase alike.
The acute time-boxed case (a live interview or client scoping session) is
one mode of working under it — see Governance and
`docs/interview-cheat-sheet.md` — not the whole of it.

## Core Principles

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

**Starting a project (its initial feature set):** plan the whole set first
(Principle VII) — `speckit-specify` + `speckit-plan` across every feature —
before implementing any. Then take each feature through the loop below.

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

This is a reference starting point, not inherited authority — the
actual codebase's own conventions win whenever they conflict with
anything here. Adapt freely per engagement; there's no ratification
ceremony required for a working reference document like this one.

**Time-boxed / live mode:** under a genuinely time-boxed, single-task
engagement (e.g. a live interview or client scoping session — see
`docs/interview-cheat-sheet.md`), Principles VII and IX may be relaxed —
plan lighter, and commit/branch as the setting allows. The verification
and testing bar (Principles V and VIII) and the non-negotiables (I and IV)
still hold.

**Version**: 2.0.0 | **Ratified**: 2026-07-15 | **Last Amended**: 2026-07-15
