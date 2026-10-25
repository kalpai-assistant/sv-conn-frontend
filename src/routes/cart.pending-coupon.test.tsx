/**
 * Cart boot-hook (SVC-347): what the cart does when a banner tap stashed
 * a coupon for later apply.
 *
 * Three invariants cover the whole surface:
 *   1. With items + a pending stash → CouponsSheet auto-opens pre-filled.
 *   2. Without items + a pending stash → the sticky "will apply when you
 *      add items" row renders above the empty state. No sheet.
 *   3. Backwards compat: a hand-typed ``/cart?coupon=CODE`` still opens
 *      the sheet pre-filled — this is the SVC-310 entry point and users
 *      share URLs.
 *
 * CouponsSheet itself is mocked to a stub that renders ``initialCode`` so
 * we're asserting the handoff, not the sheet's internals (those are
 * exercised by CouponsSheet's own test). Same for every heavy dependency
 * (bookAndPay, selected address, the two other picker sheets) — this file
 * is scoped to the pending-coupon integration.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

const navigate = vi.fn();
const useSearchResult = vi.fn<() => { coupon?: string }>(() => ({}));
const cartItems = vi.fn<() => Array<{ serviceId: string }>>(() => []);
let appliedCapture: { code: string; discount: number } | null;

// Capture what CouponsSheet receives — the stub below calls onApplied via
// a test-triggered button so we can assert the clear-on-apply path.
const sheetProps = vi.fn<(props: Record<string, unknown>) => void>();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => navigate,
  useSearch: () => useSearchResult(),
}));

vi.mock("@/lib/cart-context", () => ({
  useCart: () => ({
    items: cartItems(),
    subtotal: 0,
    updateQuantity: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    add: vi.fn(),
    addMany: vi.fn(),
    totalQuantity: 0,
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "test-user", name: "Tester" } }),
}));

vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({ selected: null, setSelectedId: vi.fn() }),
}));

vi.mock("@/hooks/useBookAndPay", () => ({
  useBookAndPay: () => ({ bookAndPay: vi.fn(), isBusy: false }),
}));

vi.mock("@/components/SavedAddressesSheet", () => ({
  SavedAddressesSheet: () => null,
}));
vi.mock("@/components/cart/SlotPickerSheet", () => ({
  SlotPickerSheet: () => null,
}));
vi.mock("@/components/cart/CouponsSheet", () => ({
  CouponsSheet: (props: Record<string, unknown>) => {
    sheetProps(props);
    const onApplied = props.onApplied as (code: string, discount: number) => void;
    return (
      <div data-testid="coupons-sheet">
        <span data-testid="initial-code">{String(props.initialCode ?? "")}</span>
        <button
          type="button"
          onClick={() => onApplied(String(props.initialCode ?? "FIRST20"), 100)}
        >
          mock-apply
        </button>
      </div>
    );
  },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  // Pass-through for the SVC-384 pricing breakdown's chip/panel + stagger.
  motion: new Proxy(
    {},
    {
      get:
        (_t, tag: string) =>
        ({
          children,
          initial: _initial,
          animate: _animate,
          exit: _exit,
          variants: _variants,
          transition: _transition,
          ...rest
        }: Record<string, unknown> & { children?: ReactNode }) => {
          const Tag = tag as keyof JSX.IntrinsicElements;
          return <Tag {...rest}>{children}</Tag>;
        },
    },
  ),
  // Reduced motion is off in the test env unless a test opts in; the chip
  // path doesn't branch on it, so stubbing to ``false`` is enough for this
  // integration test.
  useReducedMotion: () => false,
}));

vi.mock("@/components/AccountAvatar", () => ({
  AccountAvatar: () => null,
}));

import { CartPage } from "@/routes/cart";
import { getPendingCoupon, setPendingCoupon } from "@/lib/pending-coupon";

beforeEach(() => {
  vi.clearAllMocks();
  useSearchResult.mockReturnValue({});
  cartItems.mockReturnValue([]);
  appliedCapture = null;
  window.localStorage.clear();
});

describe("boot: items + pending stash", () => {
  it("auto-opens CouponsSheet with the stashed code pre-filled", () => {
    setPendingCoupon("test-user", "FIRST20");
    cartItems.mockReturnValue([{ serviceId: "svc_1" }]);

    render(<CartPage />);

    expect(screen.getByTestId("coupons-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("initial-code")).toHaveTextContent("FIRST20");
  });

  it("clears the stash on successful apply (never before — a mid-apply error must leave the code recoverable)", async () => {
    setPendingCoupon("test-user", "FIRST20");
    cartItems.mockReturnValue([{ serviceId: "svc_1" }]);

    render(<CartPage />);
    // Pre-apply: stash is still set.
    expect(getPendingCoupon("test-user")).toBe("FIRST20");

    await userEvent.click(screen.getByText("mock-apply"));

    expect(getPendingCoupon("test-user")).toBeNull();
    // Reference the capture so eslint-no-unused-vars doesn't bark — it also
    // documents the shape onApplied provides for the next test writer.
    void appliedCapture;
  });
});

describe("boot: empty cart + pending stash", () => {
  it("renders the sticky 'will apply when you add items' row above the empty state", () => {
    setPendingCoupon("test-user", "FIRST20");
    cartItems.mockReturnValue([]);

    render(<CartPage />);

    expect(screen.getByText(/will apply when you add items/i)).toBeInTheDocument();
    // Code is rendered uppercase as a span inside the row.
    expect(screen.getByText("FIRST20")).toBeInTheDocument();
    // And no sheet — opening it on an empty cart would float above a zero
    // subtotal and look broken.
    expect(screen.queryByTestId("coupons-sheet")).toBeNull();
  });

  it("Clear button drops the stash — the only way to escape without an apply attempt", async () => {
    setPendingCoupon("test-user", "FIRST20");
    cartItems.mockReturnValue([]);

    render(<CartPage />);
    await userEvent.click(screen.getByLabelText("Clear FIRST20"));

    expect(getPendingCoupon("test-user")).toBeNull();
    expect(screen.queryByText(/will apply when you add items/i)).toBeNull();
  });

  it("renders no sticky row when there is nothing stashed — the normal cold cart path", () => {
    cartItems.mockReturnValue([]);

    render(<CartPage />);

    expect(screen.queryByText(/will apply when you add items/i)).toBeNull();
  });
});

describe("backwards compat: ?coupon= handoff (SVC-310)", () => {
  it("still opens the sheet pre-filled when a user hand-types /cart?coupon=FIRST20", () => {
    useSearchResult.mockReturnValue({ coupon: "FIRST20" });
    cartItems.mockReturnValue([{ serviceId: "svc_1" }]);

    render(<CartPage />);

    expect(screen.getByTestId("coupons-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("initial-code")).toHaveTextContent("FIRST20");
  });

  it("URL param wins when both are set — the user's most recent tap is the one we honour", () => {
    setPendingCoupon("test-user", "OLDSTASH");
    useSearchResult.mockReturnValue({ coupon: "FIRST20" });
    cartItems.mockReturnValue([{ serviceId: "svc_1" }]);

    render(<CartPage />);

    expect(screen.getByTestId("initial-code")).toHaveTextContent("FIRST20");
  });
});
