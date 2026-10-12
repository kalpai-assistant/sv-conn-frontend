/**
 * The `navigator.onLine` wrapper (SVC-351).
 *
 * Three properties are load-bearing and each has shipped as a bug on this
 * surface before: a stuck `true` reading navigator statically rather than
 * subscribing (the offline-at-cold-start variant), a stuck `false` reading
 * state at mount but ignoring reconnects (the "I came back online but the
 * app still says I'm offline" variant), and a listener left attached across
 * unmounts (the leaky-event variant that only shows up under test rerenders).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * jsdom defines `navigator.onLine` with no setter, so the tests swap it out
 * at the property level rather than assigning. The teardown below restores
 * the original descriptor so one test's offline window cannot bleed into the
 * next.
 */
let originalOnLineDescriptor: PropertyDescriptor | undefined;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  originalOnLineDescriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(navigator),
    "onLine",
  );
  setOnline(true);
});

afterEach(() => {
  if (originalOnLineDescriptor) {
    Object.defineProperty(Object.getPrototypeOf(navigator), "onLine", originalOnLineDescriptor);
  }
});

describe("useOnlineStatus", () => {
  it("reports offline on mount when the browser already is", () => {
    // The fast path. A device opened in airplane mode must not need to wait
    // for an event — the gate's offline branch is painted on first render or
    // the user sees the infinite spinner this hook exists to replace.
    setOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("reports online by default", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("flips to offline when the browser fires an offline event", () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current).toBe(false);
  });

  it("flips back to online on reconnect", () => {
    // The retry side of the loop. Without this a user who recovers signal
    // stays on the "You're offline" screen until they reload — which is the
    // kind of soft lockout this ticket flagged next to the infinite spinner.
    setOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(true);
  });

  it("unsubscribes on unmount so listeners do not accumulate", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useOnlineStatus());
    const added = addSpy.mock.calls
      .filter(([type]) => type === "online" || type === "offline")
      .map(([type]) => type);
    expect(added.sort()).toEqual(["offline", "online"]);

    unmount();
    const removed = removeSpy.mock.calls
      .filter(([type]) => type === "online" || type === "offline")
      .map(([type]) => type);
    expect(removed.sort()).toEqual(["offline", "online"]);
  });
});
