/**
 * A service as a fixed-width card for the horizontal rail on Home.
 *
 * Distinct from `ServiceCard`, which is the full-width row used wherever a
 * vertical list is the right shape (the category page). This one trades the
 * description for a smaller footprint so several fit on screen at once.
 *
 * Carries no rating. The catalogue has no rating data, and inventing one is
 * exactly what the social-proof rule in docs/WIREFRAMES.md forbids — the
 * category name is real, so that is what the subtitle shows.
 */
import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { categoryIcon, categoryColor } from "@/lib/category-icons";
import type { Service } from "@/lib/mock-data";

interface ServiceCardCompactProps {
  service: Service;
  /** Slug + sort order of the owning category, when the caller knows them.
   *  Absent on a mixed rail, where the placeholder stays neutral. */
  categorySlug?: string;
  categorySortOrder?: number;
}

export function ServiceCardCompact({
  service,
  categorySlug,
  categorySortOrder,
}: ServiceCardCompactProps) {
  // Stands in for the photography this card is designed around (a separate
  // ticket). Tinting it by category at least makes adjacent cards on the rail
  // distinguishable at a glance instead of a row of identical grey blocks.
  const Icon = categorySlug ? categoryIcon(categorySlug) : undefined;
  const tint = categoryColor(categorySortOrder ?? 0);

  return (
    <Link
      to="/service/$serviceId"
      params={{ serviceId: service.id }}
      className="flex w-40 flex-shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <div
        className="flex h-24 w-full items-center justify-center"
        style={{ backgroundColor: tint + "18" }}
      >
        {Icon ? (
          <Icon className="h-7 w-7" style={{ color: tint }} />
        ) : (
          <span className="text-2xl font-bold" style={{ color: tint }}>
            {service.name.charAt(0)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* Two lines then ellipsis: service names run long ("Toilet Cleaning
            (Commercial)") and a single line truncates most of them away. */}
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
          {service.name}
        </h3>
        <p className="truncate text-[11px] text-muted-foreground">{service.categoryName}</p>
        <div className="mt-auto flex items-center gap-1 pt-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {service.duration}
        </div>
        {/* "starting at" because `price` is the cheapest variant, not a fixed
            charge — the user picks the real one on the detail screen. */}
        <p className="text-xs text-muted-foreground">
          starting at{" "}
          <span className="text-sm font-bold text-primary">
            ₹{service.price.toLocaleString("en-IN")}
          </span>
        </p>
      </div>
    </Link>
  );
}
