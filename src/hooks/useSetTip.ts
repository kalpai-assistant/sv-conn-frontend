/**
 * ``POST /bookings/{id}/tip`` — consumer adds (or updates) a gratuity
 * on a completed booking.
 *
 * A second call with a different amount replaces rather than
 * accumulates; ``amount = 0`` removes the tip. Server-side rules
 * (only-consumer, only-completed, refuses-if-refunded) surface as
 * the ApiError message, which the caller renders inline.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api";

type BookingResponseLike = components["schemas"]["BookingResponse"] & {
  items?: unknown;
  tip_amount?: number;
  discount_amount?: number;
};

export function useSetTip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, amount }: { bookingId: string; amount: number }) =>
      apiFetch<BookingResponseLike>(`/bookings/${bookingId}/tip`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      }),
    onSuccess: (_data, { bookingId }) => {
      // Both the single-booking read and the list have to reflect the
      // new tip; invalidate both so the tracking screen renders the
      // updated amount and the bookings tab shows the new total.
      qc.invalidateQueries({ queryKey: ["booking", bookingId] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
