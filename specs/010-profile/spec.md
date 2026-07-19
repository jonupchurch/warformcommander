# Feature Specification: Profile — Career Stats & Achievements

**Feature Branch**: `010-profile`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Profile (career stats, achievements) — the player profile / career
screen. A commander's identity, career stats read from the ladder, recent + notable matches
linking to replay/summary, most-played squads, and cosmetic badges/achievements. Public (viewing
another commander) and own-profile views, first-class in both orientations."

## Overview

This feature is the **commander's career screen** — the read-only face of everything a player has
done. It is almost entirely **display over data that already exists**: it reads a user's
[`ladder_standings`](../007-accounts-persistence/data-model.md), their
[`matches`](../007-accounts-persistence/data-model.md), and their
[`squads`](../007-accounts-persistence/data-model.md) from Accounts & Persistence (Feature 7),
composes them into a **Profile view-model**, and renders it with the shell primitives from the App
Shell (Feature 3) — the same `IdentityBadge`, `Stat`, `StatBar`, `Panel`, `UnitIcon` every screen
shares. It writes **nothing**: the stat write path is Feature 7/8, the ladder leaderboard is
Feature 9, and this screen only *reads*.

Two entry points render the same view-model: a commander's **own profile** (reached via the
identity badge in the shell) and **any commander's public profile** (reached from a Ladder row or a
Battle Summary opponent link). The headline career stake is **net victories** — attack wins add,
defense losses subtract (design [§13](../../reference/warformcommandergamedesigndoc.md)) — the only
ranking measure v1 actually has.

**Badges/achievements are cosmetic display, derived from milestones, not a rewards system.** The
progression / unlock layer that would make achievements *drive* unlocks is **backlogged to v1**
(design [§10](../../reference/warformcommandergamedesigndoc.md); it returns with PvE). So this
feature ships badges as a **pure derivation of career counters** — no `badges` table, no unlock, no
power (constitution **P1**). See [Assumptions](#assumptions).

The value it delivers: **a commander can see — and show off — their whole career at a glance**, on
a phone in portrait or a monitor in landscape (**P7**), with every match one tap from its replay.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View a commander's career stats + identity (Priority: P1)

A player opens a profile — their own via the identity badge, or another commander's from the
Ladder — and sees that commander's **identity** (handle, avatar, enlistment date) and **career
stats** read straight from the ladder standings: net victories, win/loss record split across attack
and defense, defenses held, total damage, current and best streak, matches played, and win rate.
The numbers are exactly what the ladder holds — the profile is a *view* of the standing, never a
second copy of it.

**Why this priority**: This is the feature's reason to exist and its MVP — an identity plus a
truthful career summary. Everything else (matches, squads, badges) hangs off the same identity and
the same standing read. Without this there is no profile.

**Independent Test**: Seed a user with a known `ladder_standings` row; render both `/profile` (as
that user) and `/commander/[handle]` (as another viewer); assert every displayed career figure
equals the standing (and that record and win-rate recompute exactly from the counters), and that
identity shows handle, avatar, and the `createdAt` enlistment date.

**Acceptance Scenarios**:

1. **Given** a commander with a populated `ladder_standings`, **When** their profile renders, **Then** net victories, attack W/L, defense W/L (defenses held), matches played, total damage, current streak, and best streak each equal the standing, and the shown record (W–L) and win-rate are recomputed from those counters — not stored separately.
2. **Given** a signed-in commander, **When** they open their own profile via the identity badge, **Then** it renders their standing and identity at `/profile`; **Given** any commander's handle, **When** a viewer opens `/commander/[handle]`, **Then** the same view-model renders for that commander.
3. **Given** a commander, **When** the profile renders identity, **Then** it shows handle, avatar (their `users.image`, or the brand mark fallback), and enlistment date (`users.createdAt`, labelled "ENLISTED"), and **no private account field** (email, role) appears anywhere.
4. **Given** net victories is the v1 stake (§13), **When** the profile shows ranking context, **Then** net victories is the headline and any MMR / tier / season / rank-progress element from the mockup is **absent or clearly marked forward-looking** — Profile renders only what v1 has.

---

### User Story 2 - Recent & notable matches, linked to replay and summary (Priority: P2)

On a profile, the commander's recent matches appear newest-first — each showing the result (win or
loss), the best-of-3 score, which side they fought (attack or defense), and the opponent — and
**each ranked match links to its Battle Summary and its Battle Playback**. A small activity view
rolls the same matches into a weeks-of-wins-and-losses strip, and a notable result or two (a best
win, a highest-damage game) may be surfaced from the same data.

**Why this priority**: Recent matches turn a static stat sheet into a living record and are the
bridge into the two screens the profile most naturally leads to — the replay (Feature 5) and the
summary (Feature 6). P2 because it depends on US1's identity/standing shell being in place.

**Independent Test**: Seed a user with several `matches` (ranked and practice, some as attacker,
some as defender, one with a since-deleted opponent); render the profile; assert the rows show the
right result/score/side, that each ranked row's Summary and Playback links resolve to that
`matchId`, that practice rows hide the opponent, and that the deleted-opponent row renders without
error.

**Acceptance Scenarios**:

1. **Given** a commander's `matches`, **When** the recent-matches list renders, **Then** rows are newest-first and each shows win/loss, the Bo3 score, the side fought, and the opponent handle.
2. **Given** a **ranked** match row, **When** a viewer taps it, **Then** it navigates to that match's Battle Summary ([Feature 6](../006-battle-summary/)) and offers its Battle Playback ([Feature 5](../005-battle-playback/)) by `matchId`.
3. **Given** a **practice** match (`mode='practice'`), **When** it appears in history, **Then** the opponent identity is hidden (per Feature 7 FR-019) and it is excluded from the ranked career counters shown in US1.
4. **Given** a match whose opponent has since deleted their account (participant FK `set null`, Feature 7), **When** the row renders, **Then** it shows a deactivated/unknown commander gracefully — no crash, no broken link.
5. **Given** the same matches, **When** the activity strip renders, **Then** it buckets recent weeks into wins vs losses derived from `matches` (the same substrate Feature 9 rolls up), and shows an empty strip for a commander with no matches.

---

### User Story 3 - Signature (most-played) squads & most-fielded unit (Priority: P3)

A profile shows the commander's **most-played squads** — the armies they field most, each with its
name, how many matches it has fought, and its win rate as a bar — and their **most-fielded unit**,
rendered with the shared `UnitIcon`. This is the "what does this commander actually play" section:
a read of match provenance, not the private roster editor.

**Why this priority**: It adds character and scouting value (an opponent can see a commander's
tendencies) but is not essential to a truthful career summary. P3 — a refinement on US1/US2 that
reuses the same `matches`/`squads` reads.

**Independent Test**: Seed a user with matches across a few squads; render the profile; assert the
squads are ranked by games played, each shows name / games / win-rate bar, a since-deleted source
squad renders gracefully, and the most-fielded unit derives from the commander's squad configs and
renders with the correct `UnitIcon` type.

**Acceptance Scenarios**:

1. **Given** a commander's `matches` grouped by the squad they attacked with, joined to `squads` for names, **When** the signature-squads section renders, **Then** it lists the top squads by games played, each with its name, match count, and a win-rate `StatBar`.
2. **Given** a squad that has since been deleted (`attackerSquadId` resolved to null via `set null`), **When** it would appear, **Then** the row degrades gracefully (a placeholder name), never erroring.
3. **Given** the commander's squad configs, **When** the most-fielded unit renders, **Then** it shows the most-common machine type with `UnitIcon` and a pick indicator; **Given** a commander with no squads, **When** the section renders, **Then** it is omitted rather than blank.

---

### User Story 4 - Badges & achievements (cosmetic, derived) (Priority: P3)

A profile shows a grid of **badges** — "First Deployment", "Centurion" (100 ranked victories),
"Ace Defender" (100 defenses held), a streak badge, a total-damage badge — each **earned**,
**in-progress** (with a progress bar), or absent. Every badge is **computed from the commander's
career counters** at render time; a badge is a picture, never a power. Achievements that would need
data v1 doesn't store are **not faked** — they simply don't ship yet.

**Why this priority**: Badges are the "show off" layer — motivating and characterful, but the last
thing a profile needs to be truthful and useful. P3, and deliberately scoped to *derived, cosmetic*
so it can't accrete into a rewards system (constitution **P1**; progression is backlogged, §10).

**Independent Test**: Feed the badge deriver a fixed `ladder_standings`; assert the earned /
in-progress set is exactly the catalog thresholds for those counters, that progress bars read the
right fraction, that flipping a counter across a threshold flips exactly one badge and changes
nothing but display, and that no badge is read from or written to any store.

**Acceptance Scenarios**:

1. **Given** a `ladder_standings`, **When** badges render, **Then** each catalog badge shows earned / in-progress (with a progress fraction) purely from the standing counters — with no `badges`/`achievements` row read or written.
2. **Given** a counter crossing a badge threshold (e.g. defenses held 99 → 100), **When** the profile re-renders, **Then** exactly that badge flips to earned and **nothing about gameplay, unlocks, or power changes** — the badge is cosmetic (P1).
3. **Given** a badge whose criterion needs data v1 does not store (per-family damage, units killed, zero-loss games, gear-at-match-time), **When** the catalog is built, **Then** that badge is **deferred, not shown as fake** — v1 ships only badges derivable from the existing counters.
4. **Given** a brand-new commander with all-zero counters, **When** badges render, **Then** the grid shows the catalog as unearned / in-progress with 0 progress, not an error.

---

### Edge Cases

- **Brand-new commander, 0 matches**: standing is all zeros (or a lazily-created 1:1 row); the profile renders a coherent cold-start — zeroed stats, empty activity strip, no signature squads, no earned badges — never a crash or a blank screen.
- **Bot / cold-start profile (P5)**: a seeded `users.isBot` commander (the opposition that keeps the ladder non-empty) is **viewable, not 404'd** — reachable from its Ladder row — and is visibly marked as a seeded/AI commander. It may have defense-only stats and no attack history; that renders gracefully.
- **Own vs others' profile**: both render the same public view-model; own-profile differs only in how it is *reached* (the identity badge) and its data *source* (session user vs handle lookup). No private data is shown on either. Editing handle/avatar is **not** this feature (Feature 7 onboarding/settings).
- **Deleted opponent in match history**: a `matches.attackerUserId`/`defenderUserId` that is null (Feature 7 `set null` on user delete) renders as a deactivated/unknown commander — history, standing, and links stay valid.
- **Deleted source squad**: a null `attackerSquadId` in the signature-squads aggregate renders with a placeholder name.
- **Unknown handle**: `/commander/[handle]` for a handle that does not exist renders a not-found, not a 500.
- **Both orientations (P7)**: the two-column landscape body collapses to a single column in portrait; the career-stats grid and badge grid reduce columns; nothing overflows horizontally at 360px.
- **Long history / large numbers**: the recent list is capped (paged or "recent N"); large totals (8.4M damage, four-digit streaks) format compactly and never break the layout.
- **Practice-only commander**: a commander whose matches are all practice shows zeroed ranked counters (practice never moves standings, Feature 7 FR-019) with practice history visible and opponents hidden.

## Requirements *(mandatory)*

### Functional Requirements

**Identity, routing & privacy (trust boundary, Principle II / P6)**

- **FR-001**: The system MUST render a commander's identity from Feature 7 `users` — **handle**, **avatar** (`users.image`, with the brand mark as fallback), and **enlistment date** (`users.createdAt`, shown "ENLISTED") — using the shell `IdentityBadge` treatment ([Feature 3](../003-app-shell/contracts/components.md)).
- **FR-002**: The system MUST provide two entry points that render the **same** Profile view-model: the signed-in commander's **own profile** at `app/(app)/profile` (reached via the shell identity badge) and **any commander** at `app/(app)/commander/[handle]`.
- **FR-003**: Profile responses MUST expose only **public** fields — `handle`, `image`, `createdAt`, `isBot`, and the standing/match/squad projections below. Private account fields (`email`, `role`, session/auth-adapter data) MUST NOT be read into or rendered by the profile (Principle II).
- **FR-004**: A **bot / cold-start** commander (`users.isBot = true`) MUST be viewable (not 404'd) and **marked as seeded/AI** (P5), since it is a public ladder participant linked from Ladder rows.
- **FR-005**: An **unknown handle** MUST render a not-found response, never a server error.

**Career stats (read-only projection of the ladder)**

- **FR-006**: Career stats MUST be read from `ladder_standings` and **equal it** — net victories, attack wins/losses, defense wins/losses (defenses held), matches played, total damage, current streak, best streak. The displayed **record (W–L)** and **win rate** MUST be *recomputed* from those counters, never stored as a separate figure.
- **FR-007**: **Net victories** (`attackWins − defenseLosses`, §13) MUST be presented as the headline ladder stake.
- **FR-008**: The system MAY show a **display-only ladder position** (`#N`) derived from standings order, clearly a convenience readout; the authoritative seasons/tiers/MMR ranking is [Feature 9](../009-ladder/). The profile MUST NOT present **MMR, tier, season, or rank-progress as real v1 data** — the mockup's `GOLD III` / `1510 MMR` / rank-progress / seasons are **forward-looking** and are omitted or explicitly labelled as not-yet-live.

**Matches (history + links)**

- **FR-009**: The system MUST list a commander's **recent matches** from `matches` (via Feature 7 `listMatches`), newest-first and capped, each showing result (win/loss), Bo3 score, side fought (attack/defense), and opponent handle.
- **FR-010**: Each **ranked** match row MUST link to that match's **Battle Summary** ([Feature 6](../006-battle-summary/)) and offer its **Battle Playback** ([Feature 5](../005-battle-playback/)), addressed by `matchId`.
- **FR-011**: **Practice** matches (`mode='practice'`) MUST render with the **opponent identity hidden** (Feature 7 FR-019) and MUST be excluded from the ranked career counters shown under FR-006.
- **FR-012**: A match with a **null participant** (opponent deleted, Feature 7 `set null`) MUST render as a deactivated/unknown commander with no broken link and no error.
- **FR-013**: The system MUST render an **activity strip** — recent weeks bucketed into wins vs losses, derived from `matches` — and MAY surface a small number of **notable results** (best win, highest-damage game) from the same data. Both degrade to an empty state with no matches.

**Signature squads & unit**

- **FR-014**: The system MUST derive **most-played squads** from `matches` grouped by the attacking squad, joined to `squads` for names, each showing name, games played, and a win-rate `StatBar` — a projection of public match provenance, **not** a read of the private roster.
- **FR-015**: A **deleted source squad** (`attackerSquadId` null) in that aggregate MUST render with a placeholder name, never erroring.
- **FR-016**: The system MUST derive the **most-fielded unit** from the commander's squad configs and render it with `UnitIcon`; with no squads, the section is omitted.

**Badges (cosmetic, derived — P1)**

- **FR-017**: Badges MUST be **derived at render time** from `ladder_standings` counters against a **typed badge catalog** — with **no `badges`/`achievements` table**, no stored per-user badge rows, and no unlock/reward.
- **FR-018**: Each badge MUST render as **earned**, **in-progress** (with a progress fraction/bar), or absent, purely as a function of the counters.
- **FR-019**: Badges MUST be **cosmetic** — they grant no power, unlock, gameplay effect, or stat (constitution **P1**). A badge whose criterion needs data the v1 schema does not hold (per-family damage, units killed, zero-loss games, gear-at-match-time) MUST be **deferred, not faked**.

**Rendering & platform (P7)**

- **FR-020**: Every profile section MUST be first-class in **mobile portrait and desktop landscape** (P7) — the two-column landscape body collapses to one column in portrait, and the career-stats and badge grids reduce columns — with **no horizontal overflow** down to 360px.
- **FR-021**: The profile MUST be **display-only and server-rendered** — it performs **no stat write** (writes are Feature 7/8) and holds no client-trusted authorization; all reads go through the server (Feature 7 service layer).

### Key Entities *(include if feature involves data)*

Reused from Feature 7 — **referenced, not redefined** (constitution P8; source:
[007 data-model](../007-accounts-persistence/data-model.md)):

- **`users`**: identity — `handle`, `image`, `createdAt` ("ENLISTED"), `isBot`. Only these public columns are read.
- **`ladder_standings`**: the career counters — attack/defense wins & losses, `netVictories` (generated), `matchesPlayed`, `totalDamage`, `currentStreak`, `bestStreak`. The **sole source** of the career-stats grid (FR-006).
- **`matches`**: resolved Bo3 summaries — `winnerSide`, per-side games won, per-side damage, `mode`, participant + squad/snapshot FKs, `createdAt`. Feeds recent matches, activity, notable results, and the signature-squads aggregate.
- **`squads`**: names for the signature-squads join and configs for the most-fielded unit.

New to this feature (view-model + derivation only — no persistence; see
[data-model.md](./data-model.md)):

- **ProfileViewModel**: the assembled, public, render-ready shape — `identity`, `career`, optional `ladderRank`, `activity`, `recentMatches`, `signatureSquads`, `mostFieldedUnit`, `badges` — composed server-side from the Feature 7 reads above.
- **CareerStats**: the recomputed display figures (record, winRatePct) layered over the raw standing counters.
- **MatchRow**: a display projection of a `matches` row — result, Bo3 score, side, opponent (or hidden/deleted), Summary/Playback hrefs, `isPractice`.
- **WeekBucket**: `{ label, wins, losses }` for the activity strip, derived from `matches`.
- **SignatureSquad**: `{ name, games, winRatePct }` from the matches×squads aggregate.
- **BadgeDefinition / BadgeView**: a catalog entry (id, name, description, threshold rule over `CareerStats`) and its derived state (`earned` | `inProgress` with a fraction), rendered display-only.

### Success Criteria *(mandatory)*

#### Measurable Outcomes

- **SC-001**: **Career stats equal the standing** — for any seeded `ladder_standings`, every displayed career figure equals the corresponding counter, and the shown record and win-rate recompute exactly from those counters (asserted by test; zero discrepancy).
- **SC-002**: **Matches link to their replay/summary** — 100% of ranked recent-match rows link to a resolvable Battle Summary and Battle Playback for their `matchId`; practice rows hide the opponent and never appear in ranked counters.
- **SC-003**: **Both orientations render** — the profile renders with **no horizontal overflow at 360px portrait and at 1440px landscape**, both first-class (P7), verified end-to-end.
- **SC-004**: **Badges are cosmetic — never power** — a badge earning/flip changes **only display**; the badge deriver is a pure function of read-only career stats with **no write path** and **no gameplay/unlock output** (verified by test and by the absence of any badge store).
- **SC-005**: **Badges are derived, not stored** — for a fixed standing, the earned/in-progress set is exactly the catalog thresholds; no badge row is read or written, and no `badges` table exists.
- **SC-006**: **Cold-start & degenerate profiles render** — a zero-match commander, a bot/cold-start commander, a deleted-opponent match, a deleted-squad aggregate row, and an unknown handle each render a valid response (empty state or not-found), never a crash.
- **SC-007**: **No private leakage** — no profile response (own or public) contains `email`, `role`, or any auth-adapter field; only the public projection is served.

## Assumptions

- **Badges are derived from stats in v1 — no table.** The badge catalog is **typed static data**;
  each badge's state is computed from `ladder_standings` counters on read. **No `badges` /
  `achievements` table is added** (this directly answers Feature 7's "a badges source" — it is a
  *derivation*, not a store). The full **achievement-as-unlock-driver** system — where clearing an
  achievement grants a capability — is **deferred and returns with PvE / progression** (design
  [§10](../../reference/warformcommandergamedesigndoc.md)). Cosmetic-only is a hard **P1** line.
- **The mockup's MMR / tiers / seasons / rank-progress are forward-looking.** v1's only ranking
  measure is **net victories** (§13; no MMR/ELO, no seasons). The `GOLD III` / `1510 MMR` / rank-
  progress panel / peak-tier readouts in the mockup are shown as **not-yet-live** (omitted or clearly
  labelled). A display-only ladder position (`#N`) is acceptable; the real ranking is Feature 9.
- **Some mockup readouts have no v1 data source and are deferred, not faked**: the per-family
  **Damage Profile** bar (kinetic/energy/explosive split — only a single `totalDamage` is stored),
  **units killed**, **avg match**, per-match **MMR delta**, and a match-weighted **pick rate** on the
  most-fielded unit. v1 shows **Total Damage** (which *is* stored) and the stats that
  `ladder_standings` / `matches` / `squads` actually provide.
- **Own vs public differ only in reach + source.** Both render the identical public view-model. All
  profile data is inherently public ladder data, so **no privacy gating** beyond simply not selecting
  the private columns. **Editing handle/avatar is not this feature** — handle is assigned on
  onboarding and avatar comes from Google (Feature 7); a settings/edit surface is separate.
- **Profiles live inside the authenticated `(app)` group.** The only public, no-session surface in
  v1 is the marketing/News site (Feature 11); profiles (like the Ladder) are viewed from within the
  authenticated app. `/commander/[handle]` is reachable by any signed-in viewer.
- **Signature squads and activity are derived from `matches`** (public provenance) — not from the
  private roster read (`listSquads` is own-only). Squad *names* surface via the matches→squads join;
  most-fielded unit derives from the squad configs that appear.
- **Feature 10 needs a few additive read projections on Feature 7's service** — resolve
  `handle → user`, per-user standing (`getStanding`, exists), per-user matches (`listMatches`,
  exists), a most-played-squads aggregate, and an optional ladder position. These are **read-only
  public projections with no schema change** (see [plan.md](./plan.md) / [contracts](./contracts/profile-view.md)).
- **Rendering is Server-Component-first** (Feature 3 / `stacks/nextjs.md`): the profile is read-only
  server data with essentially no client interactivity (charts are CSS bars, links are `next/link`);
  `[handle]` params are `await`ed per Next 16.
- **Non-goals**: the stat **write path** (Feature 7/8), the ladder **leaderboard** (Feature 9 —
  linked, not built), the full **achievement/unlock/progression** system (backlogged), **commanders**
  (deferred, §15), and the **Garage** roster editor (Feature 4). Handle/avatar editing is out.
