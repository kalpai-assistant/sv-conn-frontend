/**
 * Which routes belong to which role, and where the nav shows (SVC-273).
 *
 * `isProviderRoute` decides where the Android back button lands when there is
 * nothing left to pop. Getting it wrong is not a crash — the role guard in
 * `__root.tsx` would redirect a misrouted provider to `/provider` anyway — it
 * is a visible bounce through the consumer app, which is exactly the kind of
 * thing that reads as a glitch and is never filed as a bug.
 */
import { describe, expect, it } from "vitest";
import { isBottomNavHidden, isProviderRoute, showsCartFab } from "@/lib/nav-visibility";

describe("telling the two apps apart", () => {
  it("claims the provider root and everything under it", () => {
    expect(isProviderRoute("/provider")).toBe(true);
    expect(isProviderRoute("/provider/bookings")).toBe(true);
    expect(isProviderRoute("/provider/bookings/abc-123")).toBe(true);
    expect(isProviderRoute("/provider/profile")).toBe(true);
  });

  it("leaves consumer routes alone", () => {
    expect(isProviderRoute("/")).toBe(false);
    expect(isProviderRoute("/bookings")).toBe(false);
    expect(isProviderRoute("/profile")).toBe(false);
  });

  it("does not match a route that merely starts with the same letters", () => {
    // `startsWith("/provider")` alone would claim this. No such route exists
    // today, which is precisely why it would be missed later.
    expect(isProviderRoute("/providers-faq")).toBe(false);
  });
});

describe("where the bottom nav hides", () => {
  it("still hides on the full-screen flows that own their own bottom", () => {
    // Unchanged by SVC-273 — listed so removing the provider tabs cannot
    // quietly take the consumer rules with it.
    expect(isBottomNavHidden("/tracking/abc")).toBe(true);
    expect(isBottomNavHidden("/service/plumbing")).toBe(true);
    expect(isBottomNavHidden("/provider/onboarding")).toBe(true);
    expect(isBottomNavHidden("/privacy")).toBe(true);
  });

  it("keeps showing on cart, which is a tab", () => {
    // It used to be hidden here, and the nav painted over Book & Pay (SVC-230).
    expect(isBottomNavHidden("/cart")).toBe(false);
  });
});

describe("the cart FAB invariant", () => {
  it("only appears where the nav does not", () => {
    // Both on one screen is two cart entry points, which is the redundancy the
    // Cart tab was added to remove.
    const fabRoutes = ["/service/plumbing", "/service/deep-clean"];
    for (const route of fabRoutes) {
      expect(showsCartFab(route)).toBe(true);
      expect(isBottomNavHidden(route)).toBe(true);
    }
  });
});
