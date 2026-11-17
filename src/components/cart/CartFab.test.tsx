/**
 * SVC-417: CartFab shows no rupee figure while a line has no pro. The
 * subtotal counts only priced lines, so an all-"Choose a pro" cart would
 * read "₹0".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

let cart = { totalQuantity: 1, subtotal: 0, needsProCount: 1 };

vi.mock("@/lib/cart-context", () => ({ useCart: () => cart }));
vi.mock("@/lib/nav-visibility", () => ({ showsCartFab: () => true }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  useLocation: () => ({ pathname: "/service/x" }),
}));
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: { div: ({ children }: { children?: ReactNode }) => <div>{children}</div> },
}));

import { CartFab } from "@/components/cart/CartFab";

beforeEach(() => {
  cart = { totalQuantity: 1, subtotal: 0, needsProCount: 1 };
});

describe("CartFab", () => {
  it("says 'Choose a pro' instead of ₹0 when a line has no pro", () => {
    render(<CartFab />);
    expect(screen.getByText("Choose a pro")).toBeTruthy();
    expect(screen.queryByText(/₹/)).toBeNull();
  });

  it("shows the subtotal once every line has a pro", () => {
    cart = { totalQuantity: 2, subtotal: 900, needsProCount: 0 };
    render(<CartFab />);
    expect(screen.getByText("₹900")).toBeTruthy();
  });
});
