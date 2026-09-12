/**
 * Category picker on Home — a horizontal snap-scroll rail of image-first
 * tiles (SVC-286 v2).
 *
 * Replaces the earlier 3-column ``CategoryGrid``. The grid rendered every
 * tile at once with a 48×48 icon in the middle, which flattened the
 * illustrated L1 tiles into tiny thumbnails no one could see. The rail
 * gives each tile ~38% of the viewport, image fills the whole thing, and
 * text overlays at the bottom on a dark gradient so it reads regardless of
 * what colours dominate the illustration.
 *
 * Trade-off: users only see ~3 tiles at a time and swipe for the rest. At
 * seven L1 categories that's two swipes to cover the set, which matches
 * the Urban Company / Swiggy home pattern people already know.
 *
 * SVC-286: filters ``useCategories`` to ``parentId === null`` — Home only
 * shows top-level tiles; sub-categories render inside a category page.
 */
import { Link } from "@tanstack/react-router";
import { useCategories } from "@/hooks/useApi";
import { ErrorState } from "@/components/ErrorState";
import { categoryIcon, categoryColor } from "@/lib/category-icons";
import { categoryImage } from "@/lib/category-images";

export function CategoryRail() {
  const { data: categories, isLoading, isError, refetch } = useCategories();

  if (isLoading) {
    return (
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pl-4 scrollbar-none">
        {[1, 2, 3, 4].map((i) => (
          // Same 38% width as real tiles so the skeleton doesn't reflow when
          // real data lands.
          <div
            key={i}
            className="shrink-0 snap-start animate-pulse rounded-2xl bg-border"
            style={{ width: "38%", aspectRatio: "1 / 1" }}
          />
        ))}
        <div className="w-4 shrink-0" aria-hidden />
      </div>
    );
  }

  // Ahead of the empty check for the same reason as CategoryGrid before it:
  // returning null on a failed load made the section vanish under its own
  // heading, which reads as a rendering bug rather than an outage.
  if (isError) {
    return <ErrorState message="Couldn't load categories." onRetry={refetch} />;
  }

  if (!categories || categories.length === 0) {
    return null;
  }

  const level1 = categories.filter((c) => c.parentId === null);

  return (
    // pl-4 (not px-4) so the first tile starts at the same left inset as the
    // section header above; final tile gets its right inset from an inline
    // gutter div at the tail.
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pl-4 scrollbar-none">
      {level1.map((cat) => {
        const image = categoryImage(cat.slug);
        const Icon = categoryIcon(cat.slug);
        const tint = categoryColor(cat.sortOrder);
        return (
          <Link
            key={cat.id}
            to="/category/$slug"
            params={{ slug: cat.slug }}
            // 38% viewport width so ~2.5-3 tiles are visible at once — the
            // half-tile peek is the visual cue that more exists to the right,
            // without needing an indicator row underneath.
            className="relative shrink-0 snap-start overflow-hidden rounded-2xl"
            style={{ width: "38%", aspectRatio: "1 / 1" }}
          >
            {image ? (
              <img
                src={image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
                decoding="async"
              />
            ) : (
              // Fallback for any L1 slug that doesn't have an illustration
              // yet. Solid tint at full alpha (not the earlier +"18" tint at
              // 9%) so the white text below still reads. This branch fires
              // only when a new L1 category is added without a matching
              // asset in ``public/images/categories/`` — treat it as loud
              // temporary UI, not a design target.
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: tint }}
              >
                <Icon className="h-12 w-12 text-white" />
              </div>
            )}

            {/* Dark bottom gradient so white text below reads regardless of
                the illustration's bottom colours. Off-white illustration
                backgrounds would otherwise render white-on-white text as
                nothing. Height set to 40% of the tile — enough to darken the
                text row without dulling the illustration's focal point. */}
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />

            {/* Text-shadow belt-and-suspenders on top of the gradient — cheap
                insurance for any tile whose bottom happens to be a lighter
                accent colour that the gradient alone doesn't quite darken. */}
            <span className="absolute inset-x-2 bottom-2 text-center text-sm font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {cat.name}
            </span>
          </Link>
        );
      })}
      {/* Right-side gutter so the last tile's edge shadow isn't clipped and
          the swipe-past feels intentional. */}
      <div className="w-4 shrink-0" aria-hidden />
    </div>
  );
}
