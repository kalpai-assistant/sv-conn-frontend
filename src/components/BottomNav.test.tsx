/**
 * Which tabs each role sees (SVC-273).
 *
 * Profile moved out of the provider bar and onto the Home header avatar. The
 * bar itself stays — an earlier draft of this ticket removed it entirely, and
 * these tests exist partly so that reversal cannot happen by accident.
 *
 * The load-bearing part is the asymmetry: the provider set loses Profile, the
 * consumer set keeps it. A consumer's Profile holds their addresses, reached
 * mid-booking; a provider's is a settings screen they visit rarely.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const useAuth = vi.fn();
const useLocation = vi.fn();

vi.mock("@/lib/auth-context", () => ({ useAuth: () => useAuth() }));
vi.mock("@/lib/cart-context", () => ({ useCart: () => ({ totalQuantity: 0 }) }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => useLocation(),
  // Passes className through: the active-tab assertion below reads it, and a
  // mock that swallowed it would make that test unfalsifiable.
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import { BottomNav } from "@/components/BottomNav";

function at(pathname: string, role: "consumer" | "provider" | null) {
  useLocation.mockReturnValue({ pathname });
  useAuth.mockReturnValue({ user: role ? { role } : null });
}

/** Tab labels currently rendered, in order. */
function labels() {
  return screen.getAllByRole("link").map((a) => a.textContent?.trim());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a provider", () => {
  it("gets three tabs, without Profile", () => {
    at("/provider", "provider");

    render(<BottomNav />);

    expect(labels()).toEqual(["Home", "Jobs", "Earnings"]);
  });

  it("reaches Profile from the header avatar, not the bar", () => {
    // The whole point of the change. A Profile tab reappearing here would put
    // the least-visited destination back into a quarter of the most valuable
    // area on the screen.
    at("/provider", "provider");

    render(<BottomNav />);

    expect(screen.queryByText("Profile")).not.toBeInTheDocument();
  });

  it("keeps its tabs on the other provider screens", () => {
    // An earlier draft removed the bar entirely; this is what that reversal
    // would look like if it crept back.
    for (const path of ["/provider/bookings", "/provider/earnings"]) {
      at(path, "provider");
      const { unmount } = render(<BottomNav />);
      expect(labels()).toEqual(["Home", "Jobs", "Earnings"]);
      unmount();
    }
  });

  it("never shows consumer tabs, whatever the route", () => {
    // The role guard should keep a provider off consumer routes, but if one
    // slips through, offering them a Cart is not the recovery.
    at("/", "provider");

    render(<BottomNav />);

    expect(screen.queryByText("Cart")).not.toBeInTheDocument();
  });
});

describe("a consumer", () => {
  it("keeps all five tabs, Profile included", () => {
    // Deliberately asymmetric with the provider set: addresses live behind
    // Profile and are reached mid-booking, so it earns its place here.
    at("/", "consumer");

    render(<BottomNav />);

    expect(labels()).toEqual(["Home", "Bookings", "Cart", "Activity", "Profile"]);
  });

  it("still loses the nav on full-screen routes", () => {
    at("/service/plumbing", "consumer");

    const { container } = render(<BottomNav />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("which tab is lit", () => {
  it("keeps Jobs lit on a nested job screen, not Home", () => {
    // "/provider" is a home root and matches exactly; everything else matches
    // by prefix. Getting this wrong lights Home while the user is three
    // screens deep in a job.
    at("/provider/bookings/abc-123", "provider");

    render(<BottomNav />);

    const jobs = screen.getByText("Jobs").closest("a");
    const home = screen.getByText("Home").closest("a");
    expect(jobs?.className).toContain("text-primary");
    expect(home?.className).not.toContain("text-primary");
  });
});
