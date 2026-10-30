/**
 * Home's promo banner strip.
 *
 * Content is hardcoded for beta. Once the backend ships a /promos endpoint
 * we'll swap the constant for a query — until then, hardcoding lets us
 * show only offers the app can actually honour. Right now that's EXPO25
 * (25% off, ₹500 cap, min ₹299, until 2026-11-02) and FIRST100 (₹100 off,
 * min ₹299, until 2026-11-28), both added 2026-10-30. FIRST20 (2026-09-10)
 * is retired and deactivated in the DB.
 *
 * A coupon card shows only while its code is in the user's
 * ``GET /coupons/available`` list, the same list the cart's coupon sheet
 * reads. So a card disappears on its own when the coupon expires, is
 * deactivated, or the user has used it up, instead of advertising a code the
 * cart would then refuse ("Coupon not applicable").
 *
 * The "Refer & earn" banner used to live here too but was removed
 * (SVC-280) once we noticed the referral programme was never actually
 * built — the CTA led to /profile and did nothing. Re-add when the
 * feature ships.
 *
 * Horizontal snap scroll, one banner per screen — using CSS scroll-snap so
 * the sequencing feels intentional on iOS without any JS.
 *
 * Tap behaviour: shares ``BannerDestination`` with ``HeroBanner``. The
 * hero slot is occasional (festival-weeks only); this strip is always-on,
 * so the "FIRST20 tap did nothing" bug stays fixed on the surface users
 * actually see day-to-day. A card with no ``destination`` is still
 * rendered — gives us the shape to add greeting-only cards later without
 * reaching for a fake ``ctaTo: "/"``.
 *
 * SVC-347: coupon flows (``kind`` ``coupon`` / ``coupon-prefill-cart`` /
 * ``coupon-stash`` / ``coupon-category``) all go through
 * ``useCouponBannerHandlers`` so this file and ``HeroBanner`` cannot drift.
 * The pre-SVC-347 empty-cart dead-end (toast + stay) is gone — a tap on
 * an empty cart now stashes via ``pendingCouponStore`` and the cart's
 * boot-hook turns it into a sticky "will apply when you add items" row.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import { useServices } from "@/hooks/useApi";
import { useAvailableCoupons } from "@/hooks/useCoupons";
import { useCouponBannerHandlers } from "./coupon-banner-handlers";
import type { BannerDestination } from "./banner-destination";

interface PromoBanner {
  id: string;
  headline: string;
  body: string;
  ctaLabel: string;
  // Simple background gradient token — kept small so the banners never
  // outshine the categories directly above them.
  gradient: string;
  /** Omit to render the card as a non-interactive promo tile (no handler,
   *  no scale on press). Set to drive the tap through the matching
   *  render branch — coupon code, in-app route, or external URL. */
  destination?: BannerDestination;
}

const BANNERS: PromoBanner[] = [
  {
    id: "expo25",
    headline: "25% off your booking",
    body: "Use EXPO25 at checkout — up to ₹500 off, min ₹299.",
    ctaLabel: "Apply EXPO25",
    gradient: "from-primary to-primary/70",
    // Tap hands the code to /cart via the same ?coupon= handoff the hero
    // banner uses; the cart route opens CouponsSheet pre-filled and
    // auto-applies through POST /coupons/validate.
    destination: { kind: "coupon", value: "EXPO25" },
  },
  {
    id: "first100",
    headline: "₹100 off your booking",
    body: "Use FIRST100 at checkout — min ₹299.",
    ctaLabel: "Apply FIRST100",
    gradient: "from-primary to-primary/70",
    destination: { kind: "coupon", value: "FIRST100" },
  },
];

/** The coupon code a banner applies, or null for a non-coupon banner. */
function bannerCouponCode(destination: BannerDestination | undefined): string | null {
  if (!destination) return null;
  if (destination.kind === "coupon") return destination.value;
  if (destination.kind === "route" || destination.kind === "external") return null;
  return destination.code;
}

/**
 * Coupon banners whose code the user can apply today, plus every non-coupon
 * banner. Until the list loads (or if it fails) no coupon banner shows: a
 * strip that appears late is better than one advertising a code the cart
 * refuses.
 */
export function visibleBanners(
  banners: readonly PromoBanner[],
  available: readonly { code: string }[] | undefined,
): PromoBanner[] {
  const codes = new Set((available ?? []).map((c) => c.code.toUpperCase()));
  return banners.filter((b) => {
    const code = bannerCouponCode(b.destination);
    return code === null || codes.has(code.toUpperCase());
  });
}

export function PromoCarousel() {
  const { data: available } = useAvailableCoupons();
  const banners = visibleBanners(BANNERS, available);
  if (banners.length === 0) return null;
  return (
    <div className="pb-2">
      <div
        // Scroll snap keeps the banner alignment tidy without JS. `pl-4`
        // (not `px-4`) so the first item starts at the same left inset as
        // the section headers above; final banner gets its right inset
        // from an inline gutter div below.
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pl-4 scrollbar-none"
      >
        {banners.map((b) => (
          <PromoBannerCard key={b.id} banner={b} />
        ))}
        {/* Right-side gutter so the last banner's edge shadow isn't clipped. */}
        <div className="w-4 shrink-0" aria-hidden />
      </div>
    </div>
  );
}

interface PromoBannerCardProps {
  banner: PromoBanner;
}

/**
 * Pulled out of ``PromoCarousel`` so the four destination branches aren't
 * nested two deep inside a ``.map()`` — each branch returns the card
 * wrapped in the matching element (``<Link>``, ``<a>``, ``<button>``, or a
 * bare ``<div>``). Keeps the branching readable and testable per-card
 * without rendering the whole strip.
 */
export function PromoBannerCard({ banner }: PromoBannerCardProps) {
  const handlers = useCouponBannerHandlers();
  // Catalogue hydration check for `coupon-prefill-cart` — see the twin note
  // in HeroBanner. On the always-on strip the services query is virtually
  // always ready by the time a user scrolls past, but we still gate the
  // tap so the "I tapped but nothing happened" bug doesn't creep back on
  // a cold reload directly on Home.
  const { data: services } = useServices();
  const catalogueReady = services !== undefined;
  // 84% of the viewport so the next banner peeks in — the visual cue that
  // scroll exists, without needing an indicator row.
  const frameStyle = { width: "84%" } as const;
  const frameClass = `shrink-0 snap-start rounded-2xl bg-gradient-to-br ${banner.gradient} p-5 text-primary-foreground shadow-sm`;
  // Matches the press feedback the hero banner's interactive branches use
  // — same affordance for the same promise ("this is tappable").
  const interactiveClass = "transition-transform active:scale-[0.98]";

  const inner = (
    <>
      <p className="text-base font-semibold leading-snug">{banner.headline}</p>
      <p className="mt-1 text-sm text-primary-foreground/85">{banner.body}</p>
      {/* CTA pill is wired to destination presence, not just ctaLabel —
          a decorative card advertising "Apply FIRST20 →" with no handler
          is the exact lie SVC-310 fixed on the hero banner. */}
      {banner.destination && (
        <div className="mt-3 inline-flex items-center gap-1 text-sm font-medium">
          {banner.ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
        </div>
      )}
    </>
  );

  if (!banner.destination) {
    return (
      <div className={frameClass} style={frameStyle} role="img" aria-label={banner.headline}>
        {inner}
      </div>
    );
  }

  const destination = banner.destination;

  if (destination.kind === "route") {
    return (
      <Link
        to={destination.value}
        className={`${frameClass} ${interactiveClass} block`}
        style={frameStyle}
        aria-label={banner.headline}
      >
        {inner}
      </Link>
    );
  }

  if (destination.kind === "external") {
    return (
      <a
        href={destination.value}
        target="_blank"
        rel="noopener noreferrer"
        className={`${frameClass} ${interactiveClass} block`}
        style={frameStyle}
        aria-label={banner.headline}
      >
        {inner}
      </a>
    );
  }

  // Below: the four coupon-* flows (SVC-347). Same pattern as HeroBanner —
  // same inner frame, only the onClick + a11y label differ, with a spinner
  // overlay when the catalogue isn't ready for a prefill flow.
  const renderCouponButton = (onTap: () => void, ariaLabel: string, disabled = false) => (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={`${frameClass} ${interactiveClass} relative text-left disabled:cursor-progress`}
      style={frameStyle}
      aria-label={ariaLabel}
    >
      {inner}
      {disabled && (
        <span className="absolute bottom-4 right-4 flex h-6 w-6 items-center justify-center rounded-full bg-white/25 backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
      )}
    </button>
  );

  if (destination.kind === "coupon") {
    const code = destination.value;
    return renderCouponButton(
      () => handlers.onCoupon(code),
      `${banner.headline}. Apply coupon ${code}`,
    );
  }

  if (destination.kind === "coupon-prefill-cart") {
    const { code, items } = destination;
    return renderCouponButton(
      () => (catalogueReady ? handlers.onCouponPrefill(code, items) : undefined),
      `${banner.headline}. Add ${items.length} ${items.length === 1 ? "item" : "items"} and apply coupon ${code}`,
      !catalogueReady,
    );
  }

  if (destination.kind === "coupon-stash") {
    const { code, navigateTo } = destination;
    return renderCouponButton(
      () => handlers.onCouponStash(code, navigateTo),
      `${banner.headline}. Save coupon ${code} for later`,
    );
  }

  // destination.kind === "coupon-category"
  const { code, categorySlug } = destination;
  return renderCouponButton(
    () => handlers.onCouponCategory(code, categorySlug),
    `${banner.headline}. Browse ${categorySlug} with coupon ${code}`,
  );
}
