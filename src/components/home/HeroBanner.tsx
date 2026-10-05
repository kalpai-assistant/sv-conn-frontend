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
 * Tap behaviour (SVC-310): a banner with no ``destination`` is a
 * decorative no-op — a plain ``<div role="img">`` with no handler and no
 * press feedback, so a Ganesh-style festival greeting doesn't fake
 * tappability. When a destination is set the banner is wrapped in the
 * matching element — ``<Link>`` for an in-app route, ``<a target="_blank">``
 * for an external URL, and a ``<button>`` for a coupon code that drives
 * the cart's existing coupon-apply flow. The coupon branch toasts and
 * stays on Home if the cart is empty — the coupons sheet needs a
 * subtotal, and silently landing on an empty cart would strand the user.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCart } from "@/lib/cart-context";

/**
 * Where tapping a hero banner takes the user. Discriminated union — each
 * ``kind`` restricts ``value`` to one thing semantically (a coupon code, an
 * in-app route, or an external URL), and the render branches below use the
 * ``kind`` directly instead of sniffing the string shape.
 *
 * Exported so adding a banner elsewhere gets autocomplete on the three
 * supported shapes rather than silently falling back to any-typed strings.
 */
export type HeroBannerDestination =
  | { kind: "coupon"; value: string }
  | { kind: "route"; value: string }
  | { kind: "external"; value: string };

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
  destination?: HeroBannerDestination;
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
  const navigate = useNavigate();
  const { items } = useCart();

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

  // destination.kind === "coupon"
  const code = destination.value;
  const onTap = () => {
    // Coupons apply against a cart subtotal — opening the sheet on an
    // empty cart would drop the user on a screen where there is nothing
    // to redeem the code against, and the backend ``/coupons/validate``
    // call would 400 on ``cart_amount: 0``. Tell them what's missing
    // instead and keep them on Home.
    if (items.length === 0) {
      toast(`Add items to cart to redeem ${code}`);
      return;
    }
    // Hand the code off to /cart as a search param. The cart route
    // opens the existing CouponsSheet pre-filled with the code and
    // auto-applies through ``POST /coupons/validate`` — same path a
    // user hitting the sheet manually would take, so the eligibility
    // rules can't drift between the two entry points.
    void navigate({ to: "/cart", search: { coupon: code } });
  };

  return (
    <div className="px-4 pb-4">
      <button
        type="button"
        onClick={onTap}
        className={`${frameClass} ${interactiveClass} w-full text-left`}
        style={frameStyle}
        aria-label={`${banner.title}. Apply coupon ${code}`}
      >
        {inner}
      </button>
    </div>
  );
}
