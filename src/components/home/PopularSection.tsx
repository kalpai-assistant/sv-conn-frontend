/**
 * The "Most booked" rail on Home — a horizontal, snap-scrolling row of
 * service cards below the category grid.
 *
 * Horizontal rather than the vertical list this used to be, because Home is a
 * launchpad: the grid above is the primary way into the catalogue, and a
 * full-length list underneath buries everything after it (the trust bar) past
 * a scroll nobody performs. A rail advertises that there is more to the right
 * without consuming the page to do it. The full vertical list still exists
 * where it belongs — on the category page, where scanning everything is the
 * point.
 *
 * Capped rather than showing the whole catalogue: 363 services exist, and an
 * unbounded rail is a worse version of search.
 *
 * Title is "Most booked in Pune" rather than a specific booking count so
 * we're not shipping a number we can't verify — see the social-proof rule in
 * docs/WIREFRAMES.md.
 */
import { useServices, useCategories } from "@/hooks/useApi";
import { ServiceCardCompact } from "@/components/home/ServiceCardCompact";
import { Loader2 } from "lucide-react";

/** How many services the rail shows before the user has to search instead. */
const RAIL_LIMIT = 8;

export function PopularSection() {
  const { data: services, isLoading } = useServices();
  // Already cached — `useServices` fetches categories itself to resolve names,
  // so this reads the same query rather than issuing a second request.
  const { data: categories } = useCategories();

  const railServices = services?.slice(0, RAIL_LIMIT) ?? [];

  return (
    <section className="pb-6">
      <h2 className="px-4 pb-3 text-base font-semibold text-foreground">Most booked in Pune</h2>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : railServices.length > 0 ? (
        // `snap-x` + per-card `snap-start` so a flick settles on a card edge
        // rather than mid-card. Trailing gap is a spacer element, not
        // padding-right: browsers drop the right padding of a flex overflow
        // container, so the last card would butt against the screen edge.
        // Same shape as BookAgainRow and PromoCarousel.
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pl-4 scrollbar-none">
          {railServices.map((s) => {
            const cat = categories?.find((c) => c.id === s.categoryId);
            return (
              <ServiceCardCompact
                key={s.id}
                service={s}
                categorySlug={cat?.slug}
                categorySortOrder={cat?.sortOrder}
              />
            );
          })}
          <div className="w-4 shrink-0" aria-hidden />
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No services available yet.
        </p>
      )}
    </section>
  );
}
