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
import { AlertCircle } from "lucide-react";

import { AccountAvatar } from "@/components/AccountAvatar";
import { EarningsWindow, RangeTabs } from "@/components/provider/EarningsWindow";
import { PayoutSummary } from "@/components/provider/PayoutSummary";
import { ProEarningsBreakdown } from "@/components/provider/ProEarningsBreakdown";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupees } from "@/lib/currency";
import { WINDOW_RANGES } from "@/lib/earnings-ranges";
import { useAuth } from "@/lib/auth-context";
import { useEarnings, useEarningsSummary, type EarningsRange } from "@/hooks/useApi";
import { hasTeam, useEarningsByPro, type EarningsWithProResponse } from "@/hooks/useProEarnings";

export const Route = createFileRoute("/provider/earnings")({
  component: ProviderEarningsPage,
});

function ProviderEarningsPage() {
  // Only for the header avatar's initials.
  const { user } = useAuth();
  const [range, setRange] = useState<EarningsRange>("week");

  const summary = useEarningsSummary();
  const period = useEarnings(range);
  // SVC-323: who did the window's jobs. Also how this screen learns the SP has
  // a team at all — a solo SP's response lists only themselves, and they see
  // the tab exactly as before. Loading or failed reads as solo, so nothing
  // team-shaped flashes up for the 99% who never invite anyone.
  const byPro = useEarningsByPro(range);
  const team = hasTeam(byPro.data);
  const [splitOpen, setSplitOpen] = useState(false);

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

      {/* What is actually coming, and why it differs from what was earned
          (SVC-303). Below the hero because the lifetime total is the reason
          this tab exists; above the window picker because "when do I get paid"
          outranks "how was last week". */}
      <PayoutSummary />

      <RangeTabs ranges={WINDOW_RANGES} value={range} onChange={setRange} />

      <EarningsWindow
        range={range}
        // The by-Pro fields are additive on the same response (backend #198).
        period={{ ...period, data: period.data as EarningsWithProResponse | undefined }}
        showPro={team}
      />

      {/* Below the job list, not between it and the window card: this lands on
          its own request, and appearing above the list would shove the rows the
          provider is reading out from under them. */}
      {team && byPro.data && byPro.data.range === range && (
        <ProEarningsBreakdown data={byPro.data} open={splitOpen} onOpenChange={setSplitOpen} />
      )}
    </div>
  );
}
