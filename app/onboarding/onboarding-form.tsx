"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { HANDLE_MAX, HANDLE_MIN } from "@/lib/handle";

import { claimHandle } from "./actions";

/**
 * The registration handle form. Client-side `useTransition` for pending state (repo convention), but
 * the server action is authoritative — it re-validates and enforces case-insensitive uniqueness, so a
 * clash or bad format comes back as a typed error. On success we enter the app; the DB session then
 * carries the handle and the `(app)` gate no longer redirects here.
 */
export function OnboardingForm() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await claimHandle(handle);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/garage");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="type-eyebrow text-text-muted">Commander handle</span>
        <input
          name="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={HANDLE_MAX}
          aria-invalid={error != null}
          aria-describedby="handle-hint"
          className="rounded-md border border-border bg-surface-sunken px-3 py-2 type-readout text-text-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
      </label>
      <p id="handle-hint" className="type-body-sm text-text-muted">
        {HANDLE_MIN}–{HANDLE_MAX} characters — letters, numbers, and underscores. Shown on the ladder,
        your profile, and battle history.
      </p>
      {error && (
        <p role="alert" className="type-body-sm text-faction-enemy">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || handle.trim().length === 0}>
        {pending ? "Claiming…" : "Claim handle & enter"}
      </Button>
    </form>
  );
}
