"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HANDLE_MAX } from "@/lib/handle";

import { renameHandle } from "./handle-actions";

/**
 * Own-profile handle rename (Feature 7). Rendered only for the profile owner (`identity.isOwn`). The
 * server action re-validates + enforces case-insensitive uniqueness, so a clash/bad format returns a
 * typed error; on success we refresh the RSC so the new handle propagates.
 */
export function HandleEditor({ currentHandle }: { currentHandle: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentHandle);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setValue(currentHandle);
          setError(null);
          setEditing(true);
        }}
      >
        <Pencil className="size-3.5" aria-hidden /> Edit handle
      </Button>
    );
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const res = await renameHandle(value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={HANDLE_MAX}
          aria-label="Commander handle"
          aria-invalid={error != null}
          className="rounded-md border border-border bg-surface-sunken px-2 py-1 type-readout text-text-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
        <Button
          size="sm"
          onClick={onSave}
          disabled={pending || value.trim().length === 0 || value.trim() === currentHandle}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="type-body-sm text-faction-enemy">
          {error}
        </p>
      )}
    </div>
  );
}
