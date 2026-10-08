/**
 * `useProMe` — the question the root gate asks of every consumer (SVC-322).
 *
 * While it is pending, the gate holds "/" on a spinner. So the hook must settle
 * fast for the customers it is not about: a 404 is an answer ("not a Pro"),
 * and a 5xx or a dropped connection must resolve to an error at once rather
 * than ride the app's default 3 retries (~7 s of spinner for everyone).
 *
 * The client here is a plain `new QueryClient()` on purpose — the app's own
 * defaults, the ones that caused the bug. A test client with `retry: false`
 * would pass whether or not the hook sets it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import {
  PRO_JOBS_POLL_MS,
  isTeamPro,
  sendProLocation,
  useDeclineProJob,
  useProComplete,
  useProEnRoute,
  useProJobs,
  useProMe,
  useProStart,
  useSubmitProKyc,
  type ProMe,
} from "@/hooks/usePro";

const PRO: ProMe = {
  id: "pro-1",
  user_id: "user-1",
  display_name: "Asha",
  profile_photo_url: null,
  is_self: false,
  is_online: false,
  kyc_status: "verified",
  kyc_rejection_reason: null,
  last_location_at: null,
  service_provider: {
    user_id: "sp-1",
    business_name: "Sharma Electricals",
    business_image_url: null,
  },
};

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient();
  apiFetch.mockReset();
});

afterEach(() => client.clear());

describe("useProMe", () => {
  it("returns the Pro row for a Pro", async () => {
    apiFetch.mockResolvedValue(PRO);
    const { result } = renderHook(() => useProMe("user-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(PRO);
    expect(apiFetch).toHaveBeenCalledWith("/pros/me");
  });

  it("answers null, not an error, for someone who is not a Pro", async () => {
    apiFetch.mockRejectedValue(new ApiError(404, "Not a Pro", undefined, "NOT_A_PRO"));
    const { result } = renderHook(() => useProMe("user-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("settles a 500 as an error at once, without retrying", async () => {
    apiFetch.mockRejectedValue(new ApiError(500, "Internal Server Error"));
    const { result } = renderHook(() => useProMe("user-1"), { wrapper });

    // Well inside the first retry's 1 s backoff: if this passes, nobody sat
    // on the gate's spinner waiting for retries.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 500 });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("settles a dropped connection as an error at once (offline boot)", async () => {
    apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useProMe("user-1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 500 });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("asks again when the network comes back after a failure (found on device)", async () => {
    // React Query's reconnect refetch misses an app launched offline: its
    // online manager assumes "online" from the start, so it sees no change.
    apiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useProMe("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 500 });

    apiFetch.mockResolvedValueOnce(PRO);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(result.current.data).toEqual(PRO));
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("does not ask again on reconnect when it already has an answer", async () => {
    apiFetch.mockResolvedValueOnce(PRO);
    const { result } = renderHook(() => useProMe("user-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    window.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 50));

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("does not ask before there is a user", () => {
    renderHook(() => useProMe(undefined), { wrapper });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("keeps each account's answer apart", async () => {
    // Nothing clears the query cache on logout; a second account on the same
    // phone must not read the first one's "you are a Pro".
    apiFetch.mockResolvedValueOnce(PRO);
    const first = renderHook(() => useProMe("user-1"), { wrapper });
    await waitFor(() => expect(first.result.current.data).toEqual(PRO));

    apiFetch.mockRejectedValueOnce(new ApiError(404, "Not a Pro", undefined, "NOT_A_PRO"));
    const second = renderHook(() => useProMe("user-2"), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(second.result.current.data).toBeNull();
  });
});

describe("isTeamPro", () => {
  it("is a team Pro only with a row that is not the SP's own", () => {
    expect(isTeamPro(PRO)).toBe(true);
    // A solo SP's Pro-for-self: they work from the provider app.
    expect(isTeamPro({ ...PRO, is_self: true })).toBe(false);
    expect(isTeamPro(null)).toBe(false);
    expect(isTeamPro(undefined)).toBe(false);
  });
});

describe("the Pro's job actions (part 2)", () => {
  it("en-route POSTs to the Pro's own endpoint", async () => {
    apiFetch.mockResolvedValue({});
    const { result } = renderHook(() => useProEnRoute(), { wrapper });
    await result.current.mutateAsync({ bookingId: "b1" });
    expect(apiFetch).toHaveBeenCalledWith("/pros/me/jobs/b1/en-route", { method: "POST" });
  });

  it("start POSTs the doorstep PIN to the Pro's own endpoint", async () => {
    apiFetch.mockResolvedValue({});
    const { result } = renderHook(() => useProStart(), { wrapper });
    await result.current.mutateAsync({ bookingId: "b1", otp: "1234" });
    expect(apiFetch).toHaveBeenCalledWith("/pros/me/jobs/b1/start", {
      method: "POST",
      body: JSON.stringify({ otp: "1234" }),
    });
  });

  it("complete POSTs to the Pro's own endpoint", async () => {
    apiFetch.mockResolvedValue({});
    const { result } = renderHook(() => useProComplete(), { wrapper });
    await result.current.mutateAsync({ bookingId: "b1" });
    expect(apiFetch).toHaveBeenCalledWith("/pros/me/jobs/b1/complete", { method: "POST" });
  });

  it("refreshes the job and the Pro's lists after a step", async () => {
    apiFetch.mockResolvedValue({});
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useProEnRoute(), { wrapper });
    await result.current.mutateAsync({ bookingId: "b1" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["booking", "b1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["pro-jobs"] });
  });

  it("declines through the Pro's decline", async () => {
    apiFetch.mockResolvedValue({ booking_id: "b1", outcome: "awaiting_repick" });
    const { result } = renderHook(() => useDeclineProJob(), { wrapper });
    expect(await result.current.mutateAsync("b1")).toEqual({
      booking_id: "b1",
      outcome: "awaiting_repick",
    });
    expect(apiFetch).toHaveBeenCalledWith("/pros/me/jobs/b1/decline", { method: "POST" });
  });

  it("sends the heartbeat as lat/lng", async () => {
    apiFetch.mockResolvedValue({});
    await sendProLocation({ lat: 18.5, lng: 73.8 });
    expect(apiFetch).toHaveBeenCalledWith("/pros/me/location", {
      method: "POST",
      body: JSON.stringify({ lat: 18.5, lng: 73.8 }),
    });
  });

  it("sends KYC as the three images the backend names", async () => {
    apiFetch.mockResolvedValue({});
    const { result } = renderHook(() => useSubmitProKyc(), { wrapper });
    const img = new Blob(["x"], { type: "image/jpeg" });
    await result.current.mutateAsync({ aadhaarFront: img, aadhaarBack: img, selfie: img });

    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/pros/me/kyc");
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual(["aadhaar_front", "aadhaar_back", "selfie"]);
  });
});

describe("useProJobs", () => {
  it("re-asks the active jobs every 30 s, so an assignment shows up (found on device)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      apiFetch.mockResolvedValue({ bookings: [], total: 0 });
      renderHook(() => useProJobs("active"), { wrapper });
      await vi.waitFor(() =>
        expect(
          apiFetch.mock.calls.filter(([p]) => String(p).startsWith("/pros/me/jobs")),
        ).toHaveLength(1),
      );
      await vi.advanceTimersByTimeAsync(PRO_JOBS_POLL_MS);
      await vi.waitFor(() =>
        expect(
          apiFetch.mock.calls.filter(([p]) => String(p).startsWith("/pros/me/jobs")),
        ).toHaveLength(2),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
