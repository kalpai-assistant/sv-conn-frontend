import { Clock } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { Service } from "@/lib/mock-data";
import { useServiceSheet } from "@/lib/service-sheet-context";
import { QuickAddButton } from "@/components/service/QuickAddButton";
import { TilePrice } from "@/components/TilePrice";
import { useTileComingSoonTap } from "@/hooks/useTileComingSoonTap";
import { serviceHeroLayoutId } from "@/lib/shared-hero";
import { ReviewSnippetLine } from "@/components/service/ReviewSnippetLine";

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
 *
 * SVC-388: the one piece of social proof it does carry is the latest real
 * review quote, as a full-width line under the row, when the backend has
 * one. Rows in a vertical list need not match each other's height, so a
 * service without a snippet simply ends after the row.
 */
export function ServiceCard({ service }: { service: Service }) {
  const { openService } = useServiceSheet();

  // SVC-419: every activation (tap, Enter, Space) on an offline or
  // coming-soon tile sends one event. ADD stops propagation, so it sends its own.
  const trackComingSoonTap = useTileComingSoonTap(service);
  const handleOpen = () => {
    trackComingSoonTap();
    openService(service.id);
  };
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
      className="flex cursor-pointer flex-col gap-2 rounded-xl border border-border/50 bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex gap-3">
        <motion.div
          layoutId={layoutId}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-accent text-xl font-bold text-accent-foreground"
        >
          {service.name.charAt(0)}
        </motion.div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {/* SVC-415: two lines, not one. The price column can now hold a
              2-line status, which left too little width for one-line names. */}
          <h3 className="line-clamp-2 break-words text-sm font-semibold leading-tight text-foreground">
            {service.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">{service.categoryName}</p>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {service.duration}
          </div>
        </div>
        <div className="flex flex-col items-end justify-between gap-2" data-card-column="right">
          {/* SVC-415: "from ₹X" at the customer's point. With no price
              (SVC-485) this renders nothing and the column holds only ADD. */}
          <TilePrice
            service={service}
            show="price"
            className="flex max-w-[6.5rem] flex-col items-end text-right"
            labelClassName="text-[10px] text-muted-foreground"
            priceClassName="text-sm font-bold text-primary"
          />
          {/* mt-auto: with no price ADD is the only child and still sits on
              the duration row; with a price this is today's justify-between. */}
          <div className="mt-auto">
            <QuickAddButton service={service} />
          </div>
        </div>
      </div>
      {/* SVC-485: "No pros online right now" / "Coming soon" on its own line
          under the duration, indented to the text column (thumbnail w-16 +
          gap-3) and running under ADD, so it never has to wrap. */}
      <TilePrice
        service={service}
        show="status"
        className="-mt-1 block truncate pl-[4.75rem]"
        statusClassName="text-xs text-muted-foreground"
      />
      <ReviewSnippetLine snippet={service.reviewSnippet} />
    </div>
  );
}
