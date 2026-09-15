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
import { useBooking, useMarkEnRoute, useStartBooking, useCompleteBooking } from "@/hooks/useApi";
import type { Booking } from "@/lib/mock-data";
import { formatRupees } from "@/lib/currency";

export const Route = createFileRoute("/provider/bookings/$bookingId")({
  component: ProviderJobPage,
});

// The wording the ticket asks for, verbatim (SVC-71). It is the only message a
// provider should ever see for a wrong PIN — anything vaguer and they retype the
// same wrong digits instead of asking the customer again.
const WRONG_PIN = "Incorrect PIN, ask the customer again";

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

      {isError && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Couldn’t load this job."}
        </p>
      )}

      {!isLoading && !isError && !booking && (
        <p className="mt-6 text-sm text-muted-foreground">This job no longer exists.</p>
      )}

      {booking && <JobBody booking={booking} />}
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
function transitionMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 409) {
    return "This job has already moved on. Pull up the latest state and try again.";
  }
  return err instanceof Error ? err.message : fallback;
}

// SVC-70
function EnRouteStep({ bookingId }: { bookingId: string }) {
  const markEnRoute = useMarkEnRoute();

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Let the customer know you’ve set off. They’ll be able to track you from their app.
      </p>
      <Button
        className="mt-4 w-full"
        disabled={markEnRoute.isPending}
        onClick={() =>
          markEnRoute.mutate(
            { bookingId },
            {
              onError: (err) =>
                toast.error(transitionMessage(err, "Couldn’t update the job. Please try again.")),
            },
          )
        }
      >
        {markEnRoute.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Navigation className="h-4 w-4" />
        )}
        I’m on my way
      </Button>
    </div>
  );
}

// SVC-71 — the doorstep gate. The PIN must come out of the customer's mouth, so
// this screen never reads `booking.otp`. The backend blanks it for the provider
// (SVC-169), but not reading it is the point rather than a consequence: showing
// or pre-filling the PIN would make the whole check ceremonial no matter what
// the API happened to send.
function DoorstepOtpStep({ bookingId }: { bookingId: string }) {
  const [otp, setOtp] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const startBooking = useStartBooking();

  const submit = (value: string) => {
    if (startBooking.isPending) return;
    setErrorMsg("");
    startBooking.mutate(
      { bookingId, otp: value },
      {
        onError: (err) => {
          // 400 is the wrong-PIN case and the only one that means "try again".
          // Everything else is a genuine failure and keeps the server's message.
          setErrorMsg(
            err instanceof ApiError && err.status === 400
              ? WRONG_PIN
              : transitionMessage(err, "Couldn’t start the job. Please try again."),
          );
          setOtp("");
        },
      },
    );
  };

  return (
    <div>
      <p className="text-sm font-medium text-foreground">Ask the customer for their 4-digit PIN</p>
      <p className="mt-1 text-sm text-muted-foreground">
        It’s shown in their app. Entering it starts the job.
      </p>

      <div className="mt-4">
        <InputOTP
          maxLength={4}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          value={otp}
          disabled={startBooking.isPending}
          onChange={(value) => {
            setOtp(value);
            if (errorMsg) setErrorMsg("");
            // Auto-submit on the fourth digit — there is nothing else to fill in,
            // so a separate confirm button would just be an extra tap at the door.
            if (value.length === 4) submit(value);
          }}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3].map((i) => (
              <InputOTPSlot key={i} index={i} className="h-12 w-12 text-base" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {startBooking.isPending && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking…
        </p>
      )}

      {errorMsg && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

// SVC-72
function CompleteStep({ bookingId }: { bookingId: string }) {
  const completeBooking = useCompleteBooking();

  return (
    <div>
      <p className="text-sm font-medium text-foreground">Job in progress</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Mark it complete once you’ve finished the work.
      </p>
      <Button
        className="mt-4 w-full"
        disabled={completeBooking.isPending}
        onClick={() =>
          completeBooking.mutate(
            { bookingId },
            {
              onError: (err) =>
                toast.error(transitionMessage(err, "Couldn’t complete the job. Please try again.")),
            },
          )
        }
      >
        {completeBooking.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        Mark as Complete
      </Button>
    </div>
  );
}

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
