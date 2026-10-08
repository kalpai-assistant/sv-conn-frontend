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
import { formatRupees } from "@/lib/currency";
import { proName, type EarningsByProResponse, type ProEarningsItem } from "@/hooks/useProEarnings";

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

export function ProEarningsBreakdown({ data }: { data: EarningsByProResponse }) {
  return (
    <section className="mt-4" aria-label="By team member">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        By team member
      </h2>
      <ul className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
        {data.pros.map((item, i) => (
          <li
            key={item.professional_id ?? "unassigned"}
            className={i > 0 ? "border-t border-border" : ""}
          >
            <BreakdownRow item={item} />
          </li>
        ))}
      </ul>
    </section>
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
          <AvatarFallback>{item.display_name.charAt(0).toUpperCase()}</AvatarFallback>
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
