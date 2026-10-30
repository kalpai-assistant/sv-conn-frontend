/**
 * "Your booking is live" strip on Home (SVC-389).
 *
 * A booking a Pro has accepted used to be reachable only through the bookings
 * tab: back on Home after the cold-launch redirect (SVC-385) was spent, a
 * customer had no sign that anything was happening. This keeps the live job
 * one tap away for as long as it is in flight.
 *
 * Zero extra requests: it reads the same `useBookings(undefined, ...)` cache
 * the root gate already fills for consumers on every screen, with the same
 * `enabled` condition, so a provider, an admin or a logged-out visitor never
 * fires the call. There is no booking-status socket — tracking polls its own
 * booking — so the copy here follows React Query's refetch-on-focus and the
 * invalidations tracking already does when it changes a booking.
 *
 * "In flight" is `isActiveBookingStatus`, the set the launch redirect uses, so
 * the two can never disagree about which booking is live. `REQUESTED` is left
 * out for the same reason it is there: nobody has accepted it yet.
 *
 * Renders nothing while loading, on error, or with no live booking — no
 * skeleton, because the strip appearing late is better than Home jumping.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight, Hammer, Truck, UserCheck, type LucideIcon } from "lucide-react";
import { useBookings } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth-context";
import { isActiveBookingStatus } from "@/lib/booking-landing";
import type { BookingStatus } from "@/lib/mock-data";

// No live ETA exists — tracking deliberately shows none — so EN_ROUTE says
// "soon" rather than inventing a number.
const COPY: Partial<Record<BookingStatus, { text: string; Icon: LucideIcon }>> = {
  ACCEPTED: { text: "Pro assigned · tap to see details", Icon: UserCheck },
  EN_ROUTE: { text: "Pro arriving soon · tap to track", Icon: Truck },
  IN_PROGRESS: { text: "Service underway · tap for details", Icon: Hammer },
};

export function InProgressBookingBanner() {
  const { user, isAuthenticated, isRestoring } = useAuth();
  // Mirrors the root gate's `isConsumer && !isRestoring`; keep the two in
  // step or this becomes a second, differently-gated request.
  const role = user?.role ?? null;
  const isConsumer = isAuthenticated && role !== "provider" && role !== "admin";
  const { data: bookings } = useBookings(undefined, isConsumer && !isRestoring);

  // Earliest-created first: the job that has been going longest is the one
  // the customer is most likely waiting on.
  const live = (bookings ?? [])
    .filter((b) => isActiveBookingStatus(b.status))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const first = live[0];
  const copy = first && COPY[first.status];
  if (!first || !copy) return null;
  const more = live.length - 1;
  const { text, Icon } = copy;

  return (
    <div className="flex items-center gap-2 bg-primary px-4 py-2 text-primary-foreground">
      <Link
        to="/tracking/$bookingId"
        params={{ bookingId: first.id }}
        aria-label={`${text}: ${first.service.name}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-0.5"
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{text}</span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
      </Link>
      {/* A sibling, not nested: one link cannot contain another. */}
      {more > 0 && (
        <Link
          to="/bookings"
          aria-label={`${more} more in-progress ${more === 1 ? "booking" : "bookings"}`}
          className="shrink-0 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs font-semibold"
        >
          +{more} more
        </Link>
      )}
    </div>
  );
}
