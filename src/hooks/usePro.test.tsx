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

import { isTeamPro, useProMe, type ProMe } from "@/hooks/usePro";

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
