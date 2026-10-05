/**
 * Home's promo banner strip.
 *
 * Content is hardcoded for beta. Once the backend ships a /promos endpoint
 * we'll swap the constant for a query — until then, hardcoding lets us
 * show only offers the app can actually honour. Right now that's the
 * first-booking coupon (FIRST20, seeded 2026-09-10 with 20% off / ₹200
 * cap / min ₹499 / 90-day window).
 *
 * The "Refer & earn" banner used to live here too but was removed
 * (SVC-280) once we noticed the referral programme was never actually
 * built — the CTA led to /profile and did nothing. Re-add when the
 * feature ships.
 *
 * Horizontal snap scroll, one banner per screen — using CSS scroll-snap so
 * the sequencing feels intentional on iOS without any JS.
 *
 * Tap behaviour (SVC-310 follow-up): shares ``BannerDestination`` with
 * ``HeroBanner``. The hero slot is occasional (festival-weeks only); this
 * strip is always-on, so the "FIRST20 tap did nothing" bug stays fixed on
 * the surface users actually see day-to-day. A card with no ``destination``
 * is still rendered — gives us the shape to add greeting-only cards later
 * without reaching for a fake ``ctaTo: "/"``.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart-context";
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
    id: "first20",
    headline: "20% off your first booking",
    body: "Use FIRST20 at checkout — min ₹499.",
    ctaLabel: "Apply FIRST20",
    gradient: "from-primary to-primary/70",
    // Tap hands FIRST20 to /cart via the same ?coupon= handoff the hero
    // banner uses; the cart route opens CouponsSheet pre-filled and
    // auto-applies through POST /coupons/validate.
    destination: { kind: "coupon", value: "FIRST20" },
  },
];

export function PromoCarousel() {
  const navigate = useNavigate();
  const { items } = useCart();

  const onCouponTap = (code: string) => {
    // Mirror the hero banner's empty-cart path: the coupons sheet needs a
    // subtotal, and ``cart_amount: 0`` 400s backend-side. Toast and stay
    // put rather than drop the user on an empty cart that silently rejects.
    if (items.length === 0) {
      toast(`Add items to cart to redeem ${code}`);
      return;
    }
    void navigate({ to: "/cart", search: { coupon: code } });
  };

  return (
    <div className="pb-2">
      <div
        // Scroll snap keeps the banner alignment tidy without JS. `pl-4`
        // (not `px-4`) so the first item starts at the same left inset as
        // the section headers above; final banner gets its right inset
        // from an inline gutter div below.
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pl-4 scrollbar-none"
      >
        {BANNERS.map((b) => (
          <PromoBannerCard key={b.id} banner={b} onCouponTap={onCouponTap} />
        ))}
        {/* Right-side gutter so the last banner's edge shadow isn't clipped. */}
        <div className="w-4 shrink-0" aria-hidden />
      </div>
    </div>
  );
}

interface PromoBannerCardProps {
  banner: PromoBanner;
  onCouponTap: (code: string) => void;
}

/**
 * Pulled out of ``PromoCarousel`` so the four destination branches aren't
 * nested two deep inside a ``.map()`` — each branch returns the card
 * wrapped in the matching element (``<Link>``, ``<a>``, ``<button>``, or a
 * bare ``<div>``). Keeps the branching readable and testable per-card
 * without rendering the whole strip.
 */
export function PromoBannerCard({ banner, onCouponTap }: PromoBannerCardProps) {
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

  // destination.kind === "coupon"
  const code = destination.value;
  return (
    <button
      type="button"
      onClick={() => onCouponTap(code)}
      className={`${frameClass} ${interactiveClass} text-left`}
      style={frameStyle}
      aria-label={`${banner.headline}. Apply coupon ${code}`}
    >
      {inner}
    </button>
  );
}
