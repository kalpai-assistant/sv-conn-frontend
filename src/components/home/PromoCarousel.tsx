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
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

interface PromoBanner {
  id: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaTo: string;
  // Simple background gradient token — kept small so the banners never
  // outshine the categories directly above them.
  gradient: string;
}

const BANNERS: PromoBanner[] = [
  {
    id: "first20",
    headline: "20% off your first booking",
    body: "Use FIRST20 at checkout — min ₹499.",
    ctaLabel: "Browse services",
    ctaTo: "/",
    gradient: "from-primary to-primary/70",
  },
];

export function PromoCarousel() {
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
          <Link
            key={b.id}
            to={b.ctaTo}
            className={`shrink-0 snap-start rounded-2xl bg-gradient-to-br ${b.gradient} p-5 text-primary-foreground shadow-sm`}
            // 84% of the viewport so the next banner peeks in — the visual
            // cue that scroll exists, without needing an indicator row.
            style={{ width: "84%" }}
          >
            <p className="text-base font-semibold leading-snug">{b.headline}</p>
            <p className="mt-1 text-sm text-primary-foreground/85">{b.body}</p>
            <div className="mt-3 inline-flex items-center gap-1 text-sm font-medium">
              {b.ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </Link>
        ))}
        {/* Right-side gutter so the last banner's edge shadow isn't clipped. */}
        <div className="w-4 shrink-0" aria-hidden />
      </div>
    </div>
  );
}
