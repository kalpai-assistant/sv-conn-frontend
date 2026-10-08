import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobAddress } from "@/components/provider/JobAddress";
import { isBookingGone, useBooking } from "@/hooks/useApi";
import { proStatusLabel } from "@/lib/job-status";
import { CompleteStep, DoorstepOtpStep, EnRouteStep } from "@/components/provider/JobActions";
import { formatRupees } from "@/lib/currency";
import type { Booking } from "@/lib/mock-data";

export const Route = createFileRoute("/pro/jobs/$bookingId")({
  component: ProJobPage,
});

// SVC-322 — one job, as the Pro sees it, and where they work it: en route,
// the customer's PIN at the door, complete — or decline before setting off. Read through `GET /bookings/{id}`,
// which admits the job's assigned Pro (there is no `/pros/me/jobs/{id}`), and
// polled every 4s like the provider's job screen, so a cancellation or a
// re-pick lands here without a refresh.
function ProJobPage() {
  const { bookingId } = Route.useParams();
  const { data: booking, isLoading, isError, error } = useBooking(bookingId);
  const gone = isError && isBookingGone(error);

  return (
    <div className="min-h-screen p-6 pb-24">
      <Link
        to="/pro/jobs"
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

      {/* 403/404: the job was given to someone else, or was never this Pro's.
          Not a failure to show in red — polling has stopped, there is nothing
          to do. */}
      {gone && (
        <div className="mt-6 rounded-lg bg-muted p-4 text-sm">
          <p className="font-medium text-foreground">This job is no longer yours</p>
          <p className="mt-1 text-muted-foreground">There’s nothing left to do here.</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/pro/jobs">Back to your jobs</Link>
          </Button>
        </div>
      )}

      {isError && !gone && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Couldn’t load this job."}
        </p>
      )}

      {/* React Query keeps the last good data after a later fetch fails; a job
          that is gone must not keep rendering its body under the message. */}
      {booking && !gone && <JobBody booking={booking} />}
    </div>
  );
}

const travelling = (status: Booking["status"]) =>
  status === "ACCEPTED" || status === "EN_ROUTE" || status === "IN_PROGRESS";

function JobBody({ booking }: { booking: Booking }) {
  return (
    <>
      <h1 className="mt-3 text-lg font-semibold text-foreground">{booking.service.name}</h1>
      {/* Same line as the provider's job screen: whether there is cash to take
          at the door is the part a Pro needs. */}
      <p className="mt-1 text-sm text-muted-foreground">
        {proStatusLabel[booking.status] ?? booking.status} · {formatRupees(booking.totalAmount)} ·{" "}
        {booking.paymentMethod === "cash" ? "Cash on completion" : "Paid online"}
      </p>

      <div className="mt-4">
        <JobAddress address={booking.address} showNavigate={travelling(booking.status)} />
      </div>

      {/* The same steps the SP's job screen shows, through the Pro's own
          endpoints (SVC-322). Decline sits under "I'm on my way". */}
      <div className="mt-6">
        {booking.status === "ACCEPTED" && <EnRouteStep bookingId={booking.id} actor="pro" />}
        {booking.status === "EN_ROUTE" && <DoorstepOtpStep bookingId={booking.id} actor="pro" />}
        {booking.status === "IN_PROGRESS" && <CompleteStep bookingId={booking.id} actor="pro" />}
        {booking.status === "COMPLETED" && (
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Job completed
          </div>
        )}
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
