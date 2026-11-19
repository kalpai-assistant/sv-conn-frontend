/**
 * SVC-415: every place that shows a service price renders the shared
 * TilePrice, so they cannot drift. The price hooks are mocked to answer
 * "Coming soon" for the service; each place must then say exactly that.
 * (The ServiceSheet header has its own case in ServiceSheet.test.tsx.)
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

// SVC-419's tile-tap event has its own suite (useTileComingSoonTap.test.tsx).
vi.mock("@/hooks/useTileComingSoonTap", () => ({ useTileComingSoonTap: () => () => {} }));
vi.mock("@/hooks/useTilePoint", () => ({ useTilePoint: () => ({ lat: 12.97, lng: 77.59 }) }));
vi.mock("@/hooks/useApi", () => ({
  useFromPrices: () => ({ data: [{ service_id: "svc-1", from_price: null, served: false }] }),
  useServices: () => ({ data: [SERVICE], isLoading: false }),
  useBookings: () => ({
    data: [{ status: "COMPLETED", service: SERVICE }],
  }),
}));
vi.mock("@/lib/service-sheet-context", () => ({
  useServiceSheet: () => ({ openService: vi.fn(), closeService: vi.fn(), openServiceId: null }),
}));
vi.mock("@/components/service/QuickAddButton", () => ({ QuickAddButton: () => null }));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));

import { ServiceCard } from "@/components/ServiceCard";
import { ServiceCardCompact } from "@/components/home/ServiceCardCompact";
import { SearchSheet } from "@/components/home/SearchSheet";
import { BookAgainRow } from "@/components/home/BookAgainRow";

describe("the places that show a service price", () => {
  it("ServiceCard", () => {
    render(<ServiceCard service={SERVICE} />);
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByText("₹499")).not.toBeInTheDocument();
  });

  it("ServiceCardCompact, with no 'starting at'", () => {
    render(<ServiceCardCompact service={SERVICE} />);
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByText(/starting at/i)).not.toBeInTheDocument();
  });

  it("SearchSheet results", async () => {
    render(<SearchSheet onClose={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Search for services..."), "basin");
    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
  });

  it("BookAgainRow", () => {
    render(<BookAgainRow />);
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });
});
