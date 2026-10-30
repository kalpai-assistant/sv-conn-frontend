/**
 * Promo carousel tap behaviour.
 *
 * The hero slot's bug lived here too — the FIRST20 card was wrapped in a
 * ``<Link to="/">`` that tapped back to Home with no visible change. Promo
 * carousel is the always-on surface (festival-weeks aside), so this is the
 * one users actually hit day-to-day.
 *
 * SVC-347: same handler model as HeroBanner (``useCouponBannerHandlers``),
 * so the four coupon-* flows + the dead-end fix share one test shape.
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

let availableCoupons: Array<{ code: string }> | undefined;
vi.mock("@/hooks/useCoupons", () => ({
  useAvailableCoupons: () => ({ data: availableCoupons }),
}));

import { PromoCarousel, PromoBannerCard, visibleBanners } from "@/components/home/PromoCarousel";
import { getPendingCoupon } from "@/lib/pending-coupon";

beforeEach(() => {
  vi.clearAllMocks();
  cartItems = [];
  servicesData = [{ id: "svc_1", name: "x", variants: [] }];
  availableCoupons = [{ code: "EXPO25" }, { code: "FIRST100" }];
  window.localStorage.clear();
});

describe("seeded EXPO25 + FIRST100 cards (2026-10-30, replacing FIRST20)", () => {
  // The default export's real cards. Covers the top-of-funnel path a
  // real user hits: tap a coupon on Home.

  it("shows both new coupons and no FIRST20", () => {
    render(<PromoCarousel />);

    expect(screen.getByRole("button", { name: /25%.*EXPO25/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /₹100.*FIRST100/i })).toBeInTheDocument();
    expect(screen.queryByText(/FIRST20/)).not.toBeInTheDocument();
  });

  it("hands EXPO25 to /cart when there is a subtotal to apply it against", async () => {
    cartItems = [{ serviceId: "svc_1" }];
    render(<PromoCarousel />);

    await userEvent.click(screen.getByRole("button", { name: /25%.*EXPO25/i }));

    expect(navigate).toHaveBeenCalledWith({ to: "/cart", search: { coupon: "EXPO25" } });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("stashes and still navigates when the cart is empty — the SVC-347 §7 dead-end fix", async () => {
    cartItems = [];
    render(<PromoCarousel />);

    await userEvent.click(screen.getByRole("button", { name: /₹100.*FIRST100/i }));

    expect(navigate).toHaveBeenCalledWith({ to: "/cart", search: { coupon: "FIRST100" } });
    expect(toastFn).not.toHaveBeenCalled();
    expect(getPendingCoupon("test-user")).toBe("FIRST100");
  });
});

describe("only coupons the user can apply today are advertised", () => {
  it("hides a card whose code is no longer available (expired, deactivated or used up)", () => {
    availableCoupons = [{ code: "FIRST100" }];
    render(<PromoCarousel />);

    expect(screen.queryByText(/EXPO25/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /FIRST100/i })).toBeInTheDocument();
  });

  it("renders nothing while the list is loading or when no coupon is available", () => {
    availableCoupons = undefined;
    const { container, rerender } = render(<PromoCarousel />);
    expect(container).toBeEmptyDOMElement();

    availableCoupons = [];
    rerender(<PromoCarousel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("matches codes case-insensitively and always keeps non-coupon banners", () => {
    const card = { body: "b", ctaLabel: "c", gradient: "from-primary to-primary/70" };
    const banners = [
      {
        ...card,
        id: "expo25",
        headline: "h",
        destination: { kind: "coupon" as const, value: "EXPO25" },
      },
      {
        ...card,
        id: "spa",
        headline: "h",
        destination: { kind: "coupon-category" as const, code: "SPA20", categorySlug: "spa" },
      },
      {
        ...card,
        id: "route-x",
        headline: "h",
        destination: { kind: "route" as const, value: "/bookings" },
      },
    ];

    const shown = visibleBanners(banners, [{ code: "expo25" }]);

    expect(shown.map((b) => b.id)).toEqual(["expo25", "route-x"]);
  });
});

describe("coupon-prefill-cart card (SVC-347)", () => {
  it("calls addMany with the configured items, stashes the code, and navigates to /cart", async () => {
    render(
      <PromoBannerCard
        banner={{
          id: "prefill-x",
          headline: "Weekend deep cleaning — ₹200 off",
          body: "Add + apply",
          ctaLabel: "Add + apply",
          gradient: "from-primary to-primary/70",
          destination: {
            kind: "coupon-prefill-cart",
            code: "DIWALI20",
            items: [{ serviceId: "svc_deep_clean", quantity: 1 }],
          },
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button"));

    expect(addMany).toHaveBeenCalledWith([{ serviceId: "svc_deep_clean", quantity: 1 }]);
    expect(getPendingCoupon("test-user")).toBe("DIWALI20");
    expect(navigate).toHaveBeenCalledWith({ to: "/cart" });
  });

  it("disables the tap while the service catalogue is unresolved", async () => {
    servicesData = undefined;
    render(
      <PromoBannerCard
        banner={{
          id: "prefill-x",
          headline: "Weekend deep cleaning — ₹200 off",
          body: "Add + apply",
          ctaLabel: "Add + apply",
          gradient: "from-primary to-primary/70",
          destination: {
            kind: "coupon-prefill-cart",
            code: "DIWALI20",
            items: [{ serviceId: "svc_deep_clean" }],
          },
        }}
      />,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(addMany).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("coupon-stash card (SVC-347)", () => {
  it("stashes the code and lands on navigateTo (defaulting to /)", async () => {
    render(
      <PromoBannerCard
        banner={{
          id: "stash-x",
          headline: "₹100 off next booking",
          body: "Stash + apply later",
          ctaLabel: "Save for later",
          gradient: "from-primary to-primary/70",
          destination: { kind: "coupon-stash", code: "REFER100" },
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button"));

    expect(getPendingCoupon("test-user")).toBe("REFER100");
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
    expect(addMany).not.toHaveBeenCalled();
  });
});

describe("coupon-category card (SVC-347)", () => {
  it("stashes the code and lands on /category/$slug", async () => {
    render(
      <PromoBannerCard
        banner={{
          id: "cat-x",
          headline: "Spa week — 20% off",
          body: "Browse spa services with SPA20 ready",
          ctaLabel: "Browse spa",
          gradient: "from-primary to-primary/70",
          destination: { kind: "coupon-category", code: "SPA20", categorySlug: "spa" },
        }}
      />,
    );

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
      />,
    );

    expect(screen.queryByText(/browse services/i)).toBeNull();
  });
});
