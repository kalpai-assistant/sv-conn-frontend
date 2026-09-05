/**
 * One-tap book-and-pay (SVC-259).
 *
 * The chain itself is easy to see working. What these tests exist for is the
 * behaviour around a **dismissed** checkout, where the failure modes are
 * invisible in the UI and cost real money:
 *
 * - reusing a held booking whose cart has since changed charges the old basket
 *   for a job the user no longer asked for;
 * - *not* reusing it leaves an abandoned booking (and a provider broadcast)
 *   behind on every retry.
 *
 * Both look identical on screen. Only the requests leaving the device differ.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const createBooking = vi.fn();
const createPaymentOrder = vi.fn();
const verifyPayment = vi.fn();
const toastFn = vi.fn();
const toastError = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useCreatePaymentOrder: () => ({ mutateAsync: createPaymentOrder }),
  useVerifyPayment: () => ({ mutateAsync: verifyPayment }),
}));
vi.mock("@/hooks/useCreateBookingFromCart", () => ({
  useCreateBookingFromCart: () => ({ mutateAsync: createBooking }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign((...a: unknown[]) => toastFn(...a), {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
  }),
}));

import { useBookAndPay } from "@/hooks/useBookAndPay";

/** Captures the options Razorpay was opened with, so the modal can be driven. */
let lastOptions: {
  handler: (r: Record<string, string>) => void;
  modal: { ondismiss: () => void };
} | null = null;
const rzpOpen = vi.fn();

function cart(serviceId: string, quantity = 1) {
  return [{ key: `${serviceId}:`, serviceId, quantity, name: "x", price: 499 }] as never;
}

function args(over: Record<string, unknown> = {}) {
  return {
    booking: { items: [], address_id: "addr-1", scheduled_at: null, payment_method: "online" },
    isOnline: true,
    items: cart("svc-a"),
    onComplete: vi.fn(),
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  lastOptions = null;
  createBooking.mockResolvedValue({ id: "booking-1" });
  createPaymentOrder.mockResolvedValue({
    razorpay_key_id: "rzp_test_x",
    razorpay_order_id: "order_1",
    amount: 49900,
    currency: "INR",
  });
  verifyPayment.mockResolvedValue(undefined);
  vi.stubGlobal(
    "Razorpay",
    class {
      constructor(options: never) {
        lastOptions = options;
      }
      open = rzpOpen;
    },
  );
  vi.stubGlobal("crypto", { randomUUID: () => Math.random().toString(36) });
});

describe("the happy chain", () => {
  it("books, mints an order and opens checkout — without navigating first", async () => {
    const { result } = renderHook(() => useBookAndPay());
    const a = args();

    await act(async () => {
      await result.current.bookAndPay(a);
    });

    expect(createBooking).toHaveBeenCalledOnce();
    expect(createPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "booking-1" }),
    );
    expect(rzpOpen).toHaveBeenCalledOnce();
    // The old flow navigated here, which is the whole bug — the user landed on
    // a status screen and never found the Pay button.
    expect((a as { onComplete: () => void }).onComplete).not.toHaveBeenCalled();
  });

  it("completes only after the payment verifies", async () => {
    const { result } = renderHook(() => useBookAndPay());
    const a = args();
    await act(async () => {
      await result.current.bookAndPay(a);
    });

    await act(async () => {
      lastOptions!.handler({
        razorpay_order_id: "order_1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig",
      });
    });

    expect(verifyPayment).toHaveBeenCalledOnce();
    expect((a as { onComplete: (id: string) => void }).onComplete).toHaveBeenCalledWith(
      "booking-1",
    );
  });
});

describe("cash", () => {
  it("skips payment entirely", async () => {
    const { result } = renderHook(() => useBookAndPay());
    const a = args({ isOnline: false });

    await act(async () => {
      await result.current.bookAndPay(a);
    });

    expect(createPaymentOrder).not.toHaveBeenCalled();
    expect(rzpOpen).not.toHaveBeenCalled();
    expect((a as { onComplete: (id: string) => void }).onComplete).toHaveBeenCalledWith(
      "booking-1",
    );
  });
});

describe("dismissed checkout", () => {
  it("does not complete — so the cart survives to retry from", async () => {
    const { result } = renderHook(() => useBookAndPay());
    const a = args();
    await act(async () => {
      await result.current.bookAndPay(a);
    });

    act(() => lastOptions!.modal.ondismiss());

    // The old flow cleared the cart on booking, which would strand the user on
    // an empty cart holding an unpaid booking.
    expect((a as { onComplete: () => void }).onComplete).not.toHaveBeenCalled();
  });

  it("retrying pays for the SAME booking, not a second one", async () => {
    const { result } = renderHook(() => useBookAndPay());
    await act(async () => {
      await result.current.bookAndPay(args());
    });
    act(() => lastOptions!.modal.ondismiss());

    await act(async () => {
      await result.current.bookAndPay(args());
    });

    // One booking, two checkout attempts. Creating a second would leave an
    // abandoned booking per retry, each firing its own provider broadcast.
    expect(createBooking).toHaveBeenCalledOnce();
    expect(createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(rzpOpen).toHaveBeenCalledTimes(2);
  });

  it("mints a fresh payment-order key on retry", async () => {
    const { result } = renderHook(() => useBookAndPay());
    await act(async () => {
      await result.current.bookAndPay(args());
    });
    act(() => lastOptions!.modal.ondismiss());
    await act(async () => {
      await result.current.bookAndPay(args());
    });

    const [first] = createPaymentOrder.mock.calls[0];
    const [second] = createPaymentOrder.mock.calls[1];
    // A deliberate retry is a new intent — same as the tracking screen's Pay
    // Now button. Replaying the key would collapse into the first order.
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });

  it("quotes the 2-minute hold only for immediate bookings", async () => {
    const { result } = renderHook(() => useBookAndPay());
    await act(async () => {
      await result.current.bookAndPay(args());
    });

    act(() => lastOptions!.modal.ondismiss());

    expect(String(toastFn.mock.calls[0][1]?.description)).toMatch(/2 minutes/);
  });

  it("quotes no time for a scheduled booking", async () => {
    // cleanup_tasks.py exempts future-dated bookings from the sweeper
    // (SVC-243), so "expires in 2 minutes" would be wrong for them.
    const { result } = renderHook(() => useBookAndPay());
    await act(async () => {
      await result.current.bookAndPay(
        args({
          booking: {
            items: [],
            address_id: "addr-1",
            scheduled_at: "2026-09-06T10:00:00Z",
            payment_method: "online",
          },
        }),
      );
    });

    act(() => lastOptions!.modal.ondismiss());

    expect(String(toastFn.mock.calls[0][1]?.description)).not.toMatch(/2 minutes/);
  });
});

describe("the cart changed after a dismissal", () => {
  it("books afresh rather than charging for the old basket", async () => {
    // The money bug. The held booking is priced against the items that existed
    // when it was made; reusing it after a swap charges for a job the user no
    // longer asked for.
    const { result } = renderHook(() => useBookAndPay());
    await act(async () => {
      await result.current.bookAndPay(args({ items: cart("svc-a") }));
    });
    act(() => lastOptions!.modal.ondismiss());

    createBooking.mockResolvedValue({ id: "booking-2" });
    await act(async () => {
      await result.current.bookAndPay(args({ items: cart("svc-b") }));
    });

    expect(createBooking).toHaveBeenCalledTimes(2);
    expect(createPaymentOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({ bookingId: "booking-2" }),
    );
  });

  it("treats a quantity change as a change too", async () => {
    const { result } = renderHook(() => useBookAndPay());
    await act(async () => {
      await result.current.bookAndPay(args({ items: cart("svc-a", 1) }));
    });
    act(() => lastOptions!.modal.ondismiss());

    createBooking.mockResolvedValue({ id: "booking-2" });
    await act(async () => {
      await result.current.bookAndPay(args({ items: cart("svc-a", 3) }));
    });

    // Same service, different total. Reusing would undercharge.
    expect(createBooking).toHaveBeenCalledTimes(2);
  });
});

describe("failures", () => {
  it("surfaces a booking failure and creates no order", async () => {
    createBooking.mockRejectedValue(new Error("Address is outside our service area"));
    const { result } = renderHook(() => useBookAndPay());
    const a = args();

    await act(async () => {
      await result.current.bookAndPay(a);
    });

    expect(toastError).toHaveBeenCalledWith("Address is outside our service area");
    expect(createPaymentOrder).not.toHaveBeenCalled();
    expect((a as { onComplete: () => void }).onComplete).not.toHaveBeenCalled();
  });

  it("still opens the booking when the money was taken but verify failed", async () => {
    // Worst case to get wrong: Razorpay has the money. Losing the booking here
    // would leave the user paid-but-bookingless with nothing on screen.
    verifyPayment.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useBookAndPay());
    const a = args();
    await act(async () => {
      await result.current.bookAndPay(a);
    });

    await act(async () => {
      lastOptions!.handler({
        razorpay_order_id: "order_1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig",
      });
    });

    expect((a as { onComplete: (id: string) => void }).onComplete).toHaveBeenCalledWith(
      "booking-1",
    );
    expect(toastError).toHaveBeenCalled();
  });
});
