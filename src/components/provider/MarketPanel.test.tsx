/**
 * "Market near you" under each variant's price (SVC-413).
 *
 * The real pricing and market hooks run against a real QueryClient; only
 * `apiFetch` is faked, as in ServicesPicker.pricing.test, so the reset after a
 * save is the app's own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useMyPricing,
  type API_MarketInsights,
  type API_SpPricingResponse,
  type API_SpVariantPricing,
} from "@/hooks/useApi";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { VariantPriceRow } from "@/components/provider/VariantPriceRow";

function variant(over: Partial<API_SpVariantPricing> = {}): API_SpVariantPricing {
  return {
    variant_id: "v1",
    label: "Split AC",
    platform_price: 2499,
    price_unit: "PER_VISIT",
    recommended_range: null,
    price_amount: 2000,
    is_active: true,
    outside_recommended_range: false,
    take_home: null,
    commission_pct: 30,
    gst_pct: 18,
    upcoming_commission: null,
    ...over,
  };
}

const STATS = { sp_count: 5, median_price: 2200, min_price: 1800, max_price: 2600 };

function insights(over: Partial<API_MarketInsights> = {}): API_MarketInsights {
  return {
    service_variant_id: "v1",
    service_id: "s1",
    service_name: "AC gas charging",
    my_price: 2000,
    reference_price: 2499,
    insufficient_competition: false,
    area_stats: { ...STATS, my_percentile: 25, my_bucket: "lower" },
    ...over,
  };
}

let row: API_SpVariantPricing;
let market: () => Promise<API_MarketInsights>;
let onPatch: (body: Record<string, unknown>) => Promise<unknown>;

function routeApi(path: string, init?: RequestInit) {
  const method = init?.method ?? "GET";
  if (path === "/providers/me/pricing") {
    const data: API_SpPricingResponse = {
      services: [
        {
          service_id: "s1",
          service_name: "AC gas charging",
          price_unit: "PER_VISIT",
          variants: [row],
        },
      ],
    };
    return Promise.resolve(data);
  }
  if (path === "/providers/me/market-insights?service_variant_id=v1") return market();
  if (path === "/providers/me/pricing/v1" && method === "PATCH") {
    return onPatch(JSON.parse(init!.body as string));
  }
  return Promise.reject(new Error(`unexpected ${method} ${path}`));
}

const marketCalls = () =>
  apiFetch.mock.calls.filter(([path]) => String(path).startsWith("/providers/me/market-insights"));

function Rows() {
  const pricing = useMyPricing();
  return (
    <ul>
      {pricing.data?.services[0].variants.map((v) => (
        <VariantPriceRow key={v.variant_id} variant={v} />
      ))}
    </ul>
  );
}

async function renderRow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Rows />
    </QueryClientProvider>,
  );
  await screen.findByText("Split AC");
}

const openMarket = () => fireEvent.click(screen.getByRole("button", { name: "Market near you" }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  apiFetch.mockReset();
  row = variant();
  market = () => Promise.resolve(insights());
  onPatch = (body) => {
    row = {
      ...row,
      price_amount: (body.price_amount as number | undefined) ?? row.price_amount,
      is_active: (body.is_active as boolean | undefined) ?? row.is_active,
    };
    return Promise.resolve({ ...row, service_id: "s1" });
  };
  apiFetch.mockImplementation(routeApi);
});

describe("MarketPanel (SVC-413)", () => {
  it("fetches nothing until the SP opens it", async () => {
    await renderRow();
    expect(marketCalls()).toHaveLength(0);
    openMarket();
    await screen.findByText("5 service providers in your area");
    expect(marketCalls()).toHaveLength(1);
  });

  it("shows a skeleton while loading", async () => {
    const pending = deferred<API_MarketInsights>();
    market = () => pending.promise;
    await renderRow();
    openMarket();
    expect(await screen.findByRole("status")).toHaveAttribute("aria-busy", "true");
    await act(async () => pending.resolve(insights()));
    expect(await screen.findByText("5 service providers in your area")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a fixed error with Try again, which refetches", async () => {
    market = () => Promise.reject(new Error("boom"));
    await renderRow();
    openMarket();
    expect(await screen.findByText("Couldn’t load market data.")).toBeVisible();
    expect(screen.queryByText(/boom/)).toBeNull();

    market = () => Promise.resolve(insights());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("5 service providers in your area")).toBeVisible();
    expect(marketCalls()).toHaveLength(2);
  });

  it("says so when there are too few service providers to show", async () => {
    market = () => Promise.resolve(insights({ insufficient_competition: true, area_stats: null }));
    await renderRow();
    openMarket();
    expect(
      await screen.findByText("Not enough service providers in your area yet to show market data."),
    ).toBeVisible();
    expect(screen.queryByTestId("market-bar")).toBeNull();
  });

  it.each([
    ["lower", 1800, 0, "You’re in the lower third of prices."],
    ["middle", 2200, 50, "You’re in the middle third of prices."],
    ["upper", 2600, 100, "You’re in the upper third of prices."],
  ] as const)("shows the stats and the %s third", async (bucket, price, left, sentence) => {
    row = variant({ price_amount: price });
    market = () =>
      Promise.resolve(
        insights({
          my_price: price,
          area_stats: { ...STATS, my_percentile: left, my_bucket: bucket },
        }),
      );
    await renderRow();
    openMarket();
    expect(await screen.findByText(sentence)).toBeVisible();
    expect(screen.getByText("5 service providers in your area")).toBeVisible();
    expect(screen.getByText("Lowest ₹1,800 · Median ₹2,200 · Highest ₹2,600")).toBeVisible();
    expect(screen.getByTestId("market-bar")).toHaveAttribute("aria-hidden");
    expect(screen.getByTestId("market-median").style.left).toBe("50%");
    expect(screen.getByTestId("market-you").style.left).toBe(`${left}%`);
    // Never the percentile itself.
    expect(screen.queryByText(/percentile|\b25\b/i)).toBeNull();
  });

  it("asks for a price when none is set, still showing the stats without a 'you'", async () => {
    row = variant({ price_amount: null, is_active: null });
    market = () =>
      Promise.resolve(
        insights({
          my_price: null,
          area_stats: { ...STATS, my_percentile: null, my_bucket: null },
        }),
      );
    await renderRow();
    openMarket();
    expect(await screen.findByText("Set a price to see where you stand.")).toBeVisible();
    expect(screen.getByText("5 service providers in your area")).toBeVisible();
    expect(screen.getByText("Lowest ₹1,800 · Median ₹2,200 · Highest ₹2,600")).toBeVisible();
    expect(screen.getByTestId("market-median")).toBeInTheDocument();
    expect(screen.queryByTestId("market-you")).toBeNull();
    expect(screen.queryByText(/third of prices/)).toBeNull();
  });

  it("asks to switch the price on when it's off, still showing the stats without a 'you'", async () => {
    row = variant({ is_active: false });
    market = () =>
      Promise.resolve(
        insights({
          my_price: null,
          area_stats: { ...STATS, my_percentile: null, my_bucket: null },
        }),
      );
    await renderRow();
    openMarket();
    expect(await screen.findByText("Switch this price on to see where you stand.")).toBeVisible();
    expect(screen.getByText("5 service providers in your area")).toBeVisible();
    expect(screen.getByText("Lowest ₹1,800 · Median ₹2,200 · Highest ₹2,600")).toBeVisible();
    expect(screen.queryByTestId("market-you")).toBeNull();
  });

  it("shows the footnote under the stats", async () => {
    await renderRow();
    openMarket();
    expect(
      await screen.findByText("Other service providers’ prices update every hour."),
    ).toBeVisible();
  });

  it("never shows the old position after a save, then shows the new one", async () => {
    await renderRow();
    openMarket();
    expect(await screen.findByText("You’re in the lower third of prices.")).toBeVisible();

    const patch = deferred<unknown>();
    onPatch = (body) => {
      row = { ...row, price_amount: body.price_amount as number };
      return patch.promise.then(() => ({ ...row, service_id: "s1" }));
    };
    const refetch = deferred<API_MarketInsights>();
    market = () => refetch.promise;

    const box = within(screen.getByTestId("variant-v1")).getByRole("textbox");
    fireEvent.change(box, { target: { value: "2600" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Saving: the skeleton, not the old third.
    await waitFor(() => expect(screen.queryByText(/third of prices/)).toBeNull());
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(marketCalls()).toHaveLength(1);

    // Saved (the save no longer pending, so `saving` no longer hides the panel):
    // still the skeleton while the panel refetches, from the reset alone.
    await act(async () => patch.resolve(undefined));
    await waitFor(() => expect(marketCalls()).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText(/third of prices/)).toBeNull();
    expect(screen.queryByText("5 service providers in your area")).toBeNull();

    await act(async () =>
      refetch.resolve(
        insights({
          my_price: 2600,
          area_stats: { ...STATS, my_percentile: 100, my_bucket: "upper" },
        }),
      ),
    );
    expect(await screen.findByText("You’re in the upper third of prices.")).toBeVisible();
  });

  it("refetches after switching the price off", async () => {
    await renderRow();
    openMarket();
    expect(await screen.findByText("You’re in the lower third of prices.")).toBeVisible();

    market = () =>
      Promise.resolve(
        insights({
          my_price: null,
          area_stats: { ...STATS, my_percentile: null, my_bucket: null },
        }),
      );
    fireEvent.click(screen.getByRole("switch", { name: "Offer Split AC" }));
    expect(await screen.findByText("Switch this price on to see where you stand.")).toBeVisible();
    expect(screen.queryByText(/third of prices/)).toBeNull();
    expect(marketCalls()).toHaveLength(2);
  });
});

// Lives here because this file already renders VariantPriceRow from the SP's
// real pricing query.
describe("the upcoming commission line (SVC-486)", () => {
  // en formats in the device's locale, so either order of day and month.
  const shown = (pct: string, day: string, month: string, year: string) =>
    new RegExp(
      `^Commission changes to ${pct}% from (${day} ${month} ${year}|${month} ${day}, ${year})$`,
    );

  it("shows nothing while no change is scheduled", async () => {
    await renderRow();
    expect(screen.queryByText(/Commission changes to/)).toBeNull();
  });

  it("says the new percent and the date it starts", async () => {
    row = variant({ upcoming_commission: { new_pct: 25, effective_from: "2026-12-06" } });
    await renderRow();
    expect(screen.getByText(shown("25", "6", "Dec", "2026"))).toBeInTheDocument();
  });

  it("keeps a date-only value on its day, the 1st included, and shows 2 dp", async () => {
    row = variant({ upcoming_commission: { new_pct: 30.04, effective_from: "2027-01-01" } });
    await renderRow();
    expect(screen.getByText(shown("30.04", "1", "Jan", "2027"))).toBeInTheDocument();
  });
});
