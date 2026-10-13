/**
 * Full-width hero banner slot on Home.
 *
 * For festival / campaign artwork that deserves the top position, above the
 * category rail — Urban Company's Ganesh/Diwali/Holi banners are the
 * reference. Renders nothing when no banner in ``BANNERS`` is currently
 * inside its ``activeFrom``/``activeUntil`` window, so the slot never shows
 * a stale banner if we forget to remove one.
 *
 * Hardcoded config today; once we ship more than a handful of these, this
 * moves to a ``/banners`` endpoint on the backend so marketing can toggle
 * without a release. Same pattern the promo carousel is expected to follow
 * (see its docstring).
 *
 * When a banner is active the assumption on the illustration is that its
 * *right two-thirds* is a soft, uncluttered gradient so the overlaid text
 * has somewhere to land — the Gemini prompt used to generate it should
 * enforce that composition. If we ever accept a banner where the artwork
 * is centred / full-bleed, add a text position field ("left" | "right" |
 * "center") to the config so the layout can pivot without special-casing.
 *
 * Tap behaviour: a banner with no ``destination`` is a decorative no-op —
 * a plain ``<div role="img">`` with no handler and no press feedback, so a
 * Ganesh-style festival greeting doesn't fake tappability. When a
 * destination is set the banner is wrapped in the matching element —
 * ``<Link>`` for an in-app route, ``<a target="_blank">`` for an external
 * URL, and a ``<button>`` for the four coupon-anchored flows.
 *
 * SVC-347 added three new ``coupon-*`` ``kind``s and reworked the original
 * ``coupon`` branch so an empty-cart tap stashes via ``pendingCouponStore``
 * instead of toasting a dead end — the cart's new boot-hook turns the
 * stashed code into a sticky "will apply when you add items" row. All four
 * coupon flows go through ``useCouponBannerHandlers`` so this file and
 * ``PromoCarousel`` cannot drift. See ``frontend/docs/coupons.md`` for the
 * full handler model.
 */
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useServices } from "@/hooks/useApi";
import { useCouponBannerHandlers } from "./coupon-banner-handlers";
import type { BannerDestination } from "./banner-destination";

export interface HeroBannerConfig {
  id: string;
  /** Path under ``public/images/banners/`` — asset must exist at build
   *  time. Keep it WebP at 512-height / 1024-width (~2:1) so the payload
   *  stays under ~80KB like the category tiles. */
  image: string;
  title: string;
  /** Optional single-line subtitle rendered below the title. Keep short
   *  — anything over ~40 chars will wrap awkwardly on a 375px screen. */
  subtitle?: string;
  /** Visible CTA pill. Only rendered when ``destination`` is set — a
   *  decorative banner showing "Apply FIRST20 →" with no handler would
   *  be a lie. */
  ctaLabel?: string;
  /** Inclusive-inclusive window, ISO date strings. A banner shows on
   *  the day that equals ``activeFrom`` and on the day that equals
   *  ``activeUntil``, and every day in between. */
  activeFrom: string;
  activeUntil: string;
  /** Omitted for decorative banners (festival greetings with no offer
   *  behind them). When set, the banner becomes tappable and the
   *  render branch for the ``kind`` drives where the tap goes. */
  destination?: BannerDestination;
}

const BANNERS: HeroBannerConfig[] = [
  {
    id: "ganesh-chaturthi-2026",
    image: "/images/banners/ganesh-chaturthi-2026.webp",
    title: "Happy Ganesh Chaturthi",
    subtitle: "Use FIRST20 for 20% off your first booking",
    ctaLabel: "Apply FIRST20",
    // Ganesh Chaturthi 2026 runs Sep 6-17. Buffer to the 18th so the
    // banner is up through Anant Chaturdashi evening and quietly retires
    // the next morning without needing a code change.
    activeFrom: "2026-09-06",
    activeUntil: "2026-09-18",
    // The subtitle promotes FIRST20, so a tap applies the coupon on the
    // cart. A future purely-festive banner (greeting only, no offer) can
    // leave this undefined and the slot becomes a decorative image.
    destination: { kind: "coupon", value: "FIRST20" },
  },
];

export function pickActiveBanner(
  now: Date,
  banners: readonly HeroBannerConfig[],
): HeroBannerConfig | null {
  // ISO date compare — strings sort lexicographically the same way dates
  // do when zero-padded, which they always are in ISO. Avoids Date-object
  // timezone gotchas: "2026-09-13" < "2026-09-18" is exactly the check we
  // want, regardless of the user's local offset.
  const today = now.toISOString().slice(0, 10);
  return banners.find((b) => b.activeFrom <= today && today <= b.activeUntil) ?? null;
}

export function HeroBanner() {
  const banner = pickActiveBanner(new Date(), BANNERS);
  if (!banner) return null;
  return <HeroBannerView banner={banner} />;
}

/**
 * Separated from ``HeroBanner`` so the active-window pick isn't entangled
 * with the four render branches — makes the render logic unit-testable
 * without having to mock ``Date``.
 */
export function HeroBannerView({ banner }: { banner: HeroBannerConfig }) {
  const handlers = useCouponBannerHandlers();
  // The catalogue is already fetched on Home by PopularSection; this hook
  // reads the same cache, so the common case is a hit. The isFetched flag
  // only matters for the first-paint window of a cold reload directly on
  // Home — a tap in that window on a `coupon-prefill-cart` banner shows a
  // spinner until the services query lands.
  const { data: services } = useServices();
  const catalogueReady = services !== undefined;

  // 2:1 ratio — banner-shape without eating too much vertical real
  // estate above the fold. On a 375px screen this renders ~172px tall,
  // which reads as "important content" rather than "small notice".
  const frameStyle = { aspectRatio: "2 / 1" } as const;
  const frameClass = "relative block overflow-hidden rounded-2xl";
  // Press-feedback only when there is somewhere to go. Matches the
  // button scale on CategoryRail tiles — grep active:scale to see the
  // existing convention — so the affordance reads as a tap target.
  const interactiveClass = "transition-transform active:scale-[0.98]";

  const inner = (
    <>
      <img
        src={banner.image}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
        decoding="async"
      />
      {/* Text sits on the right two-thirds of the frame, matching the
          composition brief we give the illustrator. Left-to-right dark
          gradient in case the artwork's right side is a light gradient
          wash — belt-and-suspenders for text contrast. */}
      <div className="absolute inset-y-0 right-0 flex w-2/3 flex-col justify-center px-5 text-white">
        <p className="text-xl font-bold leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {banner.title}
        </p>
        {banner.subtitle && (
          <p className="mt-1 text-sm leading-snug text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
            {banner.subtitle}
          </p>
        )}
        {/* The CTA pill shows only when there's actually somewhere to go.
            Rendering "Apply FIRST20 →" on a decorative banner would be
            an untruthful affordance. */}
        {banner.ctaLabel && banner.destination && (
          <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-white/25 px-3 py-1 text-xs font-medium backdrop-blur">
            {banner.ctaLabel} →
          </span>
        )}
      </div>
    </>
  );

  // Decorative-only: no handler, no ripple, no key-activation. ``role="img"``
  // + ``aria-label`` with the title gives a screen reader the honest
  // description — "image: Happy Ganesh Chaturthi" — instead of leaking the
  // inner <img>'s empty alt as the whole slot's a11y name.
  if (!banner.destination) {
    return (
      <div className="px-4 pb-4">
        <div className={frameClass} style={frameStyle} role="img" aria-label={banner.title}>
          {inner}
        </div>
      </div>
    );
  }

  const destination = banner.destination;

  if (destination.kind === "route") {
    return (
      <div className="px-4 pb-4">
        <Link
          to={destination.value}
          className={`${frameClass} ${interactiveClass}`}
          style={frameStyle}
          aria-label={banner.title}
        >
          {inner}
        </Link>
      </div>
    );
  }

  if (destination.kind === "external") {
    return (
      <div className="px-4 pb-4">
        <a
          href={destination.value}
          target="_blank"
          rel="noopener noreferrer"
          className={`${frameClass} ${interactiveClass}`}
          style={frameStyle}
          aria-label={banner.title}
        >
          {inner}
        </a>
      </div>
    );
  }

  // Below: the four coupon-* flows (SVC-347). Each wraps the same inner
  // frame in a <button>; only the onClick handler and the a11y label vary.
  // Factoring the button out keeps the branches each about one tap-handler
  // line long.
  const renderCouponButton = (onTap: () => void, ariaLabel: string, disabled = false) => (
    <div className="px-4 pb-4">
      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        className={`${frameClass} ${interactiveClass} w-full text-left disabled:cursor-progress`}
        style={frameStyle}
        aria-label={ariaLabel}
      >
        {inner}
        {disabled && (
          // Spinner overlay for the "catalogue still hydrating" case on
          // `coupon-prefill-cart`. Positioned on the same CTA pill area
          // the tap target lives on, so the "we heard you" affordance is
          // honest — the tap didn't noop, it's waiting on data.
          <span className="absolute bottom-5 right-5 flex h-6 w-6 items-center justify-center rounded-full bg-white/25 backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
          </span>
        )}
      </button>
    </div>
  );

  if (destination.kind === "coupon") {
    const code = destination.value;
    return renderCouponButton(
      () => handlers.onCoupon(code),
      `${banner.title}. Apply coupon ${code}`,
    );
  }

  if (destination.kind === "coupon-prefill-cart") {
    const { code, items } = destination;
    // When the catalogue hasn't landed yet, resolving `items` to Services
    // would skip them all — show a spinner instead of silently noop-ing.
    return renderCouponButton(
      () => (catalogueReady ? handlers.onCouponPrefill(code, items) : undefined),
      `${banner.title}. Add ${items.length} ${items.length === 1 ? "item" : "items"} and apply coupon ${code}`,
      !catalogueReady,
    );
  }

  if (destination.kind === "coupon-stash") {
    const { code, navigateTo } = destination;
    return renderCouponButton(
      () => handlers.onCouponStash(code, navigateTo),
      `${banner.title}. Save coupon ${code} for later`,
    );
  }

  // destination.kind === "coupon-category"
  const { code, categorySlug } = destination;
  return renderCouponButton(
    () => handlers.onCouponCategory(code, categorySlug),
    `${banner.title}. Browse ${categorySlug} with coupon ${code}`,
  );
}
