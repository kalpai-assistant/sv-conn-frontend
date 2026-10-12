/**
 * A push that arrives while the app is open. Android shows no notification in
 * the foreground, so the app has to act on it itself: a Pro whose job was
 * cancelled or taken off them (SVC-348) must hear it now, and Pro Home must
 * stop offering the job, rather than wait up to 30 s for the next poll.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { navigate, auth, listeners, toast } = vi.hoisted(() => ({
  navigate: vi.fn(),
  auth: { user: null as { role: string } | null },
  listeners: {} as Record<string, (arg: unknown) => void>,
  toast: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: async (name: string, cb: (arg: unknown) => void) => {
      listeners[name] = cb;
      return { remove: vi.fn() };
    },
  },
}));

import { useNotificationRouter } from "@/lib/notifications";

const ID = "bf1444b2-0000-0000-0000-000000000000";

/** Mount the router as `role`, then deliver `event` in the foreground. */
async function arrive(event: string, role: string) {
  auth.user = { role };
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  renderHook(() => useNotificationRouter(), { wrapper });
  await waitFor(() => expect(listeners.pushNotificationReceived).toBeDefined());
  listeners.pushNotificationReceived({ data: { event, booking_id: ID } });
  return invalidate;
}

afterEach(() => {
  for (const key of Object.keys(listeners)) delete listeners[key];
  vi.clearAllMocks();
  auth.user = null;
});

describe("a team Pro's job going away in the foreground (SVC-348)", () => {
  it.each([
    ["job_cancelled", "Job cancelled", "This job has been cancelled. Please don't travel to it."],
    [
      "unassigned",
      "Job removed",
      "This job is no longer assigned to you. Please don't travel to it.",
    ],
  ])("%s refreshes the Pro's jobs and this job, and says so", async (event, title, body) => {
    const invalidate = await arrive(event, "consumer");

    // ["pro-jobs"] is the prefix of Pro Home's ["pro-jobs", "active"].
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pro-jobs"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["booking", ID] });
    // The push's own words, and no "Open": there is nothing to do there.
    expect(toast).toHaveBeenCalledExactlyOnceWith(title, { description: body });
    // Never yanked off whatever they are doing.
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(["job_cancelled", "unassigned"])("%s does nothing for a provider", async (event) => {
    const invalidate = await arrive(event, "provider");
    expect(invalidate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("still offers an assigned job with an Open action", async () => {
    await arrive("assigned", "consumer");
    expect(toast).toHaveBeenCalledWith(
      "New job assigned",
      expect.objectContaining({ action: expect.objectContaining({ label: "Open" }) }),
    );
  });
});
