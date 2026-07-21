"use client";

/**
 * Admin user-management screen (moderation). A two-pane console — a searchable/filterable roster on
 * the left, a detail + action panel on the right — over the real user list the page loaded. Adapts
 * the wireframe to v1 data: no MMR/rank (the ladder is net-victory based), so the hero + stats show
 * net victories / win-rate / defenses / battles. Ban/unban + delete run through the layer-3 Server
 * Actions; the actor guards (no self, no other-admin) are mirrored here as disabled controls, but the
 * server is the authority. Delete is gated behind an explicit confirm dialog.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { deleteUserAction, setUserBannedAction } from "@/app/admin/users/actions";
import type { AdminUserKpis, AdminUserRow, UserFilter } from "@/server/admin-users";
import { cn } from "@/lib/utils";

function displayName(u: AdminUserRow): string {
  return u.handle?.trim() || u.name?.trim() || `Commander ${u.id.slice(0, 6)}`;
}

function initialsOf(u: AdminUserRow): string {
  const n = displayName(u);
  const parts = n.split(/[_\s]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
function enlisted(d: Date | string): string {
  return `ENLISTED ${MONTH.format(new Date(d)).toUpperCase()}`;
}

const STATUS = {
  active: "border-faction-friendly/40 bg-faction-friendly/10 text-faction-friendly",
  banned: "border-destructive/45 bg-destructive/10 text-destructive",
} as const;

function StatusChip({ banned, className }: { banned: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "type-readout rounded-sm border px-2 py-1 text-[0.625rem]",
        banned ? STATUS.banned : STATUS.active,
        className,
      )}
    >
      {banned ? "BANNED" : "ACTIVE"}
    </span>
  );
}

const FILTERS: { key: UserFilter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "active", label: "ACTIVE" },
  { key: "banned", label: "BANNED" },
];

export interface AdminUsersScreenProps {
  initialUsers: AdminUserRow[];
  kpis: AdminUserKpis;
  currentAdminId: string;
}

export function AdminUsersScreen({ initialUsers, kpis, currentAdminId }: AdminUsersScreenProps) {
  const [users, setUsers] = useState(initialUsers);
  const [selectedId, setSelectedId] = useState<string | null>(initialUsers[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "banned" && !u.banned) return false;
      if (filter === "active" && u.banned) return false;
      if (!q) return true;
      return [u.handle, u.name, u.email].some((v) => v?.toLowerCase().includes(q));
    });
  }, [users, filter, query]);

  const selected = users.find((u) => u.id === selectedId) ?? visible[0] ?? null;
  const bannedCount = users.filter((u) => u.banned).length;

  // The server enforces these; mirrored here so the controls read as disabled with a clear reason.
  const isSelf = selected?.id === currentAdminId;
  const isAdmin = selected?.role === "admin";
  const canModerate = !!selected && !isSelf && !isAdmin && !pending;
  const guardReason = isSelf
    ? "You can't moderate your own account."
    : isAdmin
      ? "Admins can't be moderated here."
      : null;

  function toggleBan() {
    if (!selected || !canModerate) return;
    const next = !selected.banned;
    setError(null);
    startTransition(async () => {
      const r = await setUserBannedAction(selected.id, next);
      if (r.ok) setUsers((us) => us.map((u) => (u.id === selected.id ? { ...u, banned: next } : u)));
      else setError(r.reason ?? r.error);
    });
  }

  function confirmDelete() {
    if (!selected || !canModerate) return;
    const id = selected.id;
    setError(null);
    startTransition(async () => {
      const r = await deleteUserAction(id);
      if (r.ok) {
        setUsers((us) => us.filter((u) => u.id !== id));
        setSelectedId(null);
        setConfirming(false);
      } else {
        setError(r.reason ?? r.error);
        setConfirming(false);
      }
    });
  }

  const KPIS = [
    { label: "TOTAL USERS", value: kpis.total.toLocaleString(), tone: "text-text-strong" },
    { label: "ACTIVE", value: (kpis.total - bannedCount).toLocaleString(), tone: "text-faction-friendly" },
    { label: "BANNED", value: bannedCount.toLocaleString(), tone: "text-destructive" },
    { label: "BOTS", value: kpis.bots.toLocaleString(), tone: "text-text-muted" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionLabel index="00">Moderation</SectionLabel>
          <h1 className="type-display mt-3 text-3xl text-text-strong sm:text-4xl">User Management</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          {KPIS.map((k) => (
            <div key={k.label} className="flex min-w-24 flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3">
              <span className="type-readout text-[0.625rem] text-text-muted">{k.label}</span>
              <span className={cn("type-h3", k.tone)}>{k.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr] lg:items-start">
        {/* ===== LIST ===== */}
        <Panel inset="rail" className="flex flex-col gap-0 overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2">
              <span aria-hidden className="text-text-muted">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commanders…"
                aria-label="Search commanders"
                className="type-body-sm min-w-0 flex-1 bg-transparent text-text-strong outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const on = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={on}
                    className={cn(
                      "type-readout rounded-full border px-3 py-1.5 text-[0.625rem] transition-colors",
                      on
                        ? "border-faction-friendly bg-faction-friendly/10 text-faction-friendly"
                        : "border-border text-text-muted hover:text-text-strong",
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <ul className="max-h-[34rem] overflow-y-auto">
            {visible.length === 0 ? (
              <li className="p-6 text-center type-body-sm text-text-muted">No commanders match.</li>
            ) : (
              visible.map((u) => {
                const sel = u.id === selected?.id;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(u.id)}
                      aria-pressed={sel}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-border/60 border-l-2 px-4 py-3 text-left transition-colors",
                        sel
                          ? cn("bg-surface-raised", u.banned ? "border-l-destructive" : "border-l-faction-friendly")
                          : "border-l-transparent hover:bg-surface-raised/60",
                      )}
                    >
                      <span
                        className={cn(
                          "type-readout flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-xs",
                          u.banned ? "text-destructive" : "text-faction-friendly",
                        )}
                      >
                        {initialsOf(u)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="type-h3 flex items-center gap-2 truncate text-sm text-text-strong">
                          {displayName(u)}
                          {u.isBot && <span className="type-readout text-[0.5rem] text-text-dim">BOT</span>}
                          {u.role === "admin" && <span className="type-readout text-[0.5rem] text-family-energy">ADMIN</span>}
                        </span>
                        <span className="type-readout mt-0.5 block truncate text-[0.625rem] text-text-muted">
                          {u.netVictories >= 0 ? "+" : ""}{u.netVictories} net · {u.wins}W {u.losses}L
                        </span>
                      </span>
                      <StatusChip banned={u.banned} className="shrink-0" />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="border-t border-border px-4 py-3 type-readout text-[0.625rem] text-text-muted">
            {visible.length} of {users.length} shown
          </div>
        </Panel>

        {/* ===== DETAIL ===== */}
        {selected ? (
          <Panel inset="rail" className="flex flex-col gap-0 overflow-hidden p-0">
            <div className="flex items-center gap-5 border-b border-border p-6">
              <span
                className={cn(
                  "type-h2 flex size-16 shrink-0 items-center justify-center rounded-xl border bg-surface",
                  selected.banned ? "border-destructive/40 text-destructive" : "border-faction-friendly/40 text-faction-friendly",
                )}
              >
                {initialsOf(selected)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="type-h2 truncate text-text-strong">{displayName(selected)}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusChip banned={selected.banned} />
                  {selected.role === "admin" && (
                    <span className="type-readout text-[0.625rem] text-family-energy">ADMIN</span>
                  )}
                  {selected.isBot && <span className="type-readout text-[0.625rem] text-text-dim">BOT</span>}
                  <span className="type-readout text-[0.625rem] text-text-muted">{enlisted(selected.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-6">
              <span className="type-readout text-[0.625rem] text-text-muted">CAREER STATS</span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "VICTORIES", value: selected.wins, tone: "text-text-strong" },
                  {
                    label: "WIN RATE",
                    value: `${selected.matchesPlayed > 0 ? Math.round((selected.wins / selected.matchesPlayed) * 100) : 0}%`,
                    tone: selected.banned ? "text-destructive" : "text-faction-friendly",
                  },
                  { label: "DEFENSES", value: selected.defenseCount, tone: "text-text-strong" },
                  { label: "BATTLES", value: selected.matchesPlayed, tone: "text-text-strong" },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col gap-1 rounded-xl border border-border bg-surface-sunken px-3 py-3">
                    <span className="type-readout text-[0.5rem] text-text-muted">{s.label}</span>
                    <span className={cn("type-h3", s.tone)}>{s.value}</span>
                  </div>
                ))}
              </div>

              {error && (
                <p role="alert" className="type-body-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border p-6">
              {selected.handle && (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/commander/${selected.handle}`}>View full profile →</Link>
                </Button>
              )}
              <div className="flex-1" />
              {guardReason && <span className="type-readout text-[0.625rem] text-text-dim">{guardReason}</span>}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={toggleBan}
                disabled={!canModerate}
                className={
                  selected.banned
                    ? "border-faction-friendly/50 text-faction-friendly hover:bg-faction-friendly/10"
                    : "border-family-energy/50 text-family-energy hover:bg-family-energy/10"
                }
              >
                {selected.banned ? "Unban" : "Ban"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={!canModerate}
                className="border-destructive/60 text-destructive hover:bg-destructive/10"
              >
                Delete
              </Button>
            </div>
          </Panel>
        ) : (
          <Panel inset="rail" className="flex items-center justify-center p-10 type-body-sm text-text-muted">
            Select a commander to moderate.
          </Panel>
        )}
      </div>

      {/* confirm delete */}
      {confirming && selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Delete ${displayName(selected)}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-6 [backdrop-filter:blur(4px)]"
          onKeyDown={(e) => e.key === "Escape" && setConfirming(false)}
        >
          <Panel className="flex w-full max-w-md flex-col gap-0 overflow-hidden border-destructive/40 p-0">
            <div className="flex flex-col gap-3 p-6">
              <span className="type-readout text-[0.625rem] text-destructive">⚠ DESTRUCTIVE ACTION</span>
              <h3 className="type-h3 text-text-strong">Delete {displayName(selected)}?</h3>
              <p className="type-body-sm text-text-muted">
                This permanently removes the account, its squads, defenses, and ladder standing. Match
                history stays intact for opponents — no one else&rsquo;s stats change. This can&rsquo;t
                be undone.
              </p>
            </div>
            <div className="flex gap-3 border-t border-border p-4">
              <Button type="button" variant="secondary" size="md" onClick={() => setConfirming(false)} className="flex-1" autoFocus>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={confirmDelete}
                disabled={pending}
                className="flex-1 border-destructive bg-destructive/15 text-destructive hover:bg-destructive/25"
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
