import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Phone, MapPin, Loader2, Search } from "lucide-react";
import { StatusStepper } from "@/components/StatusStepper";
import { ReviewSheet } from "@/components/ReviewSheet";
import {
  useBooking,
  useCancelBooking,
  useSubmitReview,
  useCreatePaymentOrder,
  useVerifyPayment,
} from "@/hooks/useApi";
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
  const { data: booking, isLoading, refetch } = useBooking(bookingId);
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
  const handlePaymentSuccess = async (response: any) => {
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
      const order = await paymentOrderMutation.mutateAsync({ bookingId: bookingId as string });

      const options = {
        key: order.razorpay_key_id,
        amount: order.amount,
        currency: order.currency,
        name: "ServiceConnect",
        description: "Payment for Service",
        order_id: order.razorpay_order_id,
        handler: (response: any) => handlePaymentSuccess(response),
        // Closing the checkout without paying counts as a failed attempt (SVC-66 shows retry).
        // Guard against clobbering a payment that already succeeded.
        modal: {
          ondismiss: () => setPaymentState((s) => (s === "success" ? s : "failed")),
        },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e) {
      console.error(e);
      setPaymentState("failed");
    }
  };

  const submitReview = async (rating: number, comment: string) => {
    try {
      await reviewMutation.mutateAsync({ bookingId: bookingId as string, rating, comment });
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
          <StatusStepper currentStatus={booking.status} />
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

        {/* OTP Display */}
        {(booking.status === "ACCEPTED" || booking.status === "EN_ROUTE") && booking.otp && (
          <div className="rounded-xl border-2 border-primary bg-accent p-5 text-center mb-4">
            <p className="text-xs text-muted-foreground mb-2">Share this OTP with your provider</p>
            <p className="text-3xl font-bold tracking-[0.3em] text-primary">{booking.otp}</p>
          </div>
        )}

        {/* Provider Card */}
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
                <p className="text-xs text-muted-foreground">{booking.service.name}</p>
              </div>
              {booking.service.provider.phone && (
                <a
                  href={`tel:${booking.service.provider.phone}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10"
                >
                  <Phone className="h-4 w-4 text-success" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Map placeholder */}
        {booking.status === "EN_ROUTE" && (
          <div className="rounded-xl border border-border bg-accent p-6 text-center mb-4 relative overflow-hidden">
            <MapPin className="mx-auto h-8 w-8 text-primary mb-2 relative z-10" />
            <p className="text-sm font-medium text-foreground relative z-10">
              Provider is on the way
            </p>
            <p className="text-xs text-muted-foreground mt-1 relative z-10">ETA: ~15 minutes</p>

            {/* Minimal pseudo-map background */}
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(circle at 50% 50%, #6C5CE7 2px, transparent 2px)",
                backgroundSize: "20px 20px",
              }}
            ></div>
          </div>
        )}

        {/* Address */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <p className="text-xs text-muted-foreground mb-1">Service Address</p>
          <p className="text-sm text-foreground">{booking.address?.full || "Saved Address"}</p>
        </div>

        {/* Payment */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Payment</span>
            <span className="font-medium text-foreground capitalize">{booking.paymentMethod}</span>
          </div>
          <div className="flex justify-between text-sm mt-1 mb-2">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-primary">₹{booking.totalAmount}</span>
          </div>

          {booking.status === "COMPLETED" &&
            booking.paymentMethod === "online" &&
            booking.paymentStatus === "pending" && (
              <button
                onClick={handlePayment}
                disabled={paymentOrderMutation.isPending}
                className="w-full mt-2 rounded-xl bg-primary p-3 text-sm font-semibold text-primary-foreground"
              >
                {paymentOrderMutation.isPending
                  ? "Loading..."
                  : `Pay Now — ₹${booking.totalAmount}`}
              </button>
            )}
        </div>

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
