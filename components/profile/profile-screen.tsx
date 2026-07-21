/**
 * `ProfileScreen` (Feature 10, T030) — composes the whole `ProfileViewModel` into the page layout
 * shared by the own (`/profile`) and public (`/commander/[handle]`) routes: hero, a 2-column body
 * (career + matches / activity + squads + unit) that stacks to one column in portrait, then badges.
 * Server Component, token-only, no horizontal overflow at 360px (P7).
 */

import { ActivityChart } from './activity-chart';
import { BadgeGrid } from './badge-grid';
import { CareerStatsGrid } from './career-stats-grid';
import { MostFieldedUnit } from './most-fielded-unit';
import { ProfileHero } from './profile-hero';
import { RecentMatches } from './recent-matches';
import { SignatureSquads } from './signature-squads';
import type { ProfileViewModel } from '@/lib/profile-types';

export function ProfileScreen({ vm }: { vm: ProfileViewModel }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <ProfileHero identity={vm.identity} career={vm.career} ladderRank={vm.ladderRank} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <CareerStatsGrid career={vm.career} />
          <RecentMatches rows={vm.recentMatches} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <ActivityChart weeks={vm.activity} />
          <SignatureSquads squads={vm.signatureSquads} />
          <MostFieldedUnit unit={vm.mostFieldedUnit} />
        </div>
      </div>

      <BadgeGrid badges={vm.badges} />
    </div>
  );
}
