/**
 * Where the service tiles price from, when there is no pinned address (SVC-415).
 *
 * ## What this holds
 *
 * The coarse fix the launch check (`useLocationAvailability`) already gets on
 * Android at app start. It used to be discarded; the tiles now reuse it, so a
 * new customer without an address sees real "from ₹X" / "Coming soon" labels
 * on the first visit without any extra permission prompt.
 *
 * ## Session-only, deliberately not localStorage
 *
 * Same reasoning as `location-gate.ts`: a persisted fix would outlive the
 * launch it describes, and a tile priced from yesterday's city is worse than
 * the catalogue price. Module scope resets with the app process.
 *
 * ## Ages
 *
 * - `REFRESH_AFTER_MS` — a resume older than this may refresh it silently
 *   (`useLaunchFixRefresh`), and attempts are throttled by the same window, so
 *   a customer with location off does not pay a failed position call on every
 *   app switch.
 * - `FIX_MAX_AGE_MS` — a fix older than this is no longer used: the tiles fall
 *   back to catalogue prices rather than say "Coming soon" about a place the
 *   customer may have left.
 */

export const REFRESH_AFTER_MS = 30 * 60 * 1000;
export const FIX_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface LaunchFix {
  lat: number;
  lng: number;
  /** `Date.now()` when the fix was taken. */
  at: number;
}

let fix: LaunchFix | null = null;
let lastAttemptAt: number | null = null;

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Record a fix. Called by the launch check and the silent refresh only. */
export function setLaunchFix(coords: { lat: number; lng: number }, at: number): void {
  fix = { lat: coords.lat, lng: coords.lng, at };
  notify();
}

/** The raw fix, whatever its age. `useSyncExternalStore` snapshot. */
export function getLaunchFix(): LaunchFix | null {
  return fix;
}

/** The fix if it is still young enough to price from, else null. */
export function usableFix(now: number): LaunchFix | null {
  if (!fix) return null;
  return now - fix.at <= FIX_MAX_AGE_MS ? fix : null;
}

/**
 * Should a resume try a silent refresh now? Yes when there is no fix or it is
 * older than `REFRESH_AFTER_MS` — and no attempt, successful or not, was made
 * within that window.
 */
export function shouldRefresh(now: number): boolean {
  if (lastAttemptAt != null && now - lastAttemptAt < REFRESH_AFTER_MS) return false;
  return !fix || now - fix.at >= REFRESH_AFTER_MS;
}

/** Mark that a refresh attempt started, for the throttle above. */
export function markRefreshAttempt(now: number): void {
  lastAttemptAt = now;
}

/** `useSyncExternalStore` subscribe. */
export function subscribeToLaunchFix(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only: forget the fix and the last attempt. */
export function resetLaunchFix(): void {
  fix = null;
  lastAttemptAt = null;
  notify();
}
