/**
 * SVC-393: when a rebook falls back to the user's default address, the
 * cart renders a sticky "please confirm" row at the top until the user
 * explicitly dismisses it. Two things to pin:
 *
 *   1. The row appears exactly when the sessionStorage flag is set.
 *   2. "Looks good" clears the flag so the row doesn't linger on
 *      re-navigation.
 *
 * Everything heavy (bookAndPay, address picker, coupon sheet, framer-
 * motion, breakdown) is mocked out — this file is about the integration
 * of the rebook signal with the cart screen, not the cart surface.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

const cartItems = vi.fn<() => Array<{ serviceId: string }>>(() => [
  // The sticky row renders inside the "has items" branch — the empty-cart
  // branch skips the normal page altogether. Give the cart one line so the
  // normal body renders.
  { serviceId: "svc-1" },
]);

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => vi.fn(),
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
  useAuth: () => ({ user: { id: "u-1", name: "Vipul" } }),
}));

vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({
    selected: { id: "addr-current", label: "work", full: "Paud Road" },
    setSelectedId: vi.fn(),
    addresses: [{ id: "addr-current", label: "work", full: "Paud Road" }],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useBookAndPay", () => ({
  useBookAndPay: () => ({ bookAndPay: vi.fn(), isBusy: false }),
}));

vi.mock("@/components/SavedAddressesSheet", () => ({
  SavedAddressesSheet: () => null,
}));
vi.mock("@/components/cart/SlotPickerSheet", () => ({
  SlotPickerSheet: () => null,
}));
vi.mock("@/components/cart/CouponsSheet", () => ({
  CouponsSheet: () => null,
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
import { getRebookAddressConfirm, setRebookAddressConfirm } from "@/lib/rebook-address-confirm";

beforeEach(() => {
  window.sessionStorage.clear();
  cartItems.mockReturnValue([{ serviceId: "svc-1" }]);
});

describe("rebook address-confirm row", () => {
  it("does not render when no rebook fallback happened", () => {
    render(<CartPage />);
    expect(screen.queryByText(/please confirm the address/i)).not.toBeInTheDocument();
  });

  it("renders when sessionStorage carries the rebook address-confirm flag", () => {
    setRebookAddressConfirm("u-1", "home");

    render(<CartPage />);

    expect(screen.getByText(/please confirm the address/i)).toBeInTheDocument();
    // Includes the deleted address's label so the user knows WHICH address
    // the app couldn't honour.
    expect(screen.getByText(/"home"/)).toBeInTheDocument();
  });

  it("renders the generic variant when the historical label was already anonymised", () => {
    // SVC-367 backend sweep can strip the label too — the row degrades
    // gracefully rather than printing "" to the user.
    setRebookAddressConfirm("u-1", "");

    render(<CartPage />);

    expect(screen.getByText(/original delivery address isn't saved/i)).toBeInTheDocument();
  });

  it("clears the flag on 'Looks good' and never re-renders the row for this session", async () => {
    setRebookAddressConfirm("u-1", "home");

    render(<CartPage />);
    await userEvent.click(screen.getByRole("button", { name: /looks good/i }));

    expect(screen.queryByText(/please confirm the address/i)).not.toBeInTheDocument();
    expect(getRebookAddressConfirm("u-1")).toBeNull();
  });
});
