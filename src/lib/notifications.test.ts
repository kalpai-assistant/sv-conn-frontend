/**
 * Where a push tap lands. Every target here must be a real route: the provider
 * lifecycle pushes once pointed at `/provider/job/{id}`, which never existed,
 * and every tap opened a 404 on device (SVC-321). The last test checks each
 * target against the generated route tree, so a renamed route fails here
 * rather than on a phone.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The module imports the router and auth context for its hook; the pure
// function under test needs neither.
const { navigate, auth } = vi.hoisted(() => ({
  navigate: vi.fn(),
  auth: { user: null as { role: string } | null },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));

import {
  PUSH_BOOKING_PARAM,
  PUSH_EVENT_PARAM,
  readPushLink,
  routeForPayload,
  useNotificationRouter,
  type ViewerRole,
} from "@/lib/notifications";

const ID = "bf1444b2-0000-0000-0000-000000000000";
const route = (event: string, role: ViewerRole) => routeForPayload({ event, booking_id: ID }, role);

const LIFECYCLE = ["accepted", "en_route", "in_progress", "completed", "cancelled", "expired"];

describe("lifecycle events", () => {
  it.each(LIFECYCLE)("%s opens the provider's job screen", (event) => {
    expect(route(event, "provider")).toBe(`/provider/bookings/${ID}`);
  });

  it.each(LIFECYCLE)("%s opens the consumer's tracking screen", (event) => {
    expect(route(event, "consumer")).toBe(`/tracking/${ID}`);
  });

  it.each(LIFECYCLE)("%s goes nowhere for an admin", (event) => {
    expect(route(event, "admin")).toBeNull();
  });
});

describe("new_request", () => {
  it("opens the Incoming Request Card for a provider", () => {
    expect(route("new_request", "provider")).toBe(`/provider?incomingBookingId=${ID}`);
  });

  it("is dropped for anyone else", () => {
    expect(route("new_request", "consumer")).toBeNull();
  });
});

describe("two-level dispatch events (SVC-320)", () => {
  it("pro_declined opens the SP's job screen, and only for a provider", () => {
    expect(route("pro_declined", "provider")).toBe(`/provider/bookings/${ID}`);
    expect(route("pro_declined", "consumer")).toBeNull();
  });

  it.each(["reopened", "no_taker_refunded"])(
    "%s opens tracking, and only for a consumer",
    (event) => {
      expect(route(event, "consumer")).toBe(`/tracking/${ID}`);
      expect(route(event, "provider")).toBeNull();
    },
  );

  it("assigned opens the Pro app's job screen (SVC-322)", () => {
    // A team Pro's account is consumer-role, so the role alone would have sent
    // them to /tracking — a customer's view of their own job.
    expect(route("assigned", "consumer")).toBe(`/pro/jobs/${ID}`);
    // The backend never tells an SP who picked themselves.
    expect(route("assigned", "provider")).toBeNull();
  });
});

describe("a team Pro's job going away (SVC-348)", () => {
  it.each(["job_cancelled", "unassigned"])(
    "%s opens the Pro app's job screen, not /tracking",
    (event) => {
      // Same reason as "assigned": the Pro's account is consumer-role.
      expect(route(event, "consumer")).toBe(`/pro/jobs/${ID}`);
    },
  );

  it.each(["job_cancelled", "unassigned"])("%s goes nowhere for an SP or admin", (event) => {
    // The backend never sends these to a provider: the SP gets "cancelled",
    // or caused the unassign.
    expect(route(event, "provider")).toBeNull();
    expect(route(event, "admin")).toBeNull();
  });

  it("leaves the plain cancelled push where it was", () => {
    expect(route("cancelled", "consumer")).toBe(`/tracking/${ID}`);
    expect(route("cancelled", "provider")).toBe(`/provider/bookings/${ID}`);
  });
});

describe("unactionable payloads", () => {
  it("needs a booking id", () => {
    expect(routeForPayload({ event: "accepted" }, "consumer")).toBeNull();
  });

  it("ignores unknown events", () => {
    expect(route("something_new", "consumer")).toBeNull();
  });

  it("does nothing before the role is known", () => {
    expect(route("accepted", null)).toBeNull();
  });
});

describe("every target is a real route", () => {
  it("matches a fullPath in the generated route tree", async () => {
    // Read as text: importing the tree loads every route module.
    const source = (await import("@/routeTree.gen?raw")).default as unknown as string;
    const fullPaths = new Set([...source.matchAll(/fullPath: '([^']+)'/g)].map((m) => m[1]));

    const events = [
      ...LIFECYCLE,
      "new_request",
      "pro_declined",
      "reopened",
      "no_taker_refunded",
      "assigned",
      "job_cancelled",
      "unassigned",
    ];
    const targets = new Set<string>();
    for (const event of events) {
      for (const role of ["consumer", "provider"] as const) {
        const target = route(event, role);
        if (target) targets.add(target.split("?")[0].replace(ID, "$bookingId"));
      }
    }

    expect(targets).toEqual(
      new Set([
        "/provider",
        "/provider/bookings/$bookingId",
        "/tracking/$bookingId",
        "/pro/jobs/$bookingId",
      ]),
    );
    for (const target of targets) {
      // The tree spells an index route with a trailing slash ("/provider/").
      const exists = fullPaths.has(target) || fullPaths.has(`${target}/`);
      expect(exists, `${target} is not a route`).toBe(true);
    }
  });
});

// The router refreshes the Pro's jobs when an "assigned" push arrives, so it
// needs a QueryClient, as it has in the app.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe("web push (PWA)", () => {
  // The service worker can't know who is signed in, so it opens
  // /?push_event=…&push_booking_id=… and the app routes it by role.
  const openFromPush = (event: string) =>
    window.history.replaceState(
      null,
      "",
      `/?${PUSH_EVENT_PARAM}=${event}&${PUSH_BOOKING_PARAM}=${ID}`,
    );

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    navigate.mockReset();
    auth.user = null;
  });

  it("reads the payload from the URL", () => {
    expect(readPushLink(`?push_event=cancelled&push_booking_id=${ID}`)).toEqual({
      event: "cancelled",
      booking_id: ID,
    });
    expect(readPushLink("?foo=1")).toBeNull();
  });

  it("sends a provider to their job, not to /tracking", () => {
    openFromPush("cancelled");
    auth.user = { role: "provider" };
    renderHook(() => useNotificationRouter(), { wrapper });
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      to: `/provider/bookings/${ID}`,
      replace: true,
    });
  });

  it("keeps new_request opening the Incoming Request Card on the PWA", () => {
    openFromPush("new_request");
    auth.user = { role: "provider" };
    renderHook(() => useNotificationRouter(), { wrapper });
    expect(navigate).toHaveBeenCalledWith({
      to: `/provider?incomingBookingId=${ID}`,
      replace: true,
    });
  });

  it("waits for the role, then routes once", () => {
    openFromPush("reopened");
    const { rerender } = renderHook(() => useNotificationRouter(), { wrapper });
    expect(navigate).not.toHaveBeenCalled();

    auth.user = { role: "consumer" };
    rerender();
    rerender();
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: `/tracking/${ID}`, replace: true });
  });

  it("does nothing without a push in the URL", () => {
    auth.user = { role: "consumer" };
    renderHook(() => useNotificationRouter(), { wrapper });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("uses the same parameter names as the service worker", () => {
    const sw = readFileSync("public/firebase-messaging-sw.js", "utf-8");
    expect(sw).toContain(`params.set("${PUSH_EVENT_PARAM}"`);
    expect(sw).toContain(`params.set("${PUSH_BOOKING_PARAM}"`);
    // The role-blind route it used to build for everyone (its comments may
    // still name it, so match the template literal, not the words).
    expect(sw).not.toContain("`/tracking/");
  });
});
