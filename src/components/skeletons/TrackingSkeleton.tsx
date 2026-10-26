/**
 * Placeholder for `tracking.$bookingId.tsx` while the booking loads.
 *
 * The header and the trust strip are real: they don't depend on the
 * booking, so they render as-is and the page keeps its frame when data lands.
 * Below them come the three cards every booking has — stepper, address,
 * payment. The status-dependent blocks (searching, OTP, who's coming, map) are
 * left out: guessing one and swapping it for another would be worse than
 * leaving the space empty.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrustStrip } from "@/components/TrustStrip";
import { LoadingRegion } from "./LoadingRegion";

const STEPS = 4;

export function TrackingSkeleton() {
  return (
    <div className="min-h-screen pb-6">
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Link
          to="/bookings"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="text-base font-semibold text-foreground">Booking Status</h1>
      </div>

      <LoadingRegion className="px-4 pt-6">
        <TrustStrip variant="full" className="mb-4" />

        {/* StatusStepper: h-7 dot + connector on the left, a text-sm label
            (20px line, pt-1) on the right. */}
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className="flex items-stretch gap-3">
              <div className="flex flex-col items-center">
                <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                {i < STEPS - 1 && <div className="min-h-6 w-0.5 flex-1 bg-border" />}
              </div>
              <div className={`pt-1 ${i < STEPS - 1 ? "pb-3" : ""}`}>
                <Skeleton className="my-0.5 h-4 w-28" />
              </div>
            </div>
          ))}
        </div>

        {/* Address: text-xs label, text-sm line. */}
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <Skeleton className="mb-1 h-3 w-24" />
          <Skeleton className="my-0.5 h-4 w-4/5" />
        </div>

        {/* Payment: label/value rows, then the bordered total row. */}
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          {["w-12", "w-16", "w-20"].map((w, i) => (
            <div key={i} className={`flex justify-between ${i > 0 ? "mt-2" : ""}`}>
              <Skeleton className="my-0.5 h-4 w-16" />
              <Skeleton className={`my-0.5 h-4 ${w}`} />
            </div>
          ))}
          <div className="mt-2 mb-2 flex justify-between border-t border-border pt-2">
            <Skeleton className="my-0.5 h-4 w-10" />
            <Skeleton className="my-0.5 h-4 w-16" />
          </div>
        </div>
      </LoadingRegion>
    </div>
  );
}
