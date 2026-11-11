/**
 * Refunds (SVC-431): the dispute queue, newest first, filtered by status, reason
 * and the IST day it was logged. Filters and page live in the URL, so a refresh
 * or a pasted link opens the same view.
 *
 * An index route on purpose: as refunds.tsx it would be the parent of
 * refunds/$bookingId.tsx, and a booking's URL would render this list.
 */
import { createFileRoute } from "@tanstack/react-router";
import { DateFilter } from "@/components/bookings/BookingFilters";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Pager } from "@/components/payouts/Pager";
import { DisputeList } from "@/components/refunds/DisputeList";
import { OptionFilter } from "@/components/teams/DirectoryControls";
import { Button } from "@/components/ui/button";
import {
  REASON_OPTIONS,
  STATUS_OPTIONS,
  disputesListPath,
  hasRefundFilters,
  validateRefundsSearch,
  type DisputeListPage,
  type RefundsSearch,
} from "@/lib/disputes";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/refunds/")({
  component: RefundsPage,
  validateSearch: validateRefundsSearch,
});

function RefundsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = search.page ?? 1;
  const list = useApiGet<DisputeListPage>(disputesListPath(search));
  const data = list.status === "ready" ? list.data : null;

  function patch(next: Partial<RefundsSearch>) {
    navigate({ search: (prev: RefundsSearch) => ({ ...prev, ...next, page: undefined }) });
  }

  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Refunds</h1>
        <p className="text-sm text-muted-foreground">
          Customer disputes, newest first. To log a new one, open the booking from Bookings and
          choose Disputes &amp; refunds.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <OptionFilter
            label="Status"
            anyLabel="All statuses"
            options={STATUS_OPTIONS}
            value={search.status}
            onChange={(status) => patch({ status })}
          />
          <OptionFilter
            label="Reason"
            anyLabel="All reasons"
            options={REASON_OPTIONS}
            value={search.reason}
            onChange={(reason) => patch({ reason })}
          />
          <DateFilter
            label="Logged from"
            value={search.from}
            onCommit={(from) => patch({ from })}
          />
          <DateFilter label="Logged to" value={search.to} onCommit={(to) => patch({ to })} />
        </div>
        {hasRefundFilters(search) && (
          <Button variant="ghost" onClick={() => navigate({ search: {} })}>
            Clear filters
          </Button>
        )}
      </div>

      <section aria-label="Dispute list" className="min-w-0 space-y-3">
        {list.status === "loading" && <LoadingState rows={6} />}
        {list.status === "error" && (
          <ErrorState message="Couldn't load the disputes." onRetry={list.retry} />
        )}
        {data && data.items.length === 0 && (
          <EmptyState
            message={
              page > 1
                ? "Nothing on this page."
                : hasRefundFilters(search)
                  ? "No dispute matches."
                  : "No disputes yet."
            }
            detail={page === 1 && hasRefundFilters(search) ? "Try clearing a filter." : undefined}
          />
        )}
        {data && data.items.length > 0 && <DisputeList rows={data.items} />}
        {data && (
          <Pager
            label="Dispute pages"
            page={page}
            total={data.total}
            perPage={data.per_page}
            noun={["dispute", "disputes"]}
            onPage={(target) =>
              navigate({
                search: (prev: RefundsSearch) => ({
                  ...prev,
                  page: target > 1 ? target : undefined,
                }),
              })
            }
          />
        )}
      </section>
    </div>
  );
}
