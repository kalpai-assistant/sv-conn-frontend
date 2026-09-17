/**
 * Provider Earnings (SVC-260).
 *
 * ## The shape of the screen
 *
 * One headline — **total earned, all time** — then a window the provider picks,
 * then the jobs that made up that window. Lifetime first because it is the
 * figure a provider opens this tab for, and the only one that never moves for a
 * reason they have to work out; the window below it answers "and how am I doing
 * right now".
 *
 * Both figures are labelled. An unlabelled second number beside a labelled one
 * reads as a competing headline, and these two are not comparable — ₹48,250 all
 * time against ₹3,480 this week is not a comparison the layout should invite.
 *
 * ## The four states, and why they are all distinct
 *
 *     loading  →  error  →  zero  →  data
 *
 * Zero and error must never look alike. A provider with no completed jobs sees
 * "₹0", which is true. A provider whose request failed sees a retry and *no
 * number at all* — showing ₹0 there would tell them they have earned nothing,
 * which is the one wrong answer this screen can give. Same reasoning as
 * `ErrorState`, applied per block rather than per page: a failed window must not
 * blank out a lifetime total that loaded fine.
 *
 * ## Where the number comes from
 *
 * `useEarningsSummary` is the same query Provider Home's row reads. One key, one
 * request, and no way for the two screens to disagree (SVC-275 AC3).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, Receipt } from "lucide-react";

import { AccountAvatar } from "@/components/AccountAvatar";
import { WeekEarningsChart } from "@/components/provider/WeekEarningsChart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupees } from "@/lib/currency";
import { useAuth } from "@/lib/auth-context";
import {
  useEarnings,
  useEarningsSummary,
  type API_EarningsBookingItem,
  type EarningsRange,
} from "@/hooks/useApi";

export const Route = createFileRoute("/provider/earnings")({
  component: ProviderEarningsPage,
});

// Server windows are IST calendar boundaries, not rolling periods — "This week"
// means since Monday. The labels have to say so, or a provider reads a Monday
// morning ₹0 as a bug rather than as a week that has only just started.
const RANGES: { value: EarningsRange; tab: string; heading: string; empty: string }[] = [
  { value: "today", tab: "Today", heading: "TODAY", empty: "Nothing yet today" },
  { value: "week", tab: "This week", heading: "THIS WEEK", empty: "Nothing yet this week" },
  { value: "month", tab: "This month", heading: "THIS MONTH", empty: "Nothing yet this month" },
];

function ProviderEarningsPage() {
  // Only for the header avatar's initials.
  const { user } = useAuth();
  const [range, setRange] = useState<EarningsRange>("week");

  const summary = useEarningsSummary();
  const period = useEarnings(range);
  const active = RANGES.find((r) => r.value === range) ?? RANGES[1];

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">Earnings</h1>
        {/* Present even here: Profile left the tab bar, so an absent avatar
            would strand a provider who landed on this tab. */}
        <AccountAvatar to="/provider/profile" name={user?.name} />
      </div>

      {/* ---- Lifetime hero -------------------------------------------------
          The reason the tab exists. Deliberately the only thing at this size:
          a second figure this large turns a headline into a comparison. */}
      <section className="mt-6" aria-label="Total earned">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Total earned
        </p>
        {summary.isLoading ? (
          <>
            <Skeleton className="mt-2 h-10 w-44" />
            <Skeleton className="mt-2 h-4 w-36" />
          </>
        ) : summary.isError ? (
          // No figure at all. A provider who has earned ₹48,250 must not read
          // ₹0 here because a request timed out.
          <button
            onClick={() => void summary.refetch()}
            className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            Couldn&rsquo;t load your total.
            <span className="font-medium text-primary">Retry</span>
          </button>
        ) : (
          <>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-foreground">
              {formatRupees(summary.data?.lifetime_payout ?? 0)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.data?.completed_count ?? 0}{" "}
              {summary.data?.completed_count === 1 ? "job" : "jobs"} completed &middot; all time
            </p>
          </>
        )}
      </section>

      {/* ---- Window picker ------------------------------------------------ */}
      <div
        role="tablist"
        aria-label="Earnings period"
        className="mt-6 flex gap-1 rounded-xl bg-secondary p-1"
      >
        {RANGES.map((r) => (
          <button
            key={r.value}
            role="tab"
            aria-selected={r.value === range}
            onClick={() => setRange(r.value)}
            // Selected is the brand purple, not the shadcn default of a white
            // card on grey. On this screen the segment is the one control the
            // provider operates, and a near-white pill on a near-white ground
            // does not read as "pressed" at arm's length in daylight — which is
            // where a provider actually uses it.
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              r.value === range
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.tab}
          </button>
        ))}
      </div>

      {/* ---- The chosen window, and what made it up ----------------------- */}
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

        {/* The chart, week only (SVC-260). It hides itself on a quiet week and
            is absent on today/month — see WeekEarningsChart for both reasons.
            Placed above the list because it is the summary the list details. */}
        {!period.isLoading && !period.isError && range === "week" && period.data && (
          <WeekEarningsChart bookings={period.data.bookings} />
        )}

        {period.isLoading ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : period.isError ? null : period.data && period.data.bookings.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
            {period.data.bookings.map((job, i) => (
              <EarningRow key={job.booking_id} job={job} divided={i > 0} />
            ))}
          </div>
        ) : (
          // Copy, not a bare empty box. ₹0 above an empty list with nothing said
          // reads as a failed fetch; saying it plainly is the difference between
          // "you have earned nothing yet" and "something went wrong".
          <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
            <Receipt className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{active.empty}</p>
            <p className="px-8 text-xs text-muted-foreground">
              Completed jobs show up here with what you earned on each.
            </p>
          </div>
        )}
      </section>
    </div>
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
function EarningRow({ job, divided }: { job: API_EarningsBookingItem; divided: boolean }) {
  const tip = job.tip_amount ?? 0;

  return (
    <div className={`flex items-start gap-3 p-3.5 ${divided ? "border-t border-border" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{job.service_name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatCompletedAt(job.completed_at)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatRupees(job.payout_amount)}
        </p>
        {/* Reserved either way — see the note above. */}
        <p className="mt-0.5 text-xs tabular-nums text-emerald-600">
          {tip > 0 ? `incl. ${formatRupees(tip)} tip` : " "}
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
