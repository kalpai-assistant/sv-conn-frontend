import { createFileRoute } from "@tanstack/react-router";
import { Star, ShieldCheck, Clock, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServices, useReviews } from "@/hooks/useApi";
import { useState } from "react";
import { BookingSheet } from "@/components/BookingSheet";

export const Route = createFileRoute("/service/$serviceId")({
  component: ServiceDetailPage,
});

function ServiceDetailPage() {
  const { serviceId } = Route.useParams();
  const { data: services, isLoading } = useServices();
  const service = services?.find((s) => s.id === serviceId);
  const [bookingOpen, setBookingOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Service not found</p>
          <Link to="/" className="mt-2 text-sm font-medium text-primary">Go Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="text-base font-semibold text-foreground truncate">{service.name}</h1>
      </div>

      {/* Provider Placeholder */}
      <div className="flex flex-col items-center pt-6 pb-4 px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-primary">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">Qualified Professionals</h2>
        <div className="mt-1 flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
             Verified & Background Checked
          </span>
        </div>
      </div>

      {/* Service Details */}
      <div className="px-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-base font-semibold text-foreground">{service.name}</h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{service.description}</p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {service.duration}
            </div>
            <span className="text-xl font-bold text-primary">₹{service.price}</span>
          </div>
        </div>
      </div>

      {/* Reviews Note */}
      <div className="px-4 pt-6">
        <div className="rounded-xl border border-border bg-accent/50 p-4 text-center">
          <p className="text-sm font-medium text-foreground">Top-rated partners in your area</p>
          <p className="text-xs text-muted-foreground mt-1">We match you with professionals maintaining a 4.5+ average rating.</p>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card p-4 safe-bottom">
        <button
          onClick={() => setBookingOpen(true)}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground text-base"
        >
          Book Now — ₹{service.price}
        </button>
      </div>

      {bookingOpen && (
        <BookingSheet service={service} onClose={() => setBookingOpen(false)} />
      )}
    </div>
  );
}
