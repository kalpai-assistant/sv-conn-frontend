/**
 * When should the launch location gate appear? (SVC-281)
 *
 * Extracted from `__root.tsx` so it can be tested at all. The decision itself
 * is pure — a few booleans in, one verdict out — but it lives inside `AppGate`,
 * which needs auth, the router, React Query, FCM and Sentry standing up before
 * it renders. Testing the rule through that stack would mostly prove the mocks
 * work; six of this feature's bugs were in wiring, and none of them would have
 * been caught by more mocking.
 *
 * ## Two rules, one per role
 *
 * The gate used to appear on every launch, for everyone. It now appears only
 * when something is genuinely wrong, and what counts as wrong differs by role.
 *
 * **Providers** (`shouldGateLocation`) are gated when
 *
 *   - we cannot locate them (device location off, or permission not granted), or
 *   - they have no service area.
 *
 * The second clause is not a nicety. A provider with no `service_area_center`
 * is excluded from every PostGIS dispatch broadcast: online, verified,
 * subscribed, receiving nothing, permanently, with nothing on screen saying
 * why. That is worse than a stale centre, so it gates even when location works
 * perfectly.
 *
 * **Consumers** (`shouldGateConsumerLocation`) are gated only when they have no
 * saved address, or the address lookup failed. A consumer with an address is
 * never gated, whatever the device's location says: bookings use the
 * address's coordinates, not the phone's, so device location is not needed to
 * book. The stale-address case (saved in Pune, standing in Mumbai) is left to
 * the LocationBar, which shows the address in use on every screen.
 */

export interface GateInputs {
  /** Has the user already answered this launch? */
  confirmed: boolean;
  /** Can we locate them? Null while the probe is still running. */
  blocked: boolean | null;
  /**
   * Do they have a location on file — a saved address (consumer) or a service
   * area (provider)? Null while still loading.
   */
  hasOwnLocation: boolean | null;
}

export type GateVerdict = "wait" | "gate" | "pass";

/**
 * `wait` means "not yet" — hold off on the gate.
 *
 * What the caller shows meanwhile depends on which answer is missing. A
 * fast one (does this user have a saved address?) is worth a spinner. The
 * location probe is not: on a cold GPS it can take seconds, so the app renders
 * normally while it runs and the gate appears only if the answer comes back
 * negative.
 *
 * Never render the gate on a half-resolved answer. Doing so flashes it at
 * users who never needed to see it — the exact complaint this whole change
 * exists to fix.
 */
export function shouldGateLocation({
  confirmed,
  blocked,
  hasOwnLocation,
}: GateInputs): GateVerdict {
  if (confirmed) return "pass";
  if (blocked === null || hasOwnLocation === null) return "wait";
  return blocked || !hasOwnLocation ? "gate" : "pass";
}

/**
 * The consumer rule. `hasOwnLocation` is "has a saved address"; a failed
 * lookup is passed as `false`, so it gates like no address.
 *
 * A saved address is enough to pass — `blocked` is not consulted, so the
 * location probe never holds them up or gates them (see the header).
 *
 * Without one, the verdict still waits for the probe. The gate's copy depends
 * on its answer (location off, permission refused, not asked yet), and opening
 * the gate before it lands would show the wrong remedy.
 */
export function shouldGateConsumerLocation({
  confirmed,
  blocked,
  hasOwnLocation,
}: GateInputs): GateVerdict {
  if (confirmed) return "pass";
  if (hasOwnLocation === null) return "wait";
  if (hasOwnLocation) return "pass";
  return blocked === null ? "wait" : "gate";
}
