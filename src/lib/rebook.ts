/**
 * SVC-393: one-tap "Book again" from a past booking.
 *
 * Takes a historical booking and the current catalogue / address / in-flight
 * context, and returns the move the UI should make. Pure, so the rules can
 * be exercised in a unit test without a cart provider, a toast library, or a
 * router.
 *
 * The branching below is the whole point of this file. Each case is a
 * distinct conversation the caller has to have with the user:
 *
 * - **In-flight collision.** The user already has an ACCEPTED / EN_ROUTE /
 *   IN_PROGRESS booking against one of the services on this rebook. Refuse,
 *   so a double-tap on "Book again" or a quick repeat does not open a parallel
 *   job on the dispatcher. Reuses the active-status set from
 *   `booking-landing.ts` (SVC-385) so the two agree on what "in-flight" means.
 * - **Every item deprecated.** The services were all removed or deactivated.
 *   Nothing left to add; caller shows a "no longer available" state with a
 *   browse-similar link to the first item's category.
 * - **Partial deprecation.** Some items drop. The rest proceed; caller toasts
 *   which ones were skipped so the drop is reported, not swallowed.
 * - **Address fallback.** The historical address was deleted (SVC-367
 *   anonymisation sweeps it). The current default stands in, and the caller
 *   flags "please confirm" so the user cannot sleepwalk into a booking at the
 *   wrong location.
 * - **Pricing shift.** The catalogue's current line totals differ from what
 *   the booking was placed at. Caller toasts "Pricing updated" so a user who
 *   paid ₹499 last time and sees ₹599 now is not surprised at checkout.
 */
import type { Booking, Service, Address } from "./mock-data";
import { isActiveBookingStatus } from "./booking-landing";
import type { PrefillItem } from "@/components/home/banner-destination";

/** Items the cart will see, in prefill order. */
export interface RebookPrefill extends PrefillItem {}

export interface AddressChoice {
  /** The address to pre-select on the cart. */
  id: string | null;
  /** True when the historical address id no longer resolves and we fell
   *  back to the user's default — the caller flags "please confirm". */
  fellBack: boolean;
  /** The label of the deleted address, when known. Powers the sticky-row
   *  copy ("Delivery address for 'Home' was removed — please confirm."). */
  previousLabel?: string;
}

/**
 * Shape returned by `prepareRebook`. The caller switches on `kind`:
 * - `"in-flight"` → refuse with the service name in the toast
 * - `"all-deprecated"` → "No longer available"; offer a browse-similar
 * - `"ok"` → act on `items`, `address`, `pricingChanged`, `skipped`
 */
export type RebookOutcome =
  | {
      kind: "in-flight";
      /** The service that collides. First match wins — one toast is enough. */
      serviceName: string;
    }
  | {
      kind: "all-deprecated";
      /** The source booking's primary category, if we can place one. Powers
       *  the "Browse similar" link. */
      categoryId: string | undefined;
    }
  | {
      kind: "ok";
      /** Lines to hand to `useCart.addMany`. */
      items: RebookPrefill[];
      address: AddressChoice;
      /** True when the catalogue total for `items` differs from the
       *  historical booking's `serviceAmount`. */
      pricingChanged: boolean;
      /** Service ids dropped because catalogue no longer carries them or
       *  the variant is deactivated. Caller toasts per name. */
      skipped: Array<{ serviceId: string; name: string }>;
    };

export interface RebookInput {
  booking: Pick<Booking, "items" | "address" | "serviceAmount">;
  catalogue: Service[];
  addresses: Address[] | undefined;
  /** The user's active bookings — ACCEPTED / EN_ROUTE / IN_PROGRESS. The
   *  caller filters so this helper does not re-walk the whole list. */
  activeBookings: ReadonlyArray<Pick<Booking, "status" | "items">>;
}

/**
 * The whole rebook decision in one call. Caller feeds it the booking plus
 * the data it already has in React Query, and gets back a verdict it can
 * render.
 *
 * No side effects. No navigation. No cart writes. The caller is responsible
 * for applying the verdict — see `src/routes/bookings.tsx` for the call site.
 */
export function prepareRebook(input: RebookInput): RebookOutcome {
  const { booking, catalogue, addresses, activeBookings } = input;
  const byId = new Map(catalogue.map((s) => [s.id, s]));

  // In-flight check first. Refusing a rebook on a service already booked
  // is cheaper to compute and more surprising if deferred — the user who
  // mis-taps twice should see the refusal, not the price-updated toast.
  for (const item of booking.items) {
    const collision = activeBookings.find(
      (b) => isActiveBookingStatus(b.status) && b.items.some((i) => i.serviceId === item.serviceId),
    );
    if (collision) {
      return { kind: "in-flight", serviceName: item.serviceName };
    }
  }

  const items: RebookPrefill[] = [];
  const skipped: Array<{ serviceId: string; name: string }> = [];
  let newTotal = 0;

  for (const item of booking.items) {
    const service = byId.get(item.serviceId);
    if (!service) {
      skipped.push({ serviceId: item.serviceId, name: item.serviceName });
      continue;
    }
    // Variant check. If the booking carried a variant id and that variant
    // is no longer active, skip the whole line — silently falling to the
    // service's first variant would be re-selling what the user didn't
    // choose, which is the exact SVC-232 bug this field exists to prevent.
    if (item.variantId) {
      const stillActive = service.variants.some((v) => v.id === item.variantId);
      if (!stillActive) {
        skipped.push({ serviceId: item.serviceId, name: item.serviceName });
        continue;
      }
    }
    items.push({
      serviceId: service.id,
      variantId: item.variantId,
      quantity: item.quantity,
    });
    const variantPrice = item.variantId
      ? service.variants.find((v) => v.id === item.variantId)?.price
      : undefined;
    const unitPrice = variantPrice ?? service.price;
    newTotal += unitPrice * item.quantity;
  }

  if (items.length === 0) {
    // Everything deprecated. Point browse-similar at the first item's
    // category if we have one; the booking's primary service field is
    // reconstructed by the mapper (see `useApi.ts` fallback) so an entry
    // with no category is a soft-deleted service — leave categoryId
    // undefined and the caller will degrade to a plain "unavailable"
    // state rather than a dead link.
    const first = booking.items[0];
    const cat = first ? byId.get(first.serviceId)?.categoryId : undefined;
    return { kind: "all-deprecated", categoryId: cat };
  }

  // Address resolution. If the historical id resolves against the current
  // list, keep it. Otherwise fall back to the user's default (addresses[0])
  // — same rule `useSelectedAddress` uses — and flag the caller to show a
  // "please confirm" sticky row at the top of the cart.
  const list = addresses ?? [];
  const resolved = booking.address.id
    ? list.find((a) => a.id === booking.address.id)
    : undefined;
  const fallback = list[0];
  const address: AddressChoice = resolved
    ? { id: resolved.id, fellBack: false }
    : {
        id: fallback?.id ?? null,
        fellBack: true,
        previousLabel: booking.address.label || undefined,
      };

  // Pricing-changed detection is "did the subtotal move?" rather than
  // per-line to keep the toast coherent — one message, not one per item.
  // Caller shows the toast when this is true; see the pitfall in the
  // SVC-393 ticket.
  const pricingChanged = Math.round(newTotal) !== Math.round(booking.serviceAmount);

  return {
    kind: "ok",
    items,
    address,
    pricingChanged,
    skipped,
  };
}
