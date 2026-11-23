/**
 * SVC-496: the option rows and the header read one from-prices row, the
 * default option skips greyed ones, and the header is the service from_price,
 * never the lowest row.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { API_ServiceFromPrice } from "@/hooks/useApi";
import type { Service } from "@/lib/mock-data";
import { VARIANT_NO_PROS_TEXT, VARIANT_OUT_OF_RANGE_TEXT } from "@/lib/tile-price-state";

const AC: Service = {
  id: "ac",
  name: "AC servicing",
  categoryId: "c1",
  categoryName: "Appliances",
  description: "Jet wash, gas check.",
  price: 999,
  payout: 700,
  duration: "1 hr",
  variants: [
    { id: "std", label: "Standard", subcategory: null, price: 999, payout: 700 },
    { id: "split1", label: "Split 1T", subcategory: null, price: 1199, payout: 840 },
    { id: "split2", label: "Split 2T", subcategory: null, price: 1499, payout: 1050 },
  ],
};

let fromPrices: API_ServiceFromPrice[] | undefined;
const openProSelection = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useServices: () => ({ data: [AC], isLoading: false, isError: false, refetch: vi.fn() }),
  useCategories: () => ({ data: [] }),
  useServiceDetail: () => ({ data: undefined }),
  useFromPrices: () => ({ data: fromPrices }),
}));
vi.mock("@/hooks/useTilePoint", () => ({ useTilePoint: () => ({ lat: 12.97, lng: 77.59 }) }));
vi.mock("@/lib/cart-context", () => ({ useCart: () => ({ items: [], add: vi.fn() }) }));
vi.mock("@/lib/pro-selection-context", () => ({ useProSelection: () => ({ openProSelection }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));
vi.mock("@/lib/back-interceptor", () => ({ pushBackInterceptor: () => () => {} }));
vi.mock("@/components/service/ServiceBanner", () => ({ ServiceBanner: () => null }));
vi.mock("@/components/NotifyMeButton", () => ({ NotifyMeButton: () => null }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
  useMotionValue: () => ({}),
}));

import { ServiceSheet } from "@/components/service/ServiceSheet";

const sheet = () => <ServiceSheet serviceId="ac" onClose={vi.fn()} />;
const header = () => document.querySelector("[data-tile-price]")?.textContent;
const rowFor = (label: string) =>
  screen.getAllByTestId("variant-row").find((r) => r.textContent?.includes(label))!;
const checked = () =>
  screen
    .getAllByTestId("variant-row")
    .find((r) => (within(r).getByRole("radio") as HTMLInputElement).checked)?.textContent;

const row = (
  from_price: number | null,
  variants: [string, number | null, boolean][],
): API_ServiceFromPrice[] => [
  {
    service_id: "ac",
    from_price,
    served: true,
    variants: variants.map(([variant_id, p, outside]) => ({
      variant_id,
      from_price: p,
      outside_recommended_range: outside,
    })),
  },
];

beforeEach(() => {
  fromPrices = undefined;
  openProSelection.mockReset();
  Element.prototype.scrollTo = vi.fn();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
});

describe("service sheet option prices (SVC-496)", () => {
  it("the header is the service from_price, not min(rows): the AC example", () => {
    // Standard: only an out-of-range pro at ₹1,000. Split 1T: in range at ₹1,200.
    fromPrices = row(1200, [
      ["std", 1000, true],
      ["split1", 1200, false],
      ["split2", null, false],
    ]);
    render(sheet());

    expect(header()).toBe("from ₹1,200");
    expect(rowFor("Standard").textContent).toContain("from ₹1,000");
    expect(within(rowFor("Standard")).getByText(VARIANT_OUT_OF_RANGE_TEXT)).toBeInTheDocument();
    expect(rowFor("Split 1T").textContent).toContain("from ₹1,200");
    expect(rowFor("Split 1T").textContent).not.toContain(VARIANT_OUT_OF_RANGE_TEXT);
    expect(within(rowFor("Split 2T")).getByText(VARIANT_NO_PROS_TEXT)).toBeInTheDocument();
  });

  it("shows catalogue prices in the header and the rows with no from-prices row", () => {
    render(sheet());
    expect(header()).toBe("from ₹999");
    expect(within(rowFor("Standard")).getByText("₹999")).toBeInTheDocument();
    expect(within(rowFor("Split 1T")).getByText("₹1,199")).toBeInTheDocument();
    expect(checked()).toContain("Standard");
  });

  it("skips a greyed first option by default, and re-picks when from-prices arrives", () => {
    const { rerender } = render(sheet());
    expect(checked()).toContain("Standard");

    fromPrices = row(1200, [
      ["std", null, false],
      ["split1", 1200, false],
      ["split2", 1500, false],
    ]);
    rerender(sheet());
    expect(checked()).toContain("Split 1T");

    screen.getByRole("button", { name: /choose a pro/i }).click();
    expect(openProSelection).toHaveBeenCalledWith(AC, "split1");
  });

  it("every option greyed: header says no pros online, the first option stays chosen", () => {
    fromPrices = row(null, [
      ["std", null, false],
      ["split1", null, false],
      ["split2", null, false],
    ]);
    render(sheet());
    expect(screen.getByText("No pros online right now")).toBeInTheDocument();
    expect(screen.getAllByRole("radio").every((r) => (r as HTMLInputElement).disabled)).toBe(true);
    screen.getByRole("button", { name: /choose a pro/i }).click();
    expect(openProSelection).toHaveBeenCalledWith(AC, "std");
  });
});
