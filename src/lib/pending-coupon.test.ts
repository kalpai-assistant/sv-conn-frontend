/**
 * `pendingCouponStore` round-trip + the SVC-350 free-teardown guarantee.
 *
 * The second describe matters more than the first: the whole reason this
 * module uses `sc_` is so logout wipes it for free via `clearSession`. If
 * that integration ever regresses the sticky row would stale across user
 * accounts on a shared device, which is a DPDP-adjacent leak (the stashed
 * code may encode a referral — i.e. another user's identity).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  clearPendingCoupon,
  getPendingCoupon,
  pendingCouponKey,
  setPendingCoupon,
} from "./pending-coupon";
import { clearSession } from "./session";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("round-trip", () => {
  it("stores and reads back a code under the user-scoped key", () => {
    setPendingCoupon("user-A", "FIRST20");
    expect(getPendingCoupon("user-A")).toBe("FIRST20");
    // The key shape is load-bearing (SVC-350 sweeps by prefix) — assert it
    // explicitly so a rename shows up in review.
    expect(window.localStorage.getItem("sc_pending_coupon_v1_user-A")).toBe("FIRST20");
  });

  it("upper-cases and trims on set so a round-trip is idempotent on casing", () => {
    setPendingCoupon("user-A", "  first20  ");
    expect(getPendingCoupon("user-A")).toBe("FIRST20");
  });

  it("isolates per-user — one user's stash cannot read as another's", () => {
    setPendingCoupon("user-A", "FIRST20");
    setPendingCoupon("user-B", "DIWALI");
    expect(getPendingCoupon("user-A")).toBe("FIRST20");
    expect(getPendingCoupon("user-B")).toBe("DIWALI");
  });

  it("clear removes the key", () => {
    setPendingCoupon("user-A", "FIRST20");
    clearPendingCoupon("user-A");
    expect(getPendingCoupon("user-A")).toBeNull();
  });

  it("get returns null for a never-set user", () => {
    expect(getPendingCoupon("user-ghost")).toBeNull();
  });

  it("no-ops when userId is undefined — pre-auth banner taps don't throw", () => {
    expect(pendingCouponKey(undefined)).toBeNull();
    setPendingCoupon(undefined, "FIRST20");
    expect(getPendingCoupon(undefined)).toBeNull();
    // The write didn't land anywhere — no key leak into localStorage.
    expect(window.localStorage.length).toBe(0);
  });

  it("ignores an empty code — a cleared input doesn't poison the stash", () => {
    setPendingCoupon("user-A", "   ");
    expect(getPendingCoupon("user-A")).toBeNull();
  });
});

describe("SVC-350 free teardown", () => {
  // The reason this module uses the `sc_` prefix: logout's existing
  // `clearSession` sweep should pick up the pending-coupon key automatically.
  // A new user signing in on the same device must never inherit the previous
  // user's stash.
  it("is wiped by clearSession alongside the rest of the user-scoped keys", () => {
    setPendingCoupon("user-A", "FIRST20");
    expect(getPendingCoupon("user-A")).toBe("FIRST20");

    // clearSession takes a QueryClient — we don't exercise that side here,
    // we only care that the localStorage sweep catches our key.
    clearSession(new QueryClient());

    expect(getPendingCoupon("user-A")).toBeNull();
    expect(window.localStorage.getItem("sc_pending_coupon_v1_user-A")).toBeNull();
  });
});
