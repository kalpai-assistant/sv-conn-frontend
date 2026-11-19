/**
 * SVC-419: the pro sheet's three analytics events (sheet_opened,
 * sheet_abandoned, sp_selected). Same module-boundary mocks as
 * ProSelectionSheet.test.tsx, plus `track` (the real pincode helper stays),
 * the back interceptor and the drag hook, so every close path can be fired.
 */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
  back: null as null | (() => boolean),
  drag: null as null | (() => void),
}));

const track = vi.fn();
const requestLocation = vi.fn();
const addQuoted = vi.fn();

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  track: (...a: unknown[]) => track(...a),
}));
vi.mock("@/hooks/useApi", () => ({
  useServiceProviders: () => h.query,
  useFromPrices: () => ({ data: undefined }),
}));
vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({ ...h.address, setSelectedId: vi.fn() }),
}));
vi.mock("@/lib/geolocation", () => ({
  requestLocation: (...args: unknown[]) => requestLocation(...args),
}));
vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({ items: h.items, addQuoted }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/haptics", () => ({ hapticImpactLight: vi.fn() }));
vi.mock("@/lib/back-interceptor", () => ({
  pushBackInterceptor: (fn: () => boolean) => {
    h.back = fn;
    return () => {};
  },
}));
vi.mock("@/hooks/useDragDismiss", () => ({
  useDragDismiss: (onClose: () => void) => {
    h.drag = onClose;
    return {};
  },
}));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));
vi.mock("@/components/SavedAddressesSheet", () => ({
  SavedAddressesSheet: () => <div data-testid="saved-addresses" />,
}));

import { ProSelectionSheet } from "./ProSelectionSheet";
import { scrollDepthPct } from "@/lib/pro-selection";

const SERVICE: Service = {
  id: "svc-1",
  name: "Tap repair",
  categoryId: "c1",
  categoryName: "Plumbing",
  description: "",
  price: 399,
  payout: 300,
  duration: "45 min",
  variants: [{ id: "v1", label: "Single tap", subcategory: null, price: 399, payout: 300 }],
};

const HOME: Address = {
  id: "addr-1",
  label: "home",
  full: "12 MG Road",
  lat: 12.97,
  lng: 77.59,
  pincode: "560001",
};

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
  why: [],
  is_boosted: false,
  outside_recommended_range: false,
  ...over,
});

const response = (providers: API_RankedProvider[]): API_ServiceProvidersResponse => ({
  service_id: "svc-1",
  // The resolved variant differs from the prop on purpose: events carry this.
  service_variant_id: "v-resolved",
  quoted_at: "2026-11-19T10:00:00Z",
  ttl_seconds: 900,
  providers,
});

const loaded = (providers: API_RankedProvider[]) => {
  h.query = { data: response(providers), isLoading: false, isError: false, refetch: vi.fn() };
};
const loading = () => {
  h.query = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
};

const onClose = vi.fn();
const sheet = () => <ProSelectionSheet service={SERVICE} variantId="v1" onClose={onClose} />;

const calls = (name: string) => track.mock.calls.filter((c) => c[0] === name);
const opened = () => calls("marketplace.sheet_opened");
const abandoned = () => calls("marketplace.sheet_abandoned");
const selected = () => calls("marketplace.sp_selected");
const rows = () => screen.queryAllByTestId("pro-row");
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

const line = (serviceId: string, spId?: string): CartLineItem => ({
  serviceId,
  name: serviceId,
  unitPrice: 100,
  quantity: 1,
  spId,
});

beforeEach(async () => {
  // The previous test's sheet was unmounted by RTL's cleanup; its deferred
  // unmount check runs one tick later. Let it land before counting.
  await new Promise((r) => setTimeout(r, 0));
  vi.clearAllMocks();
  h.address = { selected: HOME, addresses: [HOME], isLoading: false };
  h.items = [];
  h.back = null;
  h.drag = null;
  loaded([sp()]);
});
afterEach(() => vi.restoreAllMocks());

describe("marketplace.sheet_opened", () => {
  it("is sent once the list loads, with the count, boost flag and pincode", () => {
    loaded([sp({ sp_id: "a" }), sp({ sp_id: "b", is_boosted: true })]);
    render(sheet());

    expect(opened()).toEqual([
      [
        "marketplace.sheet_opened",
        {
          service_id: "svc-1",
          service_variant_id: "v-resolved",
          sp_count_in_area: 2,
          has_boosted: true,
          user_pincode: "560001",
        },
      ],
    ]);
  });

  it("counts an empty list as 0, with no boost", () => {
    loaded([]);
    render(sheet());
    expect(opened()[0][1]).toMatchObject({ sp_count_in_area: 0, has_boosted: false });
  });

  it("waits for the list: nothing while loading, one event when it lands", () => {
    loading();
    const { rerender } = render(sheet());
    expect(opened()).toHaveLength(0);

    loaded([sp()]);
    rerender(sheet());
    expect(opened()).toHaveLength(1);
  });

  it("is sent only once per open, even when the list reloads (address changed in the sheet)", () => {
    const { rerender } = render(sheet());
    loading();
    rerender(sheet());
    loaded([sp({ sp_id: "a" }), sp({ sp_id: "b" }), sp({ sp_id: "c" })]);
    rerender(sheet());

    expect(opened()).toHaveLength(1);
    expect(opened()[0][1]).toMatchObject({ sp_count_in_area: 1 });
  });

  it("is not sent when the list fails", () => {
    h.query = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    render(sheet());
    expect(opened()).toHaveLength(0);
  });

  it("is not sent while there's no ranking location (address without coordinates)", () => {
    h.address = {
      selected: { ...HOME, lat: null, lng: null },
      addresses: [{ ...HOME, lat: null, lng: null }],
      isLoading: false,
    };
    render(sheet());
    expect(opened()).toHaveLength(0);
  });

  it.each([
    ["not six digits", "5600"],
    ["missing", null],
  ])("sends a null pincode when the address's is %s", (_, pincode) => {
    h.address = { selected: { ...HOME, pincode }, addresses: [HOME], isLoading: false };
    render(sheet());
    expect(opened()[0][1]).toMatchObject({ user_pincode: null });
  });

  it("sends a null pincode when ranked from the device (no saved address)", async () => {
    h.address = { selected: undefined, addresses: [], isLoading: false };
    requestLocation.mockResolvedValue({ ok: true, failure: null, coords: { lat: 1, lng: 2 } });
    render(sheet());

    await screen.findAllByTestId("pro-row");
    expect(opened()[0][1]).toMatchObject({ user_pincode: null });
  });
});

describe("marketplace.sheet_abandoned", () => {
  it.each([
    ["X", () => userEvent.click(screen.getByRole("button", { name: "Close" }))],
    ["the backdrop", () => userEvent.click(screen.getByTestId("pro-sheet-backdrop"))],
    ["Android back", async () => void act(() => void h.back?.())],
    ["a drag down", async () => void act(() => h.drag?.())],
  ])("is sent once on a close via %s, with no pick", async (_, close) => {
    render(sheet());
    await close();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(abandoned()).toHaveLength(1);
    expect(abandoned()[0][1]).toEqual({
      service_id: "svc-1",
      service_variant_id: "v-resolved",
      time_spent_ms: expect.any(Number),
      scroll_depth_pct: 100,
    });
  });

  it("measures time from the sheet's mount, capped at one day", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    render(sheet());
    now.mockReturnValue(1_000_000 + 4_321);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(abandoned()[0][1]).toMatchObject({ time_spent_ms: 4_321 });
  });

  it("caps time spent at 86,400,000 ms", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    render(sheet());
    now.mockReturnValue(3 * 86_400_000);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(abandoned()[0][1]).toMatchObject({ time_spent_ms: 86_400_000 });
  });

  it("reports the deepest scroll seen, not the last", async () => {
    // Before render: the sheet also measures once when the list lands.
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    render(sheet());
    const scroller = screen.getByRole("dialog").querySelector(".overflow-y-auto") as HTMLElement;

    scroller.scrollTop = 450; // (450 + 400) / 1000 = 85%
    fireEvent.scroll(scroller);
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(abandoned()[0][1]).toMatchObject({ scroll_depth_pct: 85 });
  });

  it("counts the first screenful when the customer never scrolls", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    render(sheet());
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(abandoned()[0][1]).toMatchObject({ scroll_depth_pct: 40 });
  });

  it("is not sent after a pick", async () => {
    render(sheet());
    await userEvent.click(rows()[0]);
    await flush();

    expect(selected()).toHaveLength(1);
    expect(abandoned()).toHaveLength(0);
  });

  it("is not sent when sheet_opened never was (closed while loading)", async () => {
    loading();
    render(sheet());
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(abandoned()).toHaveLength(0);
  });

  it("is sent once on an unmount without a close (route change)", async () => {
    const { unmount } = render(sheet());
    unmount();
    await flush();
    expect(abandoned()).toHaveLength(1);
  });

  it("is sent exactly once on a close via X followed by the unmount", async () => {
    const { unmount } = render(sheet());
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    unmount();
    await flush();
    expect(abandoned()).toHaveLength(1);
  });

  it("is not sent by StrictMode's dev mount → unmount → mount", async () => {
    render(<StrictMode>{sheet()}</StrictMode>);
    await flush();
    expect(opened()).toHaveLength(1);
    expect(abandoned()).toHaveLength(0);
  });

  it("is not sent by Replace cart? → Keep cart (the sheet stays open)", async () => {
    h.items = [line("svc-other", "sp-z")];
    render(sheet());
    await userEvent.click(rows()[0]);
    await userEvent.click(await screen.findByRole("button", { name: "Keep cart" }));
    await flush();

    expect(onClose).not.toHaveBeenCalled();
    expect(abandoned()).toHaveLength(0);
    expect(selected()).toHaveLength(0);
  });
});

describe("marketplace.sp_selected", () => {
  it("is sent on a direct tap with the API rank, score and price", async () => {
    loaded([
      sp({ sp_id: "a", score: 0.9 }),
      sp({ sp_id: "b", score: 0.7, price_amount: 520.5, is_boosted: true }),
    ]);
    render(sheet());
    await userEvent.click(rows()[1]);

    expect(selected()).toEqual([
      [
        "marketplace.sp_selected",
        {
          service_id: "svc-1",
          service_variant_id: "v-resolved",
          sp_id: "b",
          sp_rank_in_sheet: 1,
          sp_score: 0.7,
          price_amount: 520.5,
          is_boosted_sp: true,
          is_outside_range: false,
        },
      ],
    ]);
    // The same variant the cart line stores.
    expect(addQuoted.mock.calls[0][2]).toMatchObject({ serviceVariantId: "v-resolved" });
  });

  it("is sent on Select anyway for an outside-range pro, ranked in the full API list", async () => {
    loaded([sp({ sp_id: "a" }), sp({ sp_id: "c", outside_recommended_range: true })]);
    render(sheet());
    await userEvent.click(rows()[1]);
    expect(selected()).toHaveLength(0); // the first tap only shows the warning

    await userEvent.click(screen.getByRole("button", { name: "Select anyway" }));
    expect(selected()).toHaveLength(1);
    expect(selected()[0][1]).toMatchObject({
      sp_id: "c",
      sp_rank_in_sheet: 1,
      is_outside_range: true,
    });
  });

  it("is sent on Replace cart? → Replace", async () => {
    h.items = [line("svc-other", "sp-z")];
    render(sheet());
    await userEvent.click(rows()[0]);
    expect(selected()).toHaveLength(0);

    await userEvent.click(await screen.findByRole("button", { name: "Replace" }));
    expect(selected()).toHaveLength(1);
    expect(selected()[0][1]).toMatchObject({ sp_id: "sp-a", sp_rank_in_sheet: 0 });
  });

  it("clamps a negative score to 0 (a guard: the backend never sends one)", async () => {
    loaded([sp({ score: -0.1 })]);
    render(sheet());
    await userEvent.click(rows()[0]);
    expect(selected()[0][1]).toMatchObject({ sp_score: 0 });
  });
});

describe("scrollDepthPct()", () => {
  it("is 100 when the content fits", () => {
    expect(scrollDepthPct({ scrollTop: 0, clientHeight: 400, scrollHeight: 400 })).toBe(100);
  });

  it("is the bottom edge's position as a whole percent", () => {
    expect(scrollDepthPct({ scrollTop: 0, clientHeight: 300, scrollHeight: 1000 })).toBe(30);
    expect(scrollDepthPct({ scrollTop: 700, clientHeight: 300, scrollHeight: 1000 })).toBe(100);
  });
});
