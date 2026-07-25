import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { Chip } from "@/components/ui/chip";
import { StatBar } from "@/components/ui/stat-bar";
import { Stat } from "@/components/ui/stat";
import { BracketFrame } from "@/components/ui/bracket-frame";
import { Logo } from "@/components/brand/logo";
import { Wordmark } from "@/components/brand/wordmark";
import { UnitIcon, type MachineTypeKey } from "@/components/brand/unit-icon";

import { Ramp } from "./swatches";
import { ShadcnDemo } from "./shadcn-demo";

const UNIT_TYPES: { type: MachineTypeKey; label: string }[] = [
  { type: "heavytank", label: "Heavy Tank" },
  { type: "lighttank", label: "Light Tank" },
  { type: "mech", label: "Mech" },
  { type: "heli", label: "Attack Helicopter" },
  { type: "rocketarty", label: "Rocket Artillery" },
  { type: "artillery", label: "Artillery" },
  { type: "support", label: "Commander" },
];

const ZONES4 = [
  { name: "Air", text: "text-zone-air", border: "border-zone-air" },
  { name: "Front", text: "text-zone-front", border: "border-zone-front" },
  { name: "Middle", text: "text-zone-middle", border: "border-zone-middle" },
  { name: "Rear", text: "text-zone-rear", border: "border-zone-rear" },
];

/**
 * Dev-only design-system gallery — the isolation/review + e2e-test surface for Feature 3
 * (Storybook deferred, research D1). This file holds the US1 token reference; primitives (US3)
 * and brand/faction demos (US4) append their own sections. Reachable at `/gallery`, kept out of
 * search. (Routed at `/gallery`, not `/_gallery` — an underscore-prefixed folder is a Next.js
 * *private folder*, opted out of routing, so it could never serve a page.)
 */
export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};

const SURFACES = [
  { token: "--bg", name: "bg" },
  { token: "--surface", name: "surface" },
  { token: "--surface-rail", name: "surface-rail" },
  { token: "--surface-sunken", name: "surface-sunken" },
  { token: "--surface-raised", name: "surface-raised" },
  { token: "--surface-chrome", name: "surface-chrome" },
];

const SURFACE_RAMP = [
  { token: "--color-void", name: "void" },
  { token: "--color-abyss", name: "abyss" },
  { token: "--color-rail", name: "rail" },
  { token: "--color-sunken", name: "sunken" },
  { token: "--color-panel", name: "panel" },
  { token: "--color-raised", name: "raised" },
  { token: "--color-track", name: "track" },
  { token: "--color-steel-800", name: "steel-800" },
];

const TEXT = [
  { token: "--text-strong", name: "text-strong" },
  { token: "--text", name: "text" },
  { token: "--text-muted", name: "text-muted" },
  { token: "--text-dim", name: "text-dim" },
  { token: "--text-faint", name: "text-faint" },
];

const INK_RAMP = [
  { token: "--color-ink-100", name: "ink-100" },
  { token: "--color-ink-150", name: "ink-150" },
  { token: "--color-ink-300", name: "ink-300" },
  { token: "--color-ink-500", name: "ink-500" },
  { token: "--color-ink-700", name: "ink-700" },
  { token: "--color-ink-800", name: "ink-800" },
  { token: "--color-steel-500", name: "steel-500" },
];

const FACTION = [
  { token: "--faction-friendly", name: "faction-friendly" },
  { token: "--faction-friendly-soft", name: "friendly-soft" },
  { token: "--faction-enemy", name: "faction-enemy" },
  { token: "--faction-enemy-brand", name: "enemy-brand" },
  { token: "--faction-enemy-soft", name: "enemy-soft" },
];

const ZONES = [
  { token: "--zone-air", name: "zone-air" },
  { token: "--zone-front", name: "zone-front" },
  { token: "--zone-middle", name: "zone-middle" },
  { token: "--zone-rear", name: "zone-rear" },
];

const FAMILIES = [
  { token: "--family-kinetic", name: "family-kinetic" },
  { token: "--family-energy", name: "family-energy" },
  { token: "--family-explosive", name: "family-explosive" },
  { token: "--family-support", name: "family-support" },
  { token: "--family-flex", name: "family-flex" },
];

const TYPE_SCALE = [
  { cls: "type-display", label: "type-display", sample: "WARFORM" },
  { cls: "type-h1", label: "type-h1", sample: "Deploy Your Squads" },
  { cls: "type-h2", label: "type-h2", sample: "Battle Doctrine" },
  { cls: "type-h3", label: "type-h3", sample: "Loadout Editor" },
  { cls: "type-body-lg", label: "type-body-lg", sample: "The lead paragraph of a briefing." },
  { cls: "type-body", label: "type-body", sample: "Body copy for descriptions and prose." },
  { cls: "type-body-sm", label: "type-body-sm", sample: "Small print and secondary detail." },
  { cls: "type-label", label: "type-label", sample: "Hull Integrity" },
  { cls: "type-readout", label: "type-readout", sample: "// tick 0142 · plan-b triggered" },
  { cls: "type-eyebrow", label: "type-eyebrow", sample: "01 // Your Squads" },
];

const RADII = [
  { token: "--radius-sm", name: "radius-sm" },
  { token: "--radius-md", name: "radius-md" },
  { token: "--radius-lg", name: "radius-lg" },
  { token: "--radius-xl", name: "radius-xl" },
];

const SHADOWS = [
  { token: "--shadow-glow-cyan", name: "shadow-glow-cyan" },
  { token: "--shadow-glow-soft", name: "shadow-glow-soft" },
  { token: "--shadow-panel", name: "shadow-panel" },
  { token: "--shadow-popover", name: "shadow-popover" },
];

function Section({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6 border-t border-border-hairline pt-8">
      <h2 className="type-eyebrow text-faction-friendly">{`${index} // ${title}`}</h2>
      {children}
    </section>
  );
}

export default function GalleryPage() {
  return (
    <main id="gallery" className="mx-auto flex max-w-shell flex-col gap-12 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="type-h1 text-text-strong">Warform Commander — Design System</h1>
        <p className="type-body text-text-muted">
          The single visual source of truth: tokens, type scale, and (later) primitives + brand.
          Every value binds to a named token — no raw hex.
        </p>
      </header>

      <Section index="01" title="Color — Semantic Roles">
        <Ramp title="Surfaces" tokens={SURFACES} />
        <Ramp title="Text / Ink" tokens={TEXT} />
        <Ramp title="Faction" tokens={FACTION} />
        <Ramp title="Zones" tokens={ZONES} />
        <Ramp title="Damage Families" tokens={FAMILIES} />
      </Section>

      <Section index="02" title="Color — Primitive Ramps">
        <Ramp title="Surface ramp" tokens={SURFACE_RAMP} />
        <Ramp title="Ink / steel ramp" tokens={INK_RAMP} />
      </Section>

      <Section index="03" title="Typography">
        <div className="flex flex-col gap-5">
          {TYPE_SCALE.map((t) => (
            <div key={t.cls} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
              <span className="type-readout w-40 shrink-0 text-text-muted">{t.label}</span>
              <span data-type={t.cls} className={`${t.cls} text-text-strong`}>
                {t.sample}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section index="04" title="Radii">
        <div className="flex flex-wrap gap-6">
          {RADII.map((r) => (
            <div key={r.token} className="flex flex-col items-center gap-2">
              <div
                style={{ borderRadius: `var(${r.token})` }}
                className="size-16 border border-border-strong bg-surface-raised"
              />
              <span className="type-readout text-text-muted">{r.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section index="05" title="Elevation">
        <div className="flex flex-wrap gap-8 py-4">
          {SHADOWS.map((s) => (
            <div key={s.token} className="flex flex-col items-center gap-3">
              <div
                style={{ boxShadow: `var(${s.token})` }}
                className="size-16 rounded-md border border-border bg-surface"
              />
              <span className="type-readout text-text-muted">{s.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section index="06" title="Contrast Reference (approved pairings)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md bg-bg p-4">
            <span className="text-text-strong">text-strong on bg</span>
          </div>
          <div className="rounded-md bg-surface p-4">
            <span className="text-text">text on surface</span>
          </div>
          <div className="rounded-md bg-bg p-4">
            <span className="text-text-muted">text-muted on bg</span>
          </div>
          <div className="rounded-md bg-faction-friendly p-4">
            <span className="font-mono text-void">void on friendly (button)</span>
          </div>
          <div className="rounded-md bg-bg p-4">
            <span className="text-faction-friendly">friendly link on bg</span>
          </div>
        </div>
      </Section>

      <Section index="07" title="Primitives">
        <div className="flex flex-col gap-3">
          <h3 className="type-eyebrow text-text-muted">Button</h3>
          <div className="flex flex-wrap items-center gap-3">
            <Button data-testid="btn-primary" variant="primary">
              Primary
            </Button>
            <Button data-testid="btn-secondary" variant="secondary">
              Secondary
            </Button>
            <Button data-testid="btn-ghost" variant="ghost">
              Ghost
            </Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="type-eyebrow text-text-muted">Chip — tones</h3>
          <div className="flex flex-wrap gap-2">
            <Chip data-testid="chip-kinetic" tone="kinetic">
              Kinetic
            </Chip>
            <Chip tone="energy">Energy</Chip>
            <Chip tone="explosive">Explosive</Chip>
            <Chip tone="support">Support</Chip>
            <Chip tone="friendly">Friendly</Chip>
            <Chip tone="enemy">Enemy</Chip>
            <Chip tone="air" variant="solid">
              Air
            </Chip>
            <Chip tone="neutral">Neutral</Chip>
          </div>
        </div>

        <Panel
          inset="rail"
          eyebrow="Panel"
          actions={
            <Button size="sm" variant="ghost">
              Action
            </Button>
          }
        >
          <SectionLabel index="01">Your Squads</SectionLabel>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StatBar label="HULL" value={75} display="2400" />
            <StatBar label="SHIELD" value={40} display="1200" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Power" value="1.86k" />
            <Stat label="Squads" value="8" />
            <Stat label="Wins" value="142" />
            <Stat label="Rank" value="Gold III" />
          </div>
        </Panel>

        <div className="flex flex-col gap-3">
          <h3 className="type-eyebrow text-text-muted">BracketFrame</h3>
          <BracketFrame className="w-fit p-6">
            <span className="type-h3 text-text-strong">FRAMED</span>
          </BracketFrame>
        </div>
      </Section>

      <Section index="08" title="shadcn (base-token themed)">
        <p className="type-body-sm text-text-muted">
          Stock components, rendered on-brand with zero per-component color override (SC-007).
        </p>
        <ShadcnDemo />
      </Section>

      <Section index="09" title="Brand">
        <div className="flex flex-col gap-3">
          <h3 className="type-eyebrow text-text-muted">Logo — lockups</h3>
          <div className="flex flex-wrap items-center gap-8">
            <div data-testid="logo-badge" className="flex flex-col items-center gap-2">
              <Logo variant="badge" size={40} />
              <span className="type-readout text-text-muted">badge</span>
            </div>
            <div data-testid="logo-mono" className="flex flex-col items-center gap-2 text-text-strong">
              <Logo variant="mono" size={40} />
              <span className="type-readout text-text-muted">mono</span>
            </div>
            <div data-testid="logo-knockout" className="flex flex-col items-center gap-2 text-faction-friendly">
              <Logo variant="knockout" size={40} />
              <span className="type-readout text-text-muted">knockout</span>
            </div>
            <div data-testid="logo-on-light" className="flex flex-col items-center gap-2">
              <div className="rounded-md bg-text-strong p-3">
                <Logo variant="on-light" size={40} />
              </div>
              <span className="type-readout text-text-muted">on-light</span>
            </div>
            <div data-testid="logo-favicon" className="flex flex-col items-center gap-2">
              <Logo variant="favicon" size={32} />
              <span className="type-readout text-text-muted">favicon</span>
            </div>
            <div data-testid="logo-bracket" className="flex flex-col items-center gap-2">
              <Logo variant="badge" size={40} withBracket title="Warform Commander" />
              <span className="type-readout text-text-muted">+ bracket</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="type-eyebrow text-text-muted">Wordmark</h3>
          <div className="flex flex-wrap items-end gap-8">
            <Wordmark size="sm" />
            <Wordmark size="md" />
            <Wordmark size="lg" />
          </div>
        </div>
      </Section>

      <Section index="10" title="Faction & Zone Theming">
        <div className="flex flex-col gap-3">
          <h3 className="type-eyebrow text-text-muted">Unit icons — friendly</h3>
          <div data-testid="unit-icons-friendly" className="flex flex-wrap items-center gap-4">
            {UNIT_TYPES.map((u) => (
              <UnitIcon key={u.type} type={u.type} faction="friendly" title={u.label} className="w-14" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="type-eyebrow text-text-muted">Unit icons — enemy</h3>
          <div data-testid="unit-icons-enemy" className="flex flex-wrap items-center gap-4">
            {UNIT_TYPES.map((u) => (
              <UnitIcon key={`enemy-${u.type}`} type={u.type} faction="enemy" className="w-14" />
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Panel className="border-faction-friendly/30 bg-faction-friendly-soft">
            <h3 className="type-label text-faction-friendly">Your Forces</h3>
            <p className="type-body-sm mt-2 text-text">Friendly subtree — cyan accents.</p>
          </Panel>
          <Panel className="border-faction-enemy-brand/30 bg-faction-enemy-soft">
            <h3 className="type-label text-faction-enemy-brand">Enemy Forces</h3>
            <p className="type-body-sm mt-2 text-text">Enemy subtree — magenta accents.</p>
          </Panel>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="type-eyebrow text-text-muted">Zones</h3>
          <div className="grid gap-2 sm:grid-cols-4">
            {ZONES4.map((z) => (
              <div key={z.name} className={`border-l-2 pl-3 ${z.border}`}>
                <span className={`type-label ${z.text}`}>{z.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </main>
  );
}
