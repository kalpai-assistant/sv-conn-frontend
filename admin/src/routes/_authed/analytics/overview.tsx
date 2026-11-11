/**
 * Overview (SVC-432): business health. GMV over 7/30/90 days, weekly GMV, take
 * rate and AOV, bookings per day, and consumer retention by signup week.
 *
 * Admin and ops (nav.ts); support is sent home by the guard, and the backend
 * 403s them too. ?weeks= is in the URL so a link opens the same range. The
 * numbers are the backend's 15-minute views (sv-conn-backend ADMIN.md
 * "Analytics (SVC-432)" defines each one); nothing is computed here but labels.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import {
  AovChart,
  BookingsPerDayChart,
  ConsumerCohortTable,
  MarketplaceHealthCard,
  TakeRateChart,
  WeeklyGmvChart,
} from "@/components/analytics/OverviewCharts";
import { AnalyticsHeader, StatTile } from "@/components/analytics/parts";
import {
  DEFAULT_WEEKS,
  isOverviewEmpty,
  overviewPath,
  toDailySeries,
  toGmvTiles,
  toWeeklySeries,
  validateAnalyticsSearch,
  type OverviewResponse,
  type WeeksOption,
} from "@/lib/analytics";
import { formatRupees } from "@/lib/money";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/analytics/overview")({
  component: OverviewPage,
  validateSearch: validateAnalyticsSearch,
});

function OverviewPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const weeks = search.weeks ?? DEFAULT_WEEKS;
  const result = useApiGet<OverviewResponse>(overviewPath(weeks));
  const data = result.status === "ready" ? result.data : null;

  function setWeeks(next: WeeksOption) {
    navigate({ search: validateAnalyticsSearch({ weeks: next }), resetScroll: false });
  }

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title="Overview"
        description={`Business health over the last ${weeks} weeks, by IST week starting Monday. The GMV cards are fixed windows.`}
        weeks={weeks}
        onWeeksChange={setWeeks}
        asOf={data?.as_of ?? null}
      />

      {result.status === "loading" && <LoadingState rows={6} />}
      {result.status === "error" && (
        <ErrorState message="Couldn't load the overview." onRetry={result.retry} />
      )}
      {data && isOverviewEmpty(data) && (
        <Card>
          <EmptyState
            message="No bookings yet."
            detail="The charts fill in once consumers start booking."
          />
        </Card>
      )}
      {data && !isOverviewEmpty(data) && <OverviewBody data={data} weeks={weeks} />}
    </div>
  );
}

function OverviewBody({ data, weeks }: { data: OverviewResponse; weeks: WeeksOption }) {
  const weekly = toWeeklySeries(data.weekly);
  return (
    <>
      <section aria-label="GMV" className="grid gap-3 sm:grid-cols-3">
        {toGmvTiles(data.gmv).map((tile) => (
          <StatTile
            key={tile.label}
            label={`GMV, ${tile.label.toLowerCase()}`}
            value={formatRupees(tile.gmv)}
            detail={`${tile.completed} completed`}
            change={{
              text: tile.change,
              direction: tile.direction,
              against:
                tile.previousGmv === null
                  ? "vs previous period (not enough history)"
                  : `vs previous period (${formatRupees(tile.previousGmv)})`,
            }}
          />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <WeeklyGmvChart weeks={weekly} />
        <TakeRateChart weeks={weekly} />
        <AovChart weeks={weekly} />
        <MarketplaceHealthCard />
      </div>

      <BookingsPerDayChart days={toDailySeries(data.daily)} weeks={weeks} />
      <ConsumerCohortTable cohorts={data.cohorts} />
    </>
  );
}
