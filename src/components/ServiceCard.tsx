import { Clock } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { Service } from "@/lib/mock-data";
import { useServiceSheet } from "@/lib/service-sheet-context";
import { QuickAddButton } from "@/components/service/QuickAddButton";
import { formatRupees } from "@/lib/currency";
import { serviceHeroLayoutId } from "@/lib/shared-hero";

/**
 * A service as a full-width row, for vertical lists (the L2 category page).
 * `home/ServiceCardCompact` is the fixed-width variant for horizontal rails.
 *
 * SVC-290: card tap opens the service bottom sheet on top of the current
 * page instead of navigating to a detail page. The right-side `QuickAdd`
 * pill adds the service to the cart directly (Blinkit / Zomato pattern),
 * skipping the sheet — users who want a specific variant open the sheet
 * from the card body; users who know what they want add and move on.
 *
 * Rendered as a `<div>` with a role + onClick rather than a `<button>` so
 * the nested QuickAdd stepper (its own set of buttons) does not violate
 * the "no interactive descendants of a button" rule the HTML spec sets.
 *
 * Deliberately carries no rating. It previously rendered a hardcoded "4.8 ★"
 * and "Qualified Professionals" on every service regardless of what it was —
 * the exact thing docs/WIREFRAMES.md forbids under "Social-proof rule (do not
 * violate)": ratings and review counts are rendering placeholders, never
 * hardcoded values. There is no rating data in the catalogue to put here, so
 * the row shows what is true — category, duration, starting price.
 */
export function ServiceCard({ service }: { service: Service }) {
  const { openService } = useServiceSheet();

  const handleOpen = () => openService(service.id);
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpen();
    }
  };

  // SVC-399: this tile is the source of the service-hero shared transition
  // into the sheet's ServiceBanner. Pair stays via `service-hero-${id}`;
  // reduced-motion drops the layoutId and the sheet opens with its own
  // slide-up only.
  const reduceMotion = useReducedMotion();
  const layoutId = reduceMotion ? undefined : serviceHeroLayoutId(service.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer gap-3 rounded-xl border border-border/50 bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <motion.div
        layoutId={layoutId}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-accent text-xl font-bold text-accent-foreground"
      >
        {service.name.charAt(0)}
      </motion.div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <h3 className="truncate text-sm font-semibold text-foreground">{service.name}</h3>
        <p className="truncate text-xs text-muted-foreground">{service.categoryName}</p>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {service.duration}
        </div>
      </div>
      <div className="flex flex-col items-end justify-between gap-2">
        <div className="flex flex-col items-end">
          {/* "from" because `price` is the cheapest variant, not a fixed charge. */}
          <span className="text-[10px] text-muted-foreground">from</span>
          <span className="text-sm font-bold text-primary">{formatRupees(service.price)}</span>
        </div>
        <QuickAddButton service={service} />
      </div>
    </div>
  );
}
