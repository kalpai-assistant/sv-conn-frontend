/**
 * SVC-484 Notify me on a tile: when it shows, its two labels, the PUT at the
 * tile's own round4 point, the push-permission branches, the server's 409 /
 * 404 answers, and that its tap never reaches the card (no sheet, no SVC-419
 * event) while a tap on the rest of the card still does both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Service } from "@/lib/mock-data";

const h = vi.hoisted(() => ({
  rows: undefined as
    undefined | { service_id: string; from_price: number | null; served: boolean }[],
  signedIn: true,
  alerts: [] as {
    service_id: string;
    service_name: string;
    kind: "coming_soon" | "no_pros_online";
    created_at: string;
    expires_at: string;
  }[],
  permission: "granted" as string,
  enable: vi.fn(),
  installState: "ios-manual" as string,
  apiFetch: vi.fn(),
  putError: null as null | { status: number; code?: string },
  openService: vi.fn(),
  track: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

// An unrounded point, so the test can see the PUT round it.
const POINT = { lat: 12.971234567, lng: 77.594987654 };
vi.mock("@/hooks/useTilePoint", () => ({ useTilePoint: () => POINT }));
vi.mock("@/hooks/useApi", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useApi")>()),
  useFromPrices: () => ({ data: h.rows }),
}));
vi.mock("@/hooks/useSelectedAddress", () => ({
  useSelectedAddress: () => ({ selected: undefined }),
}));
vi.mock("@/lib/auth-context", () => ({
  useOptionalAuth: () => (h.signedIn ? { isAuthenticated: true } : null),
}));
vi.mock("@/lib/fcm", () => ({
  getPushPermission: async () => h.permission,
  enablePushNotifications: () => h.enable(),
}));
vi.mock("@/lib/install", () => ({
  useInstallState: () => ({ state: h.installState, promptInstall: vi.fn() }),
  installCostsSession: () => false,
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));
vi.mock("@/lib/analytics", () => ({ track: h.track, pincodeOrNull: () => null }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/service-sheet-context", () => ({
  useServiceSheet: () => ({ openService: h.openService }),
}));
vi.mock("@/components/service/QuickAddButton", () => ({ QuickAddButton: () => null }));

import { ApiError } from "@/lib/api";
import { NotifyMeButton } from "@/components/NotifyMeButton";
import { NOTIFY_ME_ENABLED_TEXT, NOTIFY_ME_TEXT } from "@/lib/tile-price-state";
import { ServiceCard } from "@/components/ServiceCard";

const SERVICE: Service = {
  id: "svc-1",
  name: "Deep cleaning",
  categoryId: "c1",
  categoryName: "Cleaning",
  description: "",
  price: 499,
  payout: 0,
  duration: "2 hrs",
  variants: [],
};
const COMING_SOON = [{ service_id: "svc-1", from_price: null, served: false }];
const OFFLINE = [{ service_id: "svc-1", from_price: null, served: true }];
const ALERT = {
  service_id: "svc-1",
  service_name: "Deep cleaning",
  kind: "coming_soon" as const,
  created_at: "2026-11-20T10:00:00Z",
  expires_at: "2027-01-04T10:00:00Z",
};

let client: QueryClient;
function renderWith(ui: ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  h.rows = COMING_SOON;
  h.signedIn = true;
  h.alerts = [];
  h.permission = "granted";
  h.installState = "ios-manual";
  h.putError = null;
  h.enable.mockResolvedValue({ status: "granted" });
  h.apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url === "/users/me/service-alerts") return h.alerts;
    if (method === "PUT") {
      if (h.putError) throw new ApiError(h.putError.status, "nope", undefined, h.putError.code);
      return { ...ALERT, service_id: url.split("/").pop() };
    }
    if (method === "DELETE") return undefined;
    throw new Error(`unexpected ${method} ${url}`);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

const putCalls = () => h.apiFetch.mock.calls.filter(([, init]) => init?.method === "PUT");

describe("when Notify me shows", () => {
  it.each([
    ["Coming soon", COMING_SOON],
    ["No pros online", OFFLINE],
  ])("on a %s tile", async (_label, rows) => {
    h.rows = rows;
    renderWith(<NotifyMeButton service={SERVICE} />);
    expect(await screen.findByRole("button", { name: NOTIFY_ME_TEXT })).toBeInTheDocument();
  });

  it("not on a priced tile", () => {
    h.rows = [{ service_id: "svc-1", from_price: 450, served: true }];
    renderWith(<NotifyMeButton service={SERVICE} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("not without data (the catalogue fallback)", () => {
    h.rows = undefined;
    renderWith(<NotifyMeButton service={SERVICE} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("not when signed out", () => {
    h.signedIn = false;
    renderWith(<NotifyMeButton service={SERVICE} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reads 'enabled — tap to cancel' with an open alert for the service", async () => {
    h.alerts = [ALERT];
    renderWith(<NotifyMeButton service={SERVICE} />);
    expect(await screen.findByRole("button", { name: NOTIFY_ME_ENABLED_TEXT })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("ignores another service's alert", async () => {
    h.alerts = [{ ...ALERT, service_id: "svc-2" }];
    renderWith(<NotifyMeButton service={SERVICE} />);
    expect(await screen.findByRole("button", { name: NOTIFY_ME_TEXT })).toBeInTheDocument();
  });
});

describe("saving and cancelling", () => {
  it("PUTs the tile's point, rounded with round4, then reads enabled", async () => {
    renderWith(<NotifyMeButton service={SERVICE} />);
    await userEvent.click(await screen.findByRole("button", { name: NOTIFY_ME_TEXT }));
    await screen.findByRole("button", { name: NOTIFY_ME_ENABLED_TEXT });
    expect(putCalls()).toHaveLength(1);
    const [url, init] = putCalls()[0];
    expect(url).toBe("/users/me/service-alerts/svc-1");
    expect(JSON.parse(init.body)).toEqual({ lat: 12.9712, lng: 77.595 });
    expect(client.getQueryData(["service-alerts"])).toHaveLength(1);
  });

  it("cancels with a DELETE and goes back to Notify me", async () => {
    h.alerts = [ALERT];
    renderWith(<NotifyMeButton service={SERVICE} />);
    await userEvent.click(await screen.findByRole("button", { name: NOTIFY_ME_ENABLED_TEXT }));
    await screen.findByRole("button", { name: NOTIFY_ME_TEXT });
    expect(h.apiFetch).toHaveBeenCalledWith("/users/me/service-alerts/svc-1", {
      method: "DELETE",
    });
    expect(putCalls()).toHaveLength(0);
  });

  it.each([
    [409, "SERVICE_ALREADY_AVAILABLE"],
    [404, "SERVICE_NOT_FOUND"],
  ])("a %s %s refreshes from-prices and says so", async (status, code) => {
    h.putError = { status, code };
    renderWith(<NotifyMeButton service={SERVICE} />);
    const button = await screen.findByRole("button", { name: NOTIFY_ME_TEXT });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await userEvent.click(button);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["from-prices"] }));
    const toasts = status === 409 ? h.toast.success : h.toast.error;
    expect(toasts).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: NOTIFY_ME_TEXT })).toBeInTheDocument();
  });

  it("any other error toasts and leaves the state as it was", async () => {
    h.putError = { status: 500 };
    renderWith(<NotifyMeButton service={SERVICE} />);
    const button = await screen.findByRole("button", { name: NOTIFY_ME_TEXT });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await userEvent.click(button);
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Couldn't turn on the alert", expect.anything()),
    );
    expect(invalidate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: NOTIFY_ME_TEXT })).toBeInTheDocument();
  });
});

describe("push permission before the first save", () => {
  const tap = async () => {
    renderWith(<NotifyMeButton service={SERVICE} />);
    await userEvent.click(await screen.findByRole("button", { name: NOTIFY_ME_TEXT }));
  };

  it("granted: saves without asking", async () => {
    await tap();
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(h.enable).not.toHaveBeenCalled();
  });

  it("prompt: asks from the tap, and saves once push is on", async () => {
    h.permission = "prompt";
    await tap();
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(h.enable).toHaveBeenCalledTimes(1);
  });

  it("prompt, then a failed enable: saves nothing and says so", async () => {
    h.permission = "prompt";
    h.enable.mockResolvedValue({ status: "granted", error: "config" });
    await tap();
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "Couldn't turn on notifications",
        expect.anything(),
      ),
    );
    expect(putCalls()).toHaveLength(0);
  });

  it("prompt, then declined: saves nothing and says so", async () => {
    h.permission = "prompt";
    h.enable.mockResolvedValue({ status: "denied" });
    await tap();
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Permission denied", expect.anything()),
    );
    expect(putCalls()).toHaveLength(0);
  });

  it("denied: the Profile row's blocked message, nothing saved", async () => {
    h.permission = "denied";
    await tap();
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Notifications are blocked", expect.anything()),
    );
    expect(h.enable).not.toHaveBeenCalled();
    expect(putCalls()).toHaveLength(0);
  });

  it("unsupported on an iPhone tab: the install sheet, nothing saved", async () => {
    h.permission = "unsupported";
    await tap();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(putCalls()).toHaveLength(0);
  });

  it("unsupported in a browser that can't: the straight answer, nothing saved", async () => {
    h.permission = "unsupported";
    h.installState = "unavailable";
    await tap();
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "This browser can’t receive job alerts",
        expect.anything(),
      ),
    );
    expect(putCalls()).toHaveLength(0);
  });
});

describe("inside a card (14952 #14)", () => {
  it("a Notify me tap opens no sheet and sends no SVC-419 event", async () => {
    renderWith(<ServiceCard service={SERVICE} />);
    await userEvent.click(await screen.findByRole("button", { name: NOTIFY_ME_TEXT }));
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(h.openService).not.toHaveBeenCalled();
    expect(h.track).not.toHaveBeenCalled();
  });

  it("Enter on Notify me doesn't reach the card's key handler", async () => {
    renderWith(<ServiceCard service={SERVICE} />);
    const button = await screen.findByRole("button", { name: NOTIFY_ME_TEXT });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(h.openService).not.toHaveBeenCalled();
    expect(h.track).not.toHaveBeenCalled();
  });

  it("a tap on the rest of the card still opens the sheet and sends the event", async () => {
    renderWith(<ServiceCard service={SERVICE} />);
    await screen.findByRole("button", { name: NOTIFY_ME_TEXT });
    await userEvent.click(screen.getByText("Coming soon"));
    expect(h.openService).toHaveBeenCalledWith("svc-1");
    expect(h.track).toHaveBeenCalledExactlyOnceWith(
      "marketplace.tile_coming_soon_tapped",
      expect.objectContaining({ service_id: "svc-1", state: "coming_soon" }),
    );
  });

  it("a tap inside the install sheet doesn't reach the card either", async () => {
    h.permission = "unsupported";
    renderWith(<ServiceCard service={SERVICE} />);
    await userEvent.click(await screen.findByRole("button", { name: NOTIFY_ME_TEXT }));
    await userEvent.click(await screen.findByRole("dialog"));
    expect(h.openService).not.toHaveBeenCalled();
    expect(h.track).not.toHaveBeenCalled();
  });
});
