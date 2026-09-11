/**
 * Per-category illustrated tile images (SVC-286).
 *
 * Separate from ``category-icons.ts`` on purpose: icons are Lucide
 * pictograms that ship for every one of the 18 flat catalogue slugs
 * today; images are illustrations that only exist for the 7 Level-1
 * tiles the ticket restructures Home into. When the L1 restructure
 * lands, the L1 slugs get an illustrated tile; every other slug (any
 * legacy sub-category still fetched by other surfaces, e.g. category
 * search results) falls back to its Lucide icon and does not visibly
 * regress. ``CategoryGrid`` prefers image over icon when both exist.
 *
 * Assets live under ``public/images/categories/`` — bundled into the
 * PWA build and, via Capacitor, into the APK; served at the same
 * ``/images/categories/<slug>.webp`` path in both. WebP at 512×512 to
 * keep the payload under 50KB per tile (originals were 1.1-1.5MB PNG,
 * which would have added ~9MB to first paint over cellular).
 *
 * If we ever want per-environment or dynamic images, populate the
 * ``Category.icon_url`` DB column with the same path and switch
 * ``CategoryGrid`` to prefer that. Static-bundled today because none
 * of the seven change enough to justify the DB round trip.
 */

const BASE = "/images/categories";

/**
 * Slugs that have an illustrated tile. Keys must exactly match the
 * category slug in the DB — mismatch renders the Lucide-icon fallback
 * (loud in dev via the missing-key case in `categoryImage`, silent in
 * prod). When SVC-286's L1 restructure lands, add its slugs here in
 * the same shape.
 */
export const CATEGORY_IMAGES: Record<string, string> = {
  "salon-spa-women": `${BASE}/salon-spa-women.webp`,
  "salon-massage-men": `${BASE}/salon-massage-men.webp`,
  "cleaning-pest-control": `${BASE}/cleaning-pest-control.webp`,
  "ac-appliance-repair": `${BASE}/ac-appliance-repair.webp`,
  "electrician-plumber-carpenter": `${BASE}/electrician-plumber-carpenter.webp`,
  "painting-home-improvement": `${BASE}/painting-home-improvement.webp`,
  miscellaneous: `${BASE}/miscellaneous.webp`,
};

/**
 * Look up the illustration for a category slug. Returns undefined
 * when the slug has no bundled image — callers should fall back to
 * a Lucide icon in that case, not render a broken ``<img>``.
 */
export function categoryImage(slug: string): string | undefined {
  return CATEGORY_IMAGES[slug];
}
