/**
 * When the launch gate appears (SVC-281).
 *
 * The correction this encodes: the gate used to appear on every launch, for
 * everyone, and the complaint was exactly that. It must now stay out of the
 * way of anyone we can actually locate.
 */
import { describe, expect, it } from "vitest";
import { shouldGateLocation } from "@/lib/should-gate-location";

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
