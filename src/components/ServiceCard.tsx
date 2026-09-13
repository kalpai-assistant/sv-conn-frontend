import { Clock } from "lucide-react";
import type { Service } from "@/lib/mock-data";
import { Link } from "@tanstack/react-router";

/**
 * A service as a full-width row, for vertical lists (the category page).
 * `home/ServiceCardCompact` is the fixed-width variant for horizontal rails.
 *
 * Deliberately carries no rating. It previously rendered a hardcoded "4.8 ★"
 * and "Qualified Professionals" on every service regardless of what it was —
 * the exact thing docs/WIREFRAMES.md forbids under "Social-proof rule (do not
 * violate)": ratings and review counts are rendering placeholders, never
 * hardcoded values. There is no rating data in the catalogue to put here, so
 * the row shows what is true — category, duration, starting price.
 */
export function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      to="/service/$serviceId"
      params={{ serviceId: service.id }}
      className="flex gap-3 rounded-xl bg-card p-3 shadow-sm border border-border/50 transition-shadow hover:shadow-md"
    >
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-xl font-bold text-accent-foreground">
        {service.name.charAt(0)}
      </div>
      <div className="flex flex-1 flex-col justify-center min-w-0">
        <h3 className="text-sm font-semibold text-foreground truncate">{service.name}</h3>
        <p className="truncate text-xs text-muted-foreground">{service.categoryName}</p>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {service.duration}
        </div>
      </div>
      <div className="flex flex-col items-end justify-center">
        {/* "from" because `price` is the cheapest variant, not a fixed charge. */}
        <span className="text-[10px] text-muted-foreground">from</span>
        <span className="text-sm font-bold text-primary">
          ₹{service.price.toLocaleString("en-IN")}
        </span>
      </div>
    </Link>
  );
}
