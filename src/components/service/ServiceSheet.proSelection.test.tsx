/**
 * SVC-416: ServiceSheet's CTA and the pro-selection sheet, wired together.
 *
 * Real CartProvider, real ProSelectionProvider (so the real sheet) and the
 * real ServiceSheet. Only the network and device edges are mocked. This pins
 * the hand-off between the two sheets:
 * - the CTA opens the pro sheet for the picked variant, with no price on it;
 * - a pick closes only the pro sheet, and ServiceSheet shows "Added to your
 *   cart";
 * - a dismissal leaves ServiceSheet as it was.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { API_ServiceProvidersResponse, UI_ServiceDetail } from "@/hooks/useApi";
import type { Address, Service } from "@/lib/mock-data";

const SERVICE: Service = {
  id: "s1",
  name: "Tap repair",
  categoryId: "c1",
  categoryName: "Plumbing",
  description: "Fix a dripping tap.",
  price: 399,
  payout: 300,
  duration: "45 min",
  variants: [
    { id: "v1", label: "Single tap", subcategory: null, price: 399, payout: 300 },
    { id: "v2", label: "Two taps", subcategory: null, price: 699, payout: 500 },
  ],
};

const HOME: Address = { id: "a1", label: "home", full: "12 MG Road", lat: 12.97, lng: 77.59 };

const DETAIL: UI_ServiceDetail = {
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
};

const RANKING = (variantId: string): API_ServiceProvidersResponse => ({
  service_id: "s1",
  service_variant_id: variantId,
  quoted_at: "2026-11-17T10:00:00Z",
  ttl_seconds: 900,
  providers: [
    {
      sp_id: "sp-a",
      name: "Rakesh Plumbing",
      price_amount: 750,
      price_unit: "PER_VISIT",
      rating_avg: 4.6,
      rating_count: 128,
      distance_km: 2.1,
      reliability_score: 0.9,
      score: 0.8,
      why: [],
      is_boosted: false,
      outside_recommended_range: false,
    },
  ],
});

const useServiceProviders = vi.fn((_s: unknown, variantId: unknown) => ({
  data: RANKING(String(variantId)),
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useApi", () => ({
  useServices: () => ({ data: [SERVICE], isLoading: false, isError: false, refetch: vi.fn() }),
  useCategories: () => ({ data: [] }),
  useServiceDetail: () => ({ data: DETAIL }),
  useFromPrices: () => ({ data: undefined }),
  useServiceProviders: (...args: [unknown, unknown]) => useServiceProviders(...args),
}));
vi.mock("@/hooks/useTilePoint", () => ({ useTilePoint: () => null }));
vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({
    selected: HOME,
    addresses: [HOME],
    isLoading: false,
    setSelectedId: vi.fn(),
  }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/components/SavedAddressesSheet", () => ({ SavedAddressesSheet: () => null }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));
vi.mock("@/lib/back-interceptor", () => ({ pushBackInterceptor: () => () => {} }));
vi.mock("@/components/service/ServiceBanner", () => ({ ServiceBanner: () => null }));
vi.mock("@/lib/haptics", () => ({ hapticImpactLight: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { CartProvider } from "@/lib/cart-context";
import { ProSelectionProvider } from "@/lib/pro-selection-context";
import { ServiceSheet } from "@/components/service/ServiceSheet";

const onCloseServiceSheet = vi.fn();

function renderAll() {
  const client = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <CartProvider>
        <ProSelectionProvider>{children}</ProSelectionProvider>
      </CartProvider>
    </QueryClientProvider>
  );
  return render(<ServiceSheet serviceId="s1" onClose={onCloseServiceSheet} />, {
    wrapper: Wrapper,
  });
}

const proSheet = () => screen.queryByRole("dialog", { name: "Choose a pro" });

async function pickVariant(name: RegExp) {
  await userEvent.click(screen.getByRole("radio", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Element.prototype.scrollTo = vi.fn();
  // TrustStrip subscribes to matchMedia, which jsdom doesn't ship.
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

describe("ServiceSheet → pro-selection sheet", () => {
  it("shows 'Choose a pro' with no price on the CTA", () => {
    renderAll();

    const cta = screen.getByRole("button", { name: "Choose a pro" });
    expect(cta.textContent).not.toMatch(/₹/);
  });

  it("opens the pro sheet for the picked variant", async () => {
    renderAll();
    await pickVariant(/two taps/i);
    await userEvent.click(screen.getByRole("button", { name: "Choose a pro" }));

    expect(proSheet()).toBeInTheDocument();
    expect(useServiceProviders).toHaveBeenLastCalledWith("s1", "v2", 12.97, 77.59);
  });

  it("a pick closes only the pro sheet; ServiceSheet shows the line landed", async () => {
    renderAll();
    await pickVariant(/two taps/i);
    await userEvent.click(screen.getByRole("button", { name: "Choose a pro" }));
    await userEvent.click(within(proSheet()!).getByTestId("pro-row"));

    await waitFor(() => expect(proSheet()).not.toBeInTheDocument());
    expect(onCloseServiceSheet).not.toHaveBeenCalled();
    expect(screen.getByText("Added to your cart")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go to cart/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /two taps/i })).toBeChecked();

    const stored = JSON.parse(localStorage.getItem("sc_cart_v2_u1") ?? "[]");
    expect(stored).toEqual([
      expect.objectContaining({
        serviceId: "s1",
        variantId: "v2",
        spId: "sp-a",
        unitPrice: 750,
        quotedPrice: 750,
        serviceVariantId: "v2",
        quantity: 1,
      }),
    ]);
  });

  it("a dismissal leaves ServiceSheet on the same variant, with nothing added", async () => {
    renderAll();
    await pickVariant(/two taps/i);
    await userEvent.click(screen.getByRole("button", { name: "Choose a pro" }));
    await userEvent.click(screen.getByTestId("pro-sheet-backdrop"));

    await waitFor(() => expect(proSheet()).not.toBeInTheDocument());
    expect(onCloseServiceSheet).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /two taps/i })).toBeChecked();
    expect(screen.getByRole("button", { name: "Choose a pro" })).toBeInTheDocument();
    expect(screen.queryByText("Added to your cart")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("sc_cart_v2_u1") ?? "[]")).toEqual([]);
  });

  it("offers 'Choose a pro for this option' when another variant is in the cart", async () => {
    renderAll();
    await userEvent.click(screen.getByRole("button", { name: "Choose a pro" }));
    await userEvent.click(within(proSheet()!).getByTestId("pro-row"));
    await waitFor(() => expect(proSheet()).not.toBeInTheDocument());

    await pickVariant(/two taps/i);

    const cta = screen.getByRole("button", { name: "Choose a pro for this option" });
    expect(cta.textContent).not.toMatch(/₹/);
  });
});
