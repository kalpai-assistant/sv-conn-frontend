/**
 * One Pro's earnings, for their SP (SVC-323): what the SP owes them when it
 * settles off-platform. Opened from My Team or the Earnings tab's by-Pro list.
 *
 * Same shape as the Earnings tab — lifetime first, then a window — and the same
 * window component, so the chart and the job rows cannot drift apart. The
 * lifetime figure is this Pro's row of `/me/earnings/by-pro?range=all` (the
 * windowed route has no `all`), which also supplies the name and photo: removed
 * Pros are on it, and `GET /me/team` would not know them.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, UserX } from "lucide-react";

import { BackButton } from "@/components/BackButton";
import { EarningsWindow, RangeTabs } from "@/components/provider/EarningsWindow";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { EarningsRange } from "@/hooks/useApi";
import { useEarningsByPro, useProEarnings } from "@/hooks/useProEarnings";
import { ApiError } from "@/lib/api";
import { formatRupees } from "@/lib/currency";
import { WINDOW_RANGES } from "@/lib/earnings-ranges";

export const Route = createFileRoute("/provider/team/$professionalId/earnings")({
  component: ProEarningsPage,
});

function ProEarningsPage() {
  const { professionalId } = Route.useParams();
  const [range, setRange] = useState<EarningsRange>("week");

  const lifetime = useEarningsByPro("all");
  const period = useProEarnings(range, professionalId);
  const pro = lifetime.data?.pros.find((p) => p.professional_id === professionalId);

  // Another SP's Pro or a made-up id. Said plainly, with no figures: a ₹0 here
  // would claim someone did no work.
  const notOnTeam =
    (period.error instanceof ApiError && period.error.status === 404) ||
    (lifetime.isSuccess && !pro);

  const name = pro ? (pro.is_self ? "You" : pro.display_name) : "";

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="flex items-center gap-3">
        <BackButton fallbackTo="/provider/team" />
        {pro ? (
          <>
            <Avatar className="h-8 w-8" aria-hidden>
              {pro.profile_photo_url && <AvatarImage src={pro.profile_photo_url} alt="" />}
              <AvatarFallback>{pro.display_name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">
              {name}
            </h1>
            {!pro.is_active && <Badge variant="outline">Removed</Badge>}
          </>
        ) : lifetime.isLoading ? (
          <Skeleton className="h-6 w-32" />
        ) : (
          <h1 className="text-lg font-semibold text-foreground">Earnings</h1>
        )}
      </div>

      {notOnTeam ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <UserX className="h-6 w-6 text-muted-foreground" />
          <p className="font-medium text-foreground">Not on your team</p>
          <p className="text-sm text-muted-foreground">
            This person isn&rsquo;t one of your team members.
          </p>
          <Link to="/provider/team" className="mt-2 text-sm font-medium text-primary">
            Back to My Team
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-6" aria-label="Total earned">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total earned
            </p>
            {lifetime.isLoading ? (
              <>
                <Skeleton className="mt-2 h-10 w-44" />
                <Skeleton className="mt-2 h-4 w-36" />
              </>
            ) : lifetime.isError || !pro ? (
              <button
                onClick={() => void lifetime.refetch()}
                className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                Couldn&rsquo;t load the total.
                <span className="font-medium text-primary">Retry</span>
              </button>
            ) : pro.completed_count === 0 ? (
              <p className="mt-1 text-lg font-medium text-muted-foreground">No jobs yet</p>
            ) : (
              <>
                <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-foreground">
                  {formatRupees(pro.payout)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pro.completed_count} {pro.completed_count === 1 ? "job" : "jobs"} completed
                  &middot; all time
                </p>
              </>
            )}
          </section>

          <RangeTabs ranges={WINDOW_RANGES} value={range} onChange={setRange} />

          <EarningsWindow
            range={range}
            period={period}
            emptyHint={
              pro?.is_self
                ? "Jobs you complete yourself show up here."
                : "Jobs they complete show up here with what each one earned."
            }
          />
        </>
      )}
    </div>
  );
}
