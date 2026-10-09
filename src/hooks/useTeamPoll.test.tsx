/**
 * SVC-326: My Team polls the team list only while the SP has switched off
 * taking jobs, in step with the "nobody available" banner, so a Pro's dot turns
 * green when the banner clears rather than on the next visit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTeam } from "@/hooks/useTeam";

const self = (accepts_direct_jobs: boolean) => [
  { id: "me", is_self: true, accepts_direct_jobs },
  { id: "asha", is_self: false, accepts_direct_jobs: true },
];

function respondWith(body: unknown) {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderTeam(options?: { pollWhileSelfOff?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useTeam(true, options), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useTeam polling (SVC-326)", () => {
  it("polls while the SP is switched off", async () => {
    const fetchMock = respondWith(self(false));
    const { result } = renderTeam({ pollWhileSelfOff: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("doesn't poll while the SP takes jobs", async () => {
    const fetchMock = respondWith(self(true));
    const { result } = renderTeam({ pollWhileSelfOff: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("doesn't poll for callers that didn't ask (picker, job screen)", async () => {
    const fetchMock = respondWith(self(false));
    const { result } = renderTeam();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
