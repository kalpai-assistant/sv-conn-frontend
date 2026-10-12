/**
 * Hero banner tap behaviour.
 *
 * Each render branch — the four coupon-* flows (SVC-347), ``route``,
 * ``external``, and the decorative-no-destination case — gets its own
 * assertion. The whole product surface is which element the frame wraps
 * in and what the tap handler does; everything else is pixels.
 *
 * The SVC-347 non-regression: the pre-SVC-347 empty-cart dead-end (toast
 * + stay) is gone. An empty-cart tap on a plain ``coupon`` banner now
 * stashes via pendingCouponStore and navigates — the cart's own boot-hook
 * surfaces the sticky "will apply when you add items" row from there.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigate = vi.fn();
const toastFn = vi.fn();
const addMany = vi.fn(() => ({ skipped: [] as string[] }));
let cartItems: Array<{ serviceId: string }>;
let servicesData: unknown | undefined;

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
  useCart: () => ({ items: cartItems, addMany }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "test-user" } }),
}));

vi.mock("@/hooks/useApi", () => ({
  useServices: () => ({ data: servicesData }),
}));

import { HeroBannerView, type HeroBannerConfig } from "@/components/home/HeroBanner";
import { getPendingCoupon } from "@/lib/pending-coupon";

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
  servicesData = [{ id: "svc_1", name: "x", variants: [] }];
  window.localStorage.clear();
});

describe("coupon destination (SVC-310, extended by SVC-347)", () => {
  it("hands the code off to the cart's coupons sheet when there are items to apply against", async () => {
    // Still the happy path: ?coupon= handoff opens CouponsSheet pre-filled.
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

  it("stashes and still navigates when the cart is empty — no more dead-end toast (SVC-347 §7)", async () => {
    // The whole point of this ticket's fix. Pre-SVC-347 this tap toasted
    // and stayed on Home. Now the code is stashed via pendingCouponStore
    // and we still navigate; the cart's boot-hook renders the sticky
    // "will apply when you add items" row because items.length === 0.
    cartItems = [];
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: { kind: "coupon", value: "FIRST20" },
    };

    render(<HeroBannerView banner={banner} />);
    await userEvent.click(screen.getByRole("button"));

    expect(navigate).toHaveBeenCalledWith({ to: "/cart", search: { coupon: "FIRST20" } });
    expect(toastFn).not.toHaveBeenCalled();
    expect(getPendingCoupon("test-user")).toBe("FIRST20");
  });
});

describe("coupon-prefill-cart destination (SVC-347)", () => {
  it("hydrates the cart via addMany, stashes the code, then navigates to /cart", async () => {
    cartItems = [];
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: {
        kind: "coupon-prefill-cart",
        code: "DIWALI20",
        items: [{ serviceId: "svc_deep_clean", quantity: 1 }],
      },
    };

    render(<HeroBannerView banner={banner} />);
    await userEvent.click(screen.getByRole("button"));

    expect(addMany).toHaveBeenCalledWith([{ serviceId: "svc_deep_clean", quantity: 1 }]);
    expect(getPendingCoupon("test-user")).toBe("DIWALI20");
    expect(navigate).toHaveBeenCalledWith({ to: "/cart" });
  });

  it("disables the tap and shows a spinner while the service catalogue is still loading", async () => {
    // addMany would silently drop every item against an empty catalogue
    // cache. Showing a spinner on the pill is the "we heard you, waiting
    // on data" affordance; silent no-op is the exact SVC-310 bug this
    // ticket is a sequel to.
    servicesData = undefined;
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: {
        kind: "coupon-prefill-cart",
        code: "DIWALI20",
        items: [{ serviceId: "svc_deep_clean" }],
      },
    };

    render(<HeroBannerView banner={banner} />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(addMany).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("coupon-stash destination (SVC-347)", () => {
  it("stashes the code and navigates to the configured destination", async () => {
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: { kind: "coupon-stash", code: "REFER100", navigateTo: "/bookings" },
    };

    render(<HeroBannerView banner={banner} />);
    await userEvent.click(screen.getByRole("button"));

    expect(getPendingCoupon("test-user")).toBe("REFER100");
    expect(navigate).toHaveBeenCalledWith({ to: "/bookings" });
    expect(addMany).not.toHaveBeenCalled();
  });

  it("defaults navigateTo to / when the campaign didn't set one", async () => {
    // The referral-reward kind that just wants the user back in the
    // browse funnel — no specific page in mind.
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: { kind: "coupon-stash", code: "REFER100" },
    };

    render(<HeroBannerView banner={banner} />);
    await userEvent.click(screen.getByRole("button"));

    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });
});

describe("coupon-category destination (SVC-347)", () => {
  it("stashes the code and lands on /category/$slug", async () => {
    const banner: HeroBannerConfig = {
      ...BASE,
      destination: { kind: "coupon-category", code: "SPA20", categorySlug: "spa" },
    };

    render(<HeroBannerView banner={banner} />);
    await userEvent.click(screen.getByRole("button"));

    expect(getPendingCoupon("test-user")).toBe("SPA20");
    expect(navigate).toHaveBeenCalledWith({
      to: "/category/$slug",
      params: { slug: "spa" },
    });
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
