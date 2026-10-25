/**
 * SVC-384 — bill-breakdown chip/panel behaviour.
 *
 * The three invariants we hold:
 *   1. Collapsed state: the chip is visible, the panel is not. Tap →
 *      panel is visible, chip is not. ("Chip + panel never both visible"
 *      is explicit in the ticket.)
 *   2. Expanded state renders every line the ticket spells out, each with
 *      the exact ``formatRupees`` output we expect. Optional lines
 *      (discount, convenience fee) only appear when non-zero.
 *   3. ``prefers-reduced-motion: reduce`` collapses the stagger — reused
 *      framer-motion's ``useReducedMotion`` hook, so the assertion lands
 *      on the hook rather than counting DOM transition tokens.
 *
 * We don't test the exact timing of the stagger (framer-motion owns that),
 * only that the hook signal is read and routed correctly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useReducedMotionMock = vi.fn<() => boolean | null>(() => false);

vi.mock("framer-motion", async () => {
  const React = await import("react");
  type MotionProps = React.HTMLAttributes<HTMLElement> & {
    children?: React.ReactNode;
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    variants?: unknown;
    transition?: unknown;
  };
  const stripMotionProps = ({
    initial: _initial,
    animate: _animate,
    exit: _exit,
    variants: _variants,
    transition: _transition,
    ...rest
  }: MotionProps) => rest;
  // Mocked to pass children straight through — the component tree we
  // assert against is the final DOM, not the pre-animation shell.
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: new Proxy(
      {},
      {
        get:
          (_t, tag: string) =>
          ({ children, ...rest }: MotionProps) =>
            React.createElement(tag, stripMotionProps(rest), children),
      },
    ),
    useReducedMotion: () => useReducedMotionMock(),
  };
});

import { PricingBreakdown } from "./PricingBreakdown";

beforeEach(() => {
  useReducedMotionMock.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("collapsed state", () => {
  it("renders the chip only; the panel is absent", () => {
    render(<PricingBreakdown subtotal={1000} discount={0} />);

    expect(screen.getByTestId("pricing-breakdown-chip")).toBeInTheDocument();
    expect(screen.queryByTestId("pricing-breakdown-panel")).toBeNull();
  });

  it("the chip shows the current total so the user can read it without expanding", () => {
    render(<PricingBreakdown subtotal={1200} discount={200} />);

    const chip = screen.getByTestId("pricing-breakdown-chip");
    // 1200 − 200 = 1000; ``formatRupees`` renders ``₹1,000``.
    expect(chip).toHaveTextContent("₹1,000");
    expect(chip).toHaveTextContent("See breakdown");
  });
});

describe("tap → expand", () => {
  it("hides the chip and reveals every expected line", async () => {
    render(<PricingBreakdown subtotal={1000} discount={100} couponCode="FIRST20" />);

    await userEvent.click(screen.getByTestId("pricing-breakdown-chip"));

    expect(screen.getByTestId("pricing-breakdown-panel")).toBeInTheDocument();
    // Ticket's explicit "don't let the chip stay visible under the panel".
    expect(screen.queryByTestId("pricing-breakdown-chip")).toBeNull();

    // Service subtotal: raw ``₹1,000`` via Indian grouping.
    const subtotal = screen.getByTestId("pricing-line-subtotal");
    expect(subtotal).toHaveTextContent("Service subtotal");
    expect(subtotal).toHaveTextContent("₹1,000");

    // Discount uses the ticket's ``(−₹X)`` format and the coupon code.
    const discount = screen.getByTestId("pricing-line-discount");
    expect(discount).toHaveTextContent("Discount (FIRST20)");
    expect(discount).toHaveTextContent("(−₹100)");

    // GST line: 1000 × 0.18 / 1.18 = 152.54… → rounded to 153.
    const gst = screen.getByTestId("pricing-line-gst");
    expect(gst).toHaveTextContent("GST (18%, incl.)");
    expect(gst).toHaveTextContent("₹153");

    const total = screen.getByTestId("pricing-line-total");
    expect(total).toHaveTextContent("Total");
    // Total is unchanged by the GST informational line: 1000 − 100 = 900.
    expect(total).toHaveTextContent("₹900");
  });

  it("omits the discount line when no coupon applied", async () => {
    render(<PricingBreakdown subtotal={500} discount={0} />);

    await userEvent.click(screen.getByTestId("pricing-breakdown-chip"));

    expect(screen.queryByTestId("pricing-line-discount")).toBeNull();
    expect(screen.getByTestId("pricing-line-subtotal")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-line-gst")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-line-total")).toHaveTextContent("₹500");
  });

  it("omits the convenience-fee line when zero (the default)", async () => {
    render(<PricingBreakdown subtotal={500} discount={0} />);

    await userEvent.click(screen.getByTestId("pricing-breakdown-chip"));

    expect(screen.queryByTestId("pricing-line-convenience")).toBeNull();
  });

  it("renders the convenience-fee line when positive and adds it to the total", async () => {
    render(<PricingBreakdown subtotal={500} discount={0} convenienceFee={25} />);

    await userEvent.click(screen.getByTestId("pricing-breakdown-chip"));

    const fee = screen.getByTestId("pricing-line-convenience");
    expect(fee).toHaveTextContent("Convenience fee");
    expect(fee).toHaveTextContent("₹25");
    expect(screen.getByTestId("pricing-line-total")).toHaveTextContent("₹525");
  });
});

describe("tap → collapse", () => {
  it("hides breakdown button returns the user to the chip view", async () => {
    render(<PricingBreakdown subtotal={1000} discount={0} />);

    await userEvent.click(screen.getByTestId("pricing-breakdown-chip"));
    expect(screen.getByTestId("pricing-breakdown-panel")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /hide breakdown/i }));
    expect(screen.queryByTestId("pricing-breakdown-panel")).toBeNull();
    expect(screen.getByTestId("pricing-breakdown-chip")).toBeInTheDocument();
  });
});

describe("prefers-reduced-motion", () => {
  it("reads the hook — the stagger payload is routed through its return value", async () => {
    useReducedMotionMock.mockReturnValue(true);

    render(<PricingBreakdown subtotal={1000} discount={0} />);
    // Hook is read at least once on mount.
    expect(useReducedMotionMock).toHaveBeenCalled();

    // End state remains identical — the user still sees every line.
    await userEvent.click(screen.getByTestId("pricing-breakdown-chip"));
    expect(screen.getByTestId("pricing-line-subtotal")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-line-gst")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-line-total")).toBeInTheDocument();
  });
});
