/**
 * Has the user answered the location gate, this launch? (SVC-281)
 *
 * ## What this is, and what decides the gate
 *
 * This flag alone does **not** decide whether the gate appears. It only records
 * that the user has already answered it during this launch, so the screen does
 * not reappear underneath them mid-session. Whether the gate is shown at all is
 * `shouldGateLocation`, driven by `useLocationAvailability`: the gate appears
 * when we cannot locate the user — OS location off, permission off — or when
 * they have no location on file.
 *
 * ## A note on the version this replaced
 *
 * The first build asked everyone, on every launch, and this file argued for it
 * at length: the expensive failure is a *stale* address rather than a missing
 * one, so asking only when nothing is saved cannot catch a user who moved city.
 *
 * That premise is still true. The conclusion was wrong. Asking daily charges
 * every user a tap on every launch to catch a rare case, and does not reliably
 * catch it either — a prompt seen every day becomes a reflex within a week, and
 * a reflex cannot notice that the city is wrong. Reverted after it shipped;
 * see `should-gate-location.ts` for the rule that replaced it.
 *
 * ## Module state, deliberately not localStorage
 *
 * Persisting this would outlive the launch it describes and silently disable
 * the gate. Module scope resets when the app process does, which is exactly the
 * definition of "this launch" we want.
 *
 * ## Launch, not foreground
 *
 * Deliberately not wired to Capacitor's `appStateChange`. Re-asking every time
 * someone switches back from WhatsApp would train people to dismiss the screen
 * without reading it — the same reflex that sank the every-launch version. A
 * time-based rule ("re-ask after N hours in background") is a reasonable
 * follow-up; it is not this.
 */

let confirmedThisLaunch = false;

// Subscribers, so a change re-renders the gate away. Module state alone is
// invisible to React: the first build set the flag and nothing re-evaluated,
// which left a user who tapped "yes, I'm here" staring at the same screen —
// locked out of the app entirely. Found on device; no unit test can see it,
// because the bug is in the wiring between this and the component tree.
const listeners = new Set<() => void>();

/** True once the user has confirmed or set a location since the app started. */
export function hasConfirmedLocation(): boolean {
  return confirmedThisLaunch;
}

/** Called when the user confirms an existing location or sets a new one. */
export function markLocationConfirmed(): void {
  if (confirmedThisLaunch) return;
  confirmedThisLaunch = true;
  for (const listener of listeners) listener();
}

/** `useSyncExternalStore` subscribe. */
export function subscribeToLocationGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only: return to the "not yet asked" state. */
export function resetLocationGate(): void {
  confirmedThisLaunch = false;
  for (const listener of listeners) listener();
}
