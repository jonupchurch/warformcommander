"use client";

/**
 * The admin balance editor (Feature 12, US1/T020). A dense, token-styled table of the ruleset's
 * numeric leaves grouped by section (globals / cadence / air / damage matrix / per-variant). Local
 * edits submit through `saveRulesetAction`; the result surfaces inline — the new `rulesetHash` on a
 * changing save, `VALIDATION_FAILED` (with reason) / `STALE_EDIT` on rejection, a no-op notice when
 * nothing changed. First-class in both orientations: the table scrolls within its own container,
 * never the page body (P7).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { applyEdits, groupEditableLeaves, leafLabel } from "@/lib/admin/ruleset-form";
import type { Ruleset } from "@/sim/ruleset";

import { saveRulesetAction } from "@/app/admin/balance/actions";

export interface RulesetEditorProps {
  initial: { revisionId: string; data: Ruleset; rulesetHash: string; version: number };
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saved"; hash: string; changes: number }
  | { kind: "noop" }
  | { kind: "invalid"; reason: string }
  | { kind: "stale" }
  | { kind: "forbidden" };

const SECTION_TITLES: Record<string, string> = {
  globals: "Global constants",
  cadenceTicks: "Cadence tiers (ticks/shot)",
  airMods: "Air modifiers",
  damageMatrix: "Damage matrix (bp)",
  variants: "Variant base stats",
};

export function RulesetEditor({ initial }: RulesetEditorProps) {
  const router = useRouter();
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const groups = useMemo(() => groupEditableLeaves(initial.data), [initial.data]);

  // Parse the raw string edits into the numeric edits that actually differ from the base value.
  const edits = useMemo(() => {
    const baseByPath = new Map<string, number>();
    for (const g of groups) for (const l of g.leaves) baseByPath.set(l.path, l.value);
    const out: Record<string, number> = {};
    for (const [path, text] of Object.entries(raw)) {
      const n = Number(text);
      if (text.trim() !== "" && Number.isFinite(n) && baseByPath.get(path) !== n) out[path] = n;
    }
    return out;
  }, [raw, groups]);

  const changeCount = Object.keys(edits).length;

  function onSave() {
    setState({ kind: "idle" });
    startTransition(async () => {
      const data = applyEdits(initial.data, edits);
      const result = await saveRulesetAction({ data, expectedVersion: initial.version });
      if ("error" in result) {
        if (result.error === "VALIDATION_FAILED") setState({ kind: "invalid", reason: result.reason });
        else if (result.error === "STALE_EDIT") setState({ kind: "stale" });
        else setState({ kind: "forbidden" });
        return;
      }
      if (result.noop) {
        setState({ kind: "noop" });
        return;
      }
      setState({ kind: "saved", hash: result.rulesetHash, changes: changeCount });
      setRaw({}); // edits are now the baseline
      router.refresh(); // reload the RSC with the new revision + version
    });
  }

  function onReset() {
    setRaw({});
    setState({ kind: "idle" });
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface-chrome/95 px-1 py-3 [backdrop-filter:blur(var(--blur-chrome))]">
        <div className="flex flex-col gap-1">
          <SectionLabel index="01">Balance editor</SectionLabel>
          <p className="type-readout text-text-muted">
            rev <span className="text-text-strong">{initial.rulesetHash.slice(0, 12)}</span> · v
            {initial.version} · {changeCount} pending change{changeCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onReset} disabled={pending || changeCount === 0}>
            Reset
          </Button>
          <Button size="sm" onClick={onSave} disabled={pending || changeCount === 0}>
            {pending ? "Saving…" : `Save & publish${changeCount ? ` (${changeCount})` : ""}`}
          </Button>
        </div>
      </div>

      {state.kind !== "idle" && <SaveBanner state={state} />}

      <div className="flex flex-col gap-5">
        {groups.map((group) => {
          const heading =
            group.subsection ? group.subsection : (SECTION_TITLES[group.section] ?? group.section);
          const eyebrow = group.subsection ? SECTION_TITLES[group.section] ?? group.section : undefined;
          return (
            <Panel key={`${group.section}:${group.subsection ?? ""}`} eyebrow={eyebrow}>
              <h3 className="type-h3 text-text-strong">{heading}</h3>
              <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.leaves.map((leaf) => {
                  const label = leafLabel(leaf.path, group.section, group.subsection);
                  const changed = leaf.path in edits;
                  const value = raw[leaf.path] ?? String(leaf.value);
                  return (
                    <label key={leaf.path} className="flex items-center justify-between gap-3">
                      <span
                        className="type-label truncate text-text-muted"
                        title={leaf.path}
                      >
                        {label}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setRaw((prev) => ({ ...prev, [leaf.path]: e.target.value }))}
                        className={`w-28 shrink-0 rounded-md border bg-surface-sunken px-2 py-1 type-readout tabular-nums text-text-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
                          changed ? "border-faction-friendly" : "border-border"
                        }`}
                      />
                    </label>
                  );
                })}
              </div>
            </Panel>
          );
        })}
      </div>
    </section>
  );
}

function SaveBanner({ state }: { state: SaveState }) {
  const styles: Record<string, string> = {
    saved: "border-faction-friendly/40 text-faction-friendly",
    noop: "border-border-strong text-text-muted",
    invalid: "border-faction-enemy/50 text-faction-enemy",
    stale: "border-faction-enemy/50 text-faction-enemy",
    forbidden: "border-faction-enemy/50 text-faction-enemy",
  };
  const message =
    state.kind === "saved"
      ? `Published — ${state.changes} change${state.changes === 1 ? "" : "s"}. New ruleset hash ${state.hash.slice(0, 12)}. The next match resolves against it.`
      : state.kind === "noop"
        ? "No changes to save — the ruleset is identical to the current one."
        : state.kind === "invalid"
          ? `Rejected: ${state.reason}`
          : state.kind === "stale"
            ? "Another admin saved first. Reloading the current ruleset — re-apply your change."
            : "Not authorized.";
  return (
    <div role="status" className={`rounded-lg border bg-surface-sunken px-4 py-3 type-body-sm ${styles[state.kind]}`}>
      {message}
    </div>
  );
}
