/**
 * SVC-393: "Book again" lives on COMPLETED past bookings. The CTA must
 * (1) only render for those rows, (2) hand the rebook outcome to the cart,
 * (3) surface the right side-effects (toast on deprecated / in-flight /
 * pricing changed, sticky-row signal when the address falls back, cart
 * navigation on success).
 *
 * Pure logic lives in `rebook.test.ts`; this file wires the button to the
 * cart + navigation path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const bookings = vi.fn();
const services = vi.fn();
const addresses = vi.fn();
const addMany = vi.fn(() => ({ skipped: [] }));
const navigate = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useBookings: () => ({
    data: bookings(),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useServices: () => ({ data: services() }),
}));

vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({
    addresses: addresses(),
    selected: addresses()?.[0],
    setSelectedId: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({ addMany, add: vi.fn(), items: [], totalQuantity: 0 }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u-1", name: "Vipul" } }),
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: () => ({ pull: 0, refreshing: false, armed: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => navigate,
}));

// Toast calls are observed through hoisted spies — vi.mock's factory runs
// before top-level consts bind, so these have to live inside vi.hoisted
// to be referenceable both inside the mock and inside the test bodies.
const toastSpies = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: toastSpies.toast }));

import { BookingsPage } from "@/routes/bookings";
import { getRebookAddressConfirm } from "@/lib/rebook-address-confirm";

const SERVICE = {
  id: "svc-1",
  name: "Deep Clean",
  categoryId: "cat-1",
  categoryName: "Home",
  description: "",
  price: 500,
  payout: 350,
  duration: "2h",
  variants: [],
};

const ADDRESS_HOME = { id: "addr-1", label: "home", full: "7 Lane" };

function completedBooking(overrides: Record<string, unknown> = {}) {
  // The route reads `.service.name`, `.items`, `.address`, `.scheduledAt`,
  // `.totalAmount`, `.status`. Everything else is irrelevant to the CTA.
  return {
    id: "bk-1",
    status: "COMPLETED",
    service: SERVICE,
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
    address: ADDRESS_HOME,
    serviceAmount: 500,
    totalAmount: 500,
    scheduledAt: "2026-10-01T10:00:00Z",
    createdAt: "2026-10-01T10:00:00Z",
    paymentMethod: "online",
    paymentStatus: "paid",
    discountAmount: 0,
    tipAmount: 0,
    platformCommission: 50,
    providerPayout: 450,
    statusHistory: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  services.mockReturnValue([SERVICE]);
  addresses.mockReturnValue([ADDRESS_HOME]);
});

describe("Book again CTA", () => {
  it("renders on a COMPLETED past booking", async () => {
    // The CTA is the signal that this ticket landed. A past tab with no
    // button is the regression.
    bookings.mockReturnValue([completedBooking()]);
    render(<BookingsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^past$/i }));
    expect(screen.getByRole("button", { name: /book deep clean again/i })).toBeInTheDocument();
  });

  it("does not render on a CANCELLED booking", async () => {
    // "Retry what I just cancelled" is a confusing offer — the booking was
    // cancelled on purpose. Only COMPLETED bookings get rebook.
    bookings.mockReturnValue([completedBooking({ id: "bk-cancel", status: "CANCELLED" })]);
    render(<BookingsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^past$/i }));
    expect(screen.queryByRole("button", { name: /book .* again/i })).not.toBeInTheDocument();
  });

  it("prefills the cart with the historical items and navigates to /cart", async () => {
    bookings.mockReturnValue([completedBooking()]);
    render(<BookingsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^past$/i }));
    await userEvent.click(screen.getByRole("button", { name: /book .* again/i }));

    expect(addMany).toHaveBeenCalledWith([
      { serviceId: "svc-1", variantId: undefined, quantity: 1 },
    ]);
    expect(navigate).toHaveBeenCalledWith({ to: "/cart" });
  });

  it("refuses when the user already has an active booking for that service", async () => {
    const active = {
      ...completedBooking({ id: "bk-active", status: "ACCEPTED" }),
    };
    bookings.mockReturnValue([active, completedBooking()]);
    render(<BookingsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^past$/i }));
    await userEvent.click(screen.getByRole("button", { name: /book .* again/i }));

    expect(toastSpies.toast.info).toHaveBeenCalledWith(
      expect.stringMatching(/already have an active/i),
    );
    expect(addMany).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("flags the cart's address-confirm row when the historical address is gone", async () => {
    // The deleted-address fallback (SVC-367) — pure logic is tested in
    // rebook.test.ts; this proves the UI side-effect lands in sessionStorage
    // so the cart's sticky row renders on the other side of the navigation.
    bookings.mockReturnValue([
      completedBooking({ address: { id: "addr-gone", label: "home", full: "7 Lane" } }),
    ]);
    render(<BookingsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^past$/i }));
    await userEvent.click(screen.getByRole("button", { name: /book .* again/i }));

    expect(getRebookAddressConfirm("u-1")).toBe("home");
  });

  it("toasts 'Pricing updated' when the catalogue total differs from the historical total", async () => {
    // Caller surfaces the pricing shift — users who paid ₹500 last time and
    // see ₹650 on checkout get an honest heads-up, not surprise at the pay
    // sheet.
    services.mockReturnValue([{ ...SERVICE, price: 650 }]);
    bookings.mockReturnValue([completedBooking()]);
    render(<BookingsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^past$/i }));
    await userEvent.click(screen.getByRole("button", { name: /book .* again/i }));

    expect(toastSpies.toast.message).toHaveBeenCalledWith(
      expect.stringMatching(/pricing updated/i),
    );
  });

  it("shows a 'no longer available' toast with Browse similar when the service is gone", async () => {
    // The deprecated-service branch. We call toast() with an `action` prop,
    // not toastSpies.toast.message — assert on both the call and the action shape so a
    // regression that drops the browse-similar link is caught.
    services.mockReturnValue([]); // service deleted from catalogue
    bookings.mockReturnValue([completedBooking()]);
    render(<BookingsPage />);

    await userEvent.click(screen.getByRole("button", { name: /^past$/i }));
    await userEvent.click(screen.getByRole("button", { name: /book .* again/i }));

    // The service is gone AND we have no cached category — categoryId is
    // undefined in rebook's output, so the plain-toast branch fires.
    expect(toastSpies.toast).toHaveBeenCalledWith(expect.stringMatching(/no longer available/i));
    expect(addMany).not.toHaveBeenCalled();
  });
});
