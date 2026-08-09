/**
 * The "Most booked" services list on Home — the primary catalogue
 * discovery surface below the promo banners.
 *
 * Filterable by category: when a CategoryGrid tile is tapped up-page, the
 * heading changes ("Most booked" → the category name) and the query
 * scopes to that category via the existing `useServices(categoryId)`
 * hook. Passing `undefined` shows everything, matching the previous
 * behaviour.
 *
 * Title is "Most booked in Pune" rather than a specific booking count so
 * we're not shipping a number we can't verify — see the social-proof
 * rule in docs/WIREFRAMES.md.
 */
import { useServices, useCategories } from "@/hooks/useApi";
import { ServiceCard } from "@/components/ServiceCard";
import { Loader2 } from "lucide-react";

interface PopularSectionProps {
  categoryId?: string;
}

export function PopularSection({ categoryId }: PopularSectionProps) {
  const { data: services, isLoading } = useServices(categoryId);
  const { data: categories } = useCategories();

  const categoryName = categoryId ? categories?.find((c) => c.id === categoryId)?.name : undefined;

  const heading = categoryName ? `${categoryName} services` : "Most booked in Pune";

  return (
    <section className="px-4 pb-6">
      <h2 className="pb-3 text-base font-semibold text-foreground">{heading}</h2>
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : services && services.length > 0 ? (
          services.map((s) => <ServiceCard key={s.id} service={s} />)
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {categoryName
              ? `No ${categoryName.toLowerCase()} services available yet.`
              : "No services available yet."}
          </p>
        )}
      </div>
    </section>
  );
}
