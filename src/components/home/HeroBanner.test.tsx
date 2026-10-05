/**
 * Hero banner tap behaviour (SVC-310).
 *
 * The bug that drove this ticket is invisible in a screenshot: the FIRST20
 * banner looked right and did nothing on tap. Every assertion here is on
 * the destination branches, not the pixels — the four render shapes
 * (coupon / route / external / undefined) are the whole product surface
 * and are what a user would notice break.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
const toastFn = vi.fn();
let cartItems: Array<{ serviceId: string }>;

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  // ``Link`` is a bare anchor in jsdom — the only thing a test cares
  // about is that the route destination surfaces as the ``to`` prop so
  // we can assert on it; actual client-side nav isn't exercised here.
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

import { HeroBannerView, type HeroBannerConfig } from "@/components/home/HeroBanner";

// Reference a real public asset — scripts/check-public-asset-refs.mjs
// scans test files too and 404s on made-up paths.
const BASE: Omit<HeroBannerConfig, "destination"> = {
  id: "test",
  image: "/images/banners/ganesh-chaturthi-2026.webp",
  title: "20% off your first booking",
  subtitle: "Use FIRST20 for 20% off your first booking",
  ctaLabel: "Apply FIRST20",
  activeFrom: "2026-01-01",
  activeUntil: "2026-12-31",
};

beforeEach(() => {
  vi.clearAllMocks();
  cartItems = [];
});

describe("coupon destination", () => {
  it("hands the code off to the cart's coupons sheet when there are items to apply against", async () => {
    // The whole bug this ticket closes: tapping FIRST20 used to be a no-op.
    // The handoff is the hero banner's only job in the happy path — the cart
    // route and CouponsSheet take it from here.
    cartItems = [{ serviceId: "svc_1" }];
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: { kind: "coupon", value: "FIRST20" },
    };

    render(<HeroBannerView banner={banner} />);
    await userEvent.click(screen.getByRole("button"));

    expect(navigate).toHaveBeenCalledWith({ to: "/cart", search: { coupon: "FIRST20" } });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("toasts and stays on Home when the cart is empty", async () => {
    // ``/coupons/validate`` 400s on ``cart_amount: 0`` and the coupons sheet
    // has no subtotal to compute a discount against. Dropping the user on
    // an empty cart silently would strand them. The toast names the code
    // so the user can tell what wasn't applied.
    cartItems = [];
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: { kind: "coupon", value: "FIRST20" },
    };

    render(<HeroBannerView banner={banner} />);
    await userEvent.click(screen.getByRole("button"));

    expect(toastFn).toHaveBeenCalledWith(expect.stringMatching(/add items.*FIRST20/i));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("route destination", () => {
  it("renders as an in-app Link so the router handles the nav", () => {
    // TanStack Router's ``<Link>`` is what preserves scroll + search state
    // across in-app routes. A raw <a href> would full-reload the SPA — which
    // on a Capacitor shell means a visible splash flash every tap.
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: { kind: "route", value: "/bookings" },
    };

    render(<HeroBannerView banner={banner} />);
    const link = screen.getByRole("link");

    expect(link).toHaveAttribute("data-to", "/bookings");
    // External-link attributes must NOT leak onto an in-app link — those
    // open a new browser tab, which on Capacitor exits the app shell.
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("rel");
  });
});

describe("external destination", () => {
  it("renders as an anchor with the security attrs an _blank link needs", () => {
    // ``noopener`` is the one that actually matters — without it the opened
    // tab gets a ``window.opener`` reference back and can rewrite our tab's
    // location. ``noreferrer`` is belt-and-suspenders for referrer leakage.
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: { kind: "external", value: "https://example.com/promo" },
    };

    render(<HeroBannerView banner={banner} />);
    const anchor = screen.getByRole("link");

    expect(anchor).toHaveAttribute("href", "https://example.com/promo");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor.getAttribute("rel")).toMatch(/noopener/);
    expect(anchor.getAttribute("rel")).toMatch(/noreferrer/);
  });
});

describe("no destination (decorative)", () => {
  it("is a non-interactive image with the title as its a11y label", () => {
    // A purely decorative banner (future festival greeting) must not fake
    // tappability — no button, no link, no handler. The image role +
    // aria-label gives screen readers an honest description instead of
    // leaking the inner <img>'s empty alt as the whole slot's name.
    const banner: HeroBannerConfig = { ...BASE, title: "Happy Diwali", destination: undefined };

    render(<HeroBannerView banner={banner} />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("img", { name: "Happy Diwali" })).toBeInTheDocument();
  });

  it("drops the CTA pill so there is no fake 'tap here' affordance", () => {
    // Rendering "Apply FIRST20 →" over a non-interactive banner is a lie —
    // the pill is wired to the destination's presence, not just to the
    // ctaLabel being set.
    const banner: HeroBannerConfig = {
      ...BASE,
      ctaLabel: "Apply FIRST20",
      destination: undefined,
    };

    render(<HeroBannerView banner={banner} />);

    expect(screen.queryByText(/apply first20/i)).toBeNull();
  });
});
