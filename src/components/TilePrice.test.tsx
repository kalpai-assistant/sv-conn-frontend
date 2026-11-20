/**
 * SVC-415: the tile label. Runs the real `useFromPrices` against a mocked
 * `apiFetch`, so the key, the fallback while loading and the error path are
 * the hook's own, not a mock's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  point: null as { lat: number; lng: number } | null,
}));
const apiFetch = vi.fn();

vi.mock("@/hooks/useTilePoint", () => ({ useTilePoint: () => h.point }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}));

import { TilePrice, tilePriceState } from "@/components/TilePrice";

const SERVICE = { id: "svc-1", price: 2499 };

function wrap(children: ReactNode, client: QueryClient) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function renderPrice(client = new QueryClient()) {
  const utils = render(wrap(<TilePrice service={SERVICE} />, client));
  return { ...utils, client };
}
const label = (c: HTMLElement) => c.querySelector("[data-tile-price]")?.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  h.point = { lat: 12.97161, lng: 77.59463 };
});

describe("tilePriceState", () => {
  it("floors a from_price to whole rupees", () => {
    expect(tilePriceState({ service_id: "s", from_price: 1874.25, served: true }, 2499)).toEqual({
      kind: "price",
      amount: 1874,
    });
  });
  it("is offline for null + served", () => {
    expect(tilePriceState({ service_id: "s", from_price: null, served: true }, 1)).toEqual({
      kind: "offline",
    });
  });
  it("is coming-soon when not served", () => {
    expect(tilePriceState({ service_id: "s", from_price: null, served: false }, 1)).toEqual({
      kind: "coming-soon",
    });
  });
  it("falls back to the floored catalogue price without a row", () => {
    expect(tilePriceState(undefined, 499.9)).toEqual({ kind: "price", amount: 499 });
  });
});

describe("TilePrice", () => {
  it('shows "from ₹1,874" for a from_price of 1874.25', async () => {
    apiFetch.mockResolvedValue([{ service_id: "svc-1", from_price: 1874.25, served: true }]);
    const { container } = renderPrice();
    await waitFor(() => expect(label(container)).toBe("from ₹1,874"));
  });

  it('shows "No pros online right now" for null + served', async () => {
    apiFetch.mockResolvedValue([{ service_id: "svc-1", from_price: null, served: true }]);
    renderPrice();
    expect(await screen.findByText("No pros online right now")).toBeInTheDocument();
  });

  it('shows "Coming soon" when not served', async () => {
    apiFetch.mockResolvedValue([{ service_id: "svc-1", from_price: null, served: false }]);
    renderPrice();
    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
  });

  it("shows the catalogue price for a service missing from the list", async () => {
    apiFetch.mockResolvedValue([{ service_id: "other", from_price: null, served: false }]);
    const { container } = renderPrice();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await waitFor(() => expect(label(container)).toBe("from ₹2,499"));
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });

  it("shows the catalogue price without a point, and sends nothing", () => {
    h.point = null;
    const { container } = renderPrice();
    expect(label(container)).toBe("from ₹2,499");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("shows the catalogue price when the request fails, with no error UI", async () => {
    apiFetch.mockRejectedValue(new Error("boom"));
    const { container, client } = renderPrice();
    await waitFor(() => expect(client.getQueryCache().getAll()[0]?.state.status).toBe("error"));
    expect(label(container)).toBe("from ₹2,499");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("sends and keys the point at 4 decimals", async () => {
    apiFetch.mockResolvedValue([]);
    const { client } = renderPrice();
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch.mock.calls[0][0]).toBe("/services/from-prices?lat=12.9716&lng=77.5946");
    expect(client.getQueryCache().getAll()[0]?.queryKey).toEqual(["from-prices", 12.9716, 77.5946]);
  });

  // SVC-485: `show` picks one half. Each state × each show value.
  describe.each([
    {
      state: "price",
      rows: [{ service_id: "svc-1", from_price: 1874.25, served: true }],
      text: "from ₹1,874",
      isPrice: true,
    },
    {
      state: "offline",
      rows: [{ service_id: "svc-1", from_price: null, served: true }],
      text: "No pros online right now",
      isPrice: false,
    },
    {
      state: "coming soon",
      rows: [{ service_id: "svc-1", from_price: null, served: false }],
      text: "Coming soon",
      isPrice: false,
    },
    {
      state: "fallback",
      rows: [{ service_id: "other", from_price: null, served: false }],
      text: "from ₹2,499",
      isPrice: true,
    },
  ])("show, in the $state state", ({ rows, text, isPrice }) => {
    async function renderShow(show?: "price" | "status") {
      apiFetch.mockResolvedValue(rows);
      const client = new QueryClient();
      const utils = render(wrap(<TilePrice service={SERVICE} show={show} />, client));
      await waitFor(() => expect(client.getQueryCache().getAll()[0]?.state.status).toBe("success"));
      return utils;
    }

    it("omitted: renders the label as before", async () => {
      const { container } = await renderShow();
      expect(label(container)).toBe(text);
    });

    it(`"price": ${isPrice ? "renders the label" : "renders nothing"}`, async () => {
      const { container } = await renderShow("price");
      if (isPrice) expect(label(container)).toBe(text);
      else expect(container).toBeEmptyDOMElement();
    });

    it(`"status": ${isPrice ? "renders nothing" : "renders the label"}`, async () => {
      const { container } = await renderShow("status");
      if (isPrice) expect(container).toBeEmptyDOMElement();
      else expect(label(container)).toBe(text);
    });
  });

  it("shows the fallback, not the previous point's state, while a new point loads", async () => {
    apiFetch.mockResolvedValueOnce([{ service_id: "svc-1", from_price: null, served: false }]);
    const client = new QueryClient();
    const { container, rerender } = render(wrap(<TilePrice service={SERVICE} />, client));
    expect(await screen.findByText("Coming soon")).toBeInTheDocument();

    apiFetch.mockReturnValueOnce(new Promise(() => {}));
    h.point = { lat: 18.5204, lng: 73.8567 };
    rerender(wrap(<TilePrice service={SERVICE} />, client));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(label(container)).toBe("from ₹2,499");
  });
});
