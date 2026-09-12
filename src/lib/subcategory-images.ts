/**
 * Per-sub-category illustrated tile images (SVC-286 follow-on).
 *
 * Same shape as ``category-images.ts`` for the L1 tiles, but for the
 * Level-2 sub-categories rendered inside a category page. Only sub-cats
 * with a WebP asset in ``public/images/subcategories/`` are listed here;
 * everything else falls back to its Lucide icon via ``category-icons.ts``.
 *
 * The set is intentionally partial today (6 of 17). It fills in as
 * more illustrations get generated + optimised. Each entry has to
 * match the DB slug exactly — mismatch renders the icon fallback,
 * loud in dev via the missing-key case in ``subcategoryImage``, silent
 * in prod.
 *
 * Assets are 512×512 WebP at q=85 — same pipeline as the L1 tiles,
 * see PR #135's commit message for the optimisation ritual.
 */

const BASE = "/images/subcategories";

export const SUBCATEGORY_IMAGES: Record<string, string> = {
  ac: `${BASE}/ac.webp`,
  appliances: `${BASE}/appliances.webp`,
  "pest-control": `${BASE}/pest-control.webp`,
  "ro-purifier": `${BASE}/ro-purifier.webp`,
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
