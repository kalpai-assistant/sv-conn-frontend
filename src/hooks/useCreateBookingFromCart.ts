/**
 * Create a booking from the cart.
 *
 * Wraps the new multi-item shape of ``POST /bookings/`` in a mutation so
 * the Cart page can await it, then navigate to tracking. Kept apart from
 * ``useApi.ts`` for the same reason ``useCoupons.ts`` is: cart flow gets
 * its own module boundary.
 *
 * Idempotency key is a caller-supplied argument (matches the pattern
 * ``useCreatePaymentOrder`` established in ``useApi.ts`` and the note in
 * SVC-158): react-query's retry replays the same key so a network blip
 * doesn't spawn two bookings, but a subsequent user tap regenerates it
 * and is treated as a fresh intent.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api";

// Widened response type — the OpenAPI regen is a followup on the
// backend PRs. Keep the runtime shape flexible until it lands.
type BookingResponseLike = components["schemas"]["BookingResponse"] & {
  items?: unknown;
  discount_amount?: number;
  tip_amount?: number;
};

export interface CreateCartBookingRequest {
  items: Array<{ service_id: string; quantity: number }>;
  address_id: string;
  scheduled_at: string | null;
  payment_method: "online" | "cash";
  coupon_code?: string;
  idempotencyKey: string;
}

export function useCreateBookingFromCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      idempotencyKey,
      ...body
    }: CreateCartBookingRequest): Promise<BookingResponseLike> => {
      return apiFetch<BookingResponseLike>("/bookings/", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      // A fresh booking should surface on the Bookings tab immediately
      // — invalidate the list so the tab, if already visited, refetches.
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
