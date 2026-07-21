/**
 * Commander handle rules (Feature 7 onboarding). A handle is the public identity shown on the ladder,
 * profiles, and bylines — chosen at registration (required) and changeable later. Pure + framework-free
 * so both the client form and the server action validate identically (the server is authoritative).
 *
 * Rules: 3–20 chars, letters/digits/underscore only, at least one letter (never all-numeric so a
 * handle can't be confused with an id), and not a reserved word. Uniqueness is **case-insensitive**
 * (compare on {@link handleKey}) but the display value keeps the case the commander typed.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

const HANDLE_RE = /^[A-Za-z0-9_]+$/;

/** Routes, roles, and stand-in names a handle must not shadow. */
const RESERVED = new Set([
  "admin",
  "administrator",
  "api",
  "auth",
  "commander",
  "guest",
  "help",
  "me",
  "mod",
  "moderator",
  "null",
  "root",
  "support",
  "system",
  "undefined",
  "warform",
  "warformcommander",
  "you",
]);

export type HandleCheck = { ok: true; value: string } | { ok: false; reason: string };

/** The display value: trimmed, inner whitespace untouched (the regex rejects any that remains). */
export function normalizeHandle(raw: string): string {
  return raw.trim();
}

/** The case-insensitive comparison key for uniqueness. */
export function handleKey(raw: string): string {
  return normalizeHandle(raw).toLowerCase();
}

/** Validate a raw handle, returning the cleaned display value or a human reason. */
export function validateHandle(raw: string): HandleCheck {
  const value = normalizeHandle(raw);
  if (value.length < HANDLE_MIN) return { ok: false, reason: `Handle must be at least ${HANDLE_MIN} characters.` };
  if (value.length > HANDLE_MAX) return { ok: false, reason: `Handle must be at most ${HANDLE_MAX} characters.` };
  if (!HANDLE_RE.test(value)) return { ok: false, reason: "Use only letters, numbers, and underscores." };
  if (!/[A-Za-z]/.test(value)) return { ok: false, reason: "Handle must contain at least one letter." };
  if (RESERVED.has(value.toLowerCase())) return { ok: false, reason: "That handle is reserved." };
  return { ok: true, value };
}
