/**
 * The service sheet's catalogue surface (SVC-341 → SVC-392).
 *
 * SVC-341 shipped the first scope sections (collapsible steps + an amber
 * "Not included" card). SVC-392 overhauls the surface: steps become
 * horizontal-scroll cards, "Not included" moves inside a two-column
 * "What's covered" grid alongside "What's included", and new sections
 * (Before/After, FAQ, Reviews) stack below.
 *
 * These tests pin ONLY what the sheet itself owns — section ordering,
 * section-level empty-state hiding, and the title-card rating pill. The
 * visual contract of each section (step-card shape, FAQ accordion, etc.)
 * lives in the individual section files' own tests. Pinning both would
 * couple two files to the same decisions.
 *
 * `useServiceDetail` is mocked with the shape it guarantees (always
 * arrays; its own tests cover null / [] / missing).
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Service } from "@/lib/mock-data";
import type { UI_ServiceDetail } from "@/hooks/useApi";

const SERVICE: Service = {
  id: "s1",
  name: "Full room painting",
  categoryId: "c1",
  categoryName: "Painting",
  description: "Two coats of emulsion on all four walls.",
  price: 4999,
  payout: 4000,
  duration: "6 hrs",
  variants: [],
};

// A related-service tap swaps the sheet's `serviceId` on the same mounted
// instance (service-sheet-context renders it without a key).
const RELATED: Service = { ...SERVICE, id: "s2", name: "Single wall painting" };

const STEPS = [
  { title: "Inspect walls" },
  { title: "Cover furniture" },
  { title: "Sand + prime" },
  { title: "Two coats" },
  { title: "Clean up" },
];
const INCLUDED = ["Two coats of emulsion", "Furniture masking + protection", "Site clean-up"];
const EXCLUSIONS = ["Ceiling painting", "Moving heavy furniture", "Crack repair"];
const FAQS = [
  { question: "Do I supply paint?", answer: "No — tell us the shade in the booking notes." },
];

const emptyDetail = (): UI_ServiceDetail => ({
  related: { hook: [], upsell: [], related: [] },
  steps: [],
  exclusions: [],
  includedItems: [],
  heroImageUrl: null,
  faqs: [],
  beforeAfterPhotos: [],
  ratingAverage: null,
  ratingCount: null,
  bookingsThisWeek: null,
});

const withDetail = (partial: Partial<UI_ServiceDetail>): UI_ServiceDetail => ({
  ...emptyDetail(),
  ...partial,
});

let detail: UI_ServiceDetail | undefined;
let servicesLoading = false;

vi.mock("@/hooks/useApi", () => ({
  useServices: () => ({
    data: servicesLoading ? undefined : [SERVICE, RELATED],
    isLoading: servicesLoading,
    isError: false,
    refetch: vi.fn(),
  }),
  useCategories: () => ({ data: [] }),
  useServiceDetail: () => ({ data: detail }),
}));
vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({ items: [], add: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));
vi.mock("@/lib/back-interceptor", () => ({ pushBackInterceptor: () => () => {} }));
vi.mock("@/components/service/ServiceBanner", () => ({ ServiceBanner: () => null }));
vi.mock("framer-motion", () => ({
  motion: {
    // Strip the gesture/animation props so they don't land on a DOM node.
    div: ({
      children,
      className,
      onClick,
    }: {
      children?: ReactNode;
      className?: string;
      onClick?: () => void;
    }) => (
      <div className={className} onClick={onClick}>
        {children}
      </div>
    ),
  },
  useMotionValue: () => ({}),
}));

import { ServiceSheet } from "@/components/service/ServiceSheet";

const renderSheet = () => render(<ServiceSheet serviceId="s1" onClose={vi.fn()} />);

beforeEach(() => {
  detail = undefined;
  servicesLoading = false;
  // The sheet resets its scroll on every service swap; jsdom has no layout.
  Element.prototype.scrollTo = vi.fn();
  // jsdom doesn't ship matchMedia (TrustStrip subscribes to it).
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("section-level empty-state hiding", () => {
  it("renders every section when the detail response is populated", () => {
    detail = withDetail({
      steps: STEPS,
      exclusions: EXCLUSIONS,
      includedItems: INCLUDED,
      faqs: FAQS,
    });
    renderSheet();

    expect(screen.getByRole("heading", { name: /what's covered/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /here's what we'll do/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /frequently asked/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recent reviews/i })).toBeInTheDocument();
    for (const item of INCLUDED) expect(screen.getByText(item)).toBeInTheDocument();
    for (const item of EXCLUSIONS) expect(screen.getByText(item)).toBeInTheDocument();
  });

  it("hides What's covered when both included and excluded lists are empty", () => {
    detail = withDetail({ steps: STEPS });
    renderSheet();

    expect(screen.queryByRole("heading", { name: /what's covered/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /here's what we'll do/i })).toBeInTheDocument();
  });

  it("hides Steps when no steps are supplied", () => {
    detail = withDetail({ exclusions: EXCLUSIONS });
    renderSheet();

    expect(
      screen.queryByRole("heading", { name: /here's what we'll do/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what's covered/i })).toBeInTheDocument();
  });

  it("hides Before/After when no pairs are supplied", () => {
    detail = withDetail({ steps: STEPS });
    renderSheet();

    expect(screen.queryByRole("heading", { name: /before.*after/i })).not.toBeInTheDocument();
  });

  it("still renders FAQ and Reviews even on an otherwise-empty detail", () => {
    // FAQ falls back to universal copy when the backend sends none, and
    // Reviews ship with illustrative placeholders — both are deliberately
    // persistent surfaces so the sheet never feels incomplete.
    detail = emptyDetail();
    renderSheet();

    expect(screen.getByRole("heading", { name: /frequently asked/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recent reviews/i })).toBeInTheDocument();
  });

  it("renders the base sheet (title + description + price) when the detail query hasn't landed yet", () => {
    detail = undefined;
    renderSheet();

    expect(screen.getByText(SERVICE.description)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /what's covered/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /here's what we'll do/i }),
    ).not.toBeInTheDocument();
  });
});

describe("title-card rating pill", () => {
  it("renders the rating + bookings when ratingCount is non-null", () => {
    detail = withDetail({ ratingAverage: 4.7, ratingCount: 86, bookingsThisWeek: 12 });
    renderSheet();

    expect(screen.getByText("4.7")).toBeInTheDocument();
    expect(screen.getByText("86 bookings")).toBeInTheDocument();
    expect(screen.getByText("12 this week")).toBeInTheDocument();
  });

  it("omits the pill entirely when ratingCount is null — never '0.0 ⭐'", () => {
    detail = withDetail({ ratingAverage: null, ratingCount: null });
    renderSheet();

    // The pill lives inside the service's description card, so we scope the
    // query to that card to avoid false positives from the Reviews section
    // (which carries its own illustrative star ratings).
    const descriptionCard = screen.getByText(SERVICE.description).closest("div")!;
    expect(descriptionCard.querySelector('[class*="bg-primary/10"]')).toBeNull();
    expect(descriptionCard.textContent).not.toMatch(/bookings/);
  });

  it("omits 'this week' when bookingsThisWeek is null but keeps the rating", () => {
    detail = withDetail({ ratingAverage: 4.6, ratingCount: 40, bookingsThisWeek: null });
    renderSheet();

    expect(screen.getByText("4.6")).toBeInTheDocument();
    expect(screen.getByText("40 bookings")).toBeInTheDocument();
    expect(screen.queryByText(/this week/)).not.toBeInTheDocument();
  });
});

// SVC-397: the body's spinner became the summary card's shape, announced.
describe("while the service loads", () => {
  it("shows an announced skeleton under the real header", () => {
    servicesLoading = true;
    renderSheet();

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveTextContent("Loading…");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add to cart/i })).not.toBeInTheDocument();
  });
});
