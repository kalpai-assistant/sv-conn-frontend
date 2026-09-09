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
 * `wait` means render a spinner, not the gate. Deciding on a half-resolved
 * answer would flash the gate at users who never needed to see it — which is
 * the exact complaint this change exists to fix, reintroduced as a flicker.
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
