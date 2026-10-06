/**
 * Where a push tap lands. Every target here must be a real route: the provider
 * lifecycle pushes once pointed at `/provider/job/{id}`, which never existed,
 * and every tap opened a 404 on device (SVC-321). The last test checks each
 * target against the generated route tree, so a renamed route fails here
 * rather than on a phone.
 */
import { describe, expect, it, vi } from "vitest";

// The module imports the router and auth context for its hook; the pure
// function under test needs neither.
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));

import { routeForPayload, type ViewerRole } from "@/lib/notifications";

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

  it("assigned goes nowhere until the Pro app has a job view (SVC-322)", () => {
    // A team Pro's account is consumer-role: /tracking would be the wrong screen.
    expect(route("assigned", "consumer")).toBeNull();
    expect(route("assigned", "provider")).toBeNull();
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

    const events = [...LIFECYCLE, "new_request", "pro_declined", "reopened", "no_taker_refunded"];
    const targets = new Set<string>();
    for (const event of events) {
      for (const role of ["consumer", "provider"] as const) {
        const target = route(event, role);
        if (target) targets.add(target.split("?")[0].replace(ID, "$bookingId"));
      }
    }

    expect(targets).toEqual(
      new Set(["/provider", "/provider/bookings/$bookingId", "/tracking/$bookingId"]),
    );
    for (const target of targets) {
      // The tree spells an index route with a trailing slash ("/provider/").
      const exists = fullPaths.has(target) || fullPaths.has(`${target}/`);
      expect(exists, `${target} is not a route`).toBe(true);
    }
  });
});
