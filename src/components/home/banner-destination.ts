/**
 * Where tapping a home-screen promotional banner takes the user.
 *
 * Shared by ``HeroBanner`` (occasional, full-width festival/campaign slot)
 * and ``PromoCarousel`` (always-on horizontal card strip) so a new
 * destination ``kind`` added for one is automatically supported by the
 * other — the "coupon tap handler lives in two places" bug from SVC-310
 * stays fixed as the shape grows.
 *
 * Discriminated by ``kind`` rather than sniffing ``value`` — the renderer
 * can switch on ``kind`` directly without regex-matching URL shapes,
 * which was how the pre-SVC-310 code decided (badly) what to do with
 * ``ctaTo``.
 *
 * SVC-347 added three ``coupon-*`` variants that all share one abstraction
 * — ``src/lib/pending-coupon.ts`` — so empty-cart taps never dead-end again
 * and so a new coupon-anchored campaign is a config change, not a new code
 * path. See ``frontend/docs/coupons.md`` for the full handler model.
 */

/** One line a ``coupon-prefill-cart`` tap drops into the cart via
 *  ``cart.addMany``. The service id must exist in the catalogue at tap
 *  time; variant + quantity match the shape ``cart.add()`` would take if
 *  the user had added the service by hand from the service sheet. */
export interface PrefillItem {
  serviceId: string;
  variantId?: string;
  quantity?: number;
}

export type BannerDestination =
  // The original SVC-310 flow: hand a code to /cart via ?coupon= and
  // auto-apply through CouponsSheet. The empty-cart branch no longer
  // dead-ends (SVC-347 §7) — it stashes via pendingCouponStore so the
  // sticky "will apply when you add items" row renders instead.
  | { kind: "coupon"; value: string }
  // SVC-347: hydrate the cart with named line items, then stash + navigate.
  // Enables service-anchored promos ("Weekend deep cleaning: tap to add +
  // apply") without a backend coupon.allowed_service_ids field — the flow
  // provides the services, and `/coupons/validate` enforces min-order.
  | { kind: "coupon-prefill-cart"; code: string; items: PrefillItem[] }
  // SVC-347: stash a code and land the user wherever makes sense for the
  // campaign. Default `navigateTo` is `/` — the referral-reward kind that
  // just wants the user back in the browse funnel.
  | { kind: "coupon-stash"; code: string; navigateTo?: string }
  // SVC-347: stash + navigate into a category. "20% off all Spa services"
  // without hardcoding which specific service the user books.
  | { kind: "coupon-category"; code: string; categorySlug: string }
  | { kind: "route"; value: string }
  | { kind: "external"; value: string };
