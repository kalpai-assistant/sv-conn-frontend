import { Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isCallMappingAbsent, useBookingCallMapping } from "@/hooks/useApi";
import { useT } from "@/i18n/LanguageProvider";

/**
 * SVC-453 — "Call customer" on an SP's active booking.
 *
 * The SP never sees the customer's real phone (privacy baked default, SVC-446).
 * Pressing this button asks `GET /bookings/{id}/call-mapping` for the virtual
 * number allocated for this booking, then fires a native `tel:` intent against
 * it. Exotel resolves the (From, To) pair on its side and bridges to the
 * customer's real line, playing the consent IVR first (SVC-450/451).
 *
 * ## 404 handling
 * The mapping only exists after the booking is ACCEPTED. The baked UX for a
 * tap before that: an inline toast explaining the button will come alive once
 * accepted, and no retry button — the polling `useBooking` 4s refetch will
 * flip the call button into its ready state on its own.
 *
 * ## Why a hook + tap handler rather than `href="tel:..."`
 * The virtual number is fetched lazily (no mapping for an accepted booking is
 * common on team-dispatch) and the `tel:` string needs to be computed at tap
 * time so a stale cache doesn't dial the wrong line. Rendering the button as
 * a link would also pre-resolve, which is a privacy loss shape: a background
 * fetch of the virtual number for a booking the SP never calls.
 */
export function CallCustomerButton({ bookingId }: { bookingId: string }) {
  // Prefetch the mapping so the first tap is zero-RTT on the happy path, but
  // let a 404 fail quietly — the toast at tap time is the UX, not an error
  // banner painted on the screen before anyone tries to call.
  const { data, error, isLoading, refetch } = useBookingCallMapping(bookingId);
  const { t } = useT("provider");

  const onTap = async () => {
    // Refetch inside the tap to respect "ring at tap time": a 404 cached a
    // few seconds ago is likely still a 404, but on a booking that just
    // moved ACCEPTED → EN_ROUTE between tabs it may not be. A single probe
    // avoids wasting the user's next tap on stale data.
    let number = data?.virtual_number ?? null;
    if (!number) {
      const fresh = await refetch();
      number = fresh.data?.virtual_number ?? null;
    }
    if (!number) {
      if (isCallMappingAbsent(error) || isCallMappingAbsent((data as unknown) ?? error)) {
        toast(t("call.unavailableToast"));
      } else {
        toast(t("call.failedToast"));
      }
      return;
    }
    // Native dialer intent. On Capacitor / Android this opens the system
    // dial pad with the number pre-populated; on iOS the FaceTime sheet.
    // No in-app call — SVC-446 is masking, not UCaaS.
    window.location.href = `tel:${number}`;
  };

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2"
      onClick={onTap}
      aria-label={t("call.customerAria")}
    >
      <Phone className="h-4 w-4" aria-hidden="true" />
      {t("call.customer")}
    </Button>
  );
}
