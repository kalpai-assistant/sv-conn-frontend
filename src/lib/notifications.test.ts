/**
 * Where a push tap lands. Every target here must be a real route: the provider
 * lifecycle pushes once pointed at `/provider/job/{id}`, which never existed,
 * and every tap opened a 404 on device (SVC-321). The last test checks each
 * target against the generated route tree, so a renamed route fails here
 * rather than on a phone.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
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
  PUSH_COUNT_PARAM,
  PUSH_EVENT_PARAM,
  PUSH_SERVICE_PARAM,
  PUSH_VARIANT_PARAM,
  readPushClickMessage,
  readPushLink,
  routeForPayload,
  useNotificationRouter,
  type ViewerRole,
} from "@/lib/notifications";

const ID = "bf1444b2-0000-0000-0000-000000000000";
const route = (event: string, role: ViewerRole) => routeForPayload({ event, booking_id: ID }, role);

const LIFECYCLE = ["accepted", "en_route", "in_progress", "completed", "cancelled", "expired"];
const BOOKING_EVENTS = [
  "new_request",
  "pro_declined",
  "reopened",
  "no_taker_refunded",
  "assigned",
  "job_cancelled",
  "unassigned",
];

describe("kyc_rejected (SVC-444), which has no booking", () => {
  const kyc = (role: ViewerRole) => routeForPayload({ event: "kyc_rejected" }, role);

  it("opens the home that shows the reason", () => {
    expect(kyc("provider")).toBe("/provider");
    expect(kyc("consumer")).toBe("/pro");
  });

  it.each(["admin", null] as const)("goes nowhere for %s", (role) => {
    expect(kyc(role)).toBeNull();
  });

  it.each([...LIFECYCLE, ...BOOKING_EVENTS])("%s still needs a booking", (event) => {
    expect(routeForPayload({ event }, "consumer")).toBeNull();
    expect(routeForPayload({ event }, "provider")).toBeNull();
  });
});

describe("service_available (SVC-484), which has no booking", () => {
  const SERVICE_ID = "5e1c0000-0000-0000-0000-000000000000";
  const available = (data: { service_id?: string; count?: string }, role: ViewerRole) =>
    routeForPayload({ event: "service_available", ...data }, role);

  it("opens that service's sheet for one alert", () => {
    expect(available({ service_id: SERVICE_ID, count: "1" }, "consumer")).toBe(
      `/service/${SERVICE_ID}`,
    );
  });

  it("treats a missing count as one", () => {
    expect(available({ service_id: SERVICE_ID }, "consumer")).toBe(`/service/${SERVICE_ID}`);
  });

  it("opens Home when several came due in one push", () => {
    // service_id is then only the first of them.
    expect(available({ service_id: SERVICE_ID, count: "3" }, "consumer")).toBe("/");
  });

  it("opens Home without a service id", () => {
    expect(available({ count: "1" }, "consumer")).toBe("/");
  });

  it("is routed before the booking guard (it never has a booking_id)", () => {
    expect(available({ service_id: SERVICE_ID }, "consumer")).not.toBeNull();
  });

  it.each(["provider", "admin", null] as const)("goes nowhere for %s", (role) => {
    expect(available({ service_id: SERVICE_ID, count: "1" }, role)).toBeNull();
  });
});

describe("variant_added (SVC-487), which has no booking", () => {
  const SERVICE_ID = "5e1c0000-0000-0000-0000-000000000000";
  const VARIANT_ID = "7a110000-0000-0000-0000-000000000000";
  const added = (data: { service_id?: string; variant_id?: string }, role: ViewerRole) =>
    routeForPayload({ event: "variant_added", ...data }, role);

  it("opens the SP's Prices panel for that service, on the new option", () => {
    expect(added({ service_id: SERVICE_ID, variant_id: VARIANT_ID }, "provider")).toBe(
      `/provider/profile?pricing=${SERVICE_ID}&variant=${VARIANT_ID}`,
    );
  });

  it("opens the panel alone without a variant id", () => {
    expect(added({ service_id: SERVICE_ID }, "provider")).toBe(
      `/provider/profile?pricing=${SERVICE_ID}`,
    );
  });

  it("goes nowhere without a service id", () => {
    expect(added({}, "provider")).toBeNull();
  });

  // A team Pro's account is consumer-role, and Pros don't set prices.
  it.each(["consumer", "admin", null] as const)("goes nowhere for %s", (role) => {
    expect(added({ service_id: SERVICE_ID }, role)).toBeNull();
  });
});

describe("commission_change (SVC-486), which has no booking", () => {
  const SERVICE_ID = "5e1c0000-0000-0000-0000-000000000000";
  const VARIANT_ID = "7a110000-0000-0000-0000-000000000000";
  const changed = (data: { service_id?: string; variant_id?: string }, role: ViewerRole) =>
    routeForPayload({ event: "commission_change", change_id: "cc1", ...data }, role);

  it("opens the SP's Prices panel for that service, on the option", () => {
    expect(changed({ service_id: SERVICE_ID, variant_id: VARIANT_ID }, "provider")).toBe(
      `/provider/profile?pricing=${SERVICE_ID}&variant=${VARIANT_ID}`,
    );
  });

  it("goes nowhere without a service id", () => {
    expect(changed({ variant_id: VARIANT_ID }, "provider")).toBeNull();
  });

  // A team Pro's account is consumer-role, and Pros don't set prices.
  it.each(["consumer", "admin", null] as const)("goes nowhere for %s", (role) => {
    expect(changed({ service_id: SERVICE_ID, variant_id: VARIANT_ID }, role)).toBeNull();
  });
});

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

    const events = [...LIFECYCLE, ...BOOKING_EVENTS, "kyc_rejected"];
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
        "/pro",
      ]),
    );
    for (const target of targets) {
      // The tree spells an index route with a trailing slash ("/provider/").
      const exists = fullPaths.has(target) || fullPaths.has(`${target}/`);
      expect(exists, `${target} is not a route`).toBe(true);
    }
  });

  it("includes service_available's targets (SVC-484)", async () => {
    const source = (await import("@/routeTree.gen?raw")).default as unknown as string;
    const fullPaths = new Set([...source.matchAll(/fullPath: '([^']+)'/g)].map((m) => m[1]));
    const SID = "5e1c0000-0000-0000-0000-000000000000";
    const one = routeForPayload({ event: "service_available", service_id: SID }, "consumer");
    const many = routeForPayload(
      { event: "service_available", service_id: SID, count: "2" },
      "consumer",
    );
    expect(one).toBe(`/service/${SID}`);
    expect(many).toBe("/");
    expect(fullPaths.has("/service/$serviceId")).toBe(true);
    expect(fullPaths.has("/")).toBe(true);
    // The Profile list the alerts live on.
    expect(fullPaths.has("/service-alerts")).toBe(true);
  });

  it("includes variant_added's target (SVC-487)", async () => {
    const source = (await import("@/routeTree.gen?raw")).default as unknown as string;
    const fullPaths = new Set([...source.matchAll(/fullPath: '([^']+)'/g)].map((m) => m[1]));
    const target = routeForPayload({ event: "variant_added", service_id: "s" }, "provider");
    expect(target?.split("?")[0]).toBe("/provider/profile");
    expect(fullPaths.has("/provider/profile")).toBe(true);
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

  it("reads a service_available push's service and count (SVC-484)", () => {
    const SID = "5e1c0000-0000-0000-0000-000000000000";
    expect(
      readPushLink(
        `?${PUSH_EVENT_PARAM}=service_available&${PUSH_SERVICE_PARAM}=${SID}&${PUSH_COUNT_PARAM}=1`,
      ),
    ).toStrictEqual({
      event: "service_available",
      booking_id: undefined,
      service_id: SID,
      count: "1",
      variant_id: undefined,
    });
  });

  it("opens the service's sheet from a service_available link, after a refresh", () => {
    const SID = "5e1c0000-0000-0000-0000-000000000000";
    window.history.replaceState(
      null,
      "",
      `/?${PUSH_EVENT_PARAM}=service_available&${PUSH_SERVICE_PARAM}=${SID}&${PUSH_COUNT_PARAM}=1`,
    );
    auth.user = { role: "consumer" };
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useNotificationRouter(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: `/service/${SID}`, replace: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["from-prices"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["service-alerts"] });
  });

  it("reads a variant_added push's service and option, and opens its row after a refresh (SVC-487)", () => {
    const SID = "5e1c0000-0000-0000-0000-000000000000";
    const VID = "7a110000-0000-0000-0000-000000000000";
    const search = `?${PUSH_EVENT_PARAM}=variant_added&${PUSH_SERVICE_PARAM}=${SID}&${PUSH_VARIANT_PARAM}=${VID}`;
    expect(readPushLink(search)).toStrictEqual({
      event: "variant_added",
      booking_id: undefined,
      service_id: SID,
      count: undefined,
      variant_id: VID,
    });

    window.history.replaceState(null, "", `/${search}`);
    auth.user = { role: "provider" };
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useNotificationRouter(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      to: `/provider/profile?pricing=${SID}&variant=${VID}`,
      replace: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["providerPricing"] });
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
    expect(sw).toContain(`params.set("${PUSH_SERVICE_PARAM}", data.service_id)`);
    expect(sw).toContain(`params.set("${PUSH_COUNT_PARAM}", data.count)`);
    expect(sw).toContain(`params.set("${PUSH_VARIANT_PARAM}", data.variant_id)`);
    // The role-blind route it used to build for everyone (its comments may
    // still name it, so match the template literal, not the words).
    expect(sw).not.toContain("`/tracking/");
  });

  it("claims the click before the Firebase SDK can (SVC-363)", () => {
    const sw = readFileSync("public/firebase-messaging-sw.js", "utf-8");
    // The SDK's own listener, added by firebase.messaging(), swallows every
    // click on a notification it showed. Ours has to be registered first.
    expect(sw.indexOf('addEventListener("notificationclick"')).toBeGreaterThan(-1);
    expect(sw.indexOf('addEventListener("notificationclick"')).toBeLessThan(
      sw.indexOf("const messaging = firebase.messaging()"),
    );
    expect(sw).toContain("stopImmediatePropagation");
    // The open app tab isn't controlled by this worker's scope.
    expect(sw).toContain("includeUncontrolled: true");
    expect(sw).toContain('type: "push_click"');
  });
});

describe("web push tap on an open tab (SVC-363)", () => {
  // jsdom has no service worker; a stub container is enough for the hook.
  const container = Object.assign(new EventTarget(), { startMessages: vi.fn() });
  const tap = (data: unknown) =>
    act(() => {
      container.dispatchEvent(new MessageEvent("message", { data }));
    });
  const pushClick = (event: string) => ({
    type: "push_click",
    url: `/?${PUSH_EVENT_PARAM}=${event}&${PUSH_BOOKING_PARAM}=${ID}`,
  });

  beforeEach(() => {
    Object.defineProperty(navigator, "serviceWorker", { value: container, configurable: true });
  });

  afterEach(() => {
    // @ts-expect-error -- removing the stub put there above
    delete navigator.serviceWorker;
    navigate.mockReset();
    container.startMessages.mockReset();
    auth.user = null;
  });

  it("reads the payload from a push_click message", () => {
    expect(readPushClickMessage(pushClick("cancelled"))).toEqual({
      event: "cancelled",
      booking_id: ID,
    });
  });

  it.each([
    ["another message type", { type: "something_else", url: "/?push_event=cancelled" }],
    ["a push_click without a url", { type: "push_click" }],
    ["a url without a push", { type: "push_click", url: "/" }],
    ["the Firebase SDK's own message", { isFirebaseMessaging: true, messageType: "push-received" }],
    ["no data", null],
  ])("ignores %s", (_, data) => {
    expect(readPushClickMessage(data)).toBeNull();
  });

  it("routes the tap by role, without replacing the current page", () => {
    auth.user = { role: "provider" };
    renderHook(() => useNotificationRouter(), { wrapper });
    expect(container.startMessages).toHaveBeenCalled();

    tap(pushClick("cancelled"));
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      to: `/provider/bookings/${ID}`,
      replace: false,
    });
  });

  it("routes a second tap too", () => {
    auth.user = { role: "consumer" };
    renderHook(() => useNotificationRouter(), { wrapper });
    tap(pushClick("en_route"));
    tap(pushClick("completed"));
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it("ignores any other message", () => {
    auth.user = { role: "consumer" };
    renderHook(() => useNotificationRouter(), { wrapper });
    tap({ type: "something_else", url: pushClick("cancelled").url });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("stops listening on unmount", () => {
    auth.user = { role: "consumer" };
    const { unmount } = renderHook(() => useNotificationRouter(), { wrapper });
    unmount();
    tap(pushClick("cancelled"));
    expect(navigate).not.toHaveBeenCalled();
  });
});
