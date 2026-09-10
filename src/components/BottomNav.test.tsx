/**
 * Who sees the bottom nav (SVC-273).
 *
 * The provider tab bar was removed so Home could become the single entry
 * point. The load-bearing part is that it is gone *everywhere* for a provider,
 * not just on Home — a stray tab bar on Jobs would offer routes the redesign
 * deliberately took away, and would sit on top of content that no longer
 * reserves space for it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const useAuth = vi.fn();
const useLocation = vi.fn();

vi.mock("@/lib/auth-context", () => ({ useAuth: () => useAuth() }));
vi.mock("@/lib/cart-context", () => ({ useCart: () => ({ totalQuantity: 0 }) }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => useLocation(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { BottomNav } from "@/components/BottomNav";

function at(pathname: string, role: "consumer" | "provider" | null) {
  useLocation.mockReturnValue({ pathname });
  useAuth.mockReturnValue({ user: role ? { role } : null });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a provider", () => {
  it("gets no nav on Home", () => {
    at("/provider", "provider");

    const { container } = render(<BottomNav />);

    expect(container).toBeEmptyDOMElement();
  });

  it("gets no nav on any other provider screen either", () => {
    // The bar being gone from Home but present on Jobs would be worse than
    // never removing it: the tabs it offers no longer exist as destinations.
    for (const path of ["/provider/bookings", "/provider/earnings", "/provider/profile"]) {
      at(path, "provider");
      const { container } = render(<BottomNav />);
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("never shows consumer tabs, whatever the route", () => {
    // The role guard should keep a provider off consumer routes, but if one
    // ever slips through, showing them a Cart tab is not the recovery.
    at("/", "provider");

    render(<BottomNav />);

    expect(screen.queryByText("Cart")).not.toBeInTheDocument();
  });
});

describe("a consumer", () => {
  it("still gets all five tabs", () => {
    // The other half of the change: removing the provider set must not touch
    // the consumer one.
    at("/", "consumer");

    render(<BottomNav />);

    for (const label of ["Home", "Bookings", "Cart", "Activity", "Profile"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("still loses the nav on full-screen routes", () => {
    at("/service/plumbing", "consumer");

    const { container } = render(<BottomNav />);

    expect(container).toBeEmptyDOMElement();
  });
});
