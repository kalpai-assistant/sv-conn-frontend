/**
 * The window half of an earnings screen (SVC-260): the picker, the window's
 * figure, its chart and the jobs that made it up. Shared by the SP's Earnings
 * tab and the per-Pro view (SVC-323), so there is one chart and one job row.
 *
 * The four states — loading, error, zero, data — stay distinct, as the
 * Earnings tab's header explains: a failed window shows a retry and no figure,
 * never ₹0.
 */
import { AlertCircle, Receipt } from "lucide-react";

import { WeekEarningsChart } from "@/components/provider/WeekEarningsChart";
import { MonthEarningsChart } from "@/components/provider/MonthEarningsChart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupees } from "@/lib/currency";
import { payoutState } from "@/lib/payout-status";
import type { API_EarningsResponse, EarningsRange } from "@/hooks/useApi";
import { proLabel, type ByProRange, type EarningsBookingItemWithPro } from "@/hooks/useProEarnings";
import { RANGE_META } from "@/lib/earnings-ranges";

export function RangeTabs<R extends ByProRange>({
  ranges,
  value,
  onChange,
  label = "Earnings period",
}: {
  ranges: R[];
  value: R;
  onChange: (range: R) => void;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="mt-6 flex gap-1 rounded-xl bg-secondary p-1">
      {ranges.map((r) => (
        <button
          key={r}
          role="tab"
          aria-selected={r === value}
          onClick={() => onChange(r)}
          // Selected is the brand purple, not the shadcn default of a white
          // card on grey. On this screen the segment is the one control the
          // provider operates, and a near-white pill on a near-white ground
          // does not read as "pressed" at arm's length in daylight — which is
          // where a provider actually uses it.
          className={`flex-1 whitespace-nowrap rounded-lg py-2 font-medium transition-colors ${
            // Four tabs (My Team adds "All time") don't fit a phone at text-sm.
            ranges.length > 3 ? "px-1 text-[13px]" : "px-2 text-sm"
          } ${
            r === value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {RANGE_META[r].tab}
        </button>
      ))}
    </div>
  );
}

interface WindowQuery {
  data?: Omit<API_EarningsResponse, "bookings"> & { bookings: EarningsBookingItemWithPro[] };
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

/**
 * `showPro` adds "by <name>" to each job row: on for a team SP's Earnings tab,
 * off for a solo SP (every job is theirs) and in the per-Pro view (every job
 * is that Pro's).
 */
export function EarningsWindow({
  range,
  period,
  showPro = false,
  emptyHint = "Completed jobs show up here with what you earned on each.",
}: {
  range: EarningsRange;
  period: WindowQuery;
  showPro?: boolean;
  emptyHint?: string;
}) {
  const active = RANGE_META[range];

  return (
    <section className="mt-4" aria-label={`Earnings ${active.tab.toLowerCase()}`}>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {active.heading}
        </p>
        {period.isLoading ? (
          <Skeleton className="mt-2 h-7 w-28" />
        ) : period.isError ? (
          <button
            onClick={() => void period.refetch()}
            className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            Couldn&rsquo;t load.
            <span className="font-medium text-primary">Retry</span>
          </button>
        ) : (
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatRupees(period.data?.total_payout ?? 0)}
          </p>
        )}
      </div>

      {/* The per-day chart (SVC-260), above the list because it is the summary
          the list details. Two components rather than one: seven labelled bars
          and thirty-one unlabelled ones are different problems, and the month's
          answer — tap a bar to name the day — would be pointless clutter on a
          week whose axis already says M T W T F S S.

          Both hide only on a window with no completed work, and neither
          renders on "today", where one day is one bar and the row says more. */}
      {!period.isLoading && !period.isError && period.data && range === "week" && (
        <WeekEarningsChart bookings={period.data.bookings} />
      )}
      {!period.isLoading && !period.isError && period.data && range === "month" && (
        <MonthEarningsChart bookings={period.data.bookings} />
      )}

      {period.isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : period.isError ? null : period.data && period.data.bookings.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          {period.data.bookings.map((job, i) => (
            <EarningRow key={job.booking_id} job={job} divided={i > 0} showPro={showPro} />
          ))}
        </div>
      ) : (
        // Copy, not a bare empty box. ₹0 above an empty list with nothing said
        // reads as a failed fetch; saying it plainly is the difference between
        // "you have earned nothing yet" and "something went wrong".
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
          <Receipt className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{active.empty}</p>
          <p className="px-8 text-xs text-muted-foreground">{emptyHint}</p>
        </div>
      )}
    </section>
  );
}

/**
 * One completed job.
 *
 * The tip column is reserved whether or not there is a tip. Rows that grow a
 * second line only when tipped go ragged down the list, and the eye reads the
 * ragged ones as the important ones — backwards, since the base payout is the
 * same money either way.
 *
 * `payout_amount` already includes the tip (the backend sums `provider_payout +
 * tip_amount`), so the tip line annotates the figure above it rather than adding
 * to it — hence "incl.".
 */
function EarningRow({
  job,
  divided,
  showPro,
}: {
  job: EarningsBookingItemWithPro;
  divided: boolean;
  showPro: boolean;
}) {
  const tip = job.tip_amount ?? 0;
  const state = payoutState(job.payment_method, job.settlement_status);

  return (
    <div className={`flex items-start gap-3 p-3.5 ${divided ? "border-t border-border" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{job.service_name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatCompletedAt(job.completed_at)}
        </p>
        {(state || showPro) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Where this job's money is (SVC-303). Absent on bookings from
                before these columns existed — an unlabelled row beats a
                guessed label on a screen about money. */}
            {state && (
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${state.className}`}
              >
                {state.label}
              </span>
            )}
            {/* Who did it (SVC-323), beside where the money is: the two facts
                a team SP settles a job on. */}
            {showPro && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {proLabel(job.professional)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatRupees(job.payout_amount)}
        </p>
        {/* Reserved either way — see the note above. */}
        <p className="mt-0.5 text-xs tabular-nums text-emerald-600">
          {tip > 0 ? `incl. ${formatRupees(tip)} tip` : " "}
        </p>
      </div>
    </div>
  );
}

/** "14 Sept, 4:30 pm" — the day matters inside a month window, the year never does. */
function formatCompletedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
