/**
 * The re-pick list's team fetch (SVC-361). `?booking_id=` makes the backend
 * leave out whoever declined that booking. Pinned: the param goes out, the
 * plain team call doesn't change, and the filtered entry sits under the team
 * key, so the invalidations that refresh the team (a 409 from /assign, a
 * removal) refresh it too.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TEAM_QUERY_KEY, useTeam } from "@/hooks/useTeam";

function respond(body: unknown) {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderTeam(bookingId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useTeam(true, { bookingId }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, result };
}

afterEach(() => vi.unstubAllGlobals());

describe("useTeam", () => {
  it("asks for the team without the booking's decliners", async () => {
    const fetchMock = respond([]);
    const { client, result } = renderTeam("b 1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/providers\/me\/team\?booking_id=b%201$/);
    expect(client.getQueryData([...TEAM_QUERY_KEY, "booking", "b 1"])).toEqual([]);
  });

  it("refetches on a team invalidation", async () => {
    const fetchMock = respond([]);
    const { client, result } = renderTeam("b1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await client.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("leaves the plain team call as it was", async () => {
    const fetchMock = respond([]);
    const { client, result } = renderTeam();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/providers\/me\/team$/);
    expect(client.getQueryData(TEAM_QUERY_KEY)).toEqual([]);
  });
});
