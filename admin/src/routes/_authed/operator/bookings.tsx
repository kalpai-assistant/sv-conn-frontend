/**
 * Bookings (SVC-425): every booking, filtered, with one opened beside the list.
 * Below lg the two stack, because the sidebar leaves too little room for both.
 *
 * Filters, page and the open booking all live in the URL, so a refresh or a link
 * pasted into a support thread opens the same view. Unlike the KYC queue the
 * selection belongs in the URL: a booking id is what support passes around.
 */
import { useEffect, useRef } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BookingDetailPane } from "@/components/bookings/BookingDetailPane";
import {
  BookingFilters,
  BookingIdLookup,
  type FilterPatch,
} from "@/components/bookings/BookingFilters";
import { BookingList } from "@/components/bookings/BookingList";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  bookingsListPath,
  canForceCancel,
  hasFilters,
  lastPage,
  validateBookingsSearch,
  type BookingListPage,
  type BookingsSearch,
} from "@/lib/bookings";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/operator/bookings")({
  component: BookingsPage,
  validateSearch: validateBookingsSearch,
});

/** When the panes are stacked, the detail opens a long way below the row. */
function scrollIfStacked(element: HTMLElement | null) {
  if (window.matchMedia?.("(max-width: 1023px)").matches) {
    element?.scrollIntoView({ block: "start" });
  }
}

function BookingsPage() {
  const { admin } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = search.page ?? 1;
  const selectedId = search.booking;

  const listPath = bookingsListPath(search);
  const list = useApiGet<BookingListPage>(listPath);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selectedId) {
      // The pane scrolls on its own and outlives the booking: each opens at its top.
      if (detailRef.current) {
        detailRef.current.scrollTop = 0;
      }
      scrollIfStacked(detailRef.current);
    }
  }, [selectedId]);

  function changeFilters(patch: FilterPatch) {
    navigate({ search: (prev: BookingsSearch) => ({ ...prev, ...patch, page: undefined }) });
  }

  function clearFilters() {
    navigate({ search: (prev: BookingsSearch) => ({ booking: prev.booking }) });
  }

  // Replace, not push: opening and closing bookings shouldn't fill Back with them.
  function openBooking(id: string | undefined) {
    navigate({ search: (prev: BookingsSearch) => ({ ...prev, booking: id }), replace: true });
  }

  const data = list.status === "ready" ? list.data : null;
  const refused =
    list.status === "error" && list.error instanceof ApiError && list.error.status === 422
      ? list.error.message
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">
            Every booking, newest first. Select one to see its details and timeline. Times are in
            IST.
          </p>
        </div>
        <div className="w-full sm:w-96">
          <BookingIdLookup onOpen={openBooking} />
        </div>
      </div>

      <BookingFilters search={search} onChange={changeFilters} onClear={clearFilters} />

      {(search.provider_id || search.pro) && (
        <NarrowedTo
          search={search}
          onShowAll={() =>
            navigate({
              search: (prev: BookingsSearch) => ({
                ...prev,
                provider_id: undefined,
                pro: undefined,
                page: undefined,
              }),
            })
          }
        />
      )}

      <div
        className={`grid items-start gap-6 ${
          selectedId ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""
        }`}
      >
        <section aria-label="Booking list" className="min-w-0 space-y-3">
          {list.status === "loading" && <LoadingState rows={6} />}
          {refused && (
            <Alert variant="destructive">
              <AlertDescription className="[overflow-wrap:anywhere]">{refused}</AlertDescription>
            </Alert>
          )}
          {list.status === "error" && !refused && (
            <ErrorState message="Couldn't load bookings." onRetry={list.retry} />
          )}
          {data && data.bookings.length === 0 && page > 1 && (
            <EmptyState message="Nothing on this page." detail="Go back to see earlier bookings." />
          )}
          {data && data.bookings.length === 0 && page === 1 && (
            <EmptyState
              message={hasFilters(search) ? "No bookings match these filters." : "No bookings yet."}
              detail={hasFilters(search) ? "Widen the dates or clear a filter." : undefined}
            />
          )}
          {data && data.bookings.length > 0 && (
            <BookingList bookings={data.bookings} selectedId={selectedId} onOpen={openBooking} />
          )}
          {data && <Pager search={search} page={page} total={data.total} />}
        </section>

        {selectedId && (
          <section
            aria-label="Booking detail"
            ref={detailRef}
            // Stays in view while the list scrolls. Night mode only swaps our tokens,
            // so Chrome would draw this pane's scrollbar white without color-scheme.
            className="min-w-0 scroll-mt-4 [color-scheme:light_dark] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
          >
            <BookingDetailPane
              key={selectedId}
              bookingId={selectedId}
              canCancel={canForceCancel(admin.role)}
              onClose={() => openBooking(undefined)}
              onChanged={list.refresh}
            />
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * The SP and Pro page links narrow the list to one id (SVC-427). Neither has a
 * box of its own above, so this says so, and links back to who it is.
 */
function NarrowedTo({ search, onShowAll }: { search: BookingsSearch; onShowAll: () => void }) {
  const linkClass = "font-medium text-primary underline-offset-2 hover:underline";
  return (
    <div
      role="note"
      aria-label="Narrowed list"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
    >
      {search.provider_id && (
        <span>
          Only{" "}
          <Link
            to="/operator/sps/$spId"
            params={{ spId: search.provider_id }}
            className={linkClass}
          >
            this service provider
          </Link>
          &apos;s bookings.
        </span>
      )}
      {search.pro && (
        <span>
          Only{" "}
          <Link to="/operator/pros/$proId" params={{ proId: search.pro }} className={linkClass}>
            this Pro
          </Link>
          &apos;s bookings.
        </span>
      )}
      <Button variant="ghost" size="sm" onClick={onShowAll}>
        Show everyone&apos;s
      </Button>
    </div>
  );
}

function Pager({ search, page, total }: { search: BookingsSearch; page: number; total: number }) {
  const last = lastPage(total);
  if (total === 0 && page === 1) {
    return null;
  }
  const to = (target: number): BookingsSearch => ({
    ...search,
    page: target > 1 ? target : undefined,
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {last} · {total} {total === 1 ? "booking" : "bookings"}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/operator/bookings" search={to(Math.min(page - 1, last))}>
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {page < last ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/operator/bookings" search={to(page + 1)}>
              Next
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
