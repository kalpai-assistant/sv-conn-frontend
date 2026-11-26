/**
 * When the launch gate appears (SVC-281).
 *
 * The correction this encodes: the gate used to appear on every launch, for
 * everyone, and the complaint was exactly that. It must now stay out of the
 * way of anyone we can actually locate.
 */
import { describe, expect, it } from "vitest";
import { shouldGateConsumerLocation, shouldGateLocation } from "@/lib/should-gate-location";

/** A user we can locate, who has a location on file. The common case. */
const FINE = { confirmed: false, blocked: false, hasOwnLocation: true };

describe("the whole point of the correction", () => {
  it("does not appear for a user we can locate", () => {
    // If this ever goes back to "gate", every user is being asked on every
    // launch again — which is the bug, not the feature.
    expect(shouldGateLocation(FINE)).toBe("pass");
  });
});

describe("when we cannot locate them", () => {
  it("gates, even though they have a location on file", () => {
    // A saved address is not proof they are still near it, and this is the
    // case Zepto's sheet covers: location off, app otherwise fine.
    expect(shouldGateLocation({ ...FINE, blocked: true })).toBe("gate");
  });
});

describe("when they have no location on file", () => {
  it("gates, even though we can locate them perfectly", () => {
    // The clause that is easy to drop as redundant. It is not: for a provider
    // this is the difference between receiving jobs and receiving none, ever.
    // No service_area_center means the PostGIS dispatch query excludes them
    // from every broadcast, silently.
    expect(shouldGateLocation({ ...FINE, hasOwnLocation: false })).toBe("gate");
  });

  it("gates when both are wrong", () => {
    expect(shouldGateLocation({ confirmed: false, blocked: true, hasOwnLocation: false })).toBe(
      "gate",
    );
  });
});

describe("before the answers arrive", () => {
  it("waits rather than guessing, while the location probe runs", () => {
    // Rendering the gate on a half-resolved answer would flash it at users who
    // never needed it — the same complaint, reintroduced as a flicker.
    expect(shouldGateLocation({ ...FINE, blocked: null })).toBe("wait");
  });

  it("waits while the saved locations are still loading", () => {
    expect(shouldGateLocation({ ...FINE, hasOwnLocation: null })).toBe("wait");
  });

  it("gates rather than waiting when a location lookup failed outright", () => {
    // Callers pass `false`, not `null`, when the fetch errored. Staying on
    // `null` would spin forever once React Query stops retrying — the same
    // lockout shape as #121, and offline is exactly when it happens. Gating is
    // safe here because the gate's manual entry needs no network.
    expect(shouldGateLocation({ ...FINE, hasOwnLocation: false })).toBe("gate");
  });

  it("does not wait once the user has answered", () => {
    // Someone who just tapped "yes, I'm here" must not be dropped back onto a
    // spinner because an unrelated query is refetching.
    expect(shouldGateLocation({ confirmed: true, blocked: null, hasOwnLocation: null })).toBe(
      "pass",
    );
  });
});

describe("once answered", () => {
  it("stays out of the way for the rest of the launch", () => {
    // The gate dismissing and then returning would lock the user in a loop —
    // the shape of the bug that shipped in #121.
    expect(shouldGateLocation({ confirmed: true, blocked: true, hasOwnLocation: false })).toBe(
      "pass",
    );
  });
});

/**
 * The consumer rule. The provider rule above is unchanged; consumers have
 * their own, because a consumer books against a saved address's coordinates,
 * not the phone's position.
 */
describe("consumers", () => {
  const WITH_ADDRESS = { confirmed: false, blocked: false, hasOwnLocation: true };

  it("passes a consumer with an address even when we cannot locate them", () => {
    // The change: location off or permission not granted no longer gates
    // someone who can book anyway. The stale-city case is left to the
    // LocationBar.
    expect(shouldGateConsumerLocation({ ...WITH_ADDRESS, blocked: true })).toBe("pass");
  });

  it("passes a consumer with an address whom we can locate", () => {
    expect(shouldGateConsumerLocation(WITH_ADDRESS)).toBe("pass");
  });

  it("does not wait on the location probe when they have an address", () => {
    expect(shouldGateConsumerLocation({ ...WITH_ADDRESS, blocked: null })).toBe("pass");
  });

  it("gates a consumer with no address whom we cannot locate", () => {
    expect(
      shouldGateConsumerLocation({ ...WITH_ADDRESS, blocked: true, hasOwnLocation: false }),
    ).toBe("gate");
  });

  it("gates a consumer with no address even when we can locate them", () => {
    // Nothing to book against: the gate is how they get an address.
    expect(shouldGateConsumerLocation({ ...WITH_ADDRESS, hasOwnLocation: false })).toBe("gate");
  });

  it("gates when the address lookup failed (passed as false)", () => {
    // As before: a failed fetch must not spin forever (#121, SVC-351).
    expect(
      shouldGateConsumerLocation({ confirmed: false, blocked: true, hasOwnLocation: false }),
    ).toBe("gate");
  });

  it("waits for the probe before gating a consumer with no address", () => {
    // The gate's copy depends on the probe's answer; opening before it lands
    // would name the wrong remedy.
    expect(
      shouldGateConsumerLocation({ ...WITH_ADDRESS, blocked: null, hasOwnLocation: false }),
    ).toBe("wait");
  });

  it("waits while the addresses are still loading", () => {
    expect(shouldGateConsumerLocation({ ...WITH_ADDRESS, hasOwnLocation: null })).toBe("wait");
  });

  it("stays out of the way once answered", () => {
    expect(
      shouldGateConsumerLocation({ confirmed: true, blocked: true, hasOwnLocation: false }),
    ).toBe("pass");
  });
});
