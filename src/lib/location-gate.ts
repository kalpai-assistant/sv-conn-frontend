/**
 * Has the user confirmed where they are, this launch? (SVC-281)
 *
 * ## Why every launch, and not once
 *
 * The expensive failure is not a missing address — it is a *stale* one. Someone
 * in Pune yesterday and Mumbai today books against their saved Pune address, the
 * geo-fence looks for providers around Pune, and the booking dies as "no
 * partners found nearby" with nothing explaining why. The consumer is in a city
 * full of providers and cannot reach any of them.
 *
 * Asking once, or only when no address exists, cannot catch that: the user has
 * an address, it is simply the wrong one. So the question is asked every launch
 * — the cost is a tap, and the thing it prevents is a booking sent to the wrong
 * city.
 *
 * ## Module state, deliberately not localStorage
 *
 * Persisting this would defeat the point: a relaunch is exactly when someone may
 * have travelled, and a stored "already confirmed" would skip the question
 * forever. Module scope resets when the app process does, which is the
 * definition of "this launch" we want.
 *
 * ## Launch, not foreground
 *
 * Deliberately not wired to Capacitor's `appStateChange`. Re-asking every time
 * someone switches back from WhatsApp would be intolerable and would train
 * people to dismiss the screen without reading it — which is the failure mode
 * this whole feature is built to avoid. A time-based rule ("re-ask after N
 * hours in background") is a reasonable follow-up; it is not this.
 */

let confirmedThisLaunch = false;

/** True once the user has confirmed or set a location since the app started. */
export function hasConfirmedLocation(): boolean {
  return confirmedThisLaunch;
}

/** Called when the user confirms an existing location or sets a new one. */
export function markLocationConfirmed(): void {
  confirmedThisLaunch = true;
}

/** Test-only: return to the "not yet asked" state. */
export function resetLocationGate(): void {
  confirmedThisLaunch = false;
}
