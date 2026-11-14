/**
 * The support console (SVC-433): one search box, the backend works out what was
 * typed (phone, booking ID or its last 6 characters, SP name), and the hits open
 * beside the list. Lookup-first, for "a customer calls and reads out their
 * number"; the bookings screen is the browse-first view.
 *
 * The query and whatever is open live in the URL, so Back and a pasted link both
 * work. A new search adds a history entry; opening and closing items replaces it.
 * All three roles see the page and every action on it.
 */
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { CustomerPanel } from "@/components/support/CustomerPanel";
import { LookupResults, LookupSummary } from "@/components/support/LookupResults";
import { SupportBooking } from "@/components/support/SupportBooking";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import {
  LOOKUP_MAX,
  checkLookupQuery,
  directBookingHit,
  lookupPath,
  lookupTotal,
  validateSupportSearch,
  type LookupResponse,
  type SupportSearch,
} from "@/lib/support";
import { useApiGet } from "@/lib/use-api-get";

export const Route = createFileRoute("/_authed/support/lookup")({
  component: LookupPage,
  validateSearch: validateSupportSearch,
});

/** When the panes are stacked, the detail opens a long way below the results. */
function scrollIfStacked(element: HTMLElement | null) {
  if (window.matchMedia?.("(max-width: 1023px)").matches) {
    element?.scrollIntoView({ block: "start" });
  }
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      role="search"
      noValidate
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const check = checkLookupQuery(value);
        if (!check.ok) {
          setError(check.message);
          return;
        }
        setError(null);
        onSearch(check.query);
      }}
    >
      <label htmlFor="support-lookup" className="text-sm font-medium">
        Phone number, booking ID or name
      </label>
      <div className="flex gap-2">
        <Input
          id="support-lookup"
          type="search"
          value={value}
          maxLength={LOOKUP_MAX}
          autoComplete="off"
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          placeholder="98765 43210, a booking ID, or a name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "support-lookup-error" : "support-lookup-hint"}
          className="min-w-0 flex-1"
        />
        <Button type="submit" className="shrink-0">
          <Search />
          Search
        </Button>
      </div>
      {error ? (
        <p id="support-lookup-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id="support-lookup-hint" className="text-xs text-muted-foreground">
          Any format of phone number works, with or without +91. A booking can be found by its full
          ID or its last 6 characters.
        </p>
      )}
    </form>
  );
}

function LookupPage() {
  const { admin } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const path = lookupPath(search.q);
  const lookup = useApiGet<LookupResponse>(path);
  const detailRef = useRef<HTMLElement>(null);
  const autoOpened = useRef<string | null>(null);

  const result = path && lookup.status === "ready" ? lookup.data : null;
  const open = search.booking ?? search.customer;

  function runSearch(q: string) {
    // A new search starts clean: a different caller, most likely.
    navigate({ search: { q } });
  }

  // Replace, not push: opening and closing items shouldn't fill Back with them.
  // No scroll reset, for the same reason as the bookings screen.
  function show(patch: Partial<SupportSearch>) {
    navigate({
      search: (prev: SupportSearch) => ({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    });
  }

  // A full booking ID that found just that booking opens it straight away. Once
  // per query, so closing it doesn't bring it back.
  const direct = result ? directBookingHit(result) : null;
  useEffect(() => {
    if (direct && search.q && autoOpened.current !== search.q && !search.booking) {
      autoOpened.current = search.q;
      navigate({
        search: (prev: SupportSearch) => ({ ...prev, booking: direct, customer: undefined }),
        replace: true,
        resetScroll: false,
      });
    }
  }, [direct, search.q, search.booking, navigate]);

  useEffect(() => {
    if (open) {
      if (detailRef.current) {
        detailRef.current.scrollTop = 0;
      }
      scrollIfStacked(detailRef.current);
    }
  }, [open]);

  const refused =
    path &&
    lookup.status === "error" &&
    lookup.error instanceof ApiError &&
    lookup.error.status === 422
      ? lookup.error.message
      : null;
  const queryProblem = search.q && !path ? checkLookupQuery(search.q) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Lookup</h1>
        <p className="text-sm text-muted-foreground">
          Find a customer, booking, service provider or Pro from whatever the caller can tell you.
          Times are in IST.
        </p>
      </div>

      <div className="max-w-xl">
        {/* Keyed by the query, so Back puts the box back to what was searched. */}
        <SearchBox key={search.q ?? ""} initial={search.q ?? ""} onSearch={runSearch} />
      </div>

      <div
        className={`grid items-start gap-6 ${
          open ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""
        }`}
      >
        <section aria-label="Lookup results" className="min-w-0 space-y-4">
          {queryProblem && !queryProblem.ok && (
            <Alert variant="destructive">
              <AlertDescription>{queryProblem.message}</AlertDescription>
            </Alert>
          )}
          {!search.q && !open && (
            <EmptyState
              message="Search to get started."
              detail="Results show customers, bookings, service providers and Pros together."
            />
          )}
          {path && lookup.status === "loading" && <LoadingState rows={4} />}
          {refused && (
            <Alert variant="destructive">
              <AlertDescription className="[overflow-wrap:anywhere]">{refused}</AlertDescription>
            </Alert>
          )}
          {path && lookup.status === "error" && !refused && (
            <ErrorState message="Couldn't run the lookup." onRetry={lookup.retry} />
          )}
          {result && (
            <>
              <LookupSummary result={result} />
              {lookupTotal(result) === 0 ? (
                <EmptyState
                  message={`Nothing matches “${result.query}”.`}
                  detail="Check the number, or try the last 6 characters of the booking ID."
                />
              ) : (
                <LookupResults
                  result={result}
                  selectedCustomer={search.booking ? undefined : search.customer}
                  selectedBooking={search.booking}
                  onOpenCustomer={(id) => show({ customer: id, booking: undefined })}
                  onOpenBooking={(id) => show({ booking: id, customer: undefined })}
                />
              )}
            </>
          )}
        </section>

        {open && (
          <section
            aria-label={search.booking ? "Booking detail" : "Customer detail"}
            ref={detailRef}
            // Night mode only swaps our tokens, so Chrome would draw this pane's
            // scrollbar white without color-scheme.
            className="min-w-0 scroll-mt-4 [color-scheme:light_dark] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
          >
            {search.booking ? (
              <SupportBooking
                key={search.booking}
                bookingId={search.booking}
                role={admin.role}
                onClose={() => show({ booking: undefined })}
                onBackToCustomer={search.customer ? () => show({ booking: undefined }) : undefined}
              />
            ) : (
              search.customer && (
                <CustomerPanel
                  key={search.customer}
                  customerId={search.customer}
                  onOpenBooking={(id) => show({ booking: id })}
                  onClose={() => show({ customer: undefined })}
                />
              )
            )}
          </section>
        )}
      </div>
    </div>
  );
}
