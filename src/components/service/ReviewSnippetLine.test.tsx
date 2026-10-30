/**
 * SVC-388 — the review snippet on service cards.
 *
 * Pins the four shapes the backend can send (snippet, null, field missing,
 * null reviewer name) through `mapService` and onto both card variants. The
 * "no layout jump" acceptance is a flex-stretch property of the rail and is
 * checked on a device, not here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Service } from "@/lib/mock-data";
import { mapService } from "@/hooks/useApi";
import { ReviewSnippetLine } from "./ReviewSnippetLine";
import { ServiceCard } from "@/components/ServiceCard";
import { ServiceCardCompact } from "@/components/home/ServiceCardCompact";

vi.mock("@/lib/service-sheet-context", () => ({
  useServiceSheet: () => ({ openService: vi.fn(), closeService: vi.fn(), openServiceId: null }),
}));
vi.mock("@/components/service/QuickAddButton", () => ({ QuickAddButton: () => null }));

// Wed 11 Nov 2026, 14:00 local, so "2 days ago" is stable.
const NOW = new Date(2026, 10, 11, 14, 0);
const TWO_DAYS_AGO = new Date(2026, 10, 9, 10, 0).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

type ApiService = Parameters<typeof mapService>[0];

const API_SERVICE = {
  id: "s1",
  name: "Deep clean",
  category_id: "c1",
  description: null,
  base_price: 999,
  duration_minutes: 120,
  variants: [],
} as unknown as ApiService;

const SERVICE: Service = {
  id: "s1",
  name: "Deep clean",
  categoryId: "c1",
  categoryName: "Cleaning",
  description: "",
  price: 999,
  payout: 0,
  duration: "120 mins",
  variants: [],
};

const SNIPPET = {
  text: "Finally the clean I like.",
  reviewerFirstName: "Priya",
  createdAt: TWO_DAYS_AGO,
};

describe("mapService — latest_review_snippet", () => {
  it("maps a snippet into the UI shape", () => {
    const s = mapService(
      {
        ...API_SERVICE,
        latest_review_snippet: {
          text: "Finally the clean I like.",
          reviewer_first_name: "Priya",
          created_at: TWO_DAYS_AGO,
        },
      },
      [],
    );
    expect(s.reviewSnippet).toEqual(SNIPPET);
  });

  it("keeps null as null", () => {
    expect(
      mapService({ ...API_SERVICE, latest_review_snippet: null }, []).reviewSnippet,
    ).toBeNull();
  });

  it("reads a backend without the field as no snippet", () => {
    expect(mapService(API_SERVICE, []).reviewSnippet).toBeNull();
  });
});

describe("ReviewSnippetLine", () => {
  it("renders the quote clamped to two lines, in italics", () => {
    render(<ReviewSnippetLine snippet={SNIPPET} />);
    const quote = screen.getByText("“Finally the clean I like.”");
    expect(quote.className).toContain("line-clamp-2");
    expect(quote.closest(".italic")).not.toBeNull();
  });

  it("puts the attribution on its own truncated line, outside the clamped quote", () => {
    // A long quote fills both clamped lines on the rail card; inside the same
    // element the name and date would be clamped away.
    render(<ReviewSnippetLine snippet={SNIPPET} />);
    const quote = screen.getByText("“Finally the clean I like.”");
    const attribution = screen.getByText("— Priya, 2 days ago");
    expect(attribution).not.toBe(quote);
    expect(quote.contains(attribution)).toBe(false);
    expect(attribution.className).toContain("truncate");
    expect(attribution.className).not.toContain("line-clamp");
  });

  it("attributes a null reviewer name to Customer", () => {
    render(<ReviewSnippetLine snippet={{ ...SNIPPET, reviewerFirstName: null }} />);
    expect(screen.getByText("— Customer, 2 days ago")).toBeTruthy();
  });

  it("renders nothing for null or a missing snippet", () => {
    const { container: nullBox } = render(<ReviewSnippetLine snippet={null} />);
    expect(nullBox.innerHTML).toBe("");
    const { container: missingBox } = render(<ReviewSnippetLine snippet={undefined} />);
    expect(missingBox.innerHTML).toBe("");
  });
});

describe.each([
  ["ServiceCard", (s: Service) => <ServiceCard service={s} />],
  ["ServiceCardCompact", (s: Service) => <ServiceCardCompact service={s} />],
])("%s", (_name, renderCard) => {
  it("shows the snippet when the service has one", () => {
    render(renderCard({ ...SERVICE, reviewSnippet: SNIPPET }));
    expect(screen.getByText(/Finally the clean I like\./)).toBeTruthy();
  });

  it("shows no snippet and no placeholder when there is none", () => {
    const { container } = render(renderCard({ ...SERVICE, reviewSnippet: null }));
    expect(container.textContent).not.toMatch(/“|Customer|ago/);
    expect(container.querySelector(".italic")).toBeNull();
  });
});
