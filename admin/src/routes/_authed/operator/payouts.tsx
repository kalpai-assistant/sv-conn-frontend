/**
 * Payouts (SVC-426): who we owe, what's been paid and what failed, one row per SP,
 * with one SP opened beside the list. Below lg the two stack, because the
 * sidebar leaves too little room for both.
 *
 * The ticket says /payouts; the console is section-prefixed, so it's
 * /operator/payouts. The filter, page, open SP and the SP's own bookings filter
 * and pages all live in the URL, so a refresh or a pasted link opens the same view.
 *
 * Every role reads. Admin and ops pay out and re-queue failed payouts; only admin
 * re-queues reversed ones. The backend checks each again (require_roles).
 */
import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Pager } from "@/components/payouts/Pager";
import { CsvExport, SettlementSelect } from "@/components/payouts/PayoutToolbar";
import { ProviderDetailPane } from "@/components/payouts/ProviderDetailPane";
import { ProviderList } from "@/components/payouts/ProviderList";
import {
  PAYOUTS_PAGE_SIZE,
  payoutProvidersPath,
  settlementLabel,
  validatePayoutsSearch,
  type PayoutProvidersPage,
  type PayoutsSearch,
} from "@/lib/payouts";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/payouts")({
  component: PayoutsPage,
  validateSearch: validatePayoutsSearch,
});

/** When the panes are stacked, the detail opens a long way below the row. */
function scrollIfStacked(element: HTMLElement | null) {
  if (window.matchMedia?.("(max-width: 1023px)").matches) {
    element?.scrollIntoView({ block: "start" });
  }
}

function PayoutsPage() {
  const { admin } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = search.page ?? 1;
  const selectedId = search.sp;

  const list = useApiGet<PayoutProvidersPage>(
    payoutProvidersPath({ status: search.status, page: search.page }),
  );
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selectedId) {
      // The pane scrolls on its own and outlives the SP: each opens at its top.
      if (detailRef.current) {
        detailRef.current.scrollTop = 0;
      }
      scrollIfStacked(detailRef.current);
    }
  }, [selectedId]);

  // Replace, not push: opening and closing SPs shouldn't fill Back with them.
  // A different SP starts its bookings and history from the top.
  // No scroll reset: the router's default would undo the effect above that
  // scrolls a stacked detail into view, so on a phone the tap looked dead.
  function openProvider(id: string | undefined) {
    navigate({
      search: (prev: PayoutsSearch) => ({
        ...prev,
        sp: id,
        bstatus: undefined,
        bpage: undefined,
        hpage: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }

  function patchSearch(patch: Partial<PayoutsSearch>) {
    navigate({ search: (prev: PayoutsSearch) => ({ ...prev, ...patch }) });
  }

  const data = list.status === "ready" ? list.data : null;
  const selected = data?.providers.find((p) => p.provider_id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
        <p className="text-sm text-muted-foreground">
          What each service provider has earned, been paid and is owed, largest pending amount
          first. Select one to see the bookings behind it and its payout history. Times are in IST.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-lg border bg-card p-3">
          <SettlementSelect
            label="SPs with bookings that are"
            value={search.status}
            allLabel="Any status"
            onChange={(status) => patchSearch({ status, page: undefined })}
          />
        </div>
        <CsvExport />
      </div>

      <div
        className={`grid items-start gap-6 ${
          selectedId ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""
        }`}
      >
        <section aria-label="Service provider list" className="min-w-0 space-y-3">
          {list.status === "loading" && <LoadingState rows={6} />}
          {list.status === "error" && (
            <ErrorState message="Couldn't load payouts." onRetry={list.retry} />
          )}
          {data && data.providers.length === 0 && page > 1 && (
            <EmptyState message="Nothing on this page." detail="Go back to see the rest." />
          )}
          {data && data.providers.length === 0 && page === 1 && (
            <EmptyState
              message={
                search.status
                  ? `No SPs have ${settlementLabel(search.status).toLowerCase()} bookings.`
                  : "No SP has an online booking to pay out yet."
              }
            />
          )}
          {data && data.providers.length > 0 && (
            <ProviderList
              providers={data.providers}
              selectedId={selectedId}
              onOpen={openProvider}
            />
          )}
          {data && (
            <Pager
              label="SP pages"
              page={page}
              total={data.total}
              perPage={PAYOUTS_PAGE_SIZE}
              noun={["service provider", "service providers"]}
              onPage={(target) => patchSearch({ page: target > 1 ? target : undefined })}
            />
          )}
        </section>

        {selectedId && (
          <section
            aria-label="Service provider detail"
            ref={detailRef}
            // Stays in view while the list scrolls. Night mode only swaps our tokens,
            // so Chrome would draw this pane's scrollbar white without color-scheme.
            className="min-w-0 scroll-mt-4 [color-scheme:light_dark] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
          >
            <ProviderDetailPane
              key={selectedId}
              providerId={selectedId}
              provider={selected}
              listStatus={list.status}
              role={admin.role}
              search={search}
              onSearch={patchSearch}
              onClose={() => openProvider(undefined)}
              onChanged={list.refresh}
            />
          </section>
        )}
      </div>
    </div>
  );
}
