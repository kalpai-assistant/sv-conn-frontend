/**
 * Profile → Service alerts (SVC-484): the open alerts, their wording and
 * expiry, remove by swipe or by the icon button, and the empty state.
 *
 * framer-motion is stubbed: jsdom has no layout, so a real drag can't run
 * here (the gesture itself is checked on a device). The stub gives each
 * draggable row two buttons that end a drag at a given offset, so the test
 * drives the same `onDragEnd` the gesture does.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
  Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock("framer-motion", async () => {
  const React = await import("react");
  type Info = { offset: { x: number; y: number }; velocity: { x: number; y: number } };
  type Props = Record<string, unknown> & {
    children?: ReactNode;
    onDragEnd?: (event: unknown, info: Info) => void;
  };
  const strip = ({
    layout: _l,
    initial: _i,
    animate: _a,
    exit: _e,
    transition: _t,
    drag,
    dragDirectionLock,
    dragConstraints: _dc,
    dragElastic: _de,
    onDragStart: _ds,
    onDragEnd,
    children,
    ...rest
  }: Props) => ({ drag, dragDirectionLock, onDragEnd, children, rest });
  const end = (onDragEnd: Props["onDragEnd"], x: number) => () =>
    onDragEnd?.(null, { offset: { x, y: 0 }, velocity: { x: 0, y: 0 } });
  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion: {
      li: (props: Props) => {
        const { children, rest } = strip(props);
        return React.createElement("li", rest, children);
      },
      div: (props: Props) => {
        const { drag, dragDirectionLock, onDragEnd, children, rest } = strip(props);
        return React.createElement(
          "div",
          { ...rest, "data-drag": String(drag), "data-direction-lock": String(dragDirectionLock) },
          children,
          React.createElement("button", {
            type: "button",
            "data-testid": "swipe-far",
            onClick: end(onDragEnd, -120),
          }),
          React.createElement("button", {
            type: "button",
            "data-testid": "swipe-short",
            onClick: end(onDragEnd, -30),
          }),
        );
      },
    },
  };
});

import { ServiceAlertsScreen } from "@/routes/service-alerts";
import { alertExpiryText, isSwipeRemove, SWIPE_REMOVE_OFFSET } from "@/lib/service-alerts";

const CLEANING = {
  service_id: "s1",
  service_name: "Deep cleaning",
  kind: "coming_soon",
  created_at: "2026-11-20T10:00:00Z",
  expires_at: "2027-01-04T10:00:00Z",
};
const PLUMBING = {
  service_id: "s2",
  service_name: "Basin installation",
  kind: "no_pros_online",
  created_at: "2026-11-19T10:00:00Z",
  expires_at: "2027-01-03T10:00:00Z",
};

let alerts: (typeof CLEANING)[];

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ServiceAlertsScreen />
    </QueryClientProvider>,
  );
}

const deletes = () =>
  h.apiFetch.mock.calls.filter(([, init]) => init?.method === "DELETE").map(([url]) => url);

beforeEach(() => {
  vi.clearAllMocks();
  alerts = [CLEANING, PLUMBING];
  h.apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (!init?.method) return alerts;
    if (init.method === "DELETE") return undefined;
    throw new Error(`unexpected ${init.method} ${url}`);
  });
});

describe("the list", () => {
  it("shows each alert's service, its tile wording and the expiry date", async () => {
    renderScreen();
    const row = (await screen.findByText("Deep cleaning")).closest("li")!;
    expect(within(row).getByText(/Coming soon · Expires 4 Jan/)).toBeInTheDocument();
    const other = screen.getByText("Basin installation").closest("li")!;
    expect(within(other).getByText(/No pros online right now · Expires 3 Jan/)).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    alerts = [];
    renderScreen();
    expect(await screen.findByText("No service alerts")).toBeInTheDocument();
  });

  it("makes each row a direction-locked horizontal drag that leaves vertical scroll alone", async () => {
    renderScreen();
    const row = (await screen.findByText("Deep cleaning")).closest("[data-drag]") as HTMLElement;
    expect(row).toHaveAttribute("data-drag", "x");
    expect(row).toHaveAttribute("data-direction-lock", "true");
    expect(row.style.touchAction).toBe("pan-y");
  });

  it("shows the red swipe layer only while a row is moving", async () => {
    renderScreen();
    await screen.findByText("Deep cleaning");
    expect(document.querySelector("[data-swipe-reveal]")).toBeNull();
  });
});

describe("removing", () => {
  it("the remove button DELETEs that alert and drops the row", async () => {
    renderScreen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove alert for Deep cleaning" }),
    );
    await waitFor(() => expect(screen.queryByText("Deep cleaning")).not.toBeInTheDocument());
    expect(deletes()).toEqual(["/users/me/service-alerts/s1"]);
    expect(screen.getByText("Basin installation")).toBeInTheDocument();
  });

  it("a swipe past the threshold removes it", async () => {
    renderScreen();
    const row = (await screen.findByText("Basin installation")).closest("li")!;
    await userEvent.click(within(row).getByTestId("swipe-far"));
    await waitFor(() => expect(screen.queryByText("Basin installation")).not.toBeInTheDocument());
    expect(deletes()).toEqual(["/users/me/service-alerts/s2"]);
  });

  it("a short swipe springs back and removes nothing", async () => {
    renderScreen();
    const row = (await screen.findByText("Basin installation")).closest("li")!;
    await userEvent.click(within(row).getByTestId("swipe-short"));
    expect(deletes()).toEqual([]);
    expect(screen.getByText("Basin installation")).toBeInTheDocument();
  });

  it("a failed DELETE keeps the row and says so", async () => {
    h.apiFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return alerts;
      throw new Error("offline");
    });
    renderScreen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove alert for Deep cleaning" }),
    );
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Couldn't cancel the alert", expect.anything()),
    );
    expect(screen.getByText("Deep cleaning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove alert for Deep cleaning" })).toBeEnabled();
  });

  it("the last removal leaves the empty state", async () => {
    alerts = [CLEANING];
    renderScreen();
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove alert for Deep cleaning" }),
    );
    expect(await screen.findByText("No service alerts")).toBeInTheDocument();
  });
});

describe("isSwipeRemove", () => {
  it("removes past the offset, or on a fast flick left", () => {
    const at = (x: number, vx = 0) =>
      isSwipeRemove({ offset: { x, y: 0 }, velocity: { x: vx, y: 0 } });
    expect(at(-SWIPE_REMOVE_OFFSET)).toBe(true);
    expect(at(-SWIPE_REMOVE_OFFSET + 1)).toBe(false);
    expect(at(-20, -800)).toBe(true);
    expect(at(40)).toBe(false);
  });
});

describe("alertExpiryText", () => {
  // Local time, as formatSmart works in it. Fri 20 Nov 2026, 10:00.
  const NOW = new Date(2026, 10, 20, 10, 0);
  const at = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

  it("far off: the date", () => {
    expect(alertExpiryText(at(2027, 0, 4, 10, 0), NOW)).toBe("Expires 4 Jan");
  });

  it("this week: the weekday and time", () => {
    const midWeekNow = new Date(2026, 10, 16, 10, 0); // Mon 16 Nov
    expect(alertExpiryText(at(2026, 10, 19, 15, 0), midWeekNow)).toBe("Expires Thu 3 PM");
  });

  it("tomorrow, today and within the hour read as one sentence", () => {
    expect(alertExpiryText(at(2026, 10, 21, 10, 0), NOW)).toBe("Expires tomorrow, 10 AM");
    expect(alertExpiryText(at(2026, 10, 20, 15, 0), NOW)).toBe("Expires today, 3 PM");
    expect(alertExpiryText(at(2026, 10, 20, 10, 12), NOW)).toBe("Expires in 12 min");
  });

  it("already past (clock skew) still reads as today, never 'ago'", () => {
    expect(alertExpiryText(at(2026, 10, 20, 9, 48), NOW)).toBe("Expires today");
  });
});
