/**
 * Minimal mock backend for Playwright specs.
 *
 * Shapes match `svc_connect.json` OpenAPI. Each helper returns a route handler
 * registration — compose by awaiting them from a test's `beforeEach` or inline.
 * Call counts are tracked per path so a spec can assert ordering (e.g. "verify
 * was called after order was minted").
 */
import type { Page } from "@playwright/test";

export interface MockBackendHandle {
  /** Count of fulfilled requests for a given endpoint tail (e.g. "/payments/verify").
   *  Optionally scope to an HTTP method so a POST-count isn't inflated by
   *  the GETs the same route serves (tracking screen reads /bookings/ a lot). */
  count(tail: string, method?: string): number;
  /** The raw body of the N-th call (0-indexed) to a tail, if any. */
  bodyAt(tail: string, index: number): unknown;
  /** All recorded calls, oldest first. */
  calls(): ReadonlyArray<{ method: string; tail: string; body: unknown }>;
}

export interface MockUser {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  role: "consumer" | "provider";
  preferred_language?: "en" | "hi" | "mr" | null;
  i18n_enabled?: boolean;
}

export interface MockService {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string;
  price: number;
  payout: number;
  duration: string;
  variants?: Array<{
    id: string;
    label: string;
    subcategory: string | null;
    price: number;
    payout: number;
    duration: string;
  }>;
}

export const DEFAULT_USER: MockUser = {
  id: "u-test-1",
  name: "Test Consumer",
  phone: "+919999999999",
  email: null,
  role: "consumer",
  preferred_language: "en",
  i18n_enabled: false,
};

export const DEFAULT_SERVICE: MockService = {
  id: "svc-basic-clean",
  name: "Basic home cleaning",
  categoryId: "cat-cleaning",
  categoryName: "Cleaning",
  description: "One-off deep-clean for a small home.",
  price: 499,
  payout: 400,
  duration: "90 min",
  variants: [
    {
      id: "var-1bhk",
      label: "1 BHK",
      subcategory: null,
      price: 499,
      payout: 400,
      duration: "90 min",
    },
  ],
};

export const DEFAULT_ADDRESS = {
  id: "addr-test-1",
  label: "Home",
  // Backend returns a flat `full_address` (see useApi.ts line 342). The
  // frontend remaps it to `full` on the client and LocationGateHost's
  // `localityFrom(a.full, a.label)` tries to `.split(",")` it — a missing
  // field here would TypeError at bootstrap, before the cart renders.
  full_address: "Flat 101, Test Residency, Koramangala, Bangalore, 560034",
  line1: "Flat 101, Test Residency",
  line2: null,
  city: "Bangalore",
  state: "Karnataka",
  pincode: "560034",
  latitude: 12.9716,
  longitude: 77.5946,
  is_default: true,
};

/**
 * Register the minimum route set the money path touches. Any spec may add more
 * `page.route()` registrations AFTER calling this to override specific endpoints
 * (Playwright uses most-recently-added-wins ordering).
 */
export async function mockBackend(
  page: Page,
  opts: {
    user?: MockUser;
    services?: MockService[];
    bookingId?: string;
    razorpayOrderId?: string;
  } = {},
): Promise<MockBackendHandle> {
  const user = opts.user ?? DEFAULT_USER;
  const services = opts.services ?? [DEFAULT_SERVICE];
  const bookingId = opts.bookingId ?? "booking-test-1";
  const razorpayOrderId = opts.razorpayOrderId ?? "order_test_1";
  const calls: Array<{ method: string; tail: string; body: unknown }> = [];

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const tail = url.pathname.replace(/^.*\/api\/v1/, "");
    const method = route.request().method();
    let body: unknown = null;
    try {
      body = route.request().postDataJSON();
    } catch {
      body = null;
    }
    calls.push({ method, tail, body });

    // Users
    if (tail === "/users/me" && method === "GET") {
      return route.fulfill({ json: user });
    }

    // Auth — if a spec actually drives the OTP flow it will override these.
    if (tail === "/auth/send-otp" && method === "POST") {
      return route.fulfill({ json: { success: true, retry_after: 30 } });
    }
    if (tail === "/auth/verify-otp" && method === "POST") {
      return route.fulfill({
        json: {
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          user,
          is_new_user: false,
        },
      });
    }
    if (tail === "/auth/refresh" && method === "POST") {
      return route.fulfill({
        json: {
          access_token: "test-access-token-refreshed",
          refresh_token: "test-refresh-token-refreshed",
        },
      });
    }

    // Catalog
    if (tail === "/services" && method === "GET") {
      return route.fulfill({ json: services });
    }
    if (tail.startsWith("/services/") && method === "GET") {
      const id = tail.split("/")[2];
      const svc = services.find((s) => s.id === id);
      return svc
        ? route.fulfill({ json: svc })
        : route.fulfill({ status: 404, json: { detail: "not found" } });
    }

    // Addresses (SVC-467 note: real endpoint is nested under /users/me)
    if (tail === "/users/me/addresses" && method === "GET") {
      return route.fulfill({ json: [DEFAULT_ADDRESS] });
    }

    // Categories — ServiceCatalogSheet reads this on first expand. Return
    // minimal shape: one category containing DEFAULT_SERVICE.
    if (tail === "/categories" && method === "GET") {
      return route.fulfill({
        json: [
          {
            id: services[0]?.categoryId ?? "cat-cleaning",
            name: services[0]?.categoryName ?? "Cleaning",
            slug: "cleaning",
            level: 2,
            parent_id: null,
            services: services.map((s) => ({
              id: s.id,
              name: s.name,
              price: s.price,
              duration: s.duration,
            })),
          },
        ],
      });
    }

    // Bookings list — cart's bookingLandingVerdict reads this to decide
    // whether to pre-empt home with the tracker. Empty list = no pre-empt.
    if (tail.startsWith("/bookings/") && method === "GET" && tail.includes("per_page")) {
      return route.fulfill({ json: { bookings: [], has_more: false, next_cursor: null } });
    }

    // Pro-state — SVC-322 gate. 404 here signals "not a pro" (consumer).
    if (tail === "/pros/me" && method === "GET") {
      return route.fulfill({
        status: 404,
        json: { detail: "not a pro", code: "NOT_A_PRO" },
      });
    }

    // Provider profile — same shape: 404 means not a provider.
    if (tail === "/providers/me" && method === "GET") {
      return route.fulfill({
        status: 404,
        json: { detail: "not a provider", code: "NOT_A_PROVIDER" },
      });
    }

    // Version check (SVC-162). Return "no update" so the nudge doesn't fire.
    if (tail === "/downloads/latest.json" && method === "GET") {
      return route.fulfill({
        json: { version: "0.0.0-playwright", android_url: null, release_notes: "" },
      });
    }

    // Push capability — status-only; no-op for Playwright.
    if (tail === "/users/me/push-capability" && method === "GET") {
      return route.fulfill({ json: { capable: false } });
    }

    // Booking creation. Real client POSTs to `/bookings/` (trailing slash
    // — see src/hooks/useApi.ts). The list GET hits the same path with
    // query params.
    if ((tail === "/bookings" || tail === "/bookings/") && method === "POST") {
      return route.fulfill({
        json: {
          id: bookingId,
          status: "REQUESTED",
          payment_status: "PENDING",
          scheduled_at: null,
          address_id: DEFAULT_ADDRESS.id,
          items: (body as { items?: unknown[] })?.items ?? [],
          created_at: new Date().toISOString(),
        },
      });
    }

    // Payment order — real path is `/payments/orders` (plural); see
    // src/hooks/useApi.ts line 967.
    if (tail === "/payments/orders" && method === "POST") {
      return route.fulfill({
        json: {
          razorpay_key_id: "rzp_test_playwright",
          razorpay_order_id: razorpayOrderId,
          amount: DEFAULT_SERVICE.price * 100,
          currency: "INR",
        },
      });
    }

    // Verify
    if (tail === "/payments/verify" && method === "POST") {
      return route.fulfill({
        json: {
          verified: true,
          booking: {
            id: bookingId,
            status: "REQUESTED",
            payment_status: "PAID",
          },
        },
      });
    }

    // Tracking / booking fetch
    if (tail === `/bookings/${bookingId}` && method === "GET") {
      return route.fulfill({
        json: {
          id: bookingId,
          status: "REQUESTED",
          payment_status: "PAID",
          address: DEFAULT_ADDRESS,
          items: [],
          professional: null,
          provider: null,
          created_at: new Date().toISOString(),
        },
      });
    }

    // Default: pass-through to a safe-empty response. A 404 here would make
    // React Query retry forever for any endpoint a route picks up (location
    // gate's availability check, FCM registration, etc.), which hangs the
    // app on the splash spinner. Returning an empty object keeps the loader
    // chain unblocked while still letting a spec assert `count(tail) === 0`
    // for the mocks it DID expect.
    return route.fulfill({ json: {} });
  });

  return {
    count: (tail, method) =>
      calls.filter((c) => c.tail === tail && (method === undefined || c.method === method)).length,
    bodyAt: (tail, index) => calls.filter((c) => c.tail === tail)[index]?.body ?? null,
    calls: () => calls.slice(),
  };
}
