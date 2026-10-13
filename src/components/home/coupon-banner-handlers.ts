/**
 * Shared tap handlers for the four coupon-anchored banner ``kind``s.
 *
 * ``HeroBanner`` and ``PromoCarousel`` are two renderers over one
 * ``BannerDestination`` shape, and SVC-347 added three new coupon flows
 * on top of the one SVC-310 shipped. Writing the "stash → navigate" dance
 * inline in both files is how SVC-310's bug came back a second time (the
 * strip rendered a dead ``<Link to="/">`` because the two surfaces drifted);
 * one module keeps them wired to the same handler so the inconsistency
 * can't be recreated.
 *
 * Hook form (``useCouponBannerHandlers``) so the handlers close over the
 * live cart + navigate + current user without the two components having
 * to pass them in. Pure helper functions were tempting but then every
 * caller re-threads the same four deps, which is exactly the shape of
 * mistake the hero/promo drift was.
 *
 * The handlers return nothing — all side-effecting (stash + navigate +
 * maybe addMany). Tests assert against the mocked navigate / cart /
 * localStorage, not against return values.
 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { setPendingCoupon } from "@/lib/pending-coupon";
import type { PrefillItem } from "./banner-destination";

export interface CouponBannerHandlers {
  /** The existing SVC-310 ``kind: "coupon"`` flow. Empty-cart tap no longer
   *  dead-ends (SVC-347 §7) — it stashes via pendingCouponStore so the
   *  cart's sticky row fires on the first add. */
  onCoupon(code: string): void;
  /** ``kind: "coupon-prefill-cart"``. Caller MUST have verified the service
   *  catalogue is hydrated (``useServices().data !== undefined``) before
   *  calling — handler no-ops if the catalogue is empty because
   *  ``cart.addMany`` would skip every item. */
  onCouponPrefill(code: string, items: PrefillItem[]): void;
  /** ``kind: "coupon-stash"``. ``navigateTo`` defaults to ``/`` — the
   *  referral-reward kind that just needs the user back in the browse
   *  funnel so they'll add something. */
  onCouponStash(code: string, navigateTo?: string): void;
  /** ``kind: "coupon-category"``. Lands on ``/category/$slug``, which is
   *  how `src/routes/category.$slug.tsx` is parameterised. */
  onCouponCategory(code: string, categorySlug: string): void;
}

export function useCouponBannerHandlers(): CouponBannerHandlers {
  const navigate = useNavigate();
  const { addMany } = useCart();
  const { user } = useAuth();
  const userId = user?.id;

  const onCoupon = useCallback(
    (code: string) => {
      // Dual-write: stash AND still pass ?coupon= so the existing cart boot
      // path (SVC-310) auto-opens the sheet even if the pending-coupon
      // read races. The cart boot-hook clears the stash on apply, so the
      // code can't double-fire.
      setPendingCoupon(userId, code);
      void navigate({ to: "/cart", search: { coupon: code } });
    },
    [navigate, userId],
  );

  const onCouponPrefill = useCallback(
    (code: string, items: PrefillItem[]) => {
      // Order: addMany FIRST so when the cart boot-hook reads items on
      // mount it already sees them and takes the "auto-open sheet" path
      // (not the "render sticky row" path, which would briefly flash
      // before the items landed).
      const { skipped } = addMany(items);
      if (skipped.length === items.length) {
        // Every item was a stale catalogue id — don't bother navigating
        // the user to an empty cart that pretends the banner worked.
        console.warn("[banner] coupon-prefill-cart dropped every item — nav skipped");
        return;
      }
      setPendingCoupon(userId, code);
      void navigate({ to: "/cart" });
    },
    [addMany, navigate, userId],
  );

  const onCouponStash = useCallback(
    (code: string, navigateTo?: string) => {
      setPendingCoupon(userId, code);
      void navigate({ to: navigateTo ?? "/" });
    },
    [navigate, userId],
  );

  const onCouponCategory = useCallback(
    (code: string, categorySlug: string) => {
      setPendingCoupon(userId, code);
      void navigate({ to: "/category/$slug", params: { slug: categorySlug } });
    },
    [navigate, userId],
  );

  return { onCoupon, onCouponPrefill, onCouponStash, onCouponCategory };
}
