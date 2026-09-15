import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { formatRupees } from "@/lib/currency";
import { ArrowLeft, Phone, Loader2, Search, CheckCircle2, XCircle } from "lucide-react";
import { StatusStepper } from "@/components/StatusStepper";
import { ErrorState } from "@/components/ErrorState";
import { ReviewSheet } from "@/components/ReviewSheet";
import { TrackingMap } from "@/components/tracking/TrackingMap";
import { TipSection } from "@/components/tracking/TipSection";
import {
  useBooking,
  useCancelBooking,
  useSubmitReview,
  useCreatePaymentOrder,
  useVerifyPayment,
} from "@/hooks/useApi";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/payment-status";
import type { RazorpayCheckoutOptions, RazorpaySuccessResponse } from "@/types/razorpay";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/tracking/$bookingId")({
  component: TrackingPage,
});

// Bookings already reviewed or skipped — persisted so the review sheet shows once per booking.
const REVIEWED_KEY = "sc_reviewed_bookings";

function getReviewedBookings(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(REVIEWED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function markBookingReviewed(bookingId: string) {
  if (typeof window === "undefined") return;
  const set = getReviewedBookings();
  set.add(bookingId);
  localStorage.setItem(REVIEWED_KEY, JSON.stringify([...set]));
}

function TrackingPage() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const { data: booking, isLoading, isError, refetch } = useBooking(bookingId);
  const cancelMutation = useCancelBooking();
  const reviewMutation = useSubmitReview();
  const paymentOrderMutation = useCreatePaymentOrder();
  const verifyPaymentMutation = useVerifyPayment();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [paymentState, setPaymentState] = useState<"idle" | "success" | "failed">("idle");

  // useBooking polls every 4s via refetchInterval (SVC-50); no manual interval needed.

  // Auto-open the review sheet once a booking completes, unless already reviewed/skipped.
  useEffect(() => {
    if (booking?.status === "COMPLETED" && !getReviewedBookings().has(bookingId)) {
      setReviewOpen(true);
    }
  }, [booking?.status, bookingId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Ahead of the not-found branch. This is the worst instance of the pattern:
  // someone watching a technician come to their door hits a network blip and
  // is told their booking does not exist.
  if (isError) {
    return <ErrorState message="Couldn't load this booking." onRetry={refetch} fullScreen />;
  }

  if (!booking) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-4">
        <p className="text-muted-foreground">Booking not found.</p>
        <button
          onClick={() => navigate({ to: "/bookings" })}
          className="text-primary hover:underline"
        >
          Return to My Bookings
        </button>
      </div>
    );
  }

  const isSearching = booking.status === "REQUESTED";
  const isExpired = booking.status === "EXPIRED";
  const isCancelled = booking.status === "CANCELLED";

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({
        bookingId: bookingId as string,
        reason: "Consumer cancelled",
      });
      navigate({ to: "/bookings" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel booking.");
    }
  };

  // Verify the payment server-side before treating it as successful. A failed
  // verification (bad signature, network error) is surfaced as a failed payment.
  const handlePaymentSuccess = async (response: RazorpaySuccessResponse) => {
    try {
      await verifyPaymentMutation.mutateAsync({
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
      refetch();
      setPaymentState("success");
    } catch (e) {
      console.error(e);
      setPaymentState("failed");
    }
  };

  const handlePayment = async () => {
    if (!window.Razorpay) {
      toast.error("Razorpay SDK not loaded. Please retry.");
      return;
    }
    try {
      // Fresh key per user Pay-button tap. React-query will replay the same
      // key on any retry; the backend (SVC-158) uses it to prevent two
      // Razorpay orders being created for one intent.
      const idempotencyKey = crypto.randomUUID();
      const order = await paymentOrderMutation.mutateAsync({
        bookingId: bookingId as string,
        idempotencyKey,
      });

      const options: RazorpayCheckoutOptions = {
        key: order.razorpay_key_id,
        amount: order.amount,
        currency: order.currency,
        name: "EazyServ",
        description: "Payment for Service",
        order_id: order.razorpay_order_id,
        handler: (response) => handlePaymentSuccess(response),
        // Closing the checkout without paying counts as a failed attempt (SVC-66 shows retry).
        // Guard against clobbering a payment that already succeeded.
        modal: {
          ondismiss: () => setPaymentState((s) => (s === "success" ? s : "failed")),
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      console.error(e);
      setPaymentState("failed");
    }
  };

  const submitReview = async (rating: number, comment: string) => {
    try {
      await reviewMutation.mutateAsync({ booking_id: bookingId as string, rating, comment });
      markBookingReviewed(bookingId);
      setReviewSubmitted(true);
      setReviewOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit review.");
    }
  };

  const skipReview = () => {
    markBookingReviewed(bookingId);
    setReviewOpen(false);
  };

  return (
    <div className="min-h-screen pb-6">
      {/* Header */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Link
          to="/bookings"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="text-base font-semibold text-foreground">Booking Status</h1>
      </div>

      <div className="px-4 pt-6">
        {/* Status Stepper */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <StatusStepper currentStatus={booking.status} history={booking.statusHistory} />
        </div>

        {/* Searching State */}
        {isSearching && (
          <div className="rounded-xl border border-border bg-card p-8 mb-4 text-center">
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20"
            >
              <Search className="h-8 w-8 text-primary" />
            </motion.div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Searching for nearby partners
            </h3>
            <p className="text-sm text-muted-foreground">
              We are contacting highly rated professionals in your area for {booking.service.name}.
            </p>
          </div>
        )}

        {/* Expired State */}
        {isExpired && (
          <div className="rounded-xl border border-border bg-card p-8 mb-4 text-center">
            <h3 className="text-lg font-semibold text-foreground mb-1">No partners found nearby</h3>
            <p className="text-sm text-muted-foreground mb-4">
              No partners found nearby. Try again.
            </p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
            >
              Try Again
            </button>
          </div>
        )}

        {/* EXPIRED had a banner; CANCELLED had nothing — the screen simply
            went quiet, leaving the timeline as the only (and until this
            ticket, misleading) signal that anything had happened. Same slot,
            same shape, so the two terminal states read consistently. */}
        {isCancelled && (
          <div className="rounded-xl border border-border bg-card p-8 mb-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Booking cancelled</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This booking was cancelled. You have not been charged.
            </p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
            >
              Browse services
            </button>
          </div>
        )}

        {/* Doorstep OTP — visible only when the provider is EN_ROUTE.
            Previously showed on ACCEPTED as well, meaning the consumer
            saw the code 15+ minutes before the pro actually needed it
            and often forgot it by the time they arrived. The backend
            gates state transitions on the OTP (en_route → in_progress
            requires it — see `booking.py`), so it's only meaningful
            during the window the pro is physically on the way. */}
        {booking.status === "EN_ROUTE" && booking.otp && (
          <div className="rounded-xl border-2 border-primary bg-accent p-5 text-center mb-4">
            <p className="text-xs text-muted-foreground mb-2">Share this OTP with your provider</p>
            <p className="text-3xl font-bold tracking-[0.3em] text-primary">{booking.otp}</p>
          </div>
        )}

        {/* Provider card. Header now renders the full cart summary
            ("Deep Clean + 2 more") rather than just the first service
            name — matches PR #77's push-body summariser and keeps the
            provider row honest about what they're doing. */}
        {!isSearching && booking.service.provider && (
          <div className="rounded-xl border border-border bg-card p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                {booking.service.provider.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .substring(0, 2)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {booking.service.provider.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summariseServices(booking.items, booking.service.name)}
                </p>
              </div>
              {booking.service.provider.phone && (
                <a
                  href={`tel:${booking.service.provider.phone}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10"
                  aria-label="Call provider"
                >
                  <Phone className="h-4 w-4 text-success" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Map — real OSM tiles centred on the customer address.
            Replaces the previous decorative dot-pattern placeholder.
            Live provider-position tracking (via the WebSocket at
            backend/app/routers/tracking.py) is a follow-up ticket;
            for now the map shows destination + the "on the way"
            chip when EN_ROUTE. */}
        {(booking.status === "ACCEPTED" ||
          booking.status === "EN_ROUTE" ||
          booking.status === "IN_PROGRESS") && (
          <div className="mb-4">
            <TrackingMap
              lat={booking.address?.lat ?? null}
              lng={booking.address?.lng ?? null}
              enRoute={booking.status === "EN_ROUTE"}
              // ETA remains a hardcoded ~15 min until WS-driven live
              // location arrives. Omitting is honest; showing a
              // fabricated number would tempt users to plan around it.
            />
          </div>
        )}

        {/* Address */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <p className="text-xs text-muted-foreground mb-1">Service Address</p>
          <p className="text-sm text-foreground">{booking.address?.full || "Saved Address"}</p>
        </div>

        {/* Payment breakdown. Discount + tip render as their own
            lines when non-zero, so a consumer paying a coupon-reduced
            or tip-boosted bill can see where each rupee came from. */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Payment</span>
            <span className="font-medium text-foreground capitalize">{booking.paymentMethod}</span>
          </div>
          {/* SVC-259: whether the money actually moved.
              
              The panel showed the method and the amount but never the status,
              so a paid booking said nothing — you inferred it from the absence
              of the Pay Now button below. That inference is weak on a good day
              and wrong on a bad one: the button is suppressed for CANCELLED and
              EXPIRED regardless of payment, so an expired booking looked
              identical whether or not it had been charged.
              
              It matters more now that this screen is only reached *after*
              paying rather than before — it is the confirmation, so it should
              confirm something. */}
          <div className="flex justify-between text-sm mt-2">
            <span className="text-muted-foreground">Status</span>
            <span className={`font-medium ${paymentStatusTone(booking.paymentStatus)}`}>
              {paymentStatusLabel(booking.paymentStatus)}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium text-foreground">
              {formatRupees(booking.serviceAmount)}
            </span>
          </div>
          {booking.discountAmount > 0 && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-success">Discount</span>
              <span className="font-medium text-success">
                −{formatRupees(booking.discountAmount)}
              </span>
            </div>
          )}
          {booking.tipAmount > 0 && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Tip</span>
              <span className="font-medium text-foreground">{formatRupees(booking.tipAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm mt-2 mb-2 pt-2 border-t border-border">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-primary">{formatRupees(booking.totalAmount)}</span>
          </div>

          {booking.paymentMethod === "online" &&
            booking.paymentStatus === "pending" &&
            // Terminal states, both of them. EXPIRED means no provider was
            // ever found, so the service cannot happen — offering to charge
            // for it puts the user one tap from paying for nothing and us one
            // refund behind. The screen was showing "No partners found
            // nearby" and "Pay Now" at the same time.
            booking.status !== "CANCELLED" &&
            booking.status !== "EXPIRED" &&
            paymentState !== "success" &&
            paymentState !== "failed" && (
              <button
                onClick={handlePayment}
                disabled={paymentOrderMutation.isPending}
                className="w-full mt-2 rounded-xl bg-primary p-3 text-sm font-semibold text-primary-foreground"
              >
                {paymentOrderMutation.isPending
                  ? "Loading..."
                  : `Pay Now — ${formatRupees(booking.totalAmount)}`}
              </button>
            )}

          {paymentState === "success" && (
            <div className="mt-2 flex flex-col items-center gap-2 rounded-xl border border-success bg-success/10 p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <p className="text-sm font-semibold text-success">Payment successful!</p>
              <button
                onClick={() => navigate({ to: "/bookings" })}
                className="mt-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Go to bookings
              </button>
            </div>
          )}

          {paymentState === "failed" && (
            <div className="mt-2 rounded-xl border border-destructive bg-destructive/10 p-4 text-center">
              <p className="text-sm font-medium text-destructive">Payment failed. Try again.</p>
              <button
                onClick={() => {
                  setPaymentState("idle");
                  handlePayment();
                }}
                className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Retry Payment
              </button>
            </div>
          )}
        </div>

        {/* Tip UI — completed bookings only. Independent of the
            review flow (the two are related in the wireframe but
            independent on the backend; PR #77). Payment must have
            landed before we surface this: tipping on a bill the
            customer hasn't paid yet muddies the mental model. */}
        {booking.status === "COMPLETED" && booking.paymentStatus === "paid" && (
          <div className="mb-4">
            <TipSection bookingId={booking.id} currentTip={booking.tipAmount} />
          </div>
        )}

        {/* Review confirmation (sheet auto-opens once on COMPLETED — see ReviewSheet below) */}
        {booking.status === "COMPLETED" && reviewSubmitted && (
          <div className="rounded-xl border border-success bg-success/10 p-4 mb-4 text-center text-success text-sm font-medium">
            Thank you for your feedback!
          </div>
        )}

        {/* Cancel */}
        {(booking.status === "REQUESTED" || booking.status === "ACCEPTED") && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={cancelMutation.isPending}
                className="w-full rounded-xl border border-destructive p-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                Cancel Booking
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                <AlertDialogDescription>The provider will be notified.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Go back</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel}>Yes, cancel</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <ReviewSheet
        open={reviewOpen}
        onOpenChange={(open) => {
          // Any dismissal (overlay tap, Esc, close button) counts as skipped → don't reopen.
          if (!open && !reviewSubmitted) markBookingReviewed(bookingId);
          setReviewOpen(open);
        }}
        onSubmit={submitReview}
        onSkip={skipReview}
        isSubmitting={reviewMutation.isPending}
      />
    </div>
  );
}

/** Short one-line summary of a booking's items for the provider card.
 *  Matches the ``_summarise_service_names`` helper in
 *  ``backend/app/services/booking_service.py`` so the tracking header
 *  and the incoming-request push body use the same phrasing.
 *
 *  Falls back to ``fallbackName`` when the items list is empty — an
 *  older single-service booking that predates the cart, or a
 *  transitional response where the mapper hasn't hydrated items yet. */
function summariseServices(items: Array<{ serviceName: string }>, fallbackName: string): string {
  if (items.length === 0) return fallbackName;
  if (items.length === 1) return items[0].serviceName;
  return `${items[0].serviceName} + ${items.length - 1} more`;
}
