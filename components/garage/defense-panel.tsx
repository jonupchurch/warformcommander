'use client';

/**
 * The base-defense panel (T035, US5) — designate / undesignate / re-designate the **saved** squad as
 * async-PvP defense content through Feature 7's transactional service. It surfaces the three rules the
 * server enforces (≤3 slots, attack/defense exclusivity, ≥1 attackable) as **convenience** guards
 * (Principle II — the service is authority; a rejection still surfaces here), and offers
 * **re-designate** when an edited-and-saved designated squad has drifted from its frozen snapshot
 * (the snapshot is never mutated in place, AS3). The Garage never touches snapshot rows directly.
 */

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Panel } from '@/components/ui/panel';
import { SectionLabel } from '@/components/ui/section-label';
import { computeDefenseView, DEFENSE_SLOT_COUNT } from '@/lib/garage/defense-view';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';

export function DefensePanel() {
  const { roster, defense, session, isDirty, undesignate, redesignate, designate } =
    useGarageEditor();
  const view = computeDefenseView(roster, defense, session.editingSquadId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string; reason?: string }>) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (!res.ok) setError(res.reason ?? res.error ?? 'action failed');
  }

  const { current } = view;

  return (
    <Panel inset="rail" className="flex flex-col gap-4" aria-label="Base defense">
      <SectionLabel rule={false} className="justify-between">
        Base Defense
        <span className="type-readout text-text-muted">
          {view.usedCount}/{DEFENSE_SLOT_COUNT}
        </span>
      </SectionLabel>

      <p className="type-body-sm text-text-muted">
        Designate up to {DEFENSE_SLOT_COUNT} squads as defense. A designated squad freezes an immutable
        snapshot and leaves the attack pool — keep at least one squad attackable.
      </p>

      <ul className="grid gap-2 sm:grid-cols-3">
        {view.slots.map((slot) => (
          <li
            key={slot.slot}
            className="flex flex-col gap-1 rounded-md border border-border bg-surface px-3 py-2"
          >
            <span className="type-eyebrow text-text-dim">SLOT {slot.slot + 1}</span>
            {slot.squadId === null ? (
              <span className="type-body-sm text-text-faint">Empty</span>
            ) : (
              <>
                <span className="type-body-sm truncate text-text-strong">{slot.name}</span>
                <span className="type-readout text-faction-friendly">PWR {slot.powerRating}</span>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {!current.saved ? (
          <p className="type-body-sm text-text-muted">
            Save a squad to designate it for defense.
          </p>
        ) : current.designated ? (
          <>
            <div className="flex items-center gap-2">
              <Chip tone="front" variant="solid">
                ACTIVE
              </Chip>
              <span className="type-body-sm text-text-strong">
                Serving in defense slot {(current.slot ?? 0) + 1}.
              </span>
            </div>
            {isDirty ? (
              <p className="type-body-sm text-text-muted">
                Save your edits, then re-designate to push the new build live.
              </p>
            ) : current.isStale ? (
              <p className="type-body-sm text-family-explosive">
                This defense is out of date — re-designate to push your saved changes live.
              </p>
            ) : (
              <p className="type-body-sm text-text-muted">
                The live defense matches this squad.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={busy || isDirty}
                onClick={() => run(redesignate)}
              >
                RE-DESIGNATE
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => run(undesignate)}
              >
                UNDESIGNATE
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={busy || !current.canDesignate}
              onClick={() => run(() => designate(view.freeSlots[0] as 0 | 1 | 2))}
            >
              DESIGNATE AS DEFENSE
            </Button>
            {current.blockReason && (
              <p className="type-body-sm text-text-muted">{current.blockReason}</p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="type-body-sm text-faction-enemy">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
