/**
 * /admin/bookings?booking=<id> deep link (SVC-329).
 *
 * The open sheet moved from component state into the URL so other admin
 * pages can link to one booking. Load-bearing:
 * - a UUID in `?booking=` opens that booking's sheet on load
 * - anything else is dropped, landing on the plain list instead of an error
 * - opening and closing write the URL with `replace`, so Back still leaves
 *   the page as it did before
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const navigate = vi.fn();
let search: { booking?: string } = {};

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearch: () => search,
    createFileRoute: () => (opts: { component: unknown }) => ({
      ...opts,
      fullPath: "/admin/bookings",
    }),
  };
});

import { Route } from "@/routes/admin.bookings";
import { bookingsSearchSchema } from "@/lib/admin";

const Page = (Route as unknown as { component: React.FC }).component;

const ID = "5c1d2e3f-0000-4000-8000-0000000000aa";

const booking = {
  id: ID,
  status: "accepted",
  created_at: new Date().toISOString(),
  scheduled_at: null,
  service_amount: 500,
  discount_amount: 0,
  tip_amount: 0,
  payment_method: "cash",
  payment_status: "pending",
  is_disputed: false,
  items: [{ id: "i1", service_name: "Deep Clean", quantity: 1, total_price: 500 }],
  status_history: [],
  address: null,
  consumer_phone: "+919876500001",
  provider_name: "Tush",
  provider_id: "sp-1",
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  search = {};
  apiFetch.mockImplementation((path: string) => {
    if (path.startsWith("/admin/bookings?")) {
      return Promise.resolve({ bookings: [booking], total: 1, page: 1, per_page: 50 });
    }
    if (path === `/admin/bookings/${ID}`) return Promise.resolve(booking);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
});

describe("bookingsSearchSchema", () => {
  it("keeps a booking UUID", () => {
    expect(bookingsSearchSchema.parse({ booking: ID })).toEqual({ booking: ID });
  });

  it("drops a malformed id instead of failing the page", () => {
    expect(bookingsSearchSchema.parse({ booking: "not-a-uuid" })).toEqual({});
    expect(bookingsSearchSchema.parse({})).toEqual({});
  });
});

describe("/admin/bookings?booking=", () => {
  it("opens that booking's sheet on load", async () => {
    search = { booking: ID };
    wrap(<Page />);
    expect(await screen.findByRole("dialog", { name: "Booking details" })).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(`/admin/bookings/${ID}`));
  });

  it("clears the param on close, without a history entry", async () => {
    search = { booking: ID };
    wrap(<Page />);
    await screen.findByRole("dialog", { name: "Booking details" });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(navigate).toHaveBeenCalledWith({ search: {}, replace: true });
  });

  it("opens a row by writing its id to the URL", async () => {
    wrap(<Page />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(await screen.findByText("Deep Clean"));
    expect(navigate).toHaveBeenCalledWith({ search: { booking: ID }, replace: true });
  });
});
