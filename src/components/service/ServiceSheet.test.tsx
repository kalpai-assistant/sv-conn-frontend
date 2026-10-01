/**
 * The service sheet's scope sections (SVC-341).
 *
 * "What's involved" (steps) is collapsed by default and says how many steps
 * are behind it; "Not included" (exclusions) is always open, because it is
 * the list that heads off a post-service dispute. Either section, or both,
 * may be absent — and an absent section must leave nothing behind, not an
 * orphan heading or an empty card.
 *
 * `useServiceDetail` is mocked with the shape it guarantees (always arrays —
 * its own tests cover null / [] / missing). What these tests cannot see:
 * whether expanding inside the sheet's scroll traps it on an Android WebView,
 * or how the amber reads in dark mode. Those need the debug APK.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Service } from "@/lib/mock-data";
import type { UI_ServiceDetail } from "@/hooks/useApi";

const SERVICE: Service = {
  id: "s1",
  name: "Full room painting",
  categoryId: "c1",
  categoryName: "Painting",
  description: "Two coats of emulsion on all four walls.",
  price: 4999,
  payout: 4000,
  duration: "6 hrs",
  variants: [],
};

// A related-service tap swaps the sheet's `serviceId` on the same mounted
// instance (service-sheet-context renders it without a key).
const RELATED: Service = { ...SERVICE, id: "s2", name: "Single wall painting" };

const STEPS = ["Inspect walls", "Cover furniture", "Sand + prime", "Two coats", "Clean up"];
const EXCLUSIONS = ["Ceiling painting", "Moving heavy furniture", "Crack repair"];

let detail: UI_ServiceDetail | undefined;

vi.mock("@/hooks/useApi", () => ({
  useServices: () => ({
    data: [SERVICE, RELATED],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCategories: () => ({ data: [] }),
  useServiceDetail: () => ({ data: detail }),
}));
vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({ items: [], add: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useLockBodyScroll", () => ({ useLockBodyScroll: vi.fn() }));
vi.mock("@/lib/back-interceptor", () => ({ pushBackInterceptor: () => () => {} }));
vi.mock("@/components/service/ServiceBanner", () => ({ ServiceBanner: () => null }));
vi.mock("framer-motion", () => ({
  motion: {
    // Strip the gesture/animation props so they don't land on a DOM node.
    div: ({
      children,
      className,
      onClick,
    }: {
      children?: ReactNode;
      className?: string;
      onClick?: () => void;
    }) => (
      <div className={className} onClick={onClick}>
        {children}
      </div>
    ),
  },
  useMotionValue: () => ({}),
}));

import { ServiceSheet } from "@/components/service/ServiceSheet";

const withDetail = (steps: string[], exclusions: string[]): UI_ServiceDetail => ({
  related: { hook: [], upsell: [], related: [] },
  steps,
  exclusions,
});

const renderSheet = () => render(<ServiceSheet serviceId="s1" onClose={vi.fn()} />);

beforeEach(() => {
  detail = undefined;
  // The sheet resets its scroll on every service swap; jsdom has no layout,
  // so no Element.scrollTo either.
  Element.prototype.scrollTo = vi.fn();
});

describe("both populated", () => {
  it("renders steps collapsed with a count, and exclusions open", () => {
    detail = withDetail(STEPS, EXCLUSIONS);
    renderSheet();

    const trigger = screen.getByRole("button", { name: /what's involved/i });
    expect(trigger).toHaveTextContent("5 steps");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Inspect walls")).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Not included" })).toBeInTheDocument();
    for (const item of EXCLUSIONS) expect(screen.getByText(item)).toBeInTheDocument();
  });

  it("expands to the numbered steps, in order", async () => {
    detail = withDetail(STEPS, EXCLUSIONS);
    renderSheet();

    const trigger = screen.getByRole("button", { name: /what's involved/i });
    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const ol = trigger.closest("section")!.querySelector("ol")!;
    const items = within(ol).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(STEPS.map((s, i) => `${i + 1}${s}`));

    await userEvent.click(trigger);
    expect(screen.queryByText("Inspect walls")).not.toBeInTheDocument();
  });

  it("opens collapsed again after a related-service swap", async () => {
    detail = withDetail(STEPS, EXCLUSIONS);
    const { rerender } = renderSheet();
    await userEvent.click(screen.getByRole("button", { name: /what's involved/i }));
    expect(screen.getByText("Inspect walls")).toBeInTheDocument();

    rerender(<ServiceSheet serviceId="s2" onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: /what's involved/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("Inspect walls")).not.toBeInTheDocument();
  });

  it("says '1 step', not '1 steps'", () => {
    detail = withDetail(["Only step"], []);
    renderSheet();
    expect(screen.getByRole("button", { name: /what's involved/i })).toHaveTextContent(/1 step$/);
  });
});

describe("one populated", () => {
  it("renders only steps when there are no exclusions", () => {
    detail = withDetail(STEPS, []);
    renderSheet();
    expect(screen.getByRole("button", { name: /what's involved/i })).toBeInTheDocument();
    expect(screen.queryByText("Not included")).not.toBeInTheDocument();
  });

  it("renders only exclusions when there are no steps", () => {
    detail = withDetail([], EXCLUSIONS);
    renderSheet();
    expect(screen.queryByText(/what's involved/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not included" })).toBeInTheDocument();
  });
});

describe("neither populated", () => {
  it.each([
    ["the detail response is empty", () => withDetail([], [])],
    ["the detail query hasn't landed yet", () => undefined],
  ])("leaves no heading, list or wrapper when %s", (_label, make) => {
    detail = make();
    const { container } = renderSheet();

    expect(screen.queryByText(/what's involved/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Not included")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    // The rest of the sheet still renders — this isn't an empty-sheet pass.
    expect(screen.getByText(SERVICE.description)).toBeInTheDocument();
    // No leftover section shell: the only <section>s are related rails, and
    // there are none here.
    expect(container.querySelector("section")).toBeNull();
  });
});
