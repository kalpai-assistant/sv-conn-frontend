/**
 * A team SP's earnings split by who did the work (SVC-323), and the one way a
 * Pro's figure is written, shared by the Earnings tab and My Team.
 *
 * The rows always add up to the SP's own total for the same range: the
 * backend puts jobs that completed with no Pro on a "Not assigned" row rather
 * than dropping them. That row is not tappable — there is no Pro to open.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatRupees } from "@/lib/currency";
import { RANGE_META } from "@/lib/earnings-ranges";
import { cn } from "@/lib/utils";
import { proName, type EarningsByProResponse, type ProEarningsItem } from "@/hooks/useProEarnings";
import { firstInitial } from "@/lib/initials";

/** The Pro's figure, or "No jobs yet" — never "₹0", which reads as unpaid work. */
export function ProFigure({ item }: { item: ProEarningsItem | undefined }) {
  if (!item || item.completed_count === 0) {
    return <span className="text-xs text-muted-foreground">No jobs yet</span>;
  }
  return (
    <span className="text-right">
      <span className="block text-sm font-semibold tabular-nums text-foreground">
        {formatRupees(item.payout)}
      </span>
      <span className="block text-xs text-muted-foreground">
        {item.completed_count} {item.completed_count === 1 ? "job" : "jobs"}
      </span>
    </span>
  );
}

/**
 * Closed by default: it sits under the job list, and a team SP opens it when
 * settling up rather than on every visit. Open state is the page's, so it
 * survives switching windows. Opening it grows the card downward only, so
 * nothing the SP was reading moves.
 */
export function ProEarningsBreakdown({
  data,
  open,
  onOpenChange,
}: {
  data: EarningsByProResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const people = data.pros.filter((p) => p.professional_id !== null).length;

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="mt-3 overflow-hidden rounded-xl border border-border bg-card"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-3 p-3.5 text-left">
        <span className="flex-1 text-sm font-semibold text-foreground">By team member</span>
        <span className="text-xs text-muted-foreground">
          {people} {people === 1 ? "person" : "people"}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="border-t border-border">
          {data.pros.map((item, i) => (
            <li
              key={item.professional_id ?? "unassigned"}
              className={i > 0 ? "border-t border-border" : ""}
            >
              <BreakdownRow item={item} />
            </li>
          ))}
        </ul>
        {/* The sum, said out loud: the reason "Not assigned" is a row at all. */}
        <p className="border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
          Adds up to {formatRupees(data.total_payout)} {RANGE_META[data.range].tab.toLowerCase()}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
function BreakdownRow({ item }: { item: ProEarningsItem }) {
  const body = (
    <>
      {item.professional_id === null ? (
        <div className="h-8 w-8 shrink-0 rounded-full border border-dashed border-border" />
      ) : (
        <Avatar className="h-8 w-8" aria-hidden>
          {item.profile_photo_url && <AvatarImage src={item.profile_photo_url} alt="" />}
          <AvatarFallback>{firstInitial(item.display_name)}</AvatarFallback>
        </Avatar>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{proName(item)}</span>
        {item.professional_id !== null && !item.is_active && (
          <span className="block text-xs text-muted-foreground">Past member</span>
        )}
      </span>
      <ProFigure item={item} />
    </>
  );

  if (item.professional_id === null) {
    return <div className="flex items-center gap-3 p-3">{body}</div>;
  }
  return (
    <Link
      to="/provider/team/$professionalId/earnings"
      params={{ professionalId: item.professional_id }}
      className="flex items-center gap-3 p-3"
    >
      {body}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
