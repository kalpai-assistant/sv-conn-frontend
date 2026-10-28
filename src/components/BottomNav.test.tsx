/**
 * Which tabs each role sees (SVC-273).
 *
 * Both roles moved Profile out of the bar and onto a header avatar. The bars
 * themselves stay — an earlier draft of this ticket removed the provider one
 * entirely, and these tests exist partly so that reversal cannot happen by
 * accident.
 *
 * The exact-array assertions are deliberate: removing one entry must not
 * quietly take its neighbours with it, and a set that silently grows a tab is
 * as wrong as one that loses the right one.
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
  it("gets four tabs, without Profile", () => {
    // Same move as the provider set: Profile is reached from the avatar in the
    // LocationBar now. Leaving the tab in place would put two entry points to
    // one screen on the same view.
    at("/", "consumer");

    render(<BottomNav />);

    expect(labels()).toEqual(["Home", "Bookings", "Cart", "Activity"]);
  });

  it("keeps Cart, which is not going anywhere", () => {
    // Guards against the Profile removal being over-applied — Cart sits next
    // to it and carries the item-count badge.
    at("/", "consumer");

    render(<BottomNav />);

    expect(screen.getByText("Cart")).toBeInTheDocument();
  });

  it("still loses the nav on full-screen routes", () => {
    at("/service/plumbing", "consumer");

    const { container } = render(<BottomNav />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("a Pro (SVC-322)", () => {
  // A team Pro's role is consumer, so the Pro tabs follow the route.

  it("gets Home and Jobs in the Pro app, and no Earnings", () => {
    // Earnings is absent on purpose: a team Pro's pay goes to their SP.
    at("/pro", "consumer");

    render(<BottomNav />);

    expect(labels()).toEqual(["Home", "Jobs"]);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/pro",
      "/pro/jobs",
    ]);
  });

  it("keeps the Pro tabs on a nested job screen, with Jobs lit", () => {
    at("/pro/jobs/abc-123", "consumer");

    render(<BottomNav />);

    expect(labels()).toEqual(["Home", "Jobs"]);
    expect(screen.getByText("Jobs").closest("a")?.className).toContain("text-primary");
    expect(screen.getByText("Home").closest("a")?.className).not.toContain("text-primary");
  });

  it("gets the consumer tabs back on /profile, which starts with the same letters", () => {
    at("/profile", "consumer");

    render(<BottomNav />);

    expect(labels()).toEqual(["Home", "Bookings", "Cart", "Activity"]);
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

  // SVC-391: a single `layoutId` on the active-tab pill lets framer-motion
  // slide the indicator from the previous tab to the new one. Two
  // indicators at once would freeze that animation into a cross-fade — so
  // the invariant is: exactly one active indicator in the DOM at any time,
  // sitting inside the lit tab.
  it("renders exactly one animated active indicator, inside the lit tab", () => {
    at("/bookings", "consumer");

    const { container } = render(<BottomNav />);

    const indicators = container.querySelectorAll('[aria-hidden="true"].bg-primary');
    expect(indicators.length).toBe(1);
    const lit = screen.getByText("Bookings").closest("a");
    expect(lit?.contains(indicators[0] as Node)).toBe(true);
  });
});
