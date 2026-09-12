import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ServiceCardSkeleton } from "@/components/skeletons/ServiceCardSkeleton";
import { useCategories, useServices } from "@/hooks/useApi";
import { ServiceCard } from "@/components/ServiceCard";
import type { Category } from "@/lib/mock-data";
import { categoryIcon, categoryColor } from "@/lib/category-icons";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
});

/**
 * A category's own screen (SVC-286).
 *
 * Two modes, decided at render time from the category's own children in the
 * `useCategories` list:
 *
 *   1. **Level-1 with sub-categories** — the seven illustrated Home tiles.
 *      Renders a 3-column grid of sub-category tiles. Tapping a tile
 *      navigates to that sub-category's own `/category/$slug`, which lands
 *      in mode 2.
 *
 *   2. **Level-2, or Level-1 with no children (`miscellaneous`)** — renders
 *      the services under this category, unchanged from the pre-SVC-286
 *      behaviour. Existing bookings, provider subscriptions and service ids
 *      all keep working here because `services.category_id` still points at
 *      what are now L2 rows (unchanged ids from the flat-catalogue era).
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

  const children = (categories ?? []).filter((c) => c.parentId === category.id);
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

      {children.length > 0 ? (
        // Mode 1: sub-category picker. Extracted into a sibling component so
        // hooks are declared unconditionally — the services query below is
        // only mounted in Mode 2 and wouldn't fire here anyway.
        <SubCategoryPicker subCategories={children} />
      ) : (
        // Mode 2: the pre-SVC-286 services list. Kept as its own component
        // for the same hook-mount reason.
        <ServicesUnderCategory category={category} />
      )}
    </div>
  );
}

/**
 * Mode 1 body — grid of sub-category tiles rendered like Home's
 * CategoryGrid so the L1 → L2 transition feels continuous. Uses the Lucide
 * icon path (no illustrations for sub-categories — those exist only for
 * the seven L1 tiles per `category-images.ts`).
 */
function SubCategoryPicker({ subCategories }: { subCategories: readonly Category[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 px-4 pt-4">
      {subCategories.map((sub) => {
        const SubIcon = categoryIcon(sub.slug);
        const tint = categoryColor(sub.sortOrder);
        return (
          <Link
            key={sub.id}
            to="/category/$slug"
            params={{ slug: sub.slug }}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 transition-colors"
          >
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: tint + "18" }}
            >
              <SubIcon className="h-5 w-5" style={{ color: tint }} />
            </div>
            <span className="text-center text-[11px] font-medium leading-tight text-foreground">
              {sub.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Mode 2 body — services under a category, unchanged from the pre-SVC-286
 * shape. Runs its own `useServices(categoryId)` because a hook mounted at
 * the parent level would either fire on Mode 1 pages (wasted query, wrong
 * data on screen for a beat) or need conditional-hook gymnastics.
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
