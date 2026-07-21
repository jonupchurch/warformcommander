/**
 * `ProfileHero` (Feature 10, T012 — US1) — the identity block + headline career stats. Avatar (image
 * or a brand-mark fallback), handle, "ENLISTED" date, a seeded/AI marker for a bot (P5), the
 * display-only ladder position, and the headline figures (win rate, matches, best streak, **net
 * victories**). MMR/tier are deliberately absent (forward-looking, not fabricated). Token-only.
 */

import { Diamond } from 'lucide-react';

import { Chip } from '@/components/ui/chip';
import { Panel } from '@/components/ui/panel';
import { Stat } from '@/components/ui/stat';
import type { CareerStats, ProfileIdentity } from '@/lib/profile-types';

import { HandleEditor } from './handle-editor';

export interface ProfileHeroProps {
  identity: ProfileIdentity;
  career: CareerStats;
  ladderRank: number | null;
}

function enlisted(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

export function ProfileHero({ identity, career, ladderRank }: ProfileHeroProps) {
  return (
    <Panel inset="rail" className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-faction-friendly/40 bg-surface text-faction-friendly">
          {identity.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={identity.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <Diamond className="size-7" aria-hidden />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="type-display truncate text-2xl text-text-strong">{identity.handle}</h1>
            {identity.isBot && <Chip tone="neutral">SEEDED AI</Chip>}
            {identity.isOwn && <Chip tone="friendly">YOU</Chip>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="type-eyebrow text-text-muted">ENLISTED {enlisted(identity.enlistedAt)}</span>
            {ladderRank != null && (
              <span className="type-eyebrow text-faction-friendly">LADDER #{ladderRank}</span>
            )}
          </div>
          {identity.isOwn && (
            <div className="mt-1">
              <HandleEditor currentHandle={identity.handle} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="NET VICTORIES" value={career.netVictories > 0 ? `+${career.netVictories}` : String(career.netVictories)} />
        <Stat label="WIN RATE" value={`${career.winRatePct}%`} />
        <Stat label="MATCHES" value={career.matchesPlayed.toLocaleString()} />
        <Stat label="BEST STREAK" value={career.bestStreak.toLocaleString()} />
      </div>
    </Panel>
  );
}
