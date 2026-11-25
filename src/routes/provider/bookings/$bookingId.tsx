import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobAddress } from "@/components/provider/JobAddress";
import { AssignedPro } from "@/components/provider/AssignedPro";
import { JobMapStrip } from "@/components/provider/JobMapStrip";
import { CustomerSeenChip } from "@/components/provider/CustomerSeenChip";
import { CompletionOverlay } from "@/components/provider/CompletionOverlay";
import { RateCustomerScaffold } from "@/components/provider/RateCustomerScaffold";
import { isBookingGone, useBooking } from "@/hooks/useApi";
// The per-status actions live beside the job rather than inside this route,
// because Provider Home renders the same ones inline (SVC-274). One
// implementation, so the guard on completion cannot exist on one screen only.
import { CompleteStep, DoorstepOtpStep, EnRouteStep } from "@/components/provider/JobActions";
import type { Booking } from "@/lib/mock-data";
import { formatRupees } from "@/i18n/format";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n/LanguageProvider";

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
  const { t, lang } = useT("provider");

  return (
    <div className="min-h-screen p-6 pb-24">
      <Link
        to="/provider/bookings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("jobDetail.back")}
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
          <p className="font-medium text-foreground">{t("jobDetail.goneTitle")}</p>
          <p className="mt-1 text-muted-foreground">{t("jobDetail.goneDetail")}</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/provider/bookings">{t("jobDetail.backToJobs")}</Link>
          </Button>
        </div>
      )}

      {isError && !isBookingGone(error) && (
        <p className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {errorText(error, t("jobDetail.loadFailed"), lang)}
        </p>
      )}

      {!isLoading && !isError && !booking && (
        <p className="mt-6 text-sm text-muted-foreground">{t("jobDetail.notFound")}</p>
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
  const { t, lang } = useT("provider");

  // SVC-493: the completion overlay shows once per COMPLETED-state
  // arrival on this screen. It auto-dismisses after 1.5s and hands
  // back to the EarningsBreakdown body below. Hoisted to JobBody so
  // the flag resets naturally when the host swaps bookings.
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const showCompletionOverlay = booking.status === "COMPLETED" && !overlayDismissed;

  // SVC-493: customer read-receipt field does not exist on the backend
  // yet (recommendation only — hands-off per shared contract §4 since
  // the booking mapper lives in Tushar-owned territory). The chip
  // renders nothing until a real `customerSeenAt` lands; passing
  // `undefined` keeps the surface honest without pre-committing to a
  // field name the backend may rename.
  const customerSeenAt: Date | null | undefined = undefined;

  // SVC-493: live provider location is NOT wired in Phase 4. The map
  // strip renders with just the customer pin when this is null —
  // still answers "where is the job" even without "where am I".
  // When the backend's live-tracking WebSocket landing (per
  // `frontend_integration_guide.md`) arrives, pipe it in here.
  const providerLocation: { lat: number; lng: number } | null = null;

  return (
    <>
      <h1 className="mt-3 text-lg font-semibold text-foreground">{booking.service.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatRupees(booking.totalAmount, lang)} ·{" "}
        {booking.paymentMethod === "cash" ? t("jobDetail.cash") : t("jobDetail.paidOnline")}
      </p>

      {/* SVC-493 — embedded map strip during travel statuses. A provider
          who taps JobAddress's Navigate leaves the app; the strip keeps
          the map inside the app for the glance case. Renders nothing if
          the customer address has no lat/lng (older ungeocoded rows). */}
      {travelling(booking.status) && (
        <div className="mt-4">
          <JobMapStrip
            customerAddress={booking.address}
            providerLocation={providerLocation}
            /* distance is undefined for now — no `distance_km` on the
               Booking mapper; computing on-device needs a geolocation
               permission path we don't want to take on this surface.
               EtaChip is null-safe and simply hides when undefined. */
            distanceKm={null}
          />
          {/* SVC-493: trust goes both ways. The customer-seen chip
              surfaces reciprocal awareness. Null-safe: hidden until
              backend read-receipt field lands. */}
          <div className="mt-2 flex items-center gap-2">
            <CustomerSeenChip seenAt={customerSeenAt} />
          </div>
        </div>
      )}

      {/* Above the action, deliberately: on ACCEPTED and EN_ROUTE this is the
          screen's real content — where to go — and "I'm on my way" is the reply
          to it (SVC-171). JobAddress keeps the Navigate hand-off even with the
          map strip above (the map is supplemental per the ticket). */}
      <div className="mt-4">
        <JobAddress address={booking.address} showNavigate={travelling(booking.status)} />
      </div>

      {/* Who is on the job, and a way to change it (SVC-324). Renders nothing
          for a solo SP. */}
      <AssignedPro booking={booking} />

      <div className="mt-6">
        {booking.status === "ACCEPTED" && <EnRouteStep bookingId={booking.id} />}
        {booking.status === "EN_ROUTE" && <DoorstepOtpStep bookingId={booking.id} />}
        {booking.status === "IN_PROGRESS" && <CompleteStep bookingId={booking.id} />}
        {booking.status === "COMPLETED" && (
          <>
            <EarningsBreakdown booking={booking} />
            {/* SVC-493: frontend-only rate-the-customer scaffold.
                Submit is disabled with a "Coming soon" note — backend
                endpoint does not exist (recommendation only; Tushar's
                hands-off epics own the booking surface). */}
            <RateCustomerScaffold bookingId={booking.id} />
          </>
        )}
        {(booking.status === "CANCELLED" || booking.status === "EXPIRED") && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {booking.status === "CANCELLED" ? t("jobDetail.cancelled") : t("jobDetail.expired")}
          </p>
        )}
      </div>

      {/* SVC-493: completion overlay — reuses SVC-390's Celebration via
          its new optional title/subtitle props, spring-rolls the
          provider earnings number, and fires hapticSuccess once per
          booking. Rendered at the bottom of the JSX tree so it covers
          the whole screen (fixed inset-0 z-50). */}
      {showCompletionOverlay && (
        <CompletionOverlay
          bookingId={booking.id}
          payoutAmount={booking.providerPayout}
          onDismissed={() => setOverlayDismissed(true)}
        />
      )}
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
  const { t, lang } = useT("provider");
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        {t("jobDetail.completed")}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("jobDetail.serviceAmount")}</span>
          <span className="text-foreground">{formatRupees(booking.totalAmount, lang)}</span>
        </div>

        {booking.platformCommission !== undefined && (
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("jobDetail.platformFee")}</span>
            <span className="text-foreground">
              −{formatRupees(booking.platformCommission, lang)}
            </span>
          </div>
        )}

        {booking.providerPayout !== undefined && (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-medium text-foreground">
              {t("jobDetail.yourEarnings")}
            </span>
            <span className="text-base font-semibold text-foreground">
              {formatRupees(booking.providerPayout, lang)}
            </span>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t("jobDetail.paidOut")}</p>
    </div>
  );
}
