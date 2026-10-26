import { describe, expect, it } from "vitest";
import { isEdgeSwipeBackBlocked } from "@/lib/edge-swipe";

describe("isEdgeSwipeBackBlocked", () => {
  it("blocks /cart and any nested cart path", () => {
    // Razorpay fires from inside this route — the whole dwell is marked unsafe
    // for a swipe, not just the ephemeral native-modal window.
    expect(isEdgeSwipeBackBlocked("/cart")).toBe(true);
    expect(isEdgeSwipeBackBlocked("/cart/anything")).toBe(true);
  });

  it("blocks /invite exactly, not /invitees or /inviterUser", () => {
    // The exact-match guard is deliberate — a future `/invitees` route must
    // not inherit the block.
    expect(isEdgeSwipeBackBlocked("/invite")).toBe(true);
    expect(isEdgeSwipeBackBlocked("/invitees")).toBe(false);
  });

  it("allows the ordinary consumer and provider routes", () => {
    for (const p of ["/", "/bookings", "/activity", "/tracking/abc", "/provider", "/pro"]) {
      expect(isEdgeSwipeBackBlocked(p)).toBe(false);
    }
  });
});
