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
 */
import { Link } from "@tanstack/react-router";

interface Banner {
  id: string;
  /** Path under ``public/images/banners/`` — asset must exist at build
   *  time. Keep it WebP at 512-height / 1024-width (~2:1) so the payload
   *  stays under ~80KB like the category tiles. */
  image: string;
  title: string;
  /** Optional single-line subtitle rendered below the title. Keep short
   *  — anything over ~40 chars will wrap awkwardly on a 375px screen. */
  subtitle?: string;
  /** Optional CTA pill. Omit to make the whole banner the tap target
   *  without a visible call-to-action. */
  ctaLabel?: string;
  ctaTo: string;
  /** Inclusive-inclusive window, ISO date strings. A banner shows on
   *  the day that equals ``activeFrom`` and on the day that equals
   *  ``activeUntil``, and every day in between. */
  activeFrom: string;
  activeUntil: string;
}

const BANNERS: Banner[] = [
  {
    id: "ganesh-chaturthi-2026",
    image: "/images/banners/ganesh-chaturthi-2026.webp",
    title: "Happy Ganesh Chaturthi",
    subtitle: "Use FIRST20 for 20% off your first booking",
    ctaLabel: "Explore services",
    ctaTo: "/",
    // Ganesh Chaturthi 2026 runs Sep 6-17. Buffer to the 18th so the
    // banner is up through Anant Chaturdashi evening and quietly retires
    // the next morning without needing a code change.
    activeFrom: "2026-09-06",
    activeUntil: "2026-09-18",
  },
];

function pickActiveBanner(now: Date, banners: readonly Banner[]): Banner | null {
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

  return (
    <div className="px-4 pb-4">
      <Link
        to={banner.ctaTo}
        className="relative block overflow-hidden rounded-2xl"
        // 2:1 ratio — banner-shape without eating too much vertical real
        // estate above the fold. On a 375px screen this renders ~172px
        // tall, which reads as "important content" rather than "small
        // notice".
        style={{ aspectRatio: "2 / 1" }}
      >
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
          {banner.ctaLabel && (
            <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-white/25 px-3 py-1 text-xs font-medium backdrop-blur">
              {banner.ctaLabel} →
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
