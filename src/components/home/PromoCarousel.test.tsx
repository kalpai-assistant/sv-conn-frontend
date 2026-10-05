/**
 * Promo carousel tap behaviour (SVC-310 follow-up).
 *
 * The hero slot's bug lived here too — the FIRST20 card was wrapped in a
 * ``<Link to="/">`` that tapped back to Home with no visible change.
 * Promo carousel is the always-on surface (festival-weeks aside), so this
 * is the one users actually hit day-to-day.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
const toastFn = vi.fn();
let cartItems: Array<{ serviceId: string }>;

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a data-tanstack-link href={to} data-to={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toastFn(...args), {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  }),
}));

vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({ items: cartItems }),
}));

import { PromoCarousel, PromoBannerCard } from "@/components/home/PromoCarousel";

beforeEach(() => {
  vi.clearAllMocks();
  cartItems = [];
});

describe("seeded FIRST20 card", () => {
  // The default export's one real card. Covers the top-of-funnel path a
  // real user hits: tap FIRST20 on Home.

  it("hands FIRST20 to /cart when there is a subtotal to apply it against", async () => {
    cartItems = [{ serviceId: "svc_1" }];
    render(<PromoCarousel />);

    await userEvent.click(screen.getByRole("button", { name: /20%.*FIRST20/i }));

    expect(navigate).toHaveBeenCalledWith({ to: "/cart", search: { coupon: "FIRST20" } });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("toasts and stays on Home when the cart is empty", async () => {
    // ``/coupons/validate`` 400s on ``cart_amount: 0`` and the sheet has
    // nothing to compute against. Named toast tells the user what wasn't
    // applied so the no-op is honest.
    cartItems = [];
    render(<PromoCarousel />);

    await userEvent.click(screen.getByRole("button", { name: /20%.*FIRST20/i }));

    expect(toastFn).toHaveBeenCalledWith(expect.stringMatching(/add items.*FIRST20/i));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("route destination", () => {
  it("renders as an in-app Link so the router handles the nav", () => {
    render(
      <PromoBannerCard
        banner={{
          id: "x",
          headline: "Browse services",
          body: "See what's live near you.",
          ctaLabel: "Browse",
          gradient: "from-primary to-primary/70",
          destination: { kind: "route", value: "/bookings" },
        }}
        onCouponTap={vi.fn()}
      />,
    );
    const link = screen.getByRole("link");

    expect(link).toHaveAttribute("data-to", "/bookings");
    // Must NOT accidentally open a new tab — on Capacitor that exits the
    // shell. The external attrs belong on external links only.
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("rel");
  });
});

describe("external destination", () => {
  it("renders as an _blank anchor with the opener-safety attrs", () => {
    render(
      <PromoBannerCard
        banner={{
          id: "x",
          headline: "Read the blog",
          body: "Why we chose Pune first.",
          ctaLabel: "Read",
          gradient: "from-primary to-primary/70",
          destination: { kind: "external", value: "https://example.com/post" },
        }}
        onCouponTap={vi.fn()}
      />,
    );
    const anchor = screen.getByRole("link");

    expect(anchor).toHaveAttribute("href", "https://example.com/post");
    expect(anchor).toHaveAttribute("target", "_blank");
    // ``noopener`` is the load-bearing one — without it the opened tab
    // gets ``window.opener`` and can rewrite our tab's location.
    expect(anchor.getAttribute("rel")).toMatch(/noopener/);
    expect(anchor.getAttribute("rel")).toMatch(/noreferrer/);
  });
});

describe("no destination (decorative)", () => {
  it("is a non-interactive promo tile with the headline as its a11y label", () => {
    render(
      <PromoBannerCard
        banner={{
          id: "x",
          headline: "New in Pune",
          body: "15 pros joined this week.",
          ctaLabel: "N/A",
          gradient: "from-primary to-primary/70",
          destination: undefined,
        }}
        onCouponTap={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("img", { name: "New in Pune" })).toBeInTheDocument();
  });

  it("drops the CTA pill so there is no fake 'tap here' affordance", () => {
    render(
      <PromoBannerCard
        banner={{
          id: "x",
          headline: "New in Pune",
          body: "15 pros joined this week.",
          ctaLabel: "Browse services",
          gradient: "from-primary to-primary/70",
          destination: undefined,
        }}
        onCouponTap={vi.fn()}
      />,
    );

    expect(screen.queryByText(/browse services/i)).toBeNull();
  });
});
