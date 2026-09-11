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
 * ## The rule
 *
 * The gate used to appear on every launch, for everyone. It now appears only
 * when something is genuinely wrong:
 *
 *   - we cannot locate them (device location off, or permission not granted), or
 *   - they have nothing to fall back on — a consumer with no saved address, a
 *     provider with no service area.
 *
 * The second clause is not a nicety. A provider with no `service_area_center`
 * is excluded from every PostGIS dispatch broadcast: online, verified,
 * subscribed, receiving nothing, permanently, with nothing on screen saying
 * why. That is worse than a stale centre, so it gates even when location works
 * perfectly.
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
 * location probe is not: it can take seconds, because it is the call that
 * raises the native permission dialog, so the app renders normally while it
 * runs and the gate appears only if the answer comes back negative.
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
