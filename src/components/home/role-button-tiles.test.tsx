/**
 * SVC-484 turned the SearchSheet result row and the Book again card from a
 * `<button>` into a `div role="button"` (as ServiceCard already was), so
 * Notify me can be a button inside them. They must still work from a
 * keyboard: focusable, and Enter / Space open the service sheet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Service } from "@/lib/mock-data";

const SERVICE: Service = {
  id: "svc-1",
  name: "Basin installation",
  categoryId: "c1",
  categoryName: "Plumber",
  description: "Fix a basin",
  price: 499,
  payout: 0,
  duration: "1 hr",
  variants: [],
};

const { openService } = vi.hoisted(() => ({ openService: vi.fn() }));
vi.mock("@/hooks/useTileComingSoonTap", () => ({ useTileComingSoonTap: () => () => {} }));
vi.mock("@/hooks/useTilePoint", () => ({ useTilePoint: () => null }));
vi.mock("@/hooks/useApi", () => ({
  useFromPrices: () => ({ data: undefined }),
  useServices: () => ({ data: [SERVICE], isLoading: false }),
  useBookings: () => ({ data: [{ status: "COMPLETED", service: SERVICE }] }),
}));
vi.mock("@/lib/service-sheet-context", () => ({
  useServiceSheet: () => ({ openService, closeService: vi.fn(), openServiceId: null }),
}));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));

import { SearchSheet } from "@/components/home/SearchSheet";
import { BookAgainRow } from "@/components/home/BookAgainRow";

const PLACES: Array<[string, () => Promise<HTMLElement>]> = [
  [
    "SearchSheet result",
    async () => {
      render(<SearchSheet onClose={vi.fn()} />);
      await userEvent.type(screen.getByPlaceholderText("Search for services..."), "basin");
      return (await screen.findByText("Basin installation")).closest(
        "[role=button]",
      ) as HTMLElement;
    },
  ],
  [
    "Book again card",
    async () => {
      render(<BookAgainRow />);
      return screen.getByText("Basin installation").closest("[role=button]") as HTMLElement;
    },
  ],
];

beforeEach(() => openService.mockReset());

describe.each(PLACES)("%s", (_, renderPlace) => {
  it("is focusable, with a visible focus ring", async () => {
    const tile = await renderPlace();
    expect(tile).toHaveAttribute("tabindex", "0");
    expect(tile.className).toContain("focus-visible:ring-2");
  });

  it.each(["Enter", " "])("%j opens the service sheet", async (key) => {
    const tile = await renderPlace();
    fireEvent.keyDown(tile, { key });
    expect(openService).toHaveBeenCalledTimes(1);
  });

  it("other keys do nothing", async () => {
    const tile = await renderPlace();
    fireEvent.keyDown(tile, { key: "a" });
    expect(openService).not.toHaveBeenCalled();
  });
});
