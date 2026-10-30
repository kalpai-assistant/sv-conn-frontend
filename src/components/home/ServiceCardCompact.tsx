/**
 * A service as a fixed-width card for the horizontal rail on Home.
 *
 * Distinct from `ServiceCard`, which is the full-width row used wherever a
 * vertical list is the right shape (the category page). This one trades the
 * description for a smaller footprint so several fit on screen at once.
 *
 * SVC-290: card tap opens the service bottom sheet on top of Home rather
 * than navigating away. The compact QuickAdd pill floats over the top-right
 * of the image so users can add straight from the rail (Blinkit / Zomato
 * pattern) without opening the sheet.
 *
 * Rendered as a `<div>` with a role + onClick rather than a `<button>` so
 * the nested QuickAdd stepper (its own set of buttons) does not violate
 * the "no interactive descendants of a button" rule the HTML spec sets.
 *
 * Carries no rating. The catalogue has no rating data, and inventing one is
 * exactly what the social-proof rule in docs/WIREFRAMES.md forbids — the
 * category name is real, so that is what the subtitle shows.
 *
 * SVC-388: under the category sits the latest real review quote, when the
 * backend has one. Rail cards stretch to the tallest card in the row and the
 * duration/price block is pinned with `mt-auto`, so a card without a snippet
 * stays the same height as its neighbours — the gap lands above the duration.
 */
import { Clock } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { categoryIcon, categoryColor } from "@/lib/category-icons";
import type { Service } from "@/lib/mock-data";
import { useServiceSheet } from "@/lib/service-sheet-context";
import { QuickAddButton } from "@/components/service/QuickAddButton";
import { formatRupees } from "@/lib/currency";
import { serviceHeroLayoutId } from "@/lib/shared-hero";
import { ReviewSnippetLine } from "@/components/service/ReviewSnippetLine";

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
  const { openService } = useServiceSheet();

  // Stands in for the photography this card is designed around (a separate
  // ticket). Tinting it by category at least makes adjacent cards on the rail
  // distinguishable at a glance instead of a row of identical grey blocks.
  const Icon = categorySlug ? categoryIcon(categorySlug) : undefined;
  const tint = categoryColor(categorySortOrder ?? 0);

  const handleOpen = () => openService(service.id);
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpen();
    }
  };

  // SVC-399: this image tile is the source of the service-hero shared
  // transition into the sheet's ServiceBanner. Paired on `service-hero-${id}`;
  // reduced-motion skips the layoutId so there's no morph.
  const reduceMotion = useReducedMotion();
  const layoutId = reduceMotion ? undefined : serviceHeroLayoutId(service.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className="flex w-40 shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <motion.div
        layoutId={layoutId}
        className="relative flex h-24 w-full items-center justify-center"
        style={{ backgroundColor: tint + "18" }}
      >
        {Icon ? (
          <Icon className="h-7 w-7" style={{ color: tint }} />
        ) : (
          <span className="text-2xl font-bold" style={{ color: tint }}>
            {service.name.charAt(0)}
          </span>
        )}
        {/* Quick-add pill anchored to the top-right of the image area, the
            same slot Blinkit and Zomato use for their inline ADD. Compact
            variant so it does not crowd the ~90px tile. */}
        <div className="absolute right-2 top-2">
          <QuickAddButton service={service} compact />
        </div>
      </motion.div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {/* Two lines then ellipsis: service names run long ("Toilet Cleaning
            (Commercial)") and a single line truncates most of them away. */}
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
          {service.name}
        </h3>
        <p className="truncate text-[11px] text-muted-foreground">{service.categoryName}</p>
        <ReviewSnippetLine snippet={service.reviewSnippet} />
        <div className="mt-auto flex items-center gap-1 pt-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {service.duration}
        </div>
        {/* "starting at" because `price` is the cheapest variant, not a fixed
            charge — the user picks the real one on the detail screen. */}
        <p className="text-xs text-muted-foreground">
          starting at{" "}
          <span className="text-sm font-bold text-primary">{formatRupees(service.price)}</span>
        </p>
      </div>
    </div>
  );
}
