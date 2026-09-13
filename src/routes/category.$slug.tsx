import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, Loader2, PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ServiceCardSkeleton } from "@/components/skeletons/ServiceCardSkeleton";
import { useCategories, useServices } from "@/hooks/useApi";
import { ServiceCard } from "@/components/ServiceCard";
import type { Category } from "@/lib/mock-data";
import { categoryIcon, categoryColor } from "@/lib/category-icons";
import { useCategorySheet } from "@/lib/category-sheet-context";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
});

/**
 * A category's own screen (SVC-286, revised by SVC-290).
 *
 * Two modes now, chosen by whether the slug resolves to an L1 with children
 * or anything else:
 *
 *   1. **L1 with children** — SVC-290 turned the sub-category picker into a
 *      bottom sheet on Home. A cold `/category/{L1-slug}` deep-link should
 *      show the same thing a Home L1 tile tap shows, so this branch redirects
 *      to Home and opens the sheet for that L1. Shared links keep working
 *      end-to-end without duplicating the sheet UI here.
 *
 *   2. **L2, or L1 with no children (miscellaneous)** — renders the services
 *      under this category, unchanged from the pre-SVC-286 behaviour.
 *      Existing bookings, provider subscriptions and service ids all keep
 *      working here.
 *
 * Routed on slug rather than id so `/category/plumber` reads and shares.
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
  const isL1WithChildren = !!(
    category &&
    category.parentId === null &&
    (categories ?? []).some((c) => c.parentId === category.id)
  );

  const { openCategory } = useCategorySheet();
  const navigate = useNavigate();

  // L1 deep-link: open the sheet on Home and replace the URL so back does
  // not bounce between this stub and the home the sheet already covers.
  useEffect(() => {
    if (!category || !isL1WithChildren) return;
    openCategory(category.id);
    void navigate({ to: "/", replace: true });
  }, [category, isL1WithChildren, openCategory, navigate]);

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

  // Redirect branch renders nothing while the effect runs; users see the
  // sheet slide up on Home a beat later.
  if (isL1WithChildren) {
    return null;
  }

  const Icon = categoryIcon(category.slug);
  const tint = categoryColor(category.sortOrder);

  return (
    // `pb-20` like the tab routes: 80px clears the BottomNav, which is all
    // that sits at the bottom here now.
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

      <ServicesUnderCategory category={category} />
    </div>
  );
}

/**
 * The pre-SVC-286 services list — kept for L2 slugs and the miscellaneous
 * L1 (no children). Runs its own `useServices(categoryId)` because a hook
 * mounted at the parent level would fire on the L1-redirect branch and
 * waste a query.
 */
function ServicesUnderCategory({ category }: { category: Category }) {
  const { data: services, isLoading, isError, refetch } = useServices(category.id);

  return (
    <div className="flex flex-col gap-3 px-4 pt-4">
      {isLoading ? (
        <>
          <ServiceCardSkeleton />
          <ServiceCardSkeleton />
          <ServiceCardSkeleton />
          <ServiceCardSkeleton />
        </>
      ) : isError ? (
        // Ahead of the empty branch: a failed /services request would
        // otherwise read as "this category has nothing in it".
        <ErrorState message="Couldn't load these services." onRetry={refetch} />
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
  );
}
