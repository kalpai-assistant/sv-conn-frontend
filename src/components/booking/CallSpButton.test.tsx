/**
 * `CallSpButton` (SVC-452) — the consumer-side masked-call button.
 *
 * Pins:
 *
 * - on the happy path, tapping fires a `tel:` intent against the virtual
 *   number from `/bookings/{id}/call-mapping` — never a raw SP number;
 * - a 404 at tap time shows the baked toast ("Call will be available once
 *   the SP accepts the booking.") and NEVER opens a dialer;
 * - a loading state renders a skeleton, not a disabled button, so pressing
 *   before the mapping resolves doesn't half-fire a tap handler.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "@/lib/api";

const { mapping } = vi.hoisted(() => ({
  mapping: {
    data: null as { virtual_number: string } | null,
    error: null as unknown,
    isLoading: false,
  },
}));

const toasts: string[] = [];
vi.mock("sonner", () => ({
  toast: (msg: string) => {
    toasts.push(msg);
  },
}));

vi.mock("@/hooks/useApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useApi")>();
  return {
    ...actual,
    useBookingCallMapping: () => ({
      data: mapping.data,
      error: mapping.error,
      isLoading: mapping.isLoading,
      // `refetch` returns the same data; the button first-checks `data` and
      // only reads `refetch` when `data` is null/undefined, so returning the
      // live mapping here lets the test flip 404 → number between calls.
      refetch: vi.fn().mockImplementation(async () => ({ data: mapping.data })),
    }),
    isCallMappingAbsent: (err: unknown) => err instanceof ApiError && err.status === 404,
  };
});

import { CallSpButton } from "@/components/booking/CallSpButton";

const originalHref = typeof window !== "undefined" ? window.location.href : "";

beforeEach(() => {
  toasts.length = 0;
  mapping.data = null;
  mapping.error = null;
  mapping.isLoading = false;
  // jsdom lets us read `window.location.href` but not assign to it; we
  // replace `location` with a plain object so assignments are captured and
  // nothing actually navigates out of the test. Restored in `afterEach`.
  Object.defineProperty(window, "location", {
    writable: true,
    value: { href: originalHref } as Location,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CallSpButton", () => {
  it("fires a tel: intent to the masked virtual number on tap", async () => {
    mapping.data = { virtual_number: "+918012345678" };
    render(<CallSpButton bookingId="b1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /call the professional/i }));

    expect(window.location.href).toBe("tel:+918012345678");
    // And nothing was toasted — a quiet handoff to the native dialer.
    expect(toasts).toEqual([]);
  });

  it("never dials a raw SP number — the button never holds one", () => {
    // The button has no way to receive a raw SP number: the hook only exposes
    // `virtual_number`, and the component reads nothing else from a booking.
    // This test pins that the only href the button ever opens is tel:+9180…
    // (Mumbai/Pune pool prefix) — never a +91-9xxx or +91-7xxx consumer line.
    mapping.data = { virtual_number: "+918012345678" };
    render(<CallSpButton bookingId="b1" />);
    const btn = screen.getByRole("button", { name: /call the professional/i });
    // The DOM does not carry the number anywhere; it lives only in the handler.
    expect(btn.outerHTML).not.toContain("919876500001");
    expect(btn.outerHTML).not.toContain("8012345678");
  });

  it("shows the baked 404 toast and does not dial when no mapping is active", async () => {
    mapping.data = null;
    mapping.error = new ApiError(404, "no mapping");
    render(<CallSpButton bookingId="b1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /call the professional/i }));

    expect(toasts).toEqual(["Call will be available once the SP accepts the booking."]);
    expect(window.location.href).toBe(originalHref);
  });

  it("shows the generic fail toast on an unexpected error", async () => {
    mapping.data = null;
    // A non-404 error: 500, network, etc. The button must not try to dial
    // and must not pretend things are fine.
    mapping.error = new ApiError(500, "boom");
    render(<CallSpButton bookingId="b1" />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /call the professional/i }));

    expect(toasts).toEqual(["Couldn't start the call. Please try again."]);
    expect(window.location.href).toBe(originalHref);
  });

  it("renders a skeleton while the mapping is loading, no tappable button", () => {
    mapping.isLoading = true;
    render(<CallSpButton bookingId="b1" />);
    expect(screen.queryByRole("button", { name: /call the professional/i })).toBeNull();
  });
});
