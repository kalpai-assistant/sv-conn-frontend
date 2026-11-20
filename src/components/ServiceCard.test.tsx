/**
 * SVC-485: where ServiceCard puts the price and the status. A price (or the
 * catalogue fallback) sits in the right column above ADD, as before. "No pros
 * online right now" / "Coming soon" sits on its own row under the main row,
 * and the right column holds only ADD.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { API_ServiceFromPrice } from "@/hooks/useApi";
import type { Service } from "@/lib/mock-data";

const h = vi.hoisted(() => ({
  rows: undefined as API_ServiceFromPrice[] | undefined,
  tap: vi.fn(),
  openService: vi.fn(),
}));

vi.mock("@/hooks/useTilePoint", () => ({ useTilePoint: () => ({ lat: 12.97, lng: 77.59 }) }));
vi.mock("@/hooks/useApi", () => ({ useFromPrices: () => ({ data: h.rows }) }));
vi.mock("@/hooks/useTileComingSoonTap", () => ({ useTileComingSoonTap: () => h.tap }));
vi.mock("@/lib/service-sheet-context", () => ({
  useServiceSheet: () => ({ openService: h.openService }),
}));
vi.mock("@/components/service/QuickAddButton", () => ({
  QuickAddButton: () => <button type="button">ADD</button>,
}));

import { ServiceCard } from "@/components/ServiceCard";

const SERVICE: Service = {
  id: "svc-1",
  name: "Ceiling fan installation",
  categoryId: "c1",
  categoryName: "Electrician",
  description: "Fit a fan",
  price: 499,
  payout: 0,
  duration: "60 mins",
  variants: [],
};

function renderCard() {
  const { container } = render(<ServiceCard service={SERVICE} />);
  const card = screen.getByRole("button", { name: /ceiling fan installation/i });
  const right = container.querySelector<HTMLElement>('[data-card-column="right"]')!;
  const labels = container.querySelectorAll<HTMLElement>("[data-tile-price]");
  return { card, right, labels };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = undefined;
});

describe("ServiceCard price and status placement", () => {
  it("price: 'from ₹X' in the right column above ADD, no status row", () => {
    h.rows = [{ service_id: "svc-1", from_price: 2249, served: true }];
    const { right, labels } = renderCard();
    expect(labels).toHaveLength(1);
    expect(labels[0]).toHaveAttribute("data-tile-price", "price");
    expect(right).toContainElement(labels[0]);
    expect(labels[0].textContent).toBe("from ₹2,249");
    expect(right.lastElementChild).toHaveTextContent("ADD");
  });

  it("fallback (no data): 'from ₹catalogue' in the right column, as today", () => {
    h.rows = [];
    const { right, labels } = renderCard();
    expect(labels).toHaveLength(1);
    expect(right).toContainElement(labels[0]);
    expect(labels[0].textContent).toBe("from ₹499");
  });

  it.each([
    { state: "offline", served: true, kind: "offline", text: "No pros online right now" },
    { state: "coming soon", served: false, kind: "coming-soon", text: "Coming soon" },
  ])(
    "$state: the status sits in its own row, the right column is ADD only",
    ({ served, kind, text }) => {
      h.rows = [{ service_id: "svc-1", from_price: null, served }];
      const { card, right, labels } = renderCard();
      expect(labels).toHaveLength(1);
      const status = labels[0];
      expect(status).toHaveAttribute("data-tile-price", kind);
      expect(status).toHaveTextContent(text);
      // Not in the right column; its own row, right after the main row.
      expect(right).not.toContainElement(status);
      expect(status.parentElement).toBe(card);
      expect(card.children[0].nextElementSibling).toBe(status);
      expect(right.children).toHaveLength(1);
      expect(right).toHaveTextContent(/^ADD$/);
    },
  );

  it("a card tap fires the coming-soon tap once and opens the sheet", async () => {
    h.rows = [{ service_id: "svc-1", from_price: null, served: false }];
    const { card } = renderCard();
    await userEvent.click(card);
    expect(h.tap).toHaveBeenCalledTimes(1);
    expect(h.openService).toHaveBeenCalledWith("svc-1");
  });

  it("a tap on the status line goes through the card", async () => {
    h.rows = [{ service_id: "svc-1", from_price: null, served: true }];
    renderCard();
    await userEvent.click(screen.getByText("No pros online right now"));
    expect(h.tap).toHaveBeenCalledTimes(1);
    expect(h.openService).toHaveBeenCalledWith("svc-1");
  });
});
