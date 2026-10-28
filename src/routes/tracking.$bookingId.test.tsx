/**
 * The consumer tracking screen's Call button (SVC-360 + SVC-386). Pinned:
 *
 * - a provider_phone from the backend becomes a Call link with exactly that
 *   tel: href, and the number never shows as text;
 * - null (backend withheld it) and absent (older backend) both mean no
 *   button at all — not a greyed-out one, not a placeholder number.
 *
 * Rendered at the route, not just at the component, because the whole
 * route → mapper → `WhoIsComingCard` → `ProTrustCard` path is what should
 * decide whether the button exists. Bookings go through the real mapBooking
 * so the mapper → button path is tested end to end.
 *
 * SVC-386 moved the Call affordance into `ProTrustCard`, which labels it
 * "Call {proName}" (e.g. "Call Rohan Kumar") rather than the older generic
 * "Call provider" — a /^Call / match covers both historical and current
 * labels without pinning us to one phrasing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { booking } = vi.hoisted(() => ({
  booking: { value: undefined as unknown, loading: false },
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

// SVC-393: the tracking screen now reads `useAuth` to key the favorites
// store by user id. The real context needs a provider; a tiny stub keeps
// every test in this file consistent and avoids a wrapper per render.
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u-1", name: "Vipul" } }),
}));
// Leaflet does not survive jsdom; the map is irrelevant to the button.
vi.mock("@/components/tracking/TrackingMap", () => ({ TrackingMap: () => null }));
vi.mock("@/components/tracking/TipSection", () => ({ TipSection: () => null }));
vi.mock("@/components/ReviewSheet", () => ({ ReviewSheet: () => null }));
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
});

describe("Call provider", () => {
  it("dials exactly the backend's provider_phone", () => {
    show({ provider_phone: "+919876500001" });
    const call = screen.getByRole("link", { name: /^Call / });
    expect(call.getAttribute("href")).toBe("tel:+919876500001");
  });

  it("never shows the number as text", () => {
    show({ provider_phone: "+919876500001" });
    expect(screen.queryByText(/9876500001/)).toBeNull();
  });

  it("renders no button when the backend sends null", () => {
    show({ provider_phone: null });
    expect(screen.queryByRole("link", { name: /^Call / })).toBeNull();
  });

  it("renders no button when the field is absent (older backend)", () => {
    show();
    expect(screen.queryByRole("link", { name: /^Call / })).toBeNull();
    expect(document.body.innerHTML).not.toContain("910000000000");
  });
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
