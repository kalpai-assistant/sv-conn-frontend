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

const { booking } = vi.hoisted(() => ({ booking: { value: undefined as unknown } }));

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
vi.mock("@/components/ReviewSheet", () => ({ ReviewSheet: () => null }));
vi.mock("@/hooks/useApi", async (importOriginal) => {
  const idle = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...(await importOriginal<typeof import("@/hooks/useApi")>()),
    useBooking: () => ({
      data: booking.value,
      isLoading: false,
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
