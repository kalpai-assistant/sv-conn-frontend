/**
 * The Pro's location heartbeat (SVC-322): every 30 s while online and on
 * screen, never while offline or backgrounded, and a failed send waits for the
 * next tick rather than retrying into the 10/min rate limit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const { read, send } = vi.hoisted(() => ({ read: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/pro-location", () => ({ readProLocation: read }));
vi.mock("@/hooks/usePro", () => ({ sendProLocation: send }));

import {
  HEARTBEAT_MS,
  recheckProLocation,
  resetProHeartbeatForTests,
  useProHeartbeatHost,
  useProLocationStatus,
} from "@/hooks/useProHeartbeat";

const FIX = { lat: 18.5, lng: 73.8 };

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Let the tick's awaited promises settle under fake timers. */
const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  resetProHeartbeatForTests();
  read.mockReset().mockResolvedValue({ status: "ok", coords: FIX });
  send.mockReset().mockResolvedValue({});
  setVisibility("visible");
});

afterEach(() => vi.useRealTimers());

describe("the heartbeat", () => {
  it("does nothing while the Pro is offline", async () => {
    renderHook(() => useProHeartbeatHost(false));
    await act(async () => vi.advanceTimersByTime(HEARTBEAT_MS * 3));
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends at once on going online, then every 30 s", async () => {
    renderHook(() => useProHeartbeatHost(true));
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(FIX);

    await act(async () => vi.advanceTimersByTime(HEARTBEAT_MS));
    expect(send).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(HEARTBEAT_MS));
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("stops when the Pro goes offline", async () => {
    const { rerender } = renderHook(({ on }) => useProHeartbeatHost(on), {
      initialProps: { on: true },
    });
    await flush();
    rerender({ on: false });
    send.mockClear();
    await act(async () => vi.advanceTimersByTime(HEARTBEAT_MS * 3));
    expect(send).not.toHaveBeenCalled();
  });

  it("pauses in the background and sends at once on return", async () => {
    renderHook(() => useProHeartbeatHost(true));
    await flush();
    send.mockClear();

    setVisibility("hidden");
    await act(async () => vi.advanceTimersByTime(HEARTBEAT_MS * 2));
    expect(send).not.toHaveBeenCalled();

    await act(async () => setVisibility("visible"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed send (a 429) and simply tries on the next tick", async () => {
    send.mockRejectedValueOnce(new Error("429 Too Many Requests"));
    renderHook(() => useProHeartbeatHost(true));
    await flush();
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(HEARTBEAT_MS));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("sends nothing without a fix", async () => {
    read.mockResolvedValue({ status: "off", coords: null });
    renderHook(() => useProHeartbeatHost(true));
    await flush();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the status it publishes", () => {
  it("reports what the last reading found, for the banner", async () => {
    read.mockResolvedValue({ status: "off", coords: null });
    renderHook(() => useProHeartbeatHost(true));
    const status = renderHook(() => useProLocationStatus());
    await flush();
    expect(status.result.current).toBe("off");
  });

  it("keeps the last verdict through a slow fix", async () => {
    read.mockResolvedValueOnce({ status: "ok", coords: FIX });
    renderHook(() => useProHeartbeatHost(true));
    const status = renderHook(() => useProLocationStatus());
    await flush();
    expect(status.result.current).toBe("ok");

    read.mockResolvedValueOnce({ status: "unknown", coords: null });
    await act(async () => vi.advanceTimersByTime(HEARTBEAT_MS));
    expect(status.result.current).toBe("ok");
  });

  it("clears once the Pro goes offline", async () => {
    read.mockResolvedValue({ status: "off", coords: null });
    const host = renderHook(({ on }) => useProHeartbeatHost(on), { initialProps: { on: true } });
    const status = renderHook(() => useProLocationStatus());
    await flush();
    expect(status.result.current).toBe("off");

    host.rerender({ on: false });
    await flush();
    expect(status.result.current).toBeNull();
  });

  it("re-reads on demand, after the Pro turns location on", async () => {
    read.mockResolvedValueOnce({ status: "off", coords: null });
    renderHook(() => useProHeartbeatHost(true));
    const status = renderHook(() => useProLocationStatus());
    await flush();
    expect(status.result.current).toBe("off");

    read.mockResolvedValueOnce({ status: "ok", coords: FIX });
    await act(async () => {
      await recheckProLocation();
    });
    expect(status.result.current).toBe("ok");
    expect(send).toHaveBeenCalledWith(FIX);
  });
});
