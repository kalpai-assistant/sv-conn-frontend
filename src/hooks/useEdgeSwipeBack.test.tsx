/**
 * SVC-391: the iOS left-edge-swipe-back hook.
 *
 * The hook is behavioural — it attaches pointer listeners on `document` and
 * decides on each pointerdown/move whether to navigate. These tests drive it
 * through a tiny host component and assert against two spies: the
 * back-interceptor stack and `router.history.back`. Capacitor's platform
 * check and the pathname blocklist are both mocked so each test picks one
 * combination to exercise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const platformMock = vi.hoisted(() => ({ current: "ios" as string, native: true }));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => platformMock.native,
    getPlatform: () => platformMock.current,
  },
}));

import { useEdgeSwipeBack } from "@/hooks/useEdgeSwipeBack";
import { pushBackInterceptor } from "@/lib/back-interceptor";

type FakeRouter = { history: { canGoBack: () => boolean; back: ReturnType<typeof vi.fn> } };

function makeRouter({ canGoBack = true } = {}): FakeRouter {
  return { history: { canGoBack: () => canGoBack, back: vi.fn() } };
}

function Host({ router, pathname }: { router: FakeRouter; pathname: string }) {
  // The hook's signature expects a TanStack Router — this mock stands in for
  // one; the hook only touches `.history.canGoBack` and `.history.back`.
  useEdgeSwipeBack(router as unknown as Parameters<typeof useEdgeSwipeBack>[0], pathname);
  return null;
}

function pointerDown(target: Element, clientX: number, clientY: number): void {
  // Dispatch from the element itself — `target` is read-only on Event and is
  // set by the browser during dispatch. `clientX`/`clientY` are not on the
  // base Event; attaching them via Object.assign is fine because the hook
  // reads them off the handler argument, not off a prototype.
  const ev = new Event("pointerdown", { bubbles: true });
  Object.assign(ev, { clientX, clientY });
  target.dispatchEvent(ev);
}

function pointerMove(target: Element, clientX: number, clientY: number): void {
  const ev = new Event("pointermove", { bubbles: true });
  Object.assign(ev, { clientX, clientY });
  target.dispatchEvent(ev);
}

beforeEach(() => {
  platformMock.current = "ios";
  platformMock.native = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useEdgeSwipeBack", () => {
  it("navigates back on a left-edge swipe that commits past the threshold", () => {
    const router = makeRouter();
    render(<Host router={router} pathname="/bookings" />);
    const target = document.body;

    pointerDown(target, 5, 300);
    pointerMove(target, 80, 310);

    expect(router.history.back).toHaveBeenCalledTimes(1);
  });

  it("ignores swipes that start outside the left edge", () => {
    const router = makeRouter();
    render(<Host router={router} pathname="/bookings" />);
    const target = document.body;

    // 40px in — past the EDGE_PX guard.
    pointerDown(target, 40, 300);
    pointerMove(target, 120, 310);

    expect(router.history.back).not.toHaveBeenCalled();
  });

  it("hands off to the back-interceptor stack when one is registered", () => {
    const router = makeRouter();
    const handler = vi.fn(() => true);
    const unregister = pushBackInterceptor(handler);
    render(<Host router={router} pathname="/bookings" />);

    pointerDown(document.body, 5, 300);
    pointerMove(document.body, 80, 310);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(router.history.back).not.toHaveBeenCalled();
    unregister();
  });

  it("is a no-op on blocked routes (eg /cart during Razorpay dwell)", () => {
    const router = makeRouter();
    render(<Host router={router} pathname="/cart" />);

    pointerDown(document.body, 5, 300);
    pointerMove(document.body, 80, 310);

    expect(router.history.back).not.toHaveBeenCalled();
  });

  it("is a no-op on Android (the system owns the gesture there)", () => {
    platformMock.current = "android";
    const router = makeRouter();
    render(<Host router={router} pathname="/bookings" />);

    pointerDown(document.body, 5, 300);
    pointerMove(document.body, 80, 310);

    expect(router.history.back).not.toHaveBeenCalled();
  });

  it("is a no-op on the web (the browser owns the gesture)", () => {
    platformMock.native = false;
    const router = makeRouter();
    render(<Host router={router} pathname="/bookings" />);

    pointerDown(document.body, 5, 300);
    pointerMove(document.body, 80, 310);

    expect(router.history.back).not.toHaveBeenCalled();
  });

  it("rejects a diagonal swipe that reads as a scroll gesture", () => {
    const router = makeRouter();
    render(<Host router={router} pathname="/bookings" />);

    pointerDown(document.body, 5, 300);
    // 80px right, 200px down — angle well past MAX_ANGLE_RATIO.
    pointerMove(document.body, 85, 500);

    expect(router.history.back).not.toHaveBeenCalled();
  });

  it("skips when the swipe begins inside a horizontally scrollable region", () => {
    const router = makeRouter();
    render(<Host router={router} pathname="/" />);

    // Build a scroller with its own left edge (promo carousel shape).
    const rail = document.createElement("div");
    rail.style.overflowX = "auto";
    Object.defineProperty(rail, "scrollWidth", { value: 800, configurable: true });
    Object.defineProperty(rail, "clientWidth", { value: 400, configurable: true });
    document.body.appendChild(rail);

    pointerDown(rail, 5, 300);
    pointerMove(rail, 90, 305);

    expect(router.history.back).not.toHaveBeenCalled();
  });

  it("does nothing on the home root when history is empty", () => {
    // No interceptor + canGoBack === false. The hardware-back path would
    // offer "press back again to exit" here, but a swipe to exit is
    // surprising, so the gesture is a no-op.
    const router = makeRouter({ canGoBack: false });
    render(<Host router={router} pathname="/" />);

    pointerDown(document.body, 5, 300);
    pointerMove(document.body, 80, 310);

    expect(router.history.back).not.toHaveBeenCalled();
  });
});
