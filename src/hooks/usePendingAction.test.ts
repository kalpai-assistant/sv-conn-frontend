/**
 * The undo window, as a shared rule (SVC-295, SVC-274).
 *
 * Extracted from `IncomingRequestHost`, where it guarded Ignore. The same
 * problem appears on job completion, which pushes a notification to the
 * customer, queues a cash-payment task and flips the column the payout query
 * reads — none of which can be undone after the fact.
 *
 * So every test here is really about one property: **nothing leaves until the
 * window closes.** An undo that fires the request and then apologises is not an
 * undo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePendingAction, UNDO_WINDOW_MS } from "@/hooks/usePendingAction";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("holding the action", () => {
  it("sends nothing while the window is open", () => {
    // The whole point. A request sent here cannot be taken back.
    const run = vi.fn();
    const { result } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", run));
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS - 1));

    expect(run).not.toHaveBeenCalled();
  });

  it("fires once the window closes", () => {
    const run = vi.fn();
    const { result } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", run));
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS));

    expect(run).toHaveBeenCalledOnce();
  });

  it("reports what is mid-window, so a caller can show it", () => {
    const { result } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", vi.fn()));
    expect(result.current.isPending("a")).toBe(true);
    expect(result.current.isPending("b")).toBe(false);

    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS));
    expect(result.current.isPending("a")).toBe(false);
  });
});

describe("undoing", () => {
  it("never sends it at all", () => {
    // Not "sent then retracted" — never sent. There is no endpoint that could
    // unsend the push or recall the queued task.
    const run = vi.fn();
    const { result } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", run));
    act(() => result.current.cancel("a"));
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS * 3));

    expect(run).not.toHaveBeenCalled();
  });

  it("is harmless on something that was never scheduled", () => {
    const { result } = renderHook(() => usePendingAction());
    expect(() => act(() => result.current.cancel("nope"))).not.toThrow();
  });
});

describe("more than one at a time", () => {
  it("keeps a separate window per id", () => {
    // Two offers dismissed in quick succession, or a job completed while
    // another is scheduled. A single shared timer would let the second cancel
    // the first one's pending action.
    const a = vi.fn();
    const b = vi.fn();
    const { result } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", a));
    act(() => void vi.advanceTimersByTime(1_000));
    act(() => result.current.schedule("b", b));
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS));

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("undoing one leaves the other held", () => {
    const a = vi.fn();
    const b = vi.fn();
    const { result } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", a));
    act(() => result.current.schedule("b", b));
    act(() => result.current.cancel("a"));
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS));

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it("treats a double tap as one intent", () => {
    // Re-scheduling the same id replaces the timer rather than stacking a
    // second, so the action cannot fire twice for one decision.
    const run = vi.fn();
    const { result } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", run));
    act(() => result.current.schedule("a", run));
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS * 2));

    expect(run).toHaveBeenCalledOnce();
  });
});

describe("flushing early", () => {
  it("fires now rather than waiting out the window", () => {
    // A swiped-away toast: the user saw it and did not undo, so waiting adds
    // nothing.
    const run = vi.fn();
    const { result } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", run));
    act(() => result.current.flush("a"));

    expect(run).toHaveBeenCalledOnce();
  });

  it("does not fire a second time when the window would have closed", () => {
    const run = vi.fn();
    const { result } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", run));
    act(() => result.current.flush("a"));
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS * 2));

    expect(run).toHaveBeenCalledOnce();
  });
});

describe("leaving with something held", () => {
  it("fires rather than dropping it", () => {
    // Logging out or navigating away mid-window. Dropping it would mean the
    // offer returns on the next poll as though nothing was tapped, or the job
    // stays open after the provider watched it complete.
    const run = vi.fn();
    const { result, unmount } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", run));
    expect(run).not.toHaveBeenCalled();

    unmount();

    expect(run).toHaveBeenCalledOnce();
  });

  it("does not fire something already undone", () => {
    const run = vi.fn();
    const { result, unmount } = renderHook(() => usePendingAction());

    act(() => result.current.schedule("a", run));
    act(() => result.current.cancel("a"));
    unmount();

    expect(run).not.toHaveBeenCalled();
  });
});
