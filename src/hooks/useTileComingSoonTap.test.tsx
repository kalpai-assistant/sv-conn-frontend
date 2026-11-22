/**
 * SVC-419 `marketplace.tile_coming_soon_tapped`, through the real hook and
 * the real tile places (ServiceCard, ServiceCardCompact, SearchSheet,
 * BookAgainRow) with the real QuickAddButton. The price state comes from a
 * mocked from-prices row, the same one TilePrice paints from.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Address, Service } from "@/lib/mock-data";

const h = vi.hoisted(() => ({
  row: undefined as undefined | { service_id: string; from_price: number | null; served: boolean },
  selected: undefined as Address | undefined,
}));

const track = vi.fn();
const openService = vi.fn();
const openProSelection = vi.fn();

const SERVICE: Service = {
  id: "svc-1",
  name: "Basin installation",
  categoryId: "c1",
  categoryName: "Plumber",
  description: "Fix a basin",
  price: 499,
  payout: 0,
  duration: "1 hr",
  variants: [{ id: "v1", label: "Standard", subcategory: null, price: 499, payout: 0 }],
};

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  track: (...a: unknown[]) => track(...a),
}));
vi.mock("@/hooks/useTilePoint", () => ({ useTilePoint: () => ({ lat: 12.97, lng: 77.59 }) }));
vi.mock("@/hooks/useApi", () => ({
  useFromPrices: () => ({ data: h.row ? [h.row] : [] }),
  useServices: () => ({ data: [SERVICE], isLoading: false }),
  useBookings: () => ({ data: [{ status: "COMPLETED", service: SERVICE }] }),
}));
vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({ selected: h.selected }),
}));
vi.mock("@/lib/service-sheet-context", () => ({
  useServiceSheet: () => ({ openService, closeService: vi.fn(), openServiceId: null }),
}));
vi.mock("@/lib/pro-selection-context", () => ({
  useProSelection: () => ({ openProSelection, closeProSelection: vi.fn() }),
}));
vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({ items: [], updateQuantity: vi.fn() }),
}));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));

import { ServiceCard } from "@/components/ServiceCard";
import { ServiceCardCompact } from "@/components/home/ServiceCardCompact";
import { SearchSheet } from "@/components/home/SearchSheet";
import { BookAgainRow } from "@/components/home/BookAgainRow";

const HOME: Address = {
  id: "a1",
  label: "home",
  full: "12 MG Road",
  lat: 12.97,
  lng: 77.59,
  pincode: "560001",
};

const COMING_SOON = { service_id: "svc-1", from_price: null, served: false };
const OFFLINE = { service_id: "svc-1", from_price: null, served: true };
const PRICED = { service_id: "svc-1", from_price: 450, served: true };

const events = () => track.mock.calls.filter((c) => c[0] === "marketplace.tile_coming_soon_tapped");

/** Each place, rendered, and its tile's tap target. */
const PLACES: Array<[string, () => Promise<HTMLElement>]> = [
  [
    "ServiceCard",
    async () => {
      render(<ServiceCard service={SERVICE} />);
      return screen.getByText("Basin installation").closest("[role=button]") as HTMLElement;
    },
  ],
  [
    "ServiceCardCompact",
    async () => {
      render(<ServiceCardCompact service={SERVICE} />);
      return screen.getByText("Basin installation").closest("[role=button]") as HTMLElement;
    },
  ],
  [
    "SearchSheet",
    async () => {
      render(<SearchSheet onClose={vi.fn()} />);
      await userEvent.type(screen.getByPlaceholderText("Search for services..."), "basin");
      return (await screen.findByText("Basin installation")).closest(
        "[role=button]",
      ) as HTMLElement;
    },
  ],
  [
    "BookAgainRow",
    async () => {
      render(<BookAgainRow />);
      return screen.getByText("Basin installation").closest("[role=button]") as HTMLElement;
    },
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
  h.row = COMING_SOON;
  h.selected = HOME;
});

describe.each(PLACES)("%s", (_, renderPlace) => {
  it("sends one coming_soon event per tap on a 'Coming soon' tile, and still opens it", async () => {
    const tile = await renderPlace();
    await userEvent.click(tile);

    expect(events()).toEqual([
      [
        "marketplace.tile_coming_soon_tapped",
        { service_id: "svc-1", state: "coming_soon", user_pincode: "560001" },
      ],
    ]);
    expect(openService).toHaveBeenCalledWith("svc-1");
  });

  it("sends no_pros_online on a 'No pros online right now' tile", async () => {
    h.row = OFFLINE;
    const tile = await renderPlace();
    await userEvent.click(tile);
    expect(events()).toHaveLength(1);
    expect(events()[0][1]).toMatchObject({ state: "no_pros_online" });
  });

  it("sends nothing on a priced tile", async () => {
    h.row = PRICED;
    await userEvent.click(await renderPlace());
    expect(events()).toHaveLength(0);
  });

  it("sends nothing on a fallback tile (no from-prices row)", async () => {
    h.row = undefined;
    await userEvent.click(await renderPlace());
    expect(events()).toHaveLength(0);
  });
});

describe.each([
  ["ServiceCard", () => render(<ServiceCard service={SERVICE} />)],
  ["ServiceCardCompact", () => render(<ServiceCardCompact service={SERVICE} />)],
])("ADD on %s", (_, renderCard) => {
  it("sends exactly one event per tap, and opens the pro sheet, not the service sheet", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Add Basin installation to cart" }));

    expect(events()).toHaveLength(1);
    expect(openProSelection).toHaveBeenCalledTimes(1);
    expect(openService).not.toHaveBeenCalled();
  });

  it("sends nothing when the tile is priced", async () => {
    h.row = PRICED;
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Add Basin installation to cart" }));
    expect(events()).toHaveLength(0);
  });
});

describe("keyboard", () => {
  it.each(["Enter", " "])("counts %j on a card once", (key) => {
    render(<ServiceCard service={SERVICE} />);
    const card = screen.getByText("Basin installation").closest("[role=button]") as HTMLElement;
    fireEvent.keyDown(card, { key });
    expect(events()).toHaveLength(1);
  });
});

describe("user_pincode", () => {
  it("is null when the tiles price from the device's fix (address without coordinates)", async () => {
    h.selected = { ...HOME, lat: null, lng: null };
    render(<ServiceCard service={SERVICE} />);
    await userEvent.click(screen.getByText("Basin installation"));
    expect(events()[0][1]).toMatchObject({ user_pincode: null });
  });

  it("is null when there is no selected address", async () => {
    h.selected = undefined;
    render(<ServiceCard service={SERVICE} />);
    await userEvent.click(screen.getByText("Basin installation"));
    expect(events()[0][1]).toMatchObject({ user_pincode: null });
  });

  it("is null when the address's pincode isn't six digits", async () => {
    h.selected = { ...HOME, pincode: "56-001" };
    render(<ServiceCard service={SERVICE} />);
    await userEvent.click(screen.getByText("Basin installation"));
    expect(events()[0][1]).toMatchObject({ user_pincode: null });
  });
});
