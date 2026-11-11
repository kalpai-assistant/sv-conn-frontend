/**
 * Supply (SVC-432): the SP and Pro side. Who's active, whether new SPs stick,
 * who's churned, where demand goes unmet, what things cost and how fast an SP
 * accepts.
 *
 * Admin and ops (nav.ts); support is sent home by the guard, and the backend
 * 403s them too. ?weeks= is in the URL. Definitions: sv-conn-backend ADMIN.md
 * "Analytics (SVC-432)".
 */
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import {
  ActiveSupplyChart,
  ChurnChart,
  PriceBoxPlot,
  SpCohortTable,
  SupplyGapHeatmap,
  TimeToAcceptChart,
} from "@/components/analytics/SupplyCharts";
import { AnalyticsHeader, StatTile } from "@/components/analytics/parts";
import {
  DEFAULT_WEEKS,
  isSupplyEmpty,
  supplyPath,
  toAcceptSeries,
  toChurnSeries,
  toGapMatrix,
  validateAnalyticsSearch,
  type SupplyResponse,
  type WeeksOption,
} from "@/lib/analytics";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/analytics/supply")({
  component: SupplyPage,
  validateSearch: validateAnalyticsSearch,
});

function SupplyPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const weeks = search.weeks ?? DEFAULT_WEEKS;
  const result = useApiGet<SupplyResponse>(supplyPath(weeks));
  const data = result.status === "ready" ? result.data : null;

  function setWeeks(next: WeeksOption) {
    navigate({ search: validateAnalyticsSearch({ weeks: next }), resetScroll: false });
  }

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Supply"
        description={`Service providers and Pros over the last ${weeks} weeks, by IST week starting Monday. The active counts are fixed windows; churn and prices are all time.`}
        weeks={weeks}
        onWeeksChange={setWeeks}
        asOf={data?.as_of ?? null}
      />

      {result.status === "loading" && <LoadingState rows={6} />}
      {result.status === "error" && (
        <ErrorState message="Couldn't load the supply dashboard." onRetry={result.retry} />
      )}
      {data && isSupplyEmpty(data) && (
        <Card>
          <EmptyState
            message="No supply data yet."
            detail="The charts fill in once SPs are verified and take bookings."
          />
        </Card>
      )}
      {data && !isSupplyEmpty(data) && <SupplyBody data={data} />}
    </div>
  );
}

function SupplyBody({ data }: { data: SupplyResponse }) {
  const a = data.active;
  return (
    <>
      <section aria-label="Active supply" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active SPs, last 7 days" value={String(a.sps_7d)} />
        <StatTile label="Active SPs, last 30 days" value={String(a.sps_30d)} />
        <StatTile label="Active Pros, last 7 days" value={String(a.pros_7d)} />
        <StatTile label="Active Pros, last 30 days" value={String(a.pros_30d)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActiveSupplyChart weeks={a.weekly} />
        <TimeToAcceptChart weeks={toAcceptSeries(data.time_to_accept)} />
      </div>

      <SupplyGapHeatmap matrix={toGapMatrix(data.supply_gap)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SpCohortTable cohorts={data.sp_cohorts} />
        <ChurnChart months={toChurnSeries(data.churn)} />
      </div>

      <PriceBoxPlot prices={data.prices} />
    </>
  );
}
