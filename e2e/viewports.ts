/**
 * The shell's P7 spine: every layout guarantee (no h-overflow, chrome switch, safe-area) is
 * verified at BOTH extremes — a 320px phone and a 1440px desktop — never just one (tasks.md note).
 * Shared by the shell + a11y specs so the matrix is defined once.
 */
export const VIEWPORTS = {
  /** smallest supported phone, portrait — the no-overflow floor */
  narrow: { width: 320, height: 640 },
  /** typical phone, portrait — bottom-tab chrome */
  phone: { width: 360, height: 640 },
  /** landscape desktop — top-tab chrome */
  desktop: { width: 1440, height: 900 },
  /** ultra-wide — content must stay centered within --container-shell */
  ultra: { width: 2560, height: 1080 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/** Portrait viewports show the bottom tab bar; landscape shows the top tabs. */
export const PORTRAIT: ViewportName[] = ["narrow", "phone"];
export const LANDSCAPE: ViewportName[] = ["desktop", "ultra"];
export const ALL_VIEWPORTS = Object.keys(VIEWPORTS) as ViewportName[];
