/**
 * Category picker on Home — a 3-column grid of icon tiles.
 *
 * Replaces the older horizontal-scroll CategoryChips row: chips force users
 * to swipe to discover the middle of the catalogue, hide the total set
 * behind an implicit "there might be more →" affordance, and (measured on
 * marketplace apps generally) convert notably worse than a grid where
 * everything is visible at once. Categories don't grow past a dozen or so
 * in home services, so a full grid stays scannable without a second page.
 *
 * Tapping a tile navigates to that category's own page. It previously
 * filtered a list further down Home instead, which meant the visible result
 * of the tap was two sections below the fold — past the promo carousel and
 * the book-again row — so the only feedback was the tile's own border. A real
 * route also makes the result linkable and lets hardware back return here,
 * neither of which local filter state can do.
 */
import { Link } from "@tanstack/react-router";
import { useCategories } from "@/hooks/useApi";
import { ErrorState } from "@/components/ErrorState";
import { categoryIcon, categoryColor } from "@/lib/category-icons";

export function CategoryGrid() {
  const { data: categories, isLoading, isError, refetch } = useCategories();

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3 px-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="aspect-square animate-pulse rounded-2xl bg-border" />
        ))}
      </div>
    );
  }

  // Ahead of the empty check: returning null on a failed load made the grid
  // silently vanish under its own "Categories" heading, which reads as a
  // rendering bug rather than an outage.
  if (isError) {
    return <ErrorState message="Couldn't load categories." onRetry={refetch} />;
  }

  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-3 gap-3 px-4">
      {categories.map((cat) => {
        const Icon = categoryIcon(cat.slug);
        const tint = categoryColor(cat.sortOrder);
        return (
          <Link
            key={cat.id}
            to="/category/$slug"
            params={{ slug: cat.slug }}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 transition-colors"
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              // Inline styling because the palette is arbitrary hex and can't
              // be enumerated as Tailwind classes. `+ "18"` is a 9% alpha
              // overlay, keeping the tint legible on both light and dark cards.
              style={{ backgroundColor: tint + "18" }}
            >
              <Icon className="h-5 w-5" style={{ color: tint }} />
            </div>
            <span className="text-center text-[11px] font-medium leading-tight text-foreground">
              {cat.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
