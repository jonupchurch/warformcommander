import { cn } from "@/lib/utils";

export type MachineTypeKey =
  | "heavytank"
  | "lighttank"
  | "mech"
  | "heli"
  | "rocketarty"
  | "artillery"
  | "support";

/**
 * The 7 machine SVGs (from `public/icons/`), inlined as markup so `currentColor` tints them
 * (FR-016/SC-008). No per-type color is hardcoded — every shape is `currentColor`, so the icon
 * takes the ambient text color or the faction/zone token the caller sets. Type→file map lives in
 * the data model; kept in sync here.
 */
const MARKUP: Record<MachineTypeKey, string> = {
  heavytank:
    '<rect x="6" y="27" width="52" height="8" rx="2" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><rect x="11" y="18" width="42" height="10" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><rect x="24" y="9" width="17" height="10" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><line x1="40" y1="14" x2="61" y2="14" stroke="currentColor" stroke-width="3"/>',
  lighttank:
    '<rect x="8" y="28" width="48" height="6" rx="2" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><polygon points="12,28 52,28 47,19 20,19" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><rect x="27" y="12" width="12" height="7" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><line x1="38" y1="15" x2="58" y2="15" stroke="currentColor" stroke-width="2.6"/>',
  mech:
    '<rect x="25" y="5" width="13" height="8" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><rect x="21" y="13" width="21" height="13" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><line x1="27" y1="26" x2="23" y2="38" stroke="currentColor" stroke-width="3"/><line x1="37" y1="26" x2="41" y2="38" stroke="currentColor" stroke-width="3"/><line x1="42" y1="17" x2="58" y2="14" stroke="currentColor" stroke-width="2.6"/>',
  heli:
    '<rect x="14" y="19" width="30" height="13" rx="6" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><line x1="44" y1="24" x2="61" y2="21" stroke="currentColor" stroke-width="2.4"/><line x1="60" y1="16" x2="61" y2="26" stroke="currentColor" stroke-width="2.4"/><line x1="8" y1="12" x2="50" y2="12" stroke="currentColor" stroke-width="3"/><line x1="29" y1="12" x2="29" y2="19" stroke="currentColor" stroke-width="2.4"/>',
  rocketarty:
    '<circle cx="16" cy="33" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="30" cy="33" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="44" cy="33" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="7" y="21" width="12" height="9" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><rect x="19" y="24" width="32" height="6" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><polygon points="28,24 46,24 54,10 36,10" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><line x1="35" y1="18" x2="50" y2="15" stroke="currentColor" stroke-width="2"/>',
  artillery:
    '<circle cx="18" cy="33" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="32" cy="33" r="4" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="10" y="26" width="34" height="6" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><line x1="22" y1="29" x2="59" y2="7" stroke="currentColor" stroke-width="5"/><rect x="17" y="21" width="12" height="7" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/>',
  support:
    '<polygon points="19,12 45,12 54,25 45,37 19,37 10,25" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="2.4"/><rect x="27" y="23.5" width="10" height="3" fill="currentColor"/><rect x="30.5" y="20" width="3" height="10" fill="currentColor"/>',
};

/**
 * Which way each SVG's art points by default (barrel / rotor / launcher). Co-located with the markup
 * so a redraw updates both here. Consumed by the battle sprite to flip units so they **face each
 * other** across the contact line (friendly points right, enemy points left). Facing is read from
 * each machine's *nose/cab* (its front), not its weapon: the heli's cockpit and the rocket truck's
 * cab both sit on the left (tail rotor / launcher slung to the right), so those two face left; every
 * other machine's front points right. `support` is symmetric so its value is a no-op. NOT applied by
 * `UnitIcon` itself — the default render stays as-drawn, and only the battle-playback leaf mirrors.
 */
export const ICON_FACES_RIGHT: Record<MachineTypeKey, boolean> = {
  heavytank: true,
  lighttank: true,
  mech: true,
  heli: false,
  rocketarty: false,
  artillery: true,
  support: true,
};

const FACTION = {
  friendly: "text-faction-friendly",
  enemy: "text-faction-enemy",
} as const;

export interface UnitIconProps {
  type: MachineTypeKey;
  /** sets currentColor to the faction token; omit to inherit ambient text/zone color */
  faction?: keyof typeof FACTION;
  className?: string;
  /** accessible name; omit → decorative (aria-hidden) */
  title?: string;
}

export function UnitIcon({ type, faction, className, title }: UnitIconProps) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("inline-block w-16", faction && FACTION[faction], className)}
      dangerouslySetInnerHTML={{ __html: MARKUP[type] }}
    />
  );
}
