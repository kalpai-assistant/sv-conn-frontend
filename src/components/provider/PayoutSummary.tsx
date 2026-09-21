/**
 * What is coming to the provider, and why it differs from what they earned
 * (SVC-303).
 *
 * ## The gap this exists to close
 *
 * "Earned" and "coming to you" are different numbers, and until now only the
 * first was on screen. The difference is real money:
 *
 * - **cash commission** — on a cash job the provider kept the whole amount at
 *   the door, so the platform's 20% is netted off their next online transfer;
 * - **the T+1 settlement gate** — a completed job is only payable once Razorpay
 *   has deposited that money with the platform.
 *
 * A provider shown ₹3,480 who receives ₹2,900 has been misled by their own app.
 * So the headline here is the **net** figure the payout will really send, and
 * whenever it differs from the gross, the breakdown says why. That breakdown is
 * the feature, not a detail: without it the two numbers look like a bug.
 *
 * ## States
 *
 * Four, and all distinct. Error shows a retry and **no figure** — ₹0 there
 * would tell a provider they are owed nothing when the truth is we could not
 * check. Two cases displace the figure entirely, because in both the number
 * alone would mislead:
 *
 * - **no payout method** — money is waiting and cannot be sent, which is the
 *   most actionable thing on the screen and fixable in a minute;
 * - **owing the platform** — after a run of cash work the commission can exceed
 *   online earnings, so nothing transfers. Rendered as plain accounting rather
 *   than an error, because nothing has gone wrong.
 */
import { Link } from "@tanstack/react-router";
import { AlertCircle, ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatRupees } from "@/lib/currency";
import { useProviderPayoutSummary } from "@/hooks/useApi";

/** "14 Sept" — a past payout date is a fact and safe to print. */
function formatPaidAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function PayoutSummary() {
  const { data, isLoading, isError, refetch } = useProviderPayoutSummary();

  if (isLoading) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-7 w-32" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          Couldn&rsquo;t load your payout.
          <span className="font-medium text-primary">Retry</span>
        </button>
      </div>
    );
  }

  if (!data) return null;

  const owesPlatform = data.balance_owed > 0;
  // Only worth explaining when the two actually differ. On an all-online week
  // with everything settled they are equal, and a breakdown of nothing is noise.
  const netted = !owesPlatform && data.gross_amount > data.pending_amount;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="p-4">
        {owesPlatform ? (
          // Not an error, and deliberately not styled as one: this is ordinary
          // accounting after a run of cash work.
          <>
            <p className="text-sm font-semibold text-foreground">Nothing to transfer this time</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              You&rsquo;ve done mostly cash work, so the commission owed (
              <span className="font-medium text-foreground">{formatRupees(data.balance_owed)}</span>
              ) is more than your online earnings. It comes off your next transfer — nothing to pay
              now.
            </p>
          </>
        ) : !data.payout_set && data.pending_amount > 0 ? (
          // The highest-value message on the screen: money is being held for a
          // reason the provider can fix in a minute. Replaces the figure, since
          // a bare amount here would look like money on its way.
          <>
            <p className="text-sm font-semibold text-foreground">
              {formatRupees(data.pending_amount)} is waiting to be sent
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              We can&rsquo;t pay you until you add a UPI ID or bank account.
            </p>
            <Link
              to="/provider/payout"
              className="mt-3 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Add payout details
            </Link>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Coming to you</p>
              <p className="text-xl font-bold tabular-nums text-emerald-600">
                {formatRupees(data.pending_amount)}
              </p>
            </div>

            {netted && (
              // The two facts behind the smaller number, so it is explained
              // before it arrives rather than queried afterwards.
              <div className="mt-3 space-y-1.5 border-t border-dashed border-border pt-3">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">
                    {data.pending_booking_count} {data.pending_booking_count === 1 ? "job" : "jobs"}{" "}
                    awaiting payout
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatRupees(data.gross_amount)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Held back</span>
                  <span className="tabular-nums text-amber-600">
                    &minus; {formatRupees(data.gross_amount - data.pending_amount)}
                  </span>
                </div>
                <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Cash commission you owe, and any job the bank hasn&rsquo;t settled with us yet.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Past payouts. A date here is a fact; no future date appears anywhere,
          because payouts are admin-triggered and there is no schedule to name. */}
      <Link
        to="/provider/payouts"
        className="flex items-center justify-between gap-3 border-t border-border p-3.5 transition-colors hover:bg-accent"
      >
        <div className="min-w-0">
          <p className="text-sm text-foreground">Paid out</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.last_paid_at ? `last ${formatPaidAt(data.last_paid_at)}` : "no payouts yet"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Null, not zero, when never paid — so this says nothing rather than
              claiming a ₹0 payout happened. */}
          {data.last_paid_amount != null && (
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatRupees(data.last_paid_amount)}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>
    </div>
  );
}
