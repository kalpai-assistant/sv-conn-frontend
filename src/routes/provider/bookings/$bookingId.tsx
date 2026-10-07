import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, Loader2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { JobAddress } from "@/components/provider/JobAddress";
import { ApiError } from "@/lib/api";
import { isBookingGone, useBooking } from "@/hooks/useApi";
// The per-status actions live beside the job rather than inside this route,
// because Provider Home renders the same ones inline (SVC-274). One
// implementation, so the guard on completion cannot exist on one screen only.
import { CompleteStep, DoorstepOtpStep, EnRouteStep } from "@/components/provider/JobActions";
import type { Booking } from "@/lib/mock-data";
import { formatRupees } from "@/lib/currency";

export const Route = createFileRoute("/provider/bookings/$bookingId")({
  component: ProviderJobPage,
});

// SVC-41 — the provider's job screen. One route renders every step of a job in
// flight and branches on `booking.status`, the same way the consumer's
// tracking.$bookingId screen does, so the two sides stay legible against each
// other. `useBooking` polls every 4s, so a status moved elsewhere (the consumer
// cancelling, say) lands here without a manual refresh.
function ProviderJobPage() {
  const { bookingId } = Route.useParams();
  const { data: booking, isLoading, isError, error } = useBooking(bookingId);

  return (
    <div className="min-h-screen p-6 pb-24">
      <Link
        to="/provider/bookings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Your jobs
      </Link>

      {isLoading && (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {/* 403/404 is not a failure to show in red: the job was given back,
          reassigned or never this provider's, and polling has stopped. */}
      {isError && isBookingGone(error) && (
        <div className="mt-6 rounded-lg bg-muted p-4 text-sm">
          <p className="font-medium text-foreground">This job is no longer yours</p>
          <p className="mt-1 text-muted-foreground">There’s nothing left to do here.</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/provider/bookings">Back to your jobs</Link>
          </Button>
        </div>
      )}

      {isError && !isBookingGone(error) && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Couldn’t load this job."}
        </p>
      )}

      {!isLoading && !isError && !booking && (
        <p className="mt-6 text-sm text-muted-foreground">This job no longer exists.</p>
      )}

      {/* React Query keeps the last good data after a later fetch fails, so a
          job that was given back would otherwise still render its steps, "I'm
          on my way" included, under the message above (found on device). A
          gone job shows no body; other errors keep the last state on screen. */}
      {booking && !(isError && isBookingGone(error)) && <JobBody booking={booking} />}
    </div>
  );
}

// Once the job is over there is nowhere left to travel to, so the address stays
// on screen for reference but loses the Navigate hand-off.
const travelling = (status: Booking["status"]) =>
  status === "ACCEPTED" || status === "EN_ROUTE" || status === "IN_PROGRESS";

function JobBody({ booking }: { booking: Booking }) {
  return (
    <>
      <h1 className="mt-3 text-lg font-semibold text-foreground">{booking.service.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatRupees(booking.totalAmount)} ·{" "}
        {booking.paymentMethod === "cash" ? "Cash on completion" : "Paid online"}
      </p>

      {/* Above the action, deliberately: on ACCEPTED and EN_ROUTE this is the
          screen's real content — where to go — and "I'm on my way" is the reply
          to it (SVC-171). */}
      <div className="mt-4">
        <JobAddress address={booking.address} showNavigate={travelling(booking.status)} />
      </div>

      <div className="mt-6">
        {booking.status === "ACCEPTED" && <EnRouteStep bookingId={booking.id} />}
        {booking.status === "EN_ROUTE" && <DoorstepOtpStep bookingId={booking.id} />}
        {booking.status === "IN_PROGRESS" && <CompleteStep bookingId={booking.id} />}
        {booking.status === "COMPLETED" && <EarningsBreakdown booking={booking} />}
        {(booking.status === "CANCELLED" || booking.status === "EXPIRED") && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            This job was {booking.status === "CANCELLED" ? "cancelled" : "expired"}. There’s nothing
            left to do here.
          </p>
        )}
      </div>
    </>
  );
}

// Any transition can come back 409 when the booking moved underneath us — the
// consumer cancelled, or this screen was left open on a stale step. The polling
// query re-renders the right step on its own, so the toast only has to explain
// why the tap did nothing.
// SVC-72 — what the provider actually earned, split out so the platform's cut is
// visible rather than inferred from a smaller number than the customer paid.
function EarningsBreakdown({ booking }: { booking: Booking }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        Job completed
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Service amount</span>
          <span className="text-foreground">{formatRupees(booking.totalAmount)}</span>
        </div>

        {booking.platformCommission !== undefined && (
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Platform fee</span>
            <span className="text-foreground">−{formatRupees(booking.platformCommission)}</span>
          </div>
        )}

        {booking.providerPayout !== undefined && (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-medium text-foreground">Your earnings</span>
            <span className="text-base font-semibold text-foreground">
              {formatRupees(booking.providerPayout)}
            </span>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Paid out to your registered payout method.
      </p>
    </div>
  );
}
