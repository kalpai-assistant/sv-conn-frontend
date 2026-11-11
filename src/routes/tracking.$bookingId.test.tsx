/**
 * The consumer tracking screen's Call button (SVC-360 → SVC-386 → SVC-452).
 *
 * Pinned:
 *
 * - the SP's real phone is never readable from the mapped booking, no matter
 *   what the backend sends (SVC-452 privacy baked default);
 * - the Call button only renders while the booking is in an active state
 *   (ACCEPTED / EN_ROUTE / IN_PROGRESS); COMPLETED / CANCELLED / EXPIRED /
 *   REQUESTED render no button — the mapping either has been released or
 *   never existed, and the post-completion history lives on a separate
 *   Call History screen under Profile.
 *
 * The button itself (`CallSpButton`) is tested exhaustively in its own file.
 * This file pins the route → mapper → `WhoIsComingCard` → `CallSpButton`
 * wiring: does the button render on the right states, and does the real SP
 * line stay buried?
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { booking, auth } = vi.hoisted(() => ({
  booking: { value: undefined as unknown, loading: false },
  auth: { user: { id: "c1" } as { id: string } | null },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: object) => ({
    ...opts,
    useParams: () => ({ bookingId: "b1" }),
  }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

// Leaflet does not survive jsdom; the map is irrelevant to the button.
vi.mock("@/components/tracking/TrackingMap", () => ({ TrackingMap: () => null }));
vi.mock("@/components/tracking/TipSection", () => ({ TipSection: () => null }));
vi.mock("@/components/ReviewSheet", () => ({
  ReviewSheet: ({ open }: { open: boolean }) => (open ? <div>Rate your service</div> : null),
}));
// SVC-452: stub the masked-call button so this route test stays about the
// route's wiring, not the mapping fetch. The button's own file pins the
// toast + tel: handoff.
vi.mock("@/components/booking/CallSpButton", () => ({
  CallSpButton: ({ bookingId }: { bookingId: string }) => (
    <button type="button" aria-label={`Call for booking ${bookingId}`}>
      Call
    </button>
  ),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useApi", async (importOriginal) => {
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...(await importOriginal<typeof import("@/hooks/useApi")>()),
    useBooking: () => ({
      data: booking.value,
      isLoading: booking.loading,
      isError: false,
      refetch: vi.fn(),
    }),
    useCancelBooking: idle,
    useSubmitReview: idle,
    useCreatePaymentOrder: idle,
    useVerifyPayment: idle,
  };
});

import { mapBooking } from "@/hooks/useApi";
import { Route } from "@/routes/tracking.$bookingId";

const TrackingPage = (Route as unknown as { component: () => React.ReactElement }).component;

// The smallest BookingResponse the mapper accepts, with a Pro assigned.
const apiBooking = (over: Record<string, unknown> = {}) =>
  ({
    id: "b1",
    consumer_id: "c1",
    status: "accepted",
    provider_id: "sp1",
    service_amount: 500,
    created_at: "2026-10-15T10:00:00Z",
    scheduled_at: null,
    payment_method: "cash",
    payment_status: "pending",
    professional: {
      id: "p1",
      display_name: "Rohan Kumar",
      profile_photo_url: null,
      is_self: false,
    },
    items: [
      {
        id: "i1",
        service_id: "s1",
        service_name: "Deep Clean",
        quantity: 1,
        unit_price: 500,
        total_price: 500,
      },
    ],
    ...over,
  }) as unknown as Parameters<typeof mapBooking>[0];

const show = (over: Record<string, unknown> = {}) => {
  booking.value = mapBooking(apiBooking(over));
  render(<TrackingPage />);
};

beforeEach(() => {
  booking.value = undefined;
  booking.loading = false;
  auth.user = { id: "c1" };
  localStorage.clear();
});

describe("Call provider (masked)", () => {
  // SVC-452: even if the backend still sends `provider_phone`, the mapper
  // drops it. Nothing on the screen or in the rendered DOM can expose it.
  it.each([
    ["absent", {}],
    ["null", { provider_phone: null }],
    ["a stale backend value", { provider_phone: "+919876500001" }],
  ])("never exposes the SP's real phone (provider_phone %s)", (_, over) => {
    show(over);
    expect(document.body.innerHTML).not.toContain("9876500001");
    expect(document.body.innerHTML).not.toContain("910000000000");
    // And nothing anywhere on the screen tries to open a `tel:` to a raw
    // number. Only the (stubbed) CallSpButton may initiate a dial, and
    // that fires at tap time against the masked number.
    expect(document.body.innerHTML).not.toContain('href="tel:');
  });

  it.each(["accepted", "en_route", "in_progress"] as const)(
    "renders the masked Call button on a %s booking",
    (status) => {
      show({ status });
      expect(screen.getByRole("button", { name: /^Call for booking b1$/ })).toBeInTheDocument();
    },
  );

  it.each(["requested", "completed", "cancelled", "expired"] as const)(
    "renders no Call button on a %s booking",
    (status) => {
      // REQUESTED has the "searching" block instead; terminal states
      // (COMPLETED/CANCELLED/EXPIRED) have had their mapping released, so
      // post-booking re-dialing happens from Call History under Profile.
      show({ status });
      expect(screen.queryByRole("button", { name: /^Call for booking / })).toBeNull();
    },
  );
});

// SVC-397: the full-screen spinner became the page's own frame, with the
// cards it will hold drawn as skeletons — and still announced as loading.
describe("while the booking loads", () => {
  it("shows the header and an announced skeleton, not a verdict on the booking", () => {
    booking.loading = true;
    render(<TrackingPage />);

    expect(screen.getByText("Booking Status")).toBeInTheDocument();
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveTextContent("Loading…");
    expect(screen.queryByText("Booking not found.")).not.toBeInTheDocument();
  });

  // Found on device: wrapped around the trust strip too, the region's text was
  // "Background-verified pros / Full refund guarantee / … / Loading…", and
  // TalkBack read the claims as part of the loading announcement.
  it("announces only 'Loading…' — the trust strip sits outside the region", () => {
    booking.loading = true;
    render(<TrackingPage />);

    const region = screen.getByRole("status");
    expect(region.textContent).toBe("Loading…");
    const claim = screen.getByText(/background-verified/i);
    expect(region).not.toContainElement(claim);
  });
});

// SVC-393: "Save for next time" on a COMPLETED booking.
describe("Save for next time prompt", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders on a COMPLETED booking the user has not already favorited", () => {
    show({ status: "completed", payment_status: "paid" });
    expect(screen.getByText(/book this service again next time/i)).toBeInTheDocument();
  });

  it("does not render on an active booking", () => {
    show({ status: "accepted" });
    expect(screen.queryByText(/book this service again next time/i)).not.toBeInTheDocument();
  });

  it("records the favorite under the sc_ prefix so clearSession sweeps it", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    show({ status: "completed", payment_status: "paid" });

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // The service id goes into `sc_favorites_v1_<userId>`. The exact key is
    // read by `hasFavorite` in `favorites.ts` — we assert on the prefix so a
    // version bump doesn't require this test to change.
    const key = Object.keys(window.localStorage).find((k) => k.startsWith("sc_favorites_v1_"));
    expect(key).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(key!)!)).toEqual(["s1"]);
    // After saving, the prompt flips to the confirmed state.
    expect(screen.getByText(/saved for next time/i)).toBeInTheDocument();
  });

  it("'Not now' dismisses the prompt for this booking without saving", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    show({ status: "completed", payment_status: "paid" });

    await userEvent.click(screen.getByRole("button", { name: /not now/i }));

    expect(screen.queryByText(/book this service again next time/i)).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
  });
});

// A Pro can open the job they did on this same screen. Only the customer who
// booked may rate it: the backend refuses anyone else ("You can only review
// your own bookings"), so the Pro must never be offered the sheet.
describe("the review sheet on a completed booking", () => {
  it("opens for the customer who booked", () => {
    show({ status: "completed" });
    expect(screen.getByText("Rate your service")).toBeInTheDocument();
  });

  it("never opens for anyone else, such as the Pro who did the job", () => {
    auth.user = { id: "pro-user" };
    show({ status: "completed" });
    expect(screen.queryByText("Rate your service")).toBeNull();
  });
});
