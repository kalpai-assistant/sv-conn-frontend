/**
 * Cart smart-defaults (SVC-385): the "app remembers me" cart invariants.
 *
 * Three things earn a test:
 *   1. A returning user whose last payment method was cash lands on cart with
 *      the Cash toggle already selected — the business-preferred "Pay online"
 *      default is only for the fresh-install path.
 *   2. The address picker auto-opens ONLY when the user has no address. A
 *      returning user with saved addresses sees the pre-selected row and
 *      opens the picker only on tap — pre-select, never auto-expand.
 *   3. `useSelectedAddress` already resolves the stored id (or `addresses[0]`)
 *      as the pre-selection, so this file does not retest the hook itself —
 *      the hook has its own suite. What it tests is the cart's consumption
 *      of that pre-selection + the auto-open gate.
 *
 * Heavy dependencies (bookAndPay, framer-motion, picker sheets) are stubbed
 * for the same reason `cart.pending-coupon.test.tsx` stubs them — this file
 * is scoped to the smart-defaults integration, not the sheets' internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const navigate = vi.fn();
const cartItems = vi.fn<() => Array<{ serviceId: string }>>(() => [{ serviceId: "svc_1" }]);
const useSelectedAddressReturn = vi.fn<
  () => {
    selected: { id: string; label: string; full: string } | null;
    setSelectedId: ReturnType<typeof vi.fn>;
    addresses: Array<{ id: string; label: string; full: string }> | undefined;
    isLoading: boolean;
  }
>();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => navigate,
  useSearch: () => ({}),
}));

vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({
    items: cartItems(),
    subtotal: 500,
    updateQuantity: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    add: vi.fn(),
    addMany: vi.fn(),
    totalQuantity: 1,
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "test-user", name: "Tester" } }),
}));

vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => useSelectedAddressReturn(),
}));

vi.mock("@/hooks/useBookAndPay", () => ({
  useBookAndPay: () => ({ bookAndPay: vi.fn(), isBusy: false }),
}));

// Expose whether the picker sheet is on-screen without rendering its full
// internals — the sheet component has its own suite. The test asserts on
// this data-testid rather than DOM shape so a future refactor of the sheet
// does not spuriously fail these cases.
vi.mock("@/components/SavedAddressesSheet", () => ({
  SavedAddressesSheet: () => <div data-testid="address-picker" />,
}));
vi.mock("@/components/cart/SlotPickerSheet", () => ({
  SlotPickerSheet: () => null,
}));
vi.mock("@/components/cart/CouponsSheet", () => ({
  CouponsSheet: () => null,
}));
// The pricing breakdown is unrelated to the smart-defaults assertions here
// and would otherwise pull framer-motion through; its own suite covers it.
vi.mock("@/components/cart/PricingBreakdown", () => ({
  PricingBreakdown: () => null,
}));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  type MotionProps = {
    children?: ReactNode;
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    variants?: unknown;
    transition?: unknown;
  } & Record<string, unknown>;
  const strip = ({
    initial: _initial,
    animate: _animate,
    exit: _exit,
    variants: _variants,
    transition: _transition,
    ...rest
  }: MotionProps) => rest;
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: new Proxy(
      {},
      {
        get:
          (_t, tag: string) =>
          ({ children, ...rest }: MotionProps) =>
            React.createElement(tag, strip({ children, ...rest }), children),
      },
    ),
    useReducedMotion: () => false,
  };
});

vi.mock("@/components/AccountAvatar", () => ({
  AccountAvatar: () => null,
}));

import { CartPage } from "@/routes/cart";

const KARVE = { id: "a1", label: "home", full: "Karve Nagar, Pune" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  cartItems.mockReturnValue([{ serviceId: "svc_1" }]);
  useSelectedAddressReturn.mockReturnValue({
    selected: KARVE,
    setSelectedId: vi.fn(),
    addresses: [KARVE],
    isLoading: false,
  });
});

afterEach(() => {
  localStorage.clear();
});

describe("address picker auto-open gate", () => {
  it("stays closed when the user has at least one saved address (pre-select, never auto-expand)", () => {
    render(<CartPage />);

    // The row paints the pre-selected address — this is the "we remembered"
    // affordance; forcing the picker open on top of it would feel like the
    // app ignored the memory.
    expect(screen.getByText("home")).toBeInTheDocument();
    expect(screen.getByText("Karve Nagar, Pune")).toBeInTheDocument();
    expect(screen.queryByTestId("address-picker")).toBeNull();
  });

  it("auto-opens when the user has no saved addresses — nothing to pre-select, so prompt", async () => {
    useSelectedAddressReturn.mockReturnValue({
      selected: undefined as unknown as null,
      setSelectedId: vi.fn(),
      addresses: [],
      isLoading: false,
    });

    render(<CartPage />);

    // Effect runs on mount; look for the sheet to appear.
    const picker = await screen.findByTestId("address-picker");
    expect(picker).toBeInTheDocument();
  });

  it("does not auto-open while addresses are still loading — the answer isn't in yet", () => {
    useSelectedAddressReturn.mockReturnValue({
      selected: undefined as unknown as null,
      setSelectedId: vi.fn(),
      addresses: undefined,
      isLoading: true,
    });

    render(<CartPage />);

    // A premature open here would flash the empty-list sheet during cold
    // start and look like the saved list was wiped — the same shape of
    // bug SVC-351 fixed on the LocationBar.
    expect(screen.queryByTestId("address-picker")).toBeNull();
  });
});

describe("payment method memory", () => {
  it("defaults the toggle to 'online' when nothing is stored (fresh install / post-logout)", () => {
    render(<CartPage />);

    const online = screen.getByRole("button", { name: /pay online/i });
    expect(online).toHaveClass("border-primary");
  });

  it("defaults the toggle to the stored method on next cart open", () => {
    localStorage.setItem("sc_last_payment_method", "cash");

    render(<CartPage />);

    const cash = screen.getByRole("button", { name: /cash after service/i });
    expect(cash).toHaveClass("border-primary");
  });

  it("ignores a garbage value and falls back to 'online' (defensive read, same shape as the helper's own suite)", () => {
    localStorage.setItem("sc_last_payment_method", "upi");

    render(<CartPage />);

    const online = screen.getByRole("button", { name: /pay online/i });
    expect(online).toHaveClass("border-primary");
  });
});
