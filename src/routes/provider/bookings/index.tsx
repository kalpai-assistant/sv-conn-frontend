import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookings } from "@/hooks/useApi";
import type { Booking, BookingStatus } from "@/lib/mock-data";

export const Route = createFileRoute("/provider/bookings/")({
  component: ProviderBookingsPage,
});

// A job the provider still has work to do on. REQUESTED is deliberately absent:
// an unaccepted booking belongs to the broadcast, not to this provider, and
// `GET /bookings/` only returns rows already assigned to them anyway.
const activeStatuses: BookingStatus[] = ["ACCEPTED", "EN_ROUTE", "IN_PROGRESS"];

// Mirrors the consumer list's palette (src/routes/bookings.tsx) so the same
// status means the same colour on both sides of the app.
const statusStyle: Partial<Record<BookingStatus, string>> = {
  ACCEPTED: "bg-blue-100 text-blue-700",
  EN_ROUTE: "bg-purple-100 text-purple-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
};

const statusLabel: Partial<Record<BookingStatus, string>> = {
  ACCEPTED: "Accepted",
  EN_ROUTE: "On the way",
  IN_PROGRESS: "In progress",
};

// SVC-70 — the provider's list of jobs in flight. Each row opens the job screen,
// which is where the en-route / OTP / complete transitions actually happen.
function ProviderBookingsPage() {
  const { data, isLoading, isError, error } = useBookings();

  const jobs: Booking[] = (data ?? []).filter((b: Booking) =>
    activeStatuses.includes(b.status as BookingStatus),
  );

  return (
    <div className="min-h-screen p-6 pb-24">
      {/* No back arrow, deliberately: this is a tab destination. Tab links use
          `replace` (SVC-230), so there is nothing to pop — an arrow here could
          only navigate to Home, duplicating the Home tab already visible below
          while looking like it undoes something. */}
      <h1 className="text-lg font-semibold text-foreground">Your jobs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Jobs you’ve accepted and haven’t finished yet.
      </p>

      {isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {isError && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Couldn’t load your jobs."}
        </p>
      )}

      {!isLoading && !isError && jobs.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No jobs right now</p>
          {/* "the home tab" until SVC-273 — the tab is still there, but naming
              the screen rather than the control survives the next nav change. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Go online from Home and accepted jobs will show up here.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {jobs.map((job) => (
          <Link
            key={job.id}
            to="/provider/bookings/$bookingId"
            params={{ bookingId: job.id }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{job.service.name}</p>
              {/* Two jobs for the same service are otherwise indistinguishable here —
                  the address is what tells them apart (SVC-171). Truncated because
                  the full string belongs on the job screen, not in a list row. */}
              {job.address.full && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{job.address.full}</span>
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    statusStyle[job.status] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {statusLabel[job.status] ?? job.status}
                </span>
                <span className="text-xs text-muted-foreground">₹{job.totalAmount}</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
