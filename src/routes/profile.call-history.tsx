/**
 * Consumer Call History (SVC-452).
 *
 * The audit side of call masking: every bridged call this consumer has
 * been on, with just enough detail to recognise one ("did I call Rohan
 * yesterday?") and reopen the booking if it still exists. First-name
 * only, duration, outcome — never a raw phone number, never a last name.
 * Matches the SP's mirror screen (SVC-453) in shape and the admin-side
 * privacy defaults (SVC-454).
 *
 * ## Pagination
 * 50 rows per page, baked default (SVC-452). Backed by `useInfiniteQuery`
 * in `useConsumerCallHistory` so "Load more" is a single button rather
 * than every screen re-rolling offset/concat/dedupe. Hidden when the
 * server reports `loaded >= total` or returns a short page.
 *
 * ## Tap behaviour
 * A row carries `booking_id` when the booking still exists; tapping opens
 * `/tracking/$bookingId`. A null `booking_id` renders as a static row —
 * the booking was deleted (SVC-367 account-delete scrubs them) or the
 * call was unmatched (SVC-450 writes an audit row for a stranger caller).
 * Either way we don't offer a dead link.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Phone, PhoneCall, PhoneMissed } from "lucide-react";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import {
  CALL_HISTORY_PAGE_SIZE,
  useConsumerCallHistory,
  type API_ConsumerCallHistoryEntry,
} from "@/hooks/useApi";

export const Route = createFileRoute("/profile/call-history")({
  head: () => ({
    meta: [
      { title: "Call History — EazyServ" },
      {
        name: "description",
        content: "Your recent calls with service providers, bridged privately.",
      },
    ],
  }),
  component: CallHistoryPage,
});

/** Human-friendly duration. Null (call never connected) reads as "No connect". */
function formatDuration(sec: number | null): string {
  if (sec === null || sec === 0) return "No connect";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem === 0 ? `${min}m` : `${min}m ${rem}s`;
}

/** Map Exotel/backend terminal statuses to a user-facing word. Unknown ends
 *  up echoing the server string rather than hiding: a devtools report that
 *  surprises the user is better than a silent "Completed" on a dropped call. */
function formatOutcome(outcome: string): string {
  const o = outcome.toLowerCase();
  if (o === "completed") return "Connected";
  if (o === "no_answer") return "No answer";
  if (o === "busy") return "Busy";
  if (o === "failed") return "Failed";
  if (o === "declined_consent") return "Declined";
  if (o === "in_progress") return "In progress";
  if (o === "ringing") return "Ringing";
  return outcome;
}

function formatWhen(iso: string): string {
  // Short "Nov 9, 2:04 PM"-style. Matches other screens that render past
  // timestamps; kept as a local helper rather than a shared util because
  // the bookings-list formatter deliberately omits the year and that would
  // read oddly on an older call.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CallRow({ entry }: { entry: API_ConsumerCallHistoryEntry }) {
  const name = entry.sp_first_name ?? "Provider";
  const service = entry.service_name ?? "Service";
  const when = formatWhen(entry.started_at);
  const duration = formatDuration(entry.duration_sec);
  const outcome = formatOutcome(entry.outcome);
  // Icon by direction + connect status. An unmatched row (stranger caller
  // audit, SVC-450) renders as a missed call — it's the shape the user
  // recognises, and no row carries the originating number so there's
  // nothing better to say.
  const Icon =
    entry.direction === "unmatched" || entry.duration_sec === null || entry.duration_sec === 0
      ? PhoneMissed
      : entry.direction === "sp_to_customer"
        ? PhoneCall
        : Phone;

  const body = (
    <div className="flex items-center gap-3 p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {service} · {when}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">{duration}</p>
        <p className="text-[11px] text-muted-foreground">{outcome}</p>
      </div>
    </div>
  );

  // A row with a booking_id deep-links back to tracking. Without one (deleted
  // booking, or an unmatched stranger-caller row) it's a static entry — we
  // don't offer a dead link.
  if (entry.booking_id) {
    return (
      <Link
        to="/tracking/$bookingId"
        params={{ bookingId: entry.booking_id }}
        className="block border-b border-border/60 last:border-b-0 hover:bg-secondary/40"
      >
        {body}
      </Link>
    );
  }
  return <div className="border-b border-border/60 last:border-b-0">{body}</div>;
}

export function CallHistoryPage() {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useConsumerCallHistory();

  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <Link to="/profile" aria-label="Back to profile" className="rounded-lg p-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-semibold text-foreground">Call History</h1>
      </header>

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading your calls">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="Couldn't load your call history." onRetry={refetch} />
        ) : rows.length === 0 ? (
          // No "retry" affordance here — an empty history is the common case
          // for a fresh account; a Retry button would read as "something is
          // wrong" when nothing is.
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Phone className="mx-auto mb-3 size-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No calls yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Calls with your service providers will show up here.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {rows.map((entry) => (
                <CallRow key={entry.id} entry={entry} />
              ))}
            </div>

            {hasNextPage && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}

            {/* Server reports total; once we've shown everyone, drop the
                footer to a muted "you're caught up" line rather than a dead
                Load more button. The page-size constant doubles as the
                wordless pin that this screen asks for 50 at a time. */}
            {!hasNextPage && rows.length >= CALL_HISTORY_PAGE_SIZE && (
              <p className="mt-4 text-center text-xs text-muted-foreground">You're caught up.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
