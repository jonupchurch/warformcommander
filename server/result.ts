/**
 * The service-layer result type — a success value or a **typed** business error (never a raw DB
 * error), so callers and tests can assert on `error` (persistence-api §Cross-cutting). Auth/ownership
 * violations still throw {@link import("./authz").AuthError}; these are the domain outcomes.
 */

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: ErrorCode; reason?: string };
export type Result<T> = Ok<T> | Err;

/** The closed set of business error codes the persistence API returns. */
export type ErrorCode =
  | "VALIDATION_FAILED"
  | "SLOT_CAP_EXCEEDED"
  | "SLOT_TAKEN"
  | "NOT_FOUND"
  | "NOT_OWNER"
  | "ALREADY_DESIGNATED"
  | "DEFENSE_CAP_EXCEEDED"
  | "SLOT_OCCUPIED_RACE"
  | "NOT_DESIGNATED"
  | "SLUG_TAKEN"
  | "UNSUPPORTED_FORMAT"
  | "FORBIDDEN";

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = (error: ErrorCode, reason?: string): Err => ({ ok: false, error, reason });
