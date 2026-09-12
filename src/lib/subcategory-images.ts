/**
 * Per-sub-category illustrated tile images (SVC-286 follow-on).
 *
 * Same shape as ``category-images.ts`` for the L1 tiles, but for the
 * Level-2 sub-categories rendered inside a category page. Only sub-cats
 * with a WebP asset in ``public/images/subcategories/`` are listed here;
 * everything else falls back to its Lucide icon via ``category-icons.ts``.
 *
 * Full set — all 17 sub-cats illustrated.
 *
 * Assets are 512×512 WebP at q=85 — same pipeline as the L1 tiles,
 * see PR #135's commit message for the optimisation ritual.
 */

const BASE = "/images/subcategories";

export const SUBCATEGORY_IMAGES: Record<string, string> = {
  ac: `${BASE}/ac.webp`,
  appliances: `${BASE}/appliances.webp`,
  carpenter: `${BASE}/carpenter.webp`,
  "cctv-light-event": `${BASE}/cctv-light-event.webp`,
  cleaning: `${BASE}/cleaning.webp`,
  electrician: `${BASE}/electrician.webp`,
  furniture: `${BASE}/furniture.webp`,
  massage: `${BASE}/massage.webp`,
  "nail-art": `${BASE}/nail-art.webp`,
  painting: `${BASE}/painting.webp`,
  "pest-control": `${BASE}/pest-control.webp`,
  plumber: `${BASE}/plumber.webp`,
  "ro-purifier": `${BASE}/ro-purifier.webp`,
  "salon-men": `${BASE}/salon-men.webp`,
  "salon-women": `${BASE}/salon-women.webp`,
  "toilet-cleaning-commercial": `${BASE}/toilet-cleaning-commercial.webp`,
  "vehicle-wash-cleaning": `${BASE}/vehicle-wash-cleaning.webp`,
};

/**
 * Look up the illustration for a sub-category slug. Returns undefined
 * when the slug has no bundled image — callers should fall back to a
 * Lucide icon, not render a broken ``<img>``.
 */
export function subcategoryImage(slug: string): string | undefined {
  return SUBCATEGORY_IMAGES[slug];
}
