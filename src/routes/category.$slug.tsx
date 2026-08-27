import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ServiceCardSkeleton } from "@/components/skeletons/ServiceCardSkeleton";
import { useCategories, useServices } from "@/hooks/useApi";
import { ServiceCard } from "@/components/ServiceCard";
import { categoryIcon, categoryColor } from "@/lib/category-icons";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
});

/**
 * A category's full service list, on its own screen.
 *
 * Replaces Home's in-place filter, where tapping a tile changed a section two
 * below the fold — past the promo carousel and the book-again row — so the
 * tap read as doing nothing. A dedicated screen puts the list at the top
 * where the tap can be seen to have worked.
 *
 * Routed on slug rather than the category id: ids are UUIDs, so
 * `/category/plumber` is a link someone can read and share and
 * `/category/7f38…` is not. The slug is resolved against the already-cached
 * `useCategories` list, the same way `service.$serviceId` resolves out of the
 * services list, so arriving here from Home costs no extra request.
 */
function CategoryPage() {
  const { slug } = Route.useParams();
  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useCategories();
  const category = categories?.find((c) => c.slug === slug);

  // Only query once the slug resolves. Passing `undefined` would fetch the
  // whole catalogue and render it under this category's name.
  const {
    data: services,
    isLoading: servicesLoading,
    isError: servicesError,
    refetch: refetchServices,
  } = useServices(category?.id);

  if (categoriesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Must sit ahead of the `!category` check below. A failed /categories
  // request leaves `categories` undefined, so the lookup misses and the
  // not-found branch tells the user this category doesn't exist — turning an
  // outage into a claim about their data. Same class of bug as the one
  // recorded in bookings.tsx, which "bit the beta hard" when /bookings 500'd.
  if (categoriesError) {
    return (
      <ErrorState message="Couldn't load categories." onRetry={refetchCategories} fullScreen />
    );
  }

  // A cold deep-link to a slug that no longer exists lands here. Reached only
  // once categories have actually loaded, so it means what it says.
  if (!category) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <p className="text-muted-foreground">This category doesn't exist.</p>
          <Link to="/" className="mt-2 inline-block text-sm font-medium text-primary">
            Browse all services
          </Link>
        </div>
      </div>
    );
  }

  const Icon = categoryIcon(category.slug);
  const tint = categoryColor(category.sortOrder);

  return (
    // `pb-20` like the tab routes: 80px clears the BottomNav, which is all
    // that sits at the bottom here now.
    //
    // This used to add another 4.5rem for CartFab floating above the nav.
    // The FAB no longer shows on this screen — the nav's Cart tab carries
    // the badge instead, and the FAB stepped back to /service/*, which is
    // the one browsing route with no nav. Keeping the extra room left ~56px
    // of dead space under the last card.
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Link
          to="/"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: tint + "18" }}
        >
          <Icon className="h-4 w-4" style={{ color: tint }} />
        </div>
        <h1 className="truncate text-base font-semibold text-foreground">{category.name}</h1>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-4">
        {servicesLoading ? (
          <>
            <ServiceCardSkeleton />
            <ServiceCardSkeleton />
            <ServiceCardSkeleton />
            <ServiceCardSkeleton />
          </>
        ) : servicesError ? (
          // Ahead of the empty branch for the same reason as above: a failed
          // /services request would otherwise read as "this category has
          // nothing in it".
          <ErrorState message="Couldn't load these services." onRetry={refetchServices} />
        ) : services && services.length > 0 ? (
          services.map((s) => <ServiceCard key={s.id} service={s} />)
        ) : (
          <EmptyState
            icon={PackageOpen}
            title={`No ${category.name.toLowerCase()} services yet`}
            subtitle="We're adding more in your area soon."
          />
        )}
      </div>
    </div>
  );
}
