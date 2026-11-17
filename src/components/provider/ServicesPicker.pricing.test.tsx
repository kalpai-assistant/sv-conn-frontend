/**
 * The SP's own price per variant inside "Services I offer" (SVC-412).
 *
 * The real pricing and subscription hooks run against a real QueryClient; only
 * `apiFetch` is faked, as a tiny in-memory backend, so the optimistic update,
 * the rollback and the refetch after subscribing are the app's own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import type { API_SpPricingResponse, API_SpVariantPricing } from "@/hooks/useApi";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const SERVICES = [
  {
    id: "s1",
    name: "AC gas charging",
    categoryId: "c1",
    categoryName: "AC Repair",
    price: 1999,
    payout: 1500,
    variants: [],
  },
  {
    id: "s2",
    name: "Duct cleaning",
    categoryId: "c1",
    categoryName: "AC Repair",
    price: 499,
    payout: 350,
    variants: [],
  },
];

vi.mock("@/hooks/useApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useApi")>()),
  useServices: () => ({ data: SERVICES, isLoading: false, isError: false, refetch: vi.fn() }),
  useCategories: () => ({
    data: [{ id: "c1", name: "AC Repair", slug: "ac-repair", sortOrder: 1 }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ServicesPicker } from "@/components/provider/ServicesPicker";

const AC_PCT = (750 * 100) / 2499; // the ₹2,499 / ₹750 variant's own percent

function variant(over: Partial<API_SpVariantPricing>): API_SpVariantPricing {
  return {
    variant_id: "v",
    label: "Variant",
    platform_price: 2499,
    price_unit: "PER_VISIT",
    recommended_range: null,
    price_amount: null,
    is_active: null,
    outside_recommended_range: false,
    take_home: null,
    commission_pct: AC_PCT,
    gst_pct: 18,
    ...over,
  };
}

// s1: a sensitive category (with a range). v1 unpriced, v2 priced and on,
// v0 priced by the catalogue at 0. s2: no range, unsubscribed until a test
// subscribes to it.
const S1_VARIANTS = () => [
  variant({
    variant_id: "v1",
    label: "Split AC",
    recommended_range: { low: 1874.25, high: 3123.75 },
  }),
  variant({
    variant_id: "v2",
    label: "Window AC",
    platform_price: 1999,
    recommended_range: { low: 1499.25, high: 2498.75 },
    price_amount: 2000,
    is_active: true,
    take_home: { commission: 600.24, commission_gst: 108.04, sp_receives: 1291.72 },
  }),
  variant({ variant_id: "v0", label: "Free inspection", platform_price: 0 }),
];
const S2_VARIANTS = () => [variant({ variant_id: "v3", label: "3 vents", platform_price: 499 })];

let subscriptions: string[];
let pricing: API_SpPricingResponse;
let onPatch: (variantId: string, body: Record<string, unknown>) => Promise<unknown>;

function group(serviceId: string): API_SpPricingResponse["services"][number] {
  const name = SERVICES.find((s) => s.id === serviceId)!.name;
  const variants = serviceId === "s1" ? S1_VARIANTS() : S2_VARIANTS();
  return { service_id: serviceId, service_name: name, price_unit: "PER_VISIT", variants };
}

/** What the server would send back for a PATCH, from the row it holds. */
function saved(variantId: string, body: Record<string, unknown>) {
  const all = pricing.services.flatMap((g) => g.variants.map((v) => ({ v, g })));
  const { v, g } = all.find((x) => x.v.variant_id === variantId)!;
  const price = (body.price_amount as number | undefined) ?? v.price_amount;
  const range = v.recommended_range;
  return {
    ...v,
    service_id: g.service_id,
    price_amount: price,
    is_active: (body.is_active as boolean | undefined) ?? v.is_active ?? true,
    outside_recommended_range:
      price !== null && range !== null && (price < range.low || price > range.high),
  };
}

function routeApi(path: string, init?: RequestInit) {
  const method = init?.method ?? "GET";
  if (path === "/providers/me/services" && method === "GET") {
    return Promise.resolve(
      subscriptions.map((id) => ({ id: `ps-${id}`, provider_id: "sp", service_id: id })),
    );
  }
  if (path === "/providers/me/services" && method === "POST") {
    const { service_id } = JSON.parse(init!.body as string);
    subscriptions = [...subscriptions, service_id];
    pricing = { services: [...pricing.services, group(service_id)] };
    return Promise.resolve({});
  }
  if (path === "/providers/me/pricing") return Promise.resolve(pricing);
  const patch = path.match(/^\/providers\/me\/pricing\/(.+)$/);
  if (patch && method === "PATCH") {
    return onPatch(patch[1], JSON.parse(init!.body as string));
  }
  return Promise.reject(new Error(`unexpected ${method} ${path}`));
}

const patchCalls = () =>
  apiFetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");

function renderPicker(props: { locked?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ServicesPicker {...props} />
    </QueryClientProvider>,
  );
}

/** Into the AC Repair category, and wait for the cards. */
async function openCategory() {
  fireEvent.click(await screen.findByRole("button", { name: /AC Repair/ }));
  await screen.findByText("AC gas charging");
}

const card = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

async function openPrices(serviceName: string) {
  await openCategory();
  fireEvent.click(within(card(serviceName)).getByRole("button", { name: "Prices" }));
}

const row = (variantId: string) => screen.getByTestId(`variant-${variantId}`);
const priceBox = (variantId: string) => within(row(variantId)).getByRole("textbox");
const saveButton = (variantId: string) =>
  within(row(variantId)).getByRole("button", { name: "Save" });

function type(variantId: string, value: string) {
  fireEvent.change(priceBox(variantId), { target: { value } });
  fireEvent.blur(priceBox(variantId));
}

beforeEach(() => {
  apiFetch.mockReset();
  subscriptions = ["s1"];
  pricing = { services: [group("s1")] };
  onPatch = (id, body) => Promise.resolve(saved(id, body));
  apiFetch.mockImplementation(routeApi);
});

describe("ServicesPicker pricing (SVC-412)", () => {
  it("lists one row per active variant, and the card reads the SP's own price", async () => {
    renderPicker();
    await openCategory();
    await waitFor(() =>
      expect(within(card("AC gas charging")).getByText("Your price from ₹2,000")).toBeVisible(),
    );
    // Not subscribed: the platform price, never the payout.
    expect(within(card("Duct cleaning")).getByText("Platform price from ₹499")).toBeVisible();
    expect(screen.queryByText(/₹1,500|₹350/)).toBeNull();

    fireEvent.click(within(card("AC gas charging")).getByRole("button", { name: "Prices" }));
    expect(await screen.findByText("Split AC")).toBeVisible();
    expect(screen.getByText("Window AC")).toBeVisible();
    expect(screen.getByText("Free inspection")).toBeVisible();
    // The range sits in its own nowrap span, so match the line's whole text.
    expect(
      within(row("v1")).getByText(
        (_, el) =>
          el?.tagName === "P" &&
          el.textContent === "Platform price ₹2,499 · recommended ₹1,875 – ₹3,123",
      ),
    ).toBeVisible();
    expect(within(row("v1")).getByText("recommended ₹1,875 – ₹3,123")).toHaveClass(
      "whitespace-nowrap",
    );
    expect(within(row("v1")).getByText("Set your price")).toBeVisible();
    expect(within(row("v1")).getByText("/ visit")).toBeVisible();
    expect(within(row("v2")).getByText("You receive ₹1,291.72")).toBeVisible();
  });

  it("disables the switch until the variant has a price", async () => {
    renderPicker();
    await openPrices("AC gas charging");
    await screen.findByText("Split AC");
    expect(screen.getByRole("switch", { name: "Offer Split AC" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Offer Window AC" })).toBeEnabled();
    expect(screen.getByRole("switch", { name: "Offer Window AC" })).toBeChecked();
  });

  it("switches a priced variant off with is_active alone", async () => {
    renderPicker();
    await openPrices("AC gas charging");
    fireEvent.click(await screen.findByRole("switch", { name: "Offer Window AC" }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0]).toEqual([
      "/providers/me/pricing/v2",
      expect.objectContaining({ body: JSON.stringify({ is_active: false }) }),
    ]);
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Offer Window AC" })).not.toBeChecked(),
    );
  });

  it("Use platform price sends one PATCH with the platform price, and is hidden at 0", async () => {
    renderPicker();
    await openPrices("AC gas charging");
    await screen.findByText("Split AC");
    expect(within(row("v0")).queryByRole("button", { name: /Use platform price/ })).toBeNull();

    fireEvent.click(within(row("v1")).getByRole("button", { name: "Use platform price ₹2,499" }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0]).toEqual([
      "/providers/me/pricing/v1",
      expect.objectContaining({ body: JSON.stringify({ price_amount: 2499 }) }),
    ]);
    // A new row starts on, and the box holds the price.
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Offer Split AC" })).toBeChecked(),
    );
    expect(priceBox("v1")).toHaveValue("2499");
  });

  it("saves an in-range price without a dialog", async () => {
    renderPicker();
    await openPrices("AC gas charging");
    await screen.findByText("Window AC");
    expect(saveButton("v2")).toBeDisabled(); // unchanged
    type("v2", "2100");
    fireEvent.click(saveButton("v2"));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(patchCalls()[0][1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ price_amount: 2100 }) }),
    );
  });

  it("asks before saving an out-of-range price, and flags it once saved", async () => {
    renderPicker();
    await openPrices("AC gas charging");
    await screen.findByText("Window AC");
    type("v2", "5000");
    fireEvent.click(saveButton("v2"));

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/outside the recommended range of ₹1,500 – ₹2,498/),
    ).toBeVisible();
    expect(patchCalls()).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(await within(row("v2")).findByText("Outside recommended range")).toBeVisible();
  });

  it("cancelling the out-of-range dialog saves nothing", async () => {
    renderPicker();
    await openPrices("AC gas charging");
    await screen.findByText("Window AC");
    type("v2", "1000");
    fireEvent.click(saveButton("v2"));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(patchCalls()).toHaveLength(0);
  });

  it("shows no range and no dialog for a variant outside a sensitive category", async () => {
    subscriptions = ["s1", "s2"];
    pricing = { services: [group("s1"), group("s2")] };
    renderPicker();
    await openPrices("Duct cleaning");
    await screen.findByText("3 vents");
    expect(within(row("v3")).queryByText(/recommended/)).toBeNull();
    type("v3", "5000");
    fireEvent.click(saveButton("v3"));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("previews ₹2,000 as ₹1,291.72 after ₹600.24 commission + ₹108.04 GST", async () => {
    renderPicker();
    await openPrices("AC gas charging");
    await screen.findByText("Split AC");
    type("v1", "2000");
    expect(within(row("v1")).getByText("You receive ₹1,291.72")).toBeVisible();
    expect(within(row("v1")).getByText("(after ₹600.24 commission + ₹108.04 GST)")).toBeVisible();
    expect(saveButton("v1")).toBeEnabled();
  });

  it("validates on blur and keeps Save disabled for a bad price", async () => {
    renderPicker();
    await openPrices("AC gas charging");
    await screen.findByText("Split AC");
    fireEvent.change(priceBox("v1"), { target: { value: "12.345" } });
    expect(screen.queryByText(/Enter a price above/)).toBeNull(); // not until blur
    fireEvent.blur(priceBox("v1"));
    expect(within(row("v1")).getByText(/Enter a price above/)).toBeVisible();
    expect(saveButton("v1")).toBeDisabled();
  });

  it("rolls back a failed save and says why", async () => {
    renderPicker();
    let fail!: (err: unknown) => void;
    onPatch = () => new Promise((_, reject) => (fail = reject));
    await openPrices("AC gas charging");
    await screen.findByText("Window AC");
    type("v2", "2100");
    fireEvent.click(saveButton("v2"));

    // Optimistic: the card already reads the new price.
    await waitFor(() =>
      expect(within(card("AC gas charging")).getByText("Your price from ₹2,100")).toBeVisible(),
    );
    fail(
      new ApiError(
        404,
        "Subscription to service s1 not found",
        undefined,
        "SUBSCRIPTION_NOT_FOUND",
      ),
    );

    await waitFor(() =>
      expect(within(card("AC gas charging")).getByText("Your price from ₹2,000")).toBeVisible(),
    );
    expect(within(row("v2")).getByRole("alert")).toHaveTextContent(
      "Subscription to service s1 not found",
    );
    // What the SP typed stays, so a retry is one tap.
    expect(priceBox("v2")).toHaveValue("2100");
    expect(saveButton("v2")).toBeEnabled();
  });

  it("shows no prices panel when locked", async () => {
    renderPicker({ locked: true });
    await openCategory();
    expect(within(card("AC gas charging")).queryByRole("button", { name: "Prices" })).toBeNull();
    expect(screen.queryByTestId("variant-v1")).toBeNull();
  });

  it("opens the rows of a service as soon as the SP subscribes to it", async () => {
    renderPicker();
    await openCategory();
    fireEvent.click(within(card("Duct cleaning")).getByRole("button", { name: /Duct cleaning/ }));
    expect(await screen.findByText("3 vents")).toBeVisible();
    expect(within(row("v3")).getByText("Set your price")).toBeVisible();
    expect(apiFetch).toHaveBeenCalledWith(
      "/providers/me/services",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
