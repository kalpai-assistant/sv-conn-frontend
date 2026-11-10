/**
 * The catalog tree (SVC-430): each L1 as a card, its sub-categories inside it,
 * and services under whichever category holds them. Inactive rows are muted and
 * badged. Each service shows its price and unit, its active variants and its
 * bookings in flight, the two numbers an admin weighs before deactivating it.
 *
 * Cards stack at any width, so phone width needs no second layout: long names
 * wrap, and the counts drop under the name.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { InactivePill, RowIcon } from "@/components/catalog/CatalogBadges";
import {
  bookingsLabel,
  priceLabel,
  variantsLabel,
  type CatalogCategoryNode,
  type CatalogServiceRow,
} from "@/lib/catalog";

const WRAP = "[overflow-wrap:anywhere]";
const MUTED = "opacity-60";

export function CatalogTree({ categories }: { categories: CatalogCategoryNode[] }) {
  return (
    <ul aria-label="Catalog" className="space-y-3">
      {categories.map((l1) => (
        <li
          key={l1.id}
          aria-label={l1.name}
          className="min-w-0 overflow-hidden rounded-lg border bg-card"
        >
          <CategoryRow category={l1} level={1} />
          {(l1.children.length > 0 || l1.services.length > 0) && (
            <div className="space-y-2 border-t p-2 sm:p-3">
              {l1.services.length > 0 && <ServiceList services={l1.services} />}
              {l1.children.length > 0 && (
                <ul aria-label={`${l1.name} sub-categories`} className="space-y-2">
                  {l1.children.map((l2) => (
                    <li
                      key={l2.id}
                      aria-label={l2.name}
                      className="min-w-0 rounded-md border bg-background"
                    >
                      <CategoryRow category={l2} level={2} />
                      {l2.services.length > 0 ? (
                        <div className="border-t p-2">
                          <ServiceList services={l2.services} />
                        </div>
                      ) : (
                        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                          No services yet.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function CategoryRow({ category, level }: { category: CatalogCategoryNode; level: 1 | 2 }) {
  return (
    <Link
      to="/operator/catalog/categories/$categoryId"
      params={{ categoryId: category.id }}
      aria-label={`Open category ${category.name}`}
      className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/60"
    >
      <div
        className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${category.is_active ? "" : MUTED}`}
      >
        <RowIcon iconKey={category.icon_key} />
        <span className={`${level === 1 ? "font-semibold" : "font-medium"} text-sm ${WRAP}`}>
          {category.name}
        </span>
        <span className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {category.slug}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          · sort {category.sort_order}
        </span>
      </div>
      <InactivePill active={category.is_active} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function ServiceList({ services }: { services: CatalogServiceRow[] }) {
  return (
    <ul aria-label="Services" className="divide-y rounded-md border bg-card">
      {services.map((service) => (
        <li key={service.id}>
          <Link
            to="/operator/catalog/services/$serviceId"
            params={{ serviceId: service.id }}
            aria-label={`Open service ${service.name}`}
            className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-secondary/60"
          >
            <div className={`min-w-0 flex-1 space-y-0.5 ${service.is_active ? "" : MUTED}`}>
              <div className="flex min-w-0 items-center gap-2">
                <RowIcon iconKey={service.icon_key} />
                <span className={WRAP}>{service.name}</span>
              </div>
              <p className="flex flex-wrap gap-x-2 pl-6 text-xs text-muted-foreground tabular-nums">
                <span className="text-foreground">{priceLabel(service)}</span>
                <span>{variantsLabel(service.active_variant_count)}</span>
                <span className={service.active_bookings > 0 ? "font-medium text-primary" : ""}>
                  {bookingsLabel(service.active_bookings)}
                </span>
              </p>
            </div>
            <InactivePill active={service.is_active} />
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
