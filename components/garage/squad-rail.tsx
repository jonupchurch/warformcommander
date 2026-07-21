'use client';

/**
 * The left rail (T017) — the player's saved roster from Feature 7 `listSquads`. Selecting a card
 * hydrates the editor from its stored config; `+ NEW SQUAD` starts a fresh build in the first free
 * roster slot. `ACTIVE` marks a squad currently serving as defense (mirrors Feature 7 `defenseSlot`).
 */

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Panel } from '@/components/ui/panel';
import { SectionLabel } from '@/components/ui/section-label';
import { ZONE_DOT_CLASS } from '@/lib/garage/display';
import { firstFreeRosterSlot } from '@/lib/garage/roster';
import { fromSquadConfig } from '@/lib/garage/to-squad-config';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';
import type { SquadConfig } from '@/sim/model';
import { cn } from '@/lib/utils';

export function SquadRail() {
  const { roster, session, dispatch } = useGarageEditor();
  const takenSlots = new Set(roster.map((r) => r.slotIndex));

  function newSquad() {
    dispatch({ type: 'createSquad' });
    const free = firstFreeRosterSlot(takenSlots);
    if (free !== null) dispatch({ type: 'setRosterSlot', index: free });
  }

  return (
    <Panel as="aside" inset="rail" className="flex flex-col gap-4" aria-label="Your squads">
      <SectionLabel rule={false} className="justify-between">
        Your Squads
        <span className="type-readout text-text-muted">{roster.length}</span>
      </SectionLabel>

      {roster.length === 0 ? (
        <p className="type-body-sm text-text-muted">
          No squads yet. Start one below, place five machines, and save.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {roster.map((squad) => {
            const config = squad.config as SquadConfig;
            const selected = session.editingSquadId === squad.id;
            return (
              <li key={squad.id}>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'loadSquad',
                      squadId: squad.id,
                      rosterSlotIndex: squad.slotIndex,
                      defenseSlot: squad.defenseSlot as 0 | 1 | 2 | null,
                      draft: fromSquadConfig(squad.name, config),
                    })
                  }
                  aria-pressed={selected}
                  className={cn(
                    'w-full rounded-lg border bg-surface p-3 text-left transition-colors',
                    selected
                      ? 'border-faction-friendly motion-safe:shadow-glow-soft'
                      : 'border-border hover:bg-surface-raised',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="type-h3 truncate text-text-strong">{squad.name}</span>
                    {squad.defenseSlot !== null && (
                      <Chip tone="front" variant="solid" className="shrink-0">
                        ACTIVE
                      </Chip>
                    )}
                  </div>
                  <div className="mt-2 flex gap-1" aria-hidden>
                    {config.machines.slice(0, 5).map((m) => (
                      <span
                        key={m.instanceId}
                        className={cn('h-1.5 w-5 rounded-full', ZONE_DOT_CLASS[m.zone])}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="type-readout text-text-muted">PWR {squad.powerRating}</span>
                    <span className="type-readout text-text-dim">SLOT {squad.slotIndex}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={newSquad}
        disabled={firstFreeRosterSlot(takenSlots) === null}
        className="mt-auto border-dashed"
      >
        + NEW SQUAD
      </Button>
    </Panel>
  );
}
