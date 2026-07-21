/**
 * `RecentMatches` (Feature 10, T019 — US2) — newest-first match rows: a W/L chip, side, Bo3 score,
 * the opponent (a `/commander/[handle]` link, or `hidden` for practice, or `[deleted]`), and, for
 * every ranked row, links to its Summary (Feature 6) and Playback (Feature 5) by matchId. Token-only.
 */

import Link from 'next/link';

import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/utils';
import type { MatchRow } from '@/lib/profile-types';

function Opponent({ opponent }: { opponent: MatchRow['opponent'] }) {
  if (opponent.kind === 'commander') {
    return (
      <Link
        href={opponent.profileHref}
        className="type-readout truncate text-xs text-text-strong underline-offset-4 hover:text-faction-friendly hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {opponent.handle}
      </Link>
    );
  }
  return (
    <span className="type-readout truncate text-xs text-text-muted">
      {opponent.kind === 'hidden' ? 'hidden opponent' : '[deleted]'}
    </span>
  );
}

function Row({ row }: { row: MatchRow }) {
  const won = row.result === 'W';
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface-sunken/50 px-3 py-2">
      <span
        className={cn(
          'type-readout grid size-7 shrink-0 place-items-center rounded-md text-sm',
          won ? 'bg-faction-friendly-soft text-faction-friendly' : 'bg-faction-enemy-soft text-faction-enemy',
        )}
      >
        {row.result}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="type-readout text-xs tabular-nums text-text-strong">{row.score}</span>
        <span className="type-eyebrow text-[0.5rem] text-text-muted">{row.side.toUpperCase()}</span>
      </div>
      <div className="ml-1 flex min-w-0 flex-1 items-center gap-2">
        <Opponent opponent={row.opponent} />
        {row.isPractice && <Chip tone="neutral" className="text-[0.5rem]">PRACTICE</Chip>}
      </div>
      {!row.isPractice && (
        <span className="flex shrink-0 items-center gap-2">
          <Link
            href={row.summaryHref}
            className="type-eyebrow text-[0.5rem] text-text-muted underline-offset-4 hover:text-faction-friendly hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            SUMMARY
          </Link>
          <Link
            href={row.playbackHref}
            className="type-eyebrow text-[0.5rem] text-text-muted underline-offset-4 hover:text-faction-friendly hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            REPLAY
          </Link>
        </span>
      )}
    </li>
  );
}

export function RecentMatches({ rows }: { rows: MatchRow[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-eyebrow text-text-muted">RECENT MATCHES</h2>
      {rows.length === 0 ? (
        <p className="type-body rounded-lg border border-border bg-surface-rail px-4 py-6 text-center text-sm text-text-muted">
          No matches yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <Row key={row.matchId} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}
