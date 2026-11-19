/**
 * SVC-416: the pro-selection sheet.
 *
 * The ranking query, the address hook, device location and the cart are
 * mocked at their module boundaries, so each test sets exactly the state it
 * is about. The reducer behind `cart.addQuoted` has its own tests
 * (cart-context.addQuoted.test.tsx). This file pins what the sheet hands it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { API_RankedProvider, API_ServiceProvidersResponse } from "@/hooks/useApi";
import type { Address, Service } from "@/lib/mock-data";
import type { CartLineItem } from "@/lib/cart-context";

const h = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  address: {} as {
    selected: Address | undefined;
    addresses: Address[] | undefined;
    isLoading: boolean;
  },
  items: [] as CartLineItem[],
}));

const useServiceProviders = vi.fn((..._args: unknown[]) => h.query);
// SVC-415: the empty message reads from-prices at the sheet's point.
const useFromPrices = vi.fn((..._args: unknown[]) => ({ data: undefined }) as { data: unknown });
const setSelectedId = vi.fn();
const requestLocation = vi.fn();
const addQuoted = vi.fn();
const toastSuccess = vi.fn();
const hapticImpactLight = vi.fn();
const refetch = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useServiceProviders: (...args: unknown[]) => useServiceProviders(...args),
  useFromPrices: (...args: unknown[]) => useFromPrices(...args),
}));
vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({ ...h.address, setSelectedId }),
}));
vi.mock("@/lib/geolocation", () => ({
  requestLocation: (...args: unknown[]) => requestLocation(...args),
}));
vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({ items: h.items, addQuoted }),
}));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));
vi.mock("@/lib/haptics", () => ({ hapticImpactLight: () => hapticImpactLight() }));
vi.mock("@/lib/back-interceptor", () => ({ pushBackInterceptor: () => () => {} }));
// jsdom has no window.scrollTo, which the real lock calls on release.
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));
vi.mock("@/components/SavedAddressesSheet", () => ({
  SavedAddressesSheet: ({ onPick }: { onPick: (id: string) => void }) => (
    <div data-testid="saved-addresses">
      <button type="button" onClick={() => onPick("addr-2")}>
        Pick Office
      </button>
    </div>
  ),
}));

import { ProSelectionSheet, DEVICE_LOCATE_TIMEOUT_MS } from "./ProSelectionSheet";

const SERVICE: Service = {
  id: "svc-1",
  name: "Tap repair",
  categoryId: "c1",
  categoryName: "Plumbing",
  description: "",
  price: 399,
  payout: 300,
  duration: "45 min",
  variants: [
    { id: "v1", label: "Single tap", subcategory: null, price: 399, payout: 300 },
    { id: "v2", label: "Two taps", subcategory: null, price: 699, payout: 500 },
  ],
};

const HOME: Address = { id: "addr-1", label: "home", full: "12 MG Road", lat: 12.97, lng: 77.59 };

const sp = (over: Partial<API_RankedProvider> = {}): API_RankedProvider => ({
  sp_id: "sp-a",
  name: "Rakesh Plumbing",
  price_amount: 450,
  price_unit: "PER_VISIT",
  rating_avg: 4.6,
  rating_count: 128,
  distance_km: 2.14,
  reliability_score: 0.9,
  score: 0.8,
  why: ["Highly rated", "Books in 15m"],
  is_boosted: false,
  outside_recommended_range: false,
  ...over,
});

const response = (providers: API_RankedProvider[]): API_ServiceProvidersResponse => ({
  service_id: "svc-1",
  service_variant_id: "v2",
  quoted_at: "2026-11-17T10:00:00Z",
  ttl_seconds: 900,
  providers,
});

const loaded = (providers: API_RankedProvider[]) => {
  h.query = {
    data: response(providers),
    isLoading: false,
    isError: false,
    refetch,
  };
};

const onClose = vi.fn();
const renderSheet = (variantId = "v2") =>
  render(<ProSelectionSheet service={SERVICE} variantId={variantId} onClose={onClose} />);

const rows = () => screen.queryAllByTestId("pro-row");

beforeEach(() => {
  vi.clearAllMocks();
  useFromPrices.mockReturnValue({ data: undefined });
  h.address = { selected: HOME, addresses: [HOME], isLoading: false };
  h.items = [];
  loaded([sp()]);
});

describe("the two lists", () => {
  it("shows in-range SPs first, then the out-of-range ones under their heading", () => {
    loaded([
      sp({ sp_id: "a", name: "Alpha" }),
      sp({ sp_id: "b", name: "Bravo" }),
      sp({ sp_id: "c", name: "Charlie", outside_recommended_range: true }),
    ]);
    renderSheet();

    const inRange = screen.getByRole("list", { name: "Pros" });
    expect(
      within(inRange)
        .getAllByTestId("pro-row")
        .map((r) => r.textContent),
    ).toEqual([expect.stringContaining("Alpha"), expect.stringContaining("Bravo")]);
    expect(
      screen.getByRole("heading", { name: "Outside the recommended price" }),
    ).toBeInTheDocument();
    const outside = screen.getByRole("list", { name: "Outside the recommended price" });
    expect(within(outside).getByText("Charlie")).toBeInTheDocument();
  });

  it("shows only the second list, with its heading, when no SP is in range", () => {
    loaded([sp({ sp_id: "c", name: "Charlie", outside_recommended_range: true })]);
    renderSheet();

    expect(screen.queryByRole("list", { name: "Pros" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Outside the recommended price" }),
    ).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });

  it("has no second heading when every SP is in range", () => {
    loaded([sp({ sp_id: "a" }), sp({ sp_id: "b" })]);
    renderSheet();

    expect(screen.queryByText("Outside the recommended price")).not.toBeInTheDocument();
  });
});

describe("a row", () => {
  it("shows initials, name, rating, price with unit, distance and the why chips", () => {
    renderSheet();
    const row = rows()[0];

    expect(row).toHaveTextContent("RP");
    expect(row).toHaveTextContent("Rakesh Plumbing");
    expect(row).toHaveTextContent("4.6");
    expect(row).toHaveTextContent("(128)");
    expect(row).toHaveTextContent("₹450");
    expect(row).toHaveTextContent("/ visit");
    expect(row).toHaveTextContent("2.1 km away");
    expect(
      within(row)
        .getAllByTestId("why-chip")
        .map((c) => c.textContent),
    ).toEqual(["Highly rated", "Books in 15m"]);
  });

  it("shows 'Service pro' for a nameless SP and 'New' when it has no reviews", () => {
    loaded([sp({ name: null, rating_avg: null, rating_count: 0 })]);
    renderSheet();
    const row = rows()[0];

    expect(row).toHaveTextContent("Service pro");
    expect(row).toHaveTextContent("New");
    expect(row).not.toHaveTextContent("(0)");
  });

  it("shows at most three why chips, as sent", () => {
    loaded([sp({ why: ["One", "Two", "Three", "Four"] })]);
    renderSheet();

    expect(screen.getAllByTestId("why-chip").map((c) => c.textContent)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });

  it.each([
    ["PER_SQFT", "/ sq ft"],
    ["PER_HOUR", "/ hour"],
    ["PER_ITEM", "/ item"],
  ])("labels %s as %s, with no quantity selector", (unit, label) => {
    loaded([sp({ price_unit: unit })]);
    renderSheet();

    expect(rows()[0]).toHaveTextContent(label);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("never marks a boosted SP", () => {
    loaded([sp({ is_boosted: true }), sp({ sp_id: "b", name: "Bravo" })]);
    renderSheet();
    const [boosted, plain] = rows();

    expect(document.body.textContent).not.toMatch(/boost|sponsor|promoted|featured|\bad\b/i);
    // Same markup as an unboosted row: nothing extra rendered for it.
    expect(boosted.className).toBe(plain.className);
    expect(boosted.querySelectorAll("*").length).toBe(plain.querySelectorAll("*").length);
  });
});

describe("picking an SP", () => {
  it("writes the SP and quote to the cart, toasts, buzzes once and closes", async () => {
    renderSheet();
    await userEvent.click(rows()[0]);

    expect(addQuoted).toHaveBeenCalledWith(
      SERVICE,
      "v2",
      {
        spId: "sp-a",
        spName: "Rakesh Plumbing",
        quotedPrice: 450,
        quotedAt: "2026-11-17T10:00:00Z",
        serviceVariantId: "v2",
        outsideRecommendedRange: false,
      },
      { replaceOtherSps: false },
    );
    expect(toastSuccess).toHaveBeenCalledWith("Added — Rakesh Plumbing at ₹450");
    expect(hapticImpactLight).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("names a nameless SP 'Service pro' in the toast", async () => {
    loaded([sp({ name: null })]);
    renderSheet();
    await userEvent.click(rows()[0]);

    expect(toastSuccess).toHaveBeenCalledWith("Added — Service pro at ₹450");
  });
});

describe("an out-of-range SP", () => {
  beforeEach(() => {
    loaded([sp({ sp_id: "c", name: "Charlie", outside_recommended_range: true })]);
  });

  it("shows the warning strip on tap and adds nothing yet", async () => {
    renderSheet();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.click(rows()[0]);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This pro's price is outside our recommended range",
    );
    expect(addQuoted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("adds it, flagged, on Select anyway", async () => {
    renderSheet();
    await userEvent.click(rows()[0]);
    await userEvent.click(screen.getByRole("button", { name: "Select anyway" }));

    expect(addQuoted).toHaveBeenCalledWith(
      SERVICE,
      "v2",
      expect.objectContaining({ spId: "c", outsideRecommendedRange: true }),
      { replaceOtherSps: false },
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("Replace cart?", () => {
  const line = (serviceId: string, spId?: string): CartLineItem => ({
    serviceId,
    name: serviceId,
    unitPrice: 100,
    quantity: 1,
    spId,
  });

  it("asks before adding an SP different from the one on the cart's lines", async () => {
    h.items = [line("svc-other", "sp-z")];
    renderSheet();
    await userEvent.click(rows()[0]);

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Replace cart?");
    expect(addQuoted).not.toHaveBeenCalled();
  });

  it("replaces on confirm", async () => {
    h.items = [line("svc-other", "sp-z")];
    renderSheet();
    await userEvent.click(rows()[0]);
    await userEvent.click(await screen.findByRole("button", { name: "Replace" }));

    expect(addQuoted).toHaveBeenCalledWith(
      SERVICE,
      "v2",
      expect.objectContaining({ spId: "sp-a" }),
      {
        replaceOtherSps: true,
      },
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("adds nothing and stays open on Keep cart", async () => {
    h.items = [line("svc-other", "sp-z")];
    renderSheet();
    await userEvent.click(rows()[0]);
    await userEvent.click(await screen.findByRole("button", { name: "Keep cart" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(addQuoted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("doesn't ask when the cart's lines have no SP", async () => {
    h.items = [line("svc-other")];
    renderSheet();
    await userEvent.click(rows()[0]);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(addQuoted).toHaveBeenCalledOnce();
  });

  it("doesn't ask when the only other-SP line is the one being re-picked", async () => {
    h.items = [line("svc-1", "sp-z")];
    renderSheet();
    await userEvent.click(rows()[0]);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(addQuoted).toHaveBeenCalledOnce();
  });
});

describe("location", () => {
  it("ranks from the selected address's coordinates", () => {
    renderSheet();

    expect(useServiceProviders).toHaveBeenLastCalledWith("svc-1", "v2", 12.97, 77.59);
    expect(requestLocation).not.toHaveBeenCalled();
  });

  it("asks for another address when the selected one has no coordinates", async () => {
    h.address = {
      selected: { ...HOME, lat: null, lng: null },
      addresses: [{ ...HOME, lat: null, lng: null }],
      isLoading: false,
    };
    renderSheet();

    expect(screen.getByText("Choose or add an address to see pros")).toBeInTheDocument();
    expect(useServiceProviders).toHaveBeenLastCalledWith("svc-1", "v2", null, null);
    expect(requestLocation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Choose address" }));
    await userEvent.click(screen.getByRole("button", { name: "Pick Office" }));

    expect(setSelectedId).toHaveBeenCalledWith("addr-2");
    expect(screen.queryByTestId("saved-addresses")).not.toBeInTheDocument();
  });

  it("uses the device location when there is no saved address", async () => {
    h.address = { selected: undefined, addresses: [], isLoading: false };
    requestLocation.mockResolvedValue({
      ok: true,
      failure: null,
      coords: { lat: 18.52, lng: 73.85 },
    });
    renderSheet();

    expect(requestLocation).toHaveBeenCalledWith(DEVICE_LOCATE_TIMEOUT_MS);
    await waitFor(() =>
      expect(useServiceProviders).toHaveBeenLastCalledWith("svc-1", "v2", 18.52, 73.85),
    );
  });

  it("shows skeletons while the device locates", () => {
    h.address = { selected: undefined, addresses: [], isLoading: false };
    requestLocation.mockReturnValue(new Promise(() => {}));
    renderSheet();

    expect(screen.getAllByTestId("pro-row-skeleton")).toHaveLength(3);
    expect(useServiceProviders).toHaveBeenLastCalledWith("svc-1", "v2", null, null);
  });

  it("asks for an address when the device can't be located", async () => {
    h.address = { selected: undefined, addresses: [], isLoading: false };
    requestLocation.mockResolvedValue({ ok: false, failure: "permission-denied", coords: null });
    renderSheet();

    expect(
      await screen.findByText("We couldn't find your location. Add an address to see pros."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add address" }));
    expect(screen.getByTestId("saved-addresses")).toBeInTheDocument();
  });

  it("waits for the address list before asking the device", () => {
    h.address = { selected: undefined, addresses: undefined, isLoading: true };
    renderSheet();

    expect(requestLocation).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("pro-row-skeleton")).toHaveLength(3);
  });
});

describe("states", () => {
  it("shows 3 skeleton rows while loading", () => {
    h.query = { data: undefined, isLoading: true, isError: false, refetch };
    renderSheet();

    expect(screen.getAllByTestId("pro-row-skeleton")).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("shows the empty message with no Notify me", () => {
    loaded([]);
    renderSheet();

    expect(
      screen.getByText("No pros available for this service in your area yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/notify/i)).not.toBeInTheDocument();
  });

  // SVC-415: from-prices at the sheet's own ranking point decides the copy.
  it("says no pros online when from-prices says the service is served here", () => {
    loaded([]);
    useFromPrices.mockReturnValue({
      data: [{ service_id: SERVICE.id, from_price: null, served: true }],
    });
    renderSheet();

    expect(screen.getByText("No pros online right now")).toBeInTheDocument();
    expect(useFromPrices).toHaveBeenLastCalledWith({ lat: HOME.lat, lng: HOME.lng });
  });

  it("keeps the area message when the service is not served here", () => {
    loaded([]);
    useFromPrices.mockReturnValue({
      data: [{ service_id: SERVICE.id, from_price: null, served: false }],
    });
    renderSheet();

    expect(
      screen.getByText("No pros available for this service in your area yet."),
    ).toBeInTheDocument();
  });

  it("keeps the area message when from-prices is unavailable", () => {
    loaded([]);
    useFromPrices.mockReturnValue({ data: undefined });
    renderSheet();

    expect(
      screen.getByText("No pros available for this service in your area yet."),
    ).toBeInTheDocument();
  });

  it("shows an inline error that retries", async () => {
    h.query = { data: undefined, isLoading: false, isError: true, refetch };
    renderSheet();

    expect(screen.getByText("Couldn't load pros for this service.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

describe("dismissing", () => {
  it("closes on a backdrop tap", async () => {
    renderSheet();
    await userEvent.click(screen.getByTestId("pro-sheet-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(addQuoted).not.toHaveBeenCalled();
  });

  it("closes from the Close button", async () => {
    renderSheet();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
