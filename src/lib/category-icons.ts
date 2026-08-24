/**
 * Per-category icon and colour, derived client-side.
 *
 * The backend supplies neither. `categories.icon_url` is null for all 18 rows
 * in the live catalogue, and the `Category` model has no colour column at all
 * — so anything visual has to be decided here or every tile renders the same.
 *
 * Keyed on **slug**, not name or id: slugs are stable and URL-safe (they also
 * key the `/category/$slug` route), whereas names get reworded by whoever is
 * editing the catalogue and ids are UUIDs.
 *
 * ⚠️ Build against the LIVE slugs, not `scripts/seed_categories.py`. That
 * script seeds 8 categories under different names ("Home Cleaning",
 * "Plumbing", "Electrical") than the 18 on beta ("Cleaning", "Plumber",
 * "Electrician"). A map written from the seed file type-checks perfectly and
 * then silently falls back on every tile in production.
 */
import type { LucideIcon } from "lucide-react";
import {
  AirVent,
  Bath,
  Brush,
  Bug,
  Camera,
  Car,
  Droplets,
  Hammer,
  HandHeart,
  LayoutGrid,
  Paintbrush,
  Scissors,
  Sofa,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * Every slug the catalogue serves today. Verified against
 * `GET /api/v1/categories` on beta, 2026-08-24.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  cleaning: Sparkles,
  "pest-control": Bug,
  ac: AirVent,
  appliances: LayoutGrid,
  electrician: Zap,
  plumber: Wrench,
  carpenter: Hammer,
  painting: Paintbrush,
  "salon-men": Scissors,
  "salon-women": Brush,
  massage: HandHeart,
  // Deliberate, not accidental. "Miscellaneous" is a genuine catch-all in the
  // catalogue and there is no honest pictogram for it — the generic grid mark
  // says "assorted" better than a wrong specific icon would.
  miscellaneous: LayoutGrid,
  "ro-purifier": Droplets,
  furniture: Sofa,
  "vehicle-wash-cleaning": Car,
  "toilet-cleaning-commercial": Bath,
  // Also deliberate: the category bundles CCTV with event lighting, so it has
  // no single subject. The camera is the half a customer is more likely to be
  // shopping for.
  "cctv-light-event": Camera,
  "nail-art": Sparkles,
};

/**
 * Tile tints, indexed by the category's `sort_order`.
 *
 * Rendered at ~9% alpha behind the icon and full strength for the icon
 * itself, so these need to read on both a light and a dark card. Deliberately
 * fewer entries than there are categories — with 18 tiles on screen, adjacent
 * ones differing is what matters, not global uniqueness.
 */
const CATEGORY_COLORS = [
  "#1957D2", // brand blue
  "#00897B", // teal
  "#C2410C", // burnt orange
  "#6D28D9", // violet
  "#B45309", // amber
  "#0E7490", // cyan
  "#BE185D", // magenta
  "#15803D", // green
] as const;

/** Fallback for a slug shipped after this map was written. */
const FALLBACK_ICON: LucideIcon = Sparkles;

export function categoryIcon(slug: string): LucideIcon {
  return CATEGORY_ICONS[slug] ?? FALLBACK_ICON;
}

export function categoryColor(sortOrder: number): string {
  // Guards a negative or non-integer sort_order rather than trusting the
  // catalogue — an out-of-range index here would render `undefined` into a
  // style attribute and silently produce an uncoloured tile.
  const index = Math.abs(Math.trunc(sortOrder)) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[index];
}
