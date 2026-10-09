/**
 * Accept always opts in to the pick step (SVC-321), and the backend decides:
 * 200 is the claim (a solo SP, unchanged), 202 is "pick a Pro" with nothing
 * claimed. Reading a 202 as a win would tell a team SP they had a job nobody
 * was assigned to — the exact failure the opt-in header exists to prevent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { acceptErrorMessage, useAcceptOffer } from "@/hooks/useBookingOffer";
import { ApiError } from "@/lib/api";

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function accept() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const { result } = renderHook(() => useAcceptOffer(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  result.current.mutate("b1");
  return result;
}

afterEach(() => vi.unstubAllGlobals());

const PROS = [
  {
    id: "p1",
    display_name: "Asha",
    profile_photo_url: null,
    is_self: true,
    busy: false,
    accepts_direct_jobs: true,
  },
];

describe("useAcceptOffer", () => {
  it("sends X-Team-Pick on every accept", async () => {
    const fetchMock = respond(200, { id: "b1" });
    const result = accept();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/bookings\/b1\/accept$/);
    expect(init).toMatchObject({ method: "PATCH", headers: { "X-Team-Pick": "1" } });
  });

  it("200 is the claim", async () => {
    respond(200, { id: "b1" });
    const result = accept();
    await waitFor(() => expect(result.current.data).toEqual({ outcome: "accepted" }));
  });

  it("202 is the picker, with the team from the body", async () => {
    respond(202, { booking_id: "b1", pros: PROS });
    const result = accept();
    await waitFor(() => expect(result.current.data).toEqual({ outcome: "pick", pros: PROS }));
  });

  it("410 is still a quiet 'taken'", async () => {
    respond(410, { message: "This booking is no longer available" });
    const result = accept();
    await waitFor(() => expect(result.current.data).toEqual({ outcome: "taken" }));
  });

  it("409 SELF_NOT_TAKING_JOBS is a real error the card explains (SVC-326)", async () => {
    respond(409, { message: "server copy", code: "SELF_NOT_TAKING_JOBS" });
    const result = accept();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(acceptErrorMessage(result.current.error)).toMatch(/switch it back on in my team/i);
  });
});

describe("acceptErrorMessage", () => {
  it("keeps the server message for anything else", () => {
    expect(acceptErrorMessage(new ApiError(409, "Booking is en route"))).toBe(
      "Booking is en route",
    );
    expect(acceptErrorMessage("??")).toBe("Could not accept this job.");
  });
});
