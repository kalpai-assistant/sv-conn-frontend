import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiFetch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: (path: string) => apiFetch(path),
}));

import {
  hasTeam,
  proLabel,
  proName,
  useEarningsByPro,
  useProEarnings,
  type ProEarningsItem,
} from "@/hooks/useProEarnings";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: React.PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiFetch.mockResolvedValue({ range: "week", total_payout: 0, completed_count: 0, pros: [] });
});

describe("the requests", () => {
  it("asks by-pro for the range, under the shared earnings key", async () => {
    const { client, Wrapper } = wrapper();
    renderHook(() => useEarningsByPro("all"), { wrapper: Wrapper });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/providers/me/earnings/by-pro?range=all"),
    );
    // Under ["earnings"], so existing invalidations of the SP's earnings reach it.
    expect(client.getQueryCache().find({ queryKey: ["earnings", "by-pro", "all"] })).toBeDefined();
  });

  it("narrows the window to one Pro by professional_id", async () => {
    const { Wrapper } = wrapper();
    renderHook(() => useProEarnings("month", "p-1"), { wrapper: Wrapper });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/providers/me/earnings?range=month&professional_id=p-1",
      ),
    );
  });

  it("never shows one Pro's window as a placeholder for another's", async () => {
    const { Wrapper } = wrapper();
    apiFetch.mockResolvedValueOnce({ range: "week", total_payout: 650, bookings: [] });
    const { result, rerender } = renderHook(({ id }) => useProEarnings("week", id), {
      wrapper: Wrapper,
      initialProps: { id: "p-1" },
    });
    await waitFor(() => expect(result.current.data?.total_payout).toBe(650));

    apiFetch.mockReturnValueOnce(new Promise(() => {}));
    rerender({ id: "p-2" });
    expect(result.current.data).toBeUndefined();
  });
});

const item = (over: Partial<ProEarningsItem>): ProEarningsItem => ({
  professional_id: "p",
  display_name: "Ravi",
  profile_photo_url: null,
  is_self: false,
  is_active: true,
  payout: 0,
  completed_count: 0,
  ...over,
});
const resp = (pros: ProEarningsItem[]) => ({
  range: "all" as const,
  total_payout: 0,
  completed_count: 0,
  pros,
});

describe("hasTeam", () => {
  it("is false for a solo SP, even with legacy Not assigned jobs", () => {
    expect(hasTeam(resp([item({ is_self: true }), item({ professional_id: null })]))).toBe(false);
  });

  it("is false before the response lands", () => {
    expect(hasTeam(undefined)).toBe(false);
  });

  it("is true with another Pro, removed ones included", () => {
    expect(hasTeam(resp([item({ is_self: true }), item({ is_active: false })]))).toBe(true);
  });
});

describe("labels", () => {
  it("says 'by you' for the SP's own jobs, matching '(You)' elsewhere", () => {
    expect(proLabel({ id: "p", display_name: "Tush", is_self: true })).toBe("by you");
    expect(proLabel({ id: "p", display_name: "Ravi", is_self: false })).toBe("by Ravi");
    expect(proLabel(null)).toBe("Not assigned");
  });

  it("names by-pro rows", () => {
    expect(proName(item({ is_self: true, display_name: "Tush" }))).toBe("You");
    expect(proName(item({ professional_id: null }))).toBe("Not assigned");
    expect(proName(item({}))).toBe("Ravi");
  });
});
