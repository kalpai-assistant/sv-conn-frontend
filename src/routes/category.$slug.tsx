import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Couldn't load categories.</p>
        <button
          onClick={() => refetchCategories()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
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
    // Not `pb-20` like the tab routes: 80px clears the BottomNav but not
    // CartFab floating above it, so the last card ends up partly behind the
    // cart bar. Same calc the service detail screen uses — BottomNav (or a
    // page CTA, if one is ever added here) plus the FAB and its gap.
    <div
      className="min-h-screen"
      style={{ paddingBottom: "calc(var(--page-cta-height, 4rem) + 4.5rem)" }}
    >
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
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : servicesError ? (
          // Ahead of the empty branch for the same reason as above: a failed
          // /services request would otherwise read as "this category has
          // nothing in it".
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Couldn't load these services.</p>
            <button
              onClick={() => refetchServices()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
          </div>
        ) : services && services.length > 0 ? (
          services.map((s) => <ServiceCard key={s.id} service={s} />)
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No {category.name.toLowerCase()} services available yet.
          </p>
        )}
      </div>
    </div>
  );
}
