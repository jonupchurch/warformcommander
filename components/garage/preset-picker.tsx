'use client';

/**
 * The preset picker (T032, US4) — the Customize surface's **PRESETS** tab for the selected machine. It
 * lists the type's **stock** builds (every variant's default, from `preset-catalog`) and the player's
 * **custom** presets (Feature 7 `listPresets`, **type-scoped** so a different type is never offered
 * them), and lets them **save** the current build as a new custom preset. Applying a preset re-derives
 * + re-validates like any edit; a custom bundle is **fit** to the target variant's slot layout (a
 * 4-utility preset never overfills a 3-slot variant, FR-013).
 */

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { SectionLabel } from '@/components/ui/section-label';
import { buildStockCatalog } from '@/lib/garage/preset-catalog';
import { presetsForType } from '@/lib/garage/presets';
import { useGarageEditor } from '@/lib/garage/use-garage-editor';

export function PresetPicker() {
  const { session, ruleset, presets, applyStock, applyCustom, saveCurrentAsPreset } =
    useGarageEditor();
  const slot = session.selection.selectedSlot;
  const machine = slot === null ? null : session.draft.machines[slot];

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (machine === null || slot === null) {
    return <p className="type-body-sm text-text-muted">Select a machine to load or save a preset.</p>;
  }

  const stock = buildStockCatalog(ruleset)[machine.typeId] ?? [];
  const custom = presetsForType(presets, machine.typeId);
  const activeId = machine.sourcePresetId ?? null;

  async function onSave() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await saveCurrentAsPreset(name.trim());
    setBusy(false);
    if (res.ok) setName('');
    else setError(res.reason ?? res.error);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionLabel index="01" rule={false}>
          Stock Builds
        </SectionLabel>
        <p className="type-body-sm text-text-muted">
          A coherent starting build for each {machine.typeId} variant — applies in one tap.
        </p>
        <ul className="flex flex-col gap-2">
          {stock.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => applyStock(slot, preset)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-faction-friendly hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="type-body-sm text-text-strong">{preset.name}</span>
                {activeId === preset.id ? (
                  <Chip tone="support">APPLIED</Chip>
                ) : (
                  <span className="type-eyebrow text-text-dim">APPLY →</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel index="02" rule={false}>
          My Presets
        </SectionLabel>
        {custom.length === 0 ? (
          <p className="type-body-sm text-text-muted">
            No saved {machine.typeId} presets yet — save this build below to reuse it.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {custom.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  onClick={() => applyCustom(slot, preset)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-faction-friendly hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="type-body-sm text-text-strong">{preset.name}</span>
                  {activeId === preset.id ? (
                    <Chip tone="support">APPLIED</Chip>
                  ) : (
                    <span className="type-eyebrow text-text-dim">APPLY →</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <SectionLabel index="03" rule={false}>
          Save Current As Preset
        </SectionLabel>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Preset name"
            aria-label="New preset name"
            className="type-body-sm min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 py-1.5 text-text-strong outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onSave}
            disabled={busy || !name.trim()}
          >
            {busy ? 'SAVING…' : 'SAVE'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="type-body-sm text-faction-enemy">
            Save failed: {error}
          </p>
        )}
      </div>
    </div>
  );
}
