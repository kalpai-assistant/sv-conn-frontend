/**
 * One tap from cart to paid booking (SVC-259).
 *
 * ## What was wrong
 *
 * "Book & Pay" created the booking and then navigated to the tracking screen,
 * where the user had to scroll down and find a second "Pay Now" button. People
 * read the button label, landed on a screen that looked like confirmation, and
 * stopped — which SVC-259 identifies as the leading contributor to zero
 * payments ever landing on beta, and the root cause behind SVC-246.
 *
 * Now the three steps chain: create the booking, mint the payment order, open
 * Razorpay. The tracking screen becomes the confirmation it always looked like,
 * and by the time it loads `paymentStatus` is `paid`, so its Pay Now button
 * correctly does not render.
 *
 * ## The booking outlives a dismissed checkout, on purpose
 *
 * Closing the Razorpay modal leaves a real booking behind in
 * REQUESTED/PENDING. Two consequences drive the design:
 *
 * 1. **The cart is not cleared until payment succeeds.** Clearing on booking —
 *    what the old flow did — would strand the user on an empty cart with an
 *    unpaid booking and nothing to retry from.
 * 2. **A retry reuses that booking rather than making another.** Otherwise
 *    every dismissal-and-retry cycle leaves another abandoned booking for the
 *    sweeper, and the provider broadcast fires for each one.
 *
 * ## …unless the cart changed underneath it
 *
 * The held booking is priced against the items that existed when it was
 * created. If the user dismisses checkout, swaps a ₹499 service for a ₹1200
 * one, and taps again, reusing the held booking would charge them ₹499 for a
 * job they no longer asked for. So any change to `items` discards it and the
 * next tap books afresh. This is a money bug, not a tidiness concern.
 *
 * The cart persists in localStorage but the held booking is React state, so a
 * force-close mid-flow also drops it — the next tap books afresh, which is the
 * behaviour we want and gets it for free.
 */
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { RazorpayCheckoutOptions, RazorpaySuccessResponse } from "@/types/razorpay";
import { useCreatePaymentOrder, useVerifyPayment } from "@/hooks/useApi";
import { useCreateBookingFromCart } from "@/hooks/useCreateBookingFromCart";
import type { CartLineItem } from "@/lib/cart-context";

type CreateBookingArgs = Parameters<ReturnType<typeof useCreateBookingFromCart>["mutateAsync"]>[0];

interface BookAndPayArgs {
  /** Everything `createBooking` needs, minus the idempotency key. */
  booking: Omit<CreateBookingArgs, "idempotencyKey">;
  /** Cash skips payment entirely and behaves as it always did. */
  isOnline: boolean;
  /** Cart contents — a change to these invalidates any held booking. */
  items: CartLineItem[];
  /** Paid, or a cash booking created. Navigate and clear the cart here. */
  onComplete: (bookingId: string) => void;
}

/** Stable identity for a cart, so a change to it can be detected. */
function cartSignature(items: CartLineItem[]): string {
  return items
    .map((i) => `${i.serviceId}:${i.variantId ?? ""}:${i.quantity}`)
    .sort()
    .join("|");
}

export function useBookAndPay() {
  const createBooking = useCreateBookingFromCart();
  const createPaymentOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();
  const [isBusy, setIsBusy] = useState(false);

  // The booking created by a tap whose checkout was then dismissed, kept so a
  // retry pays for it instead of creating another. Held in a ref rather than
  // state: nothing renders from it, and a re-render mid-checkout must not
  // reset it.
  const heldBooking = useRef<{ id: string; cart: string } | null>(null);

  const bookAndPay = useCallback(
    async ({ booking, isOnline, items, onComplete }: BookAndPayArgs) => {
      if (isBusy) return;
      setIsBusy(true);
      try {
        const signature = cartSignature(items);
        // Discard a held booking whose cart no longer matches — paying for it
        // would charge the old basket. See the module docs.
        if (heldBooking.current && heldBooking.current.cart !== signature) {
          heldBooking.current = null;
        }

        let bookingId = heldBooking.current?.id;
        if (!bookingId) {
          const created = await createBooking.mutateAsync({
            ...booking,
            // Fresh key per tap. React-query replays the same key on its own
            // retries (the backend collapses those); a new user tap is a new
            // intent and gets a new key.
            idempotencyKey: crypto.randomUUID(),
          });
          bookingId = created.id as string;
        }

        // Cash: nothing to charge, so the booking IS the outcome.
        if (!isOnline) {
          heldBooking.current = null;
          onComplete(bookingId);
          return;
        }

        if (!window.Razorpay) {
          // The booking exists and is payable from the tracking screen, so
          // hold it rather than losing it to a script that failed to load.
          heldBooking.current = { id: bookingId, cart: signature };
          toast.error("Payment couldn't start", {
            description: "Check your connection and tap Pay again.",
          });
          return;
        }

        // A separate key from the booking's: different endpoint, different
        // idempotency store. A deliberate retry after a dismissal is a new
        // intent and mints a new one, matching what the tracking screen's Pay
        // Now button already does.
        const order = await createPaymentOrder.mutateAsync({
          bookingId,
          idempotencyKey: crypto.randomUUID(),
        });

        const options: RazorpayCheckoutOptions = {
          key: order.razorpay_key_id,
          amount: order.amount,
          currency: order.currency,
          name: "EazyServ",
          description: "Payment for Service",
          order_id: order.razorpay_order_id,
          handler: (response: RazorpaySuccessResponse) => {
            void (async () => {
              try {
                await verifyPayment.mutateAsync({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                });
                heldBooking.current = null;
                onComplete(bookingId);
              } catch {
                // Razorpay took the money but our verify call failed. The
                // booking must not be lost: keep it held so Pay can be
                // retried, and send them to tracking where the real payment
                // status is shown rather than guessed at here.
                toast.error("Payment taken, but we couldn't confirm it", {
                  description: "Opening your booking — it will update shortly.",
                });
                heldBooking.current = null;
                onComplete(bookingId);
              }
            })();
          },
          modal: {
            ondismiss: () => {
              // Hold the booking so the next tap pays for this one rather than
              // creating a second. `scheduled_at` decides the copy: the
              // cleanup sweeper exempts future-dated bookings (SVC-243), so
              // quoting "2 minutes" to someone who booked for tomorrow would
              // be wrong.
              heldBooking.current = { id: bookingId, cart: signature };
              setIsBusy(false);
              const isImmediate = !booking.scheduled_at;
              toast("Payment cancelled", {
                description: isImmediate
                  ? "Your booking is held for 2 minutes — tap Pay to complete it."
                  : "Tap Pay to complete your booking.",
              });
            },
          },
        };
        new window.Razorpay(options).open();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong. Please try again.";
        toast.error(msg);
      } finally {
        // `ondismiss` clears this itself — the modal outlives this function, so
        // leaving the button spinning until it closes would be wrong.
        setIsBusy(false);
      }
    },
    [isBusy, createBooking, createPaymentOrder, verifyPayment],
  );

  return { bookAndPay, isBusy };
}
