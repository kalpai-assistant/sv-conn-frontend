/**
 * Data layer for the Incoming Request Card (SVC-69).
 *
 * ---------------------------------------------------------------------------
 * Why this does NOT use `useBooking(id)`
 * ---------------------------------------------------------------------------
 * `useBooking` wraps `GET /bookings/{id}`, which enforces
 *
 *     if user_id not in (booking.consumer_id, booking.provider_id): 403
 *
 * A provider looking at an incoming request has not accepted yet, and
 * `booking.provider_id` stays NULL until someone does — so a broadcast
 * recipient is neither the consumer nor the assigned provider and every call
 * 403s. The card would never render, for anyone, ever.
 *
 * `GET /bookings/{id}/offer` (SVC-153) exists precisely for this case and
 * returns only what the card renders — notably not `doorstep_otp`, which must
 * reach the provider from the consumer at the door.
 *
 * ---------------------------------------------------------------------------
 * Status codes are the contract. Never parse the message.
 * ---------------------------------------------------------------------------
 * Both endpoints declare their codes in the OpenAPI spec so the generated
 * client carries them. The backend chose these codes specifically so the card
 * can tell "someone beat me to it" from "you should never have seen this"
 * without string matching.
 *
 * As of SVC-167 + SVC-168 (merged, backend #66) the two endpoints share one
 * vocabulary, so a single classifier serves both:
 *
 *   403  you were not offered this booking  → real error, do not render
 *   404  no such booking                    → do not render
 *   410  the offer is gone — claimed by another provider, cancelled or expired
 *                                           → dismiss QUIETLY
 *
 * 410 is the common outcome, not an edge case: the push fans out to every
 * nearby eligible provider and exactly one can win, so everyone else lands
 * here. Treating it as an error shows a scary failure to the majority of
 * recipients on every single booking.
 *
 * Historical note, because the old shape is still in the wild: `accept` used to
 * return 403 for the lost race, which forced `if (403 || 410) dismiss()` here
 * and read as an auth failure for the *common* path. SVC-167 unified it to 410.
 * This file no longer special-cases accept — if you are looking at a deployment
 * older than backend #66, a lost race arrives as 403 and is reported as a real
 * error rather than dismissed quietly. That is the safe direction to be wrong
 * in, and it self-corrects once the backend is current.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import type { components } from "@/types/api";

type Schema<K extends keyof components["schemas"]> = components["schemas"][K];

export type BookingOffer = Schema<"BookingOfferResponse">;

/**
 * Why the card closed. Only `unavailable` is a real error; everything else is
 * an ordinary outcome and must not produce error UI.
 */
export type DismissReason =
  | "accepted" // this provider won the job
  | "taken" // someone else won it, or it was cancelled/expired server-side
  | "expired" // the local countdown reached zero
  | "ignored" // the provider tapped Ignore — local only, no API call
  | "unavailable"; // 403/404 on load — the card should never have opened

/**
 * The offer is over: claimed by another provider, cancelled, or expired.
 * Dismiss the card quietly — this is the common outcome, not an edge case.
 */
const GONE = 410;
/** Not offered this booking (on load) / already claimed by someone else (on accept). */
const FORBIDDEN = 403;
/** No such booking. */
const NOT_FOUND = 404;

/**
 * Classify a failure of `GET /offer` or `PATCH /accept` — since SVC-167 the two
 * share one status vocabulary, so one function covers both.
 *
 * Returns null when the failure is a real error the provider might retry: a 409
 * (the booking moved past ACCEPTED — a genuinely illegal move, not a lost
 * race), a 5xx, or a network drop. The card stays open for those.
 */
export function dismissReasonForOfferError(error: unknown): DismissReason | null {
  if (!(error instanceof ApiError)) return null;
  // The offer is gone. Common case — quiet dismissal, never error UI.
  if (error.status === GONE) return "taken";
  // The card was opened for a booking this provider was never offered, or one
  // that does not exist. Dismissed too, but logged: it should not happen.
  if (error.status === FORBIDDEN || error.status === NOT_FOUND) return "unavailable";
  return null;
}

/**
 * Read the countdown seed off an offer.
 *
 * The generated type says `seconds_remaining: number` — always present —
 * because SVC-166 deliberately gave the field no default, so it lands in
 * OpenAPI `required` and codegen types it non-optional. That was the whole
 * point: an optional field invites `?? 120` and reinstates the client-side
 * guess the field exists to remove.
 *
 * But backend PR #60 is in review, not deployed. Until it ships, staging
 * genuinely omits both expiry fields while the types insist they are there,
 * and TypeScript cannot warn us — we told it the field is always present.
 * `seconds_remaining - elapsed` would then be NaN and the card would render
 * garbage with no error at all.
 *
 * Reading through `unknown` is the honest way to say "this type is a promise
 * the deployed server does not keep yet". Returning null makes the card HIDE
 * the countdown and render everything else. No timer beats a wrong timer — and
 * beats a fabricated one, which would silently outlive the deploy window
 * because it appears to work.
 */
export function readSecondsRemaining(offer: BookingOffer): number | null {
  const raw: unknown = offer.seconds_remaining;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.floor(raw));
}

/**
 * Fetch the offer behind an incoming request.
 *
 * Deliberately fetched exactly once per card. The countdown is seeded from
 * `seconds_remaining` at fetch time and ticked locally, so a refetch would
 * reset a running timer — every refetch trigger is therefore off.
 */
export function useBookingOffer(bookingId: string | null) {
  return useQuery({
    queryKey: ["booking-offer", bookingId],
    queryFn: () => apiFetch<BookingOffer>(`/bookings/${bookingId}/offer`),
    enabled: Boolean(bookingId),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // 403/404/410 are all terminal answers — retrying burns the offer window
    // and cannot change the result. A transient network failure gets one retry.
    retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 1,
  });
}

/**
 * Claim the booking. First provider to accept wins.
 *
 * Resolves with the reason the card should close: `"accepted"` when this
 * provider won, `"taken"` when the offer was already gone, `"unavailable"` for
 * the shouldn't-happen 403/404. Losing the race is an expected outcome — it
 * resolves rather than throwing so the card dismisses without error UI.
 * Anything else (409, 5xx, network) rejects and surfaces as a real error the
 * provider can retry.
 *
 * Accept is idempotent server-side: re-accepting a booking you already hold
 * returns 200 with no second push to the consumer (SVC-154), so a retry after a
 * lost response is safe.
 */
export function useAcceptOffer() {
  const queryClient = useQueryClient();

  return useMutation<Extract<DismissReason, "accepted" | "taken" | "unavailable">, Error, string>({
    mutationFn: async (bookingId: string) => {
      try {
        await apiFetch<Schema<"BookingResponse">>(`/bookings/${bookingId}/accept`, {
          method: "PATCH",
        });
        return "accepted";
      } catch (error) {
        // The offer can be claimed in the seconds between the card rendering
        // and the provider tapping Accept. That race is lost regularly, and
        // arrives here as the same 410 the load path gets.
        const reason = dismissReasonForOfferError(error);
        if (reason === "taken" || reason === "unavailable") return reason;
        throw error;
      }
    },
    onSuccess: (outcome) => {
      // Won or lost, this provider's job list may have changed.
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      if (outcome === "accepted") {
        queryClient.invalidateQueries({ queryKey: ["provider-bookings"] });
      }
    },
  });
}
