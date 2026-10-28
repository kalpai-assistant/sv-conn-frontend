/**
 * SVC-393: `prepareRebook` is a pure switch over the four edge cases the
 * ticket calls out. Each test here pins one branch — a change that merges
 * two of them (or silently falls through the "all deprecated" filter) will
 * trip the suite rather than ship.
 *
 * The booking fixture is kept minimal: only the fields `prepareRebook`
 * reads. `UnknownBooking`-shaped casts live inside the fixture builder so
 * the test bodies stay readable.
 */
import { describe, expect, it } from "vitest";
import { prepareRebook } from "@/lib/rebook";
import type { Booking, Service, Address } from "@/lib/mock-data";

function makeService(overrides: Partial<Service>): Service {
  return {
    id: "svc-1",
    name: "Deep Clean",
    categoryId: "cat-1",
    categoryName: "Home",
    description: "",
    price: 500,
    payout: 350,
    duration: "2h",
    variants: [],
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking>): Booking {
  // Reconstruct only the fields `prepareRebook` reads. Casting through
  // `unknown` short-circuits the full type — tests shouldn't track the
  // Booking shape as it grows.
  return {
    items: [
      {
        id: "bi-1",
        serviceId: "svc-1",
        serviceName: "Deep Clean",
        quantity: 1,
        unitPrice: 500,
        totalPrice: 500,
      },
    ],
    address: { id: "addr-1", label: "home", full: "7 Lane" } as Address,
    serviceAmount: 500,
    status: "COMPLETED",
    ...overrides,
  } as unknown as Booking;
}

describe("prepareRebook — ok paths", () => {
  it("prefills the exact service + variant + quantity from the historical booking", () => {
    // The whole point of SVC-393. If this fails every other outcome below is
    // moot because the happy path is already broken.
    const service = makeService({
      variants: [
        {
          id: "v-std",
          label: "Standard",
          price: 500,
          duration: "2h",
          payout: 350,
          subcategory: null,
        },
      ],
    });
    const booking = makeBooking({
      items: [
        {
          id: "bi-1",
          serviceId: "svc-1",
          serviceName: "Deep Clean",
          variantId: "v-std",
          variantLabel: "Standard",
          quantity: 2,
          unitPrice: 500,
          totalPrice: 1000,
        },
      ],
      serviceAmount: 1000,
    });

    const outcome = prepareRebook({
      booking,
      catalogue: [service],
      addresses: [{ id: "addr-1", label: "home", full: "7 Lane" } as Address],
      activeBookings: [],
    });

    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.items).toEqual([{ serviceId: "svc-1", variantId: "v-std", quantity: 2 }]);
    expect(outcome.pricingChanged).toBe(false);
    expect(outcome.address).toEqual({ id: "addr-1", fellBack: false });
    expect(outcome.skipped).toEqual([]);
  });

  it("flags pricing changed when the catalogue total differs from the historical total", () => {
    // Caller toasts "Pricing updated" — the ticket's SVC-393 pitfall. We
    // don't silently reprice the user's historical bill, we tell them.
    const service = makeService({ price: 650 });
    const booking = makeBooking({ serviceAmount: 500 });

    const outcome = prepareRebook({
      booking,
      catalogue: [service],
      addresses: [{ id: "addr-1", label: "home", full: "7 Lane" } as Address],
      activeBookings: [],
    });

    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.pricingChanged).toBe(true);
  });

  it("falls back to the default address and flags it when the historical address is gone", () => {
    // SVC-367 anonymisation would delete the row, leaving the historical id
    // dangling. The sticky "please confirm" row is driven by this flag.
    const service = makeService({});
    const booking = makeBooking({});
    const defaultAddress = {
      id: "addr-current",
      label: "work",
      full: "Paud Road",
    } as Address;

    const outcome = prepareRebook({
      booking,
      catalogue: [service],
      addresses: [defaultAddress],
      activeBookings: [],
    });

    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.address).toEqual({
      id: "addr-current",
      fellBack: true,
      previousLabel: "home",
    });
  });
});

describe("prepareRebook — refusal paths", () => {
  it("refuses when an active booking already covers one of the services", () => {
    // The in-flight check from SVC-385. Firing the toast is the caller's
    // job; our contract is to say which service collided.
    const service = makeService({});
    const booking = makeBooking({});
    const activeBooking = {
      status: "ACCEPTED",
      items: [{ id: "bi-x", serviceId: "svc-1", serviceName: "Deep Clean" }],
    } as unknown as Booking;

    const outcome = prepareRebook({
      booking,
      catalogue: [service],
      addresses: [{ id: "addr-1", label: "home", full: "7 Lane" } as Address],
      activeBookings: [activeBooking],
    });

    expect(outcome).toEqual({ kind: "in-flight", serviceName: "Deep Clean" });
  });

  it("reports all-deprecated when every line's service is gone", () => {
    // Nothing to add. Caller shows "No longer available" and a browse-similar
    // link to the first item's category — the category is placed from the
    // mapper's fallback only when the service is cached, so an all-cold
    // catalogue returns `undefined` here (not a dead link).
    const booking = makeBooking({});

    const outcome = prepareRebook({
      booking,
      catalogue: [], // catalogue has no entry for svc-1
      addresses: [{ id: "addr-1", label: "home", full: "7 Lane" } as Address],
      activeBookings: [],
    });

    expect(outcome.kind).toBe("all-deprecated");
    if (outcome.kind !== "all-deprecated") return;
    expect(outcome.categoryId).toBeUndefined();
  });

  it("skips a line whose historical variant is no longer active, keeping the others", () => {
    // Service still exists, but the variant the user paid for isn't in the
    // catalogue any more — don't silently fall back to the first variant
    // (SVC-232's exact failure mode). Reported in `skipped`.
    const retained = makeService({ id: "svc-2", name: "Carpet Clean", variants: [] });
    const changed = makeService({
      id: "svc-1",
      name: "Deep Clean",
      variants: [
        { id: "v-new", label: "New", price: 500, duration: "2h", payout: 350, subcategory: null },
      ],
    });
    const booking = makeBooking({
      items: [
        {
          id: "bi-1",
          serviceId: "svc-1",
          serviceName: "Deep Clean",
          variantId: "v-old",
          quantity: 1,
          unitPrice: 500,
          totalPrice: 500,
        },
        {
          id: "bi-2",
          serviceId: "svc-2",
          serviceName: "Carpet Clean",
          quantity: 1,
          unitPrice: 300,
          totalPrice: 300,
        },
      ],
      serviceAmount: 800,
    });

    const outcome = prepareRebook({
      booking,
      catalogue: [retained, changed],
      addresses: [{ id: "addr-1", label: "home", full: "7 Lane" } as Address],
      activeBookings: [],
    });

    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") return;
    expect(outcome.items).toEqual([{ serviceId: "svc-2", variantId: undefined, quantity: 1 }]);
    expect(outcome.skipped).toEqual([{ serviceId: "svc-1", name: "Deep Clean" }]);
  });
});
