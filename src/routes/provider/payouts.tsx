/**
 * The provider's payout statement (SVC-303).
 *
 * ## Why its own screen
 *
 * A statement is a different reading task from a dashboard. The Earnings tab
 * answers "how am I doing"; this answers "when did that money arrive, and why
 * was it that much". Inlining it would push the second question into a screen
 * built for the first.
 *
 * ## One row per settlement cycle, not per job
 *
 * A payout settles a batch, so the date and the amount belong to the cycle. That
 * is also why the per-job chips on the Earnings tab carry no date: there is no
 * correct per-booking paid date to show, and the join that would fake one
 * duplicates rows and doubles the total.
 *
 * Each row carries what was deducted from it. That single line is the answer to
 * "why was this transfer smaller than I expected" — asked at exactly the moment
 * a provider is looking at the number that surprised them.
 *
 * The list holds payouts that **happened**. The backend filters out cycles that
 * moved no money, so a row here means it landed, not that we tried.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Wallet } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";
import { formatRupees } from "@/lib/currency";
import { useProviderPayouts, useProviderPayoutSummary } from "@/hooks/useApi";
import type { API_ProviderPayoutEntry } from "@/hooks/useApi";

export const Route = createFileRoute("/provider/payouts")({
  component: ProviderPayoutsPage,
});

/** "14 Sept 2026" — the year matters here, unlike in a single window. */
function formatPaidAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PayoutRow({ entry, divided }: { entry: API_ProviderPayoutEntry; divided: boolean }) {
  return (
    <div className={`flex items-start gap-3 p-3.5 ${divided ? "border-t border-border" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{formatPaidAt(entry.paid_at)}</p>
        {/* Reserved whether or not there was a deduction, so the list does not
            go ragged and draw the eye to the deducted ones — the same rule the
            tip column follows on the Earnings tab. */}
        <p className="mt-0.5 text-xs tabular-nums text-amber-600">
          {entry.cash_commission_deducted > 0
            ? `− ${formatRupees(entry.cash_commission_deducted)} cash commission`
            : " "}
        </p>
      </div>
      <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
        {formatRupees(entry.amount)}
      </p>
    </div>
  );
}

function ProviderPayoutsPage() {
  // The summary is already cached by the Earnings tab this screen is reached
  // from, so the header figure costs nothing extra.
  const summary = useProviderPayoutSummary();
  const list = useProviderPayouts();

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="flex items-center gap-2">
        {/* A back arrow, unlike the tab destinations: this screen sits below
            Earnings rather than beside it in the bar. */}
        <Link
          to="/provider/earnings"
          aria-label="Back to earnings"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold text-foreground">Payouts</h1>
      </div>

      <section className="mt-6" aria-label="Paid out, all time">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Paid out, all time
        </p>
        {list.isLoading ? (
          <>
            <Skeleton className="mt-2 h-9 w-40" />
            <Skeleton className="mt-2 h-4 w-32" />
          </>
        ) : list.isError ? null : (
          <>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {formatRupees(
                (list.data?.entries ?? []).reduce((total, entry) => total + entry.amount, 0),
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {list.data?.total ?? 0} {list.data?.total === 1 ? "payout" : "payouts"}
              {summary.data?.last_paid_at
                ? ` · last ${formatPaidAt(summary.data.last_paid_at)}`
                : ""}
            </p>
          </>
        )}
      </section>

      {/* isError before empty, always: a failed fetch must never render as
          "you have never been paid". See the ordering note in ErrorState. */}
      {list.isLoading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.isError ? (
        <ErrorState message="Couldn't load your payouts." onRetry={() => void list.refetch()} />
      ) : list.data && list.data.entries.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {list.data.entries.map((entry, i) => (
            <PayoutRow key={entry.id} entry={entry} divided={i > 0} />
          ))}
        </div>
      ) : (
        // Reachable and ordinary: every provider is here until their first
        // payout. Said in words rather than as "₹0", which the API deliberately
        // returns as null so this can be phrased truthfully.
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
          <Wallet className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No payouts yet</p>
          <p className="px-8 text-xs text-muted-foreground">
            Your first payout will show here once it&rsquo;s sent.
          </p>
        </div>
      )}
    </div>
  );
}
