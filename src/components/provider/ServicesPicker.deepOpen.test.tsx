/**
 * Opening one service's Prices panel from a "variant_added" push (SVC-487).
 * /provider/profile?pricing=<service_id> passes the id in as `openPricingFor`.
 *
 * As in ServicesPicker.pricing.test.tsx, the real subscription and pricing
 * hooks run; only `apiFetch` is faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { API_SpPricingResponse } from "@/hooks/useApi";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

// Two categories, so "drilled in" is visible: the grid has both tiles.
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
    name: "Tap repair",
    categoryId: "c2",
    categoryName: "Plumber",
    price: 299,
    payout: 200,
    variants: [],
  },
];

vi.mock("@/hooks/useApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useApi")>()),
  useServices: () => ({ data: SERVICES, isLoading: false, isError: false, refetch: vi.fn() }),
  useCategories: () => ({
    data: [
      { id: "c1", name: "AC Repair", slug: "ac-repair", sortOrder: 1 },
      { id: "c2", name: "Plumber", slug: "plumber", sortOrder: 2 },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ServicesPicker } from "@/components/provider/ServicesPicker";

// s1 is subscribed and has the newly added option, unpriced.
const PRICING: API_SpPricingResponse = {
  services: [
    {
      service_id: "s1",
      service_name: "AC gas charging",
      price_unit: "PER_VISIT",
      variants: [
        {
          variant_id: "v-new",
          label: "5 ton",
          platform_price: 2499,
          price_unit: "PER_VISIT",
          recommended_range: null,
          price_amount: null,
          is_active: null,
          outside_recommended_range: false,
          take_home: null,
          commission_pct: 30,
          gst_pct: 18,
          upcoming_commission: null,
        },
      ],
    },
  ],
};

let subscriptions: Promise<string[]>;
const scrollIntoView = vi.fn();

beforeEach(() => {
  subscriptions = Promise.resolve(["s1"]);
  apiFetch.mockReset();
  apiFetch.mockImplementation((path: string) => {
    if (path === "/providers/me/services") {
      return subscriptions.then((ids) =>
        ids.map((id) => ({ id: `ps-${id}`, provider_id: "sp", service_id: id })),
      );
    }
    if (path === "/providers/me/pricing") return Promise.resolve(PRICING);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
  // jsdom has no layout, so no scrollIntoView.
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  scrollIntoView.mockReset();
});

function renderPicker(props: Parameters<typeof ServicesPicker>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: typeof props) => (
    <QueryClientProvider client={client}>
      <ServicesPicker {...p} />
    </QueryClientProvider>
  );
  const view = render(tree(props));
  return { rerender: (p: typeof props) => view.rerender(tree(p)) };
}

/** The category grid, untouched: both tiles, no service cards. */
async function expectGrid() {
  expect(await screen.findByRole("button", { name: /AC Repair/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /Plumber/ })).toBeVisible();
  expect(screen.queryByText("AC gas charging")).toBeNull();
  expect(screen.queryByText("5 ton")).toBeNull();
}

describe("ServicesPicker openPricingFor (SVC-487)", () => {
  it("drills into the category, opens the Prices panel and scrolls to it", async () => {
    const handled = vi.fn();
    renderPicker({ openPricingFor: "s1", onPricingHandled: handled });

    expect(await screen.findByText("5 ton")).toBeVisible();
    expect(screen.getByRole("heading", { name: "AC Repair" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Prices" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("Tap repair")).toBeNull();

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    // On the service's own card, the <li> that holds its panel.
    const target = scrollIntoView.mock.contexts[0] as HTMLElement;
    expect(target.tagName).toBe("LI");
    expect(target).toHaveTextContent("AC gas charging");
    expect(target).toHaveTextContent("5 ton");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it("centres the new option's row when given one, clear of the bottom nav", async () => {
    renderPicker({ openPricingFor: "s1", openPricingVariant: "v-new", onPricingHandled: vi.fn() });

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId("variant-v-new"));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("falls back to the card when the option's row isn't there", async () => {
    // Switched off since the push, or never existed: the panel still opens.
    renderPicker({ openPricingFor: "s1", openPricingVariant: "gone", onPricingHandled: vi.fn() });

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    const target = scrollIntoView.mock.contexts[0] as HTMLElement;
    expect(target.tagName).toBe("LI");
    expect(target).toHaveTextContent("AC gas charging");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByText("5 ton")).toBeVisible();
  });

  it("waits for the subscriptions before deciding (they read [] until then)", async () => {
    let resolve!: (ids: string[]) => void;
    subscriptions = new Promise((r) => (resolve = r));
    const handled = vi.fn();
    renderPicker({ openPricingFor: "s1", onPricingHandled: handled });

    await new Promise((r) => setTimeout(r, 20));
    expect(handled).not.toHaveBeenCalled();

    resolve(["s1"]);
    expect(await screen.findByText("5 ton")).toBeVisible();
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a service the SP doesn't offer", "s2", false],
    ["an unknown service", "nope", false],
    ["a locked picker", "s1", true],
  ])("shows the page as usual for %s, and still clears the request", async (_, id, locked) => {
    const handled = vi.fn();
    renderPicker({ openPricingFor: id, onPricingHandled: handled, locked });

    await waitFor(() => expect(handled).toHaveBeenCalledTimes(1));
    await expectGrid();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing without the prop, as onboarding uses it", async () => {
    renderPicker({ locked: false });
    await expectGrid();
    await new Promise((r) => setTimeout(r, 20));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("opens once per request: a re-render with the same id is a no-op", async () => {
    const handled = vi.fn();
    const { rerender } = renderPicker({ openPricingFor: "s1", onPricingHandled: handled });
    await screen.findByText("5 ton");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));

    rerender({ openPricingFor: "s1", onPricingHandled: handled });
    await new Promise((r) => setTimeout(r, 20));
    expect(handled).toHaveBeenCalledTimes(1);
  });
});
