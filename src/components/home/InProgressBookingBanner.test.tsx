/**
 * Home's in-progress booking banner (SVC-389).
 *
 * Driven through the real `useBookings`, with only `apiFetch` mocked, so the
 * "no request for a provider" case is checked at the wire rather than against
 * a mocked hook — that request is the thing the shared `enabled` condition
 * exists to prevent.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiFetch = vi.fn();
let auth: {
  user: { id: string; role: string } | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => auth,
}));

// A bare anchor with the resolved path, so `href` is what the tap would open.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
  }) => {
    const href = Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to);
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

import { InProgressBookingBanner } from "@/components/home/InProgressBookingBanner";

function booking(id: string, status: string, created_at: string) {
  return {
    id,
    status,
    created_at,
    consumer_id: "c1",
    service_amount: 500,
    items: [
      {
        id: `${id}-item`,
        service_id: "s1",
        service_name: "Deep cleaning",
        quantity: 1,
        unit_price: 500,
        total_price: 500,
      },
    ],
  };
}

function serve(bookings: unknown[]) {
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/bookings")) return { bookings, total: bookings.length };
    return [];
  });
}

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InProgressBookingBanner />
    </QueryClientProvider>,
  );
}

const bookingCalls = () =>
  apiFetch.mock.calls.filter(([path]) => String(path).startsWith("/bookings"));

beforeEach(() => {
  vi.clearAllMocks();
  auth = { user: { id: "u1", role: "consumer" }, isAuthenticated: true, isRestoring: false };
});

describe("InProgressBookingBanner", () => {
  it.each([
    ["accepted", "Pro assigned · tap to see details"],
    ["en_route", "Pro arriving soon · tap to track"],
    ["in_progress", "Service underway · tap for details"],
  ])("shows the %s copy and links to that booking's tracking", async (status, copy) => {
    serve([booking("b1", status, "2026-10-29T09:00:00Z")]);
    renderBanner();

    const link = await screen.findByRole("link", { name: `${copy}: Deep cleaning` });
    expect(link).toHaveAttribute("href", "/tracking/b1");
    expect(link).toHaveTextContent(copy);
  });

  it.each(["completed", "cancelled", "requested", "expired"])(
    "renders nothing for a %s booking",
    async (status) => {
      serve([booking("b1", status, "2026-10-29T09:00:00Z")]);
      const { container } = renderBanner();

      await waitFor(() => expect(bookingCalls()).toHaveLength(1));
      // One more tick for the resolved query to render.
      await new Promise((r) => setTimeout(r, 0));
      expect(container).toBeEmptyDOMElement();
    },
  );

  it("shows the earliest-created live booking and collapses the rest into +N more", async () => {
    serve([
      booking("late", "in_progress", "2026-10-29T11:00:00Z"),
      booking("done", "completed", "2026-10-28T08:00:00Z"),
      booking("early", "en_route", "2026-10-29T08:00:00Z"),
      booking("mid", "accepted", "2026-10-29T10:00:00Z"),
    ]);
    renderBanner();

    const main = await screen.findByRole("link", {
      name: "Pro arriving soon · tap to track: Deep cleaning",
    });
    expect(main).toHaveAttribute("href", "/tracking/early");

    const more = screen.getByRole("link", { name: "2 more in-progress bookings" });
    expect(more).toHaveTextContent("+2 more");
    expect(more).toHaveAttribute("href", "/bookings");
  });

  it("has no +N more chip with a single live booking", async () => {
    serve([booking("b1", "accepted", "2026-10-29T09:00:00Z")]);
    renderBanner();

    await screen.findByRole("link", { name: /Pro assigned/ });
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("renders nothing when the bookings request fails", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/bookings")) throw new Error("offline");
      return [];
    });
    const { container } = renderBanner();

    await waitFor(() => expect(bookingCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [
      "a provider",
      { user: { id: "p1", role: "provider" }, isAuthenticated: true, isRestoring: false },
    ],
    ["an admin", { user: { id: "a1", role: "admin" }, isAuthenticated: true, isRestoring: false }],
    ["a logged-out visitor", { user: null, isAuthenticated: false, isRestoring: false }],
    [
      "a session still restoring",
      { user: { id: "u1", role: "consumer" }, isAuthenticated: true, isRestoring: true },
    ],
  ])("never requests /bookings for %s", async (_who, state) => {
    auth = state;
    serve([booking("b1", "accepted", "2026-10-29T09:00:00Z")]);
    const { container } = renderBanner();

    await new Promise((r) => setTimeout(r, 0));
    expect(bookingCalls()).toHaveLength(0);
    expect(container).toBeEmptyDOMElement();
  });
});
