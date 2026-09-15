import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, History, MapPin } from "lucide-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { useBookings, useBookingsTotal } from "@/hooks/useApi";
import type { Booking, BookingStatus } from "@/lib/mock-data";
import { formatRupees } from "@/lib/currency";

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
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-700",
};

const statusLabel: Partial<Record<BookingStatus, string>> = {
  ACCEPTED: "Accepted",
  EN_ROUTE: "On the way",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

/**
 * When a finished job actually finished (SVC-296).
 *
 * The terminal transition, not `scheduledAt` — a job cancelled three days after
 * it was booked is filed under the day it ended, which is what a provider
 * looking back is trying to find. Falls back to the booking date when the
 * history is missing rather than rendering an empty cell.
 */
function endedAt(job: Booking): string {
  const terminal = [...(job.statusHistory ?? [])]
    .reverse()
    .find((entry) => !activeStatuses.includes(entry.status));
  const when = terminal?.at ?? job.createdAt ?? job.scheduledAt;
  if (!when) return "";
  return new Date(when).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// SVC-70 — the provider's list of jobs in flight. Each row opens the job screen,
// which is where the en-route / OTP / complete transitions actually happen.
//
// SVC-296 added the Past tab. Before it, a completed job left the provider's app
// the moment it was finished: this screen kept only the three active statuses,
// so a provider had no record of work they had actually done. The consumer side
// had solved the same problem with an Active/Past pair (src/routes/bookings.tsx)
// and this mirrors it deliberately — same split, same palette — rather than
// inventing a second shape for one app.
//
// Why here and not a fourth nav tab or a Profile row: two nav entries that both
// mean "your jobs" make the provider guess which holds a given job, and Profile
// is where settings live (payout, service area), not a work record.
function ProviderBookingsPage() {
  const [tab, setTab] = useState<"active" | "past">("active");
  const { data, isLoading, isError, error } = useBookings();
  const { total, truncated } = useBookingsTotal();
  // Only for the header avatar’s initials.
  const { user } = useAuth();

  const all: Booking[] = data ?? [];
  const active = all.filter((b) => activeStatuses.includes(b.status as BookingStatus));
  // Everything that is not in flight — completed, cancelled, expired. Defined as
  // the complement rather than a list, so a status added later surfaces here
  // instead of vanishing from both tabs.
  const past = all.filter((b) => !activeStatuses.includes(b.status as BookingStatus));
  const jobs = tab === "active" ? active : past;

  return (
    <div className="min-h-screen p-6 pb-24">
      {/* No back arrow, deliberately: this is a tab destination. Tab links use
          `replace` (SVC-230), so there is nothing to pop — an arrow here could
          only navigate to Home, duplicating the Home tab already visible below
          while looking like it undoes something.

          The avatar is the opposite case: Profile left the tab bar, so without
          it here Profile would be reachable only from Home — a regression in
          reach rather than a relocation. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">Your jobs</h1>
        <AccountAvatar to="/provider/profile" name={user?.name} />
      </div>

      {/* Same control as the consumer list, so the gesture means the same thing
          on both sides of the app.

          The selected tab is filled with the brand blue rather than a white
          card on grey: the old treatment distinguished the two only by a
          shadow, which on a phone in daylight is close to no signal at all. */}
      <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1">
        {(["active", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {tab === "active"
          ? "Jobs you’ve accepted and haven’t finished yet."
          : "Jobs you’ve finished, and ones that were cancelled."}
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

      {/* The shared EmptyState rather than a hand-rolled one, so this matches
          the consumer's empty bookings screen by construction — circled icon in
          the brand blue, not a bare grey glyph. The two had drifted: same
          situation, two different treatments.

          No CTA here, unlike the consumer's "Browse services": a provider with
          no jobs needs to go online from Home, which is one tap away in the nav
          below, and the subtitle already says so. */}
      {!isLoading && !isError && jobs.length === 0 && (
        <EmptyState
          icon={tab === "active" ? CalendarDays : History}
          title={tab === "active" ? "No jobs right now" : "No past jobs yet"}
          // "the home tab" until SVC-273 — the tab is still there, but naming
          // the screen rather than the control survives the next nav change.
          subtitle={
            tab === "active"
              ? "Go online from Home and accepted jobs will show up here."
              : "Jobs you finish will be listed here."
          }
        />
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
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    statusStyle[job.status] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {statusLabel[job.status] ?? job.status}
                </span>
                {/* The provider's own take, not the customer's price (SVC-296).
                    This row used to render `totalAmount` — ₹499 on a job that
                    pays ₹349 after commission — which is the app telling a
                    provider the wrong number about their own money. Both tabs
                    show payout for the same reason: split across the two, the
                    figure would appear to drop the moment a job finished. */}
                <span className="text-xs font-medium text-foreground">
                  You earn {formatRupees(job.providerPayout)}
                </span>
                {tab === "past" && (
                  <span className="text-xs text-muted-foreground">{endedAt(job)}</span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* Say so rather than present a truncated list as a complete one. The
          server caps a response at 50 rows and this screen does not paginate;
          staying silent would let a provider believe older work no longer
          exists — the very complaint SVC-296 is about. */}
      {truncated && !isLoading && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Showing your 50 most recent jobs of {total}.
        </p>
      )}
    </div>
  );
}
