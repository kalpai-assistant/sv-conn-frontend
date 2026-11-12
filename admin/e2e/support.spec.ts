/**
 * The support console in a real browser, with the API mocked (SVC-433). The
 * shape of each mock is the backend's app/routers/admin_support.py, plus the
 * booking detail and timeline from app/routers/admin.py and /admin/audit.
 *
 * The audit mock records what the backend would: each note and contacted mark
 * adds a row, so "lookup → action → audit entry" runs end to end in the browser.
 * The real audit write is the backend's test.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";

type Role = "admin" | "ops" | "support";
type Json = Record<string, unknown>;

const CUSTOMER = "a21284d4-1dbc-4d6e-b32d-47b91a373b56";
const SP = "adbc6094-3a25-422b-8710-dfebb5e26186";
const REQUESTED = "4d1dd8c9-09c1-4c17-a0f2-b0091a9edda2";
const NOBODY = "52a82557-106d-40af-8d52-5e9e9fc5c567";
const ACCEPTED = "634d27d9-a93e-468c-9a3f-cfba26938a9f";
const COMPLETED = "33a823f6-abf6-4ede-968c-8a10619862f8";

const PRO_KIRAN = "11111111-1111-4111-8111-111111111111";
const PRO_MEERA = "22222222-2222-4222-8222-222222222222";
const PRO_SUNIL = "33333333-3333-4333-8333-333333333333";

function makeBooking(id: string, status: string, overrides: Json = {}): Json {
  return {
    id,
    consumer_id: CUSTOMER,
    provider_id: status === "requested" ? null : SP,
    items: [
      {
        id: `${id}-i1`,
        service_id: "s1",
        service_name: "Facade Cleaning",
        variant_label: null,
        quantity: 1,
        unit_price: 450,
        total_price: 450,
      },
    ],
    status,
    service_amount: 450,
    platform_commission: 67.5,
    provider_payout: 382.5,
    discount_amount: 0,
    tip_amount: 0,
    payment_method: "cash",
    payment_status: "pending",
    address: null,
    is_disputed: false,
    consumer_phone: "+919876543301",
    provider_name: status === "requested" ? null : "Facade Cleaning Co",
    professional:
      status === "requested" ? null : { id: PRO_KIRAN, display_name: "Kiran", is_self: false },
    service_provider:
      status === "requested" ? null : { user_id: SP, business_name: "Facade Cleaning Co" },
    scheduled_at: null,
    created_at: "2026-11-12T04:30:00Z",
    ...overrides,
  };
}

function lookupRow(id: string, status: string): Json {
  return {
    id,
    status,
    created_at: "2026-11-12T04:30:00Z",
    scheduled_at: null,
    service_summary: "Facade Cleaning",
    consumer_name: "Asha Rao",
    consumer_phone: "+919876543301",
    provider_name: status === "requested" ? null : "Facade Cleaning Co",
    matched_by: "phone",
  };
}

function refusal(status: number, code: string, message: string, details: Json | null = null) {
  return { status, json: { error: true, message, code, details } };
}

async function mockBackend(page: Page, role: Role) {
  const bookings: Record<string, Json> = {
    [REQUESTED]: makeBooking(REQUESTED, "requested"),
    [NOBODY]: makeBooking(NOBODY, "requested"),
    [ACCEPTED]: makeBooking(ACCEPTED, "accepted"),
    [COMPLETED]: makeBooking(COMPLETED, "completed"),
  };
  const notes: Record<string, Json[]> = {};
  const audit: Json[] = [];
  const retries: string[] = [];
  const reassigns: Json[] = [];
  const lookups: string[] = [];
  let current = PRO_KIRAN;
  const author = {
    user_id: "a1",
    name: null,
    email: `${role}433@kalpai.in`,
    admin_role: role,
  };

  function record(action: string, target: string) {
    audit.unshift({
      id: `e${audit.length + 1}`,
      admin_user_id: "a1",
      admin_name: null,
      admin_email: author.email,
      action,
      target_type: "booking",
      target_id: target,
      sp_user_id: null,
      to_sp_user_id: null,
      reason: null,
      details: {},
      before_json: null,
      after_json: null,
      ip_address: null,
      user_agent: null,
      created_at: "2026-11-12T07:00:00Z",
    });
  }

  await page.addInitScript(
    ([key, token]) => window.sessionStorage.setItem(key, token),
    [TOKEN_KEY, "session-1"],
  );
  await page.route("**/api/v1/admin/auth/me", (route) =>
    route.fulfill({ json: { id: "a1", email: author.email, role, last_login_at: null } }),
  );

  await page.route("**/api/v1/admin/support/lookup?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    lookups.push(q);
    if (q === ACCEPTED) {
      return route.fulfill({
        json: {
          query: q,
          interpreted_as: ["booking_id"],
          customers: [],
          providers: [],
          pros: [],
          bookings: [lookupRow(ACCEPTED, "accepted")],
          truncated: [],
        },
      });
    }
    if (q === "zzz") {
      return route.fulfill({
        json: {
          query: q,
          interpreted_as: ["name"],
          customers: [],
          providers: [],
          pros: [],
          bookings: [],
          truncated: [],
        },
      });
    }
    return route.fulfill({
      json: {
        query: q,
        interpreted_as: ["phone"],
        customers: [
          {
            user_id: CUSTOMER,
            name: "Asha Rao",
            phone: "+919876543301",
            created_at: "2026-10-01T05:00:00Z",
            is_active: true,
            deleted: false,
            booking_count: 4,
          },
        ],
        providers: [
          {
            user_id: SP,
            name: "Facade Owner",
            business_name: "Facade Cleaning Co",
            phone: "+919876543401",
            kyc_status: "verified",
            is_online: true,
            matched_by: "phone",
          },
        ],
        pros: [
          {
            professional_id: PRO_MEERA,
            display_name: "Meera",
            phone: "+919876543402",
            is_online: true,
            is_active: true,
            service_provider: {
              user_id: SP,
              name: "Facade Owner",
              business_name: "Facade Cleaning Co",
            },
          },
        ],
        bookings: [
          lookupRow(REQUESTED, "requested"),
          lookupRow(NOBODY, "requested"),
          lookupRow(ACCEPTED, "accepted"),
        ],
        truncated: ["bookings"],
      },
    });
  });

  await page.route("**/api/v1/admin/support/customers/*", (route) =>
    route.fulfill({
      json: {
        user_id: CUSTOMER,
        name: "Asha Rao",
        phone: "+919876543301",
        email: null,
        created_at: "2026-10-01T05:00:00Z",
        deleted_at: null,
        is_active: true,
        address_count: 2,
        lifetime_bookings: 4,
        completed_bookings: 1,
        lifetime_spend: 450,
        recent_bookings: [
          {
            id: COMPLETED,
            status: "completed",
            created_at: "2026-11-10T04:30:00Z",
            scheduled_at: null,
            service_summary: "Facade Cleaning",
            total: 450,
            payment_method: "cash",
            provider: { user_id: SP, name: "Facade Owner", business_name: "Facade Cleaning Co" },
            professional: { id: PRO_KIRAN, display_name: "Kiran" },
          },
        ],
      },
    }),
  );

  await page.route("**/api/v1/admin/bookings/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const [, id, tail] = url.pathname.match(/\/admin\/bookings\/([^/]+)(?:\/([\w-]+))?$/) ?? [];
    const found = bookings[id];
    if (!found) {
      return route.fulfill(refusal(404, "BOOKING_NOT_FOUND", `Booking ${id} not found`));
    }
    const post = request.method() === "POST";
    if (!tail) return route.fulfill({ json: found });
    if (tail === "timeline") return route.fulfill({ json: [] });
    if (tail === "notes" && !post) return route.fulfill({ json: notes[id] ?? [] });
    if ((tail === "notes" || tail === "contacted") && post) {
      const body = (request.postDataJSON() as { body?: string } | null)?.body ?? null;
      if (tail === "notes" && !body?.trim()) {
        return route.fulfill(refusal(422, "NOTE_EMPTY", "A note can't be empty."));
      }
      const note = {
        id: `n${Object.values(notes).flat().length + 1}`,
        booking_id: id,
        kind: tail === "notes" ? "note" : "contacted",
        body,
        created_at: "2026-11-12T07:00:00Z",
        author,
      };
      notes[id] = [note, ...(notes[id] ?? [])];
      record(tail === "notes" ? "booking.note_add" : "booking.contacted", id);
      return route.fulfill({ status: 201, json: note });
    }
    if (tail === "retry-dispatch" && post) {
      retries.push(id);
      if (found.status !== "requested") {
        return route.fulfill(refusal(409, "BOOKING_NOT_REQUESTED", "Not waiting."));
      }
      if (id === NOBODY) {
        return route.fulfill(
          refusal(
            409,
            "NO_ELIGIBLE_PROVIDERS",
            "No provider can be offered this booking right now.",
            {
              reason: "no_provider_covers_services",
            },
          ),
        );
      }
      if (retries.filter((r) => r === id).length > 1) {
        return route.fulfill(
          refusal(409, "DISPATCH_RETRY_TOO_SOON", "Moments ago.", { retry_after_seconds: 28 }),
        );
      }
      record("booking.retry_dispatch", id);
      return route.fulfill({
        json: {
          booking_id: id,
          status: "requested",
          recipients: 1,
          retried_at: "2026-11-12T07:00:00Z",
          offer_expires_at: "2026-11-12T07:12:00Z",
        },
      });
    }
    if (tail === "eligible-pros") {
      if (found.status !== "accepted") {
        return route.fulfill(refusal(409, "BOOKING_NOT_REASSIGNABLE", "Not accepted."));
      }
      const pro = (pid: string, name: string, eligible: boolean, code: string | null) => ({
        professional_id: pid,
        display_name: name,
        phone: "+919876543499",
        is_self: false,
        is_online: code !== "PRO_OFFLINE",
        kyc_status: "verified",
        is_current: pid === current,
        eligible: pid !== current && eligible,
        refusal_code: pid === current ? null : code,
      });
      return route.fulfill({
        json: {
          booking_id: id,
          service_provider_id: SP,
          current_professional_id: current,
          pros: [
            pro(PRO_KIRAN, "Kiran", true, null),
            pro(PRO_MEERA, "Meera", true, null),
            pro(PRO_SUNIL, "Sunil", false, "PRO_OFFLINE"),
          ],
        },
      });
    }
    if (tail === "reassign-pro" && post) {
      const body = request.postDataJSON() as { professional_id: string };
      reassigns.push(body);
      current = body.professional_id;
      found.professional = { id: current, display_name: "Meera", is_self: false };
      record("booking.reassign_pro", id);
      return route.fulfill({ json: found });
    }
    return route.fallback();
  });

  await page.route("**/api/v1/admin/audit/filters", (route) =>
    route.fulfill({ json: { admins: [], actions: [], target_types: [] } }),
  );
  await page.route("**/api/v1/admin/audit?*", (route) =>
    route.fulfill({ json: { items: audit, total: audit.length, page: 1, per_page: 50 } }),
  );

  return { retries, reassigns, lookups };
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.use({ timezoneId: "Asia/Kolkata", locale: "en-IN" });

test("lookup → open a booking → add a note → the audit log shows booking.note_add", async ({
  page,
}) => {
  const backend = await mockBackend(page, "admin");
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Admin sections" })
    .getByRole("link", { name: "Lookup" })
    .click();
  await expect(page.getByRole("heading", { name: "Lookup" })).toBeVisible();

  await page.getByLabel("Phone number, booking ID or name").fill("98765 43301");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=98765/);
  expect(backend.lookups.at(-1)).toBe("98765 43301");

  await expect(page.getByText("Searched as phone number.")).toBeVisible();
  await expect(page.getByText("Showing the first 20 bookings.")).toBeVisible();
  const results = page.getByRole("region", { name: "Lookup results" });
  await expect(results.getByRole("region", { name: "Customers" })).toContainText("Asha Rao");
  await expect(
    results
      .getByRole("region", { name: "Service providers" })
      .getByRole("link", { name: /Facade Cleaning Co/ }),
  ).toHaveAttribute("href", `/operator/sps/${SP}`);
  await expect(results.getByRole("link", { name: /Meera/ })).toHaveAttribute(
    "href",
    `/operator/pros/${PRO_MEERA}`,
  );

  await results
    .getByRole("region", { name: "Bookings" })
    .getByRole("button", { name: /4d1dd8c9/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`booking=${REQUESTED}`));
  const detail = page.getByRole("region", { name: "Booking detail" });
  await expect(detail.getByRole("heading", { name: "Booking 4d1dd8c9" })).toBeVisible();
  // The reused pane: money, including the platform commission.
  await expect(detail.getByText("Platform commission")).toBeVisible();

  // A whitespace-only note never leaves the browser.
  await detail.getByLabel("Add a note").fill("   ");
  await detail.getByRole("button", { name: "Add note" }).click();
  await expect(detail.getByRole("alert")).toHaveText("Write something first.");

  await detail.getByLabel("Add a note").fill("Customer asked for a call back <b>today</b>.");
  await detail.getByRole("button", { name: "Add note" }).click();
  const list = detail.getByRole("list", { name: "Notes" });
  await expect(list).toContainText("Customer asked for a call back <b>today</b>.");
  await expect(list).toContainText("admin433@kalpai.in");
  await expect(list).toContainText("Admin");
  // 07:00 UTC is 12:30 pm IST.
  await expect(list).toContainText("12:30 pm IST");
  await expect(detail.getByLabel("Add a note")).toHaveValue("");
  // Append-only: nothing to change or remove a note with.
  await expect(list.getByRole("button")).toHaveCount(0);

  // Mark contacted is its own action, and lands as its own kind of note.
  await detail.getByLabel("Contacted the customer").fill("Called, no answer");
  await detail.getByRole("button", { name: "Mark contacted" }).click();
  await expect(
    detail.getByRole("status").filter({ hasText: "Marked as contacted." }),
  ).toBeVisible();
  await expect(list.getByText("Contacted customer")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Admin sections" })
    .getByRole("link", { name: "Audit log" })
    .click();
  await expect(page.getByRole("cell", { name: "booking.note_add" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "booking.contacted" })).toBeVisible();

  // Back returns to the search, with the booking still open.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`booking=${REQUESTED}`));
  await expect(page.getByLabel("Phone number, booking ID or name")).toHaveValue("98765 43301");
});

test("retry dispatch: one click, the result, a too-soon second click and the no-SP booking", async ({
  page,
}) => {
  const backend = await mockBackend(page, "support");
  await page.goto(`/support/lookup?q=9876543301&booking=${REQUESTED}`);
  const detail = page.getByRole("region", { name: "Booking detail" });
  const retry = detail.getByRole("button", { name: "Retry dispatch" });

  // A double click sends one request.
  await retry.dblclick();
  await expect(detail.getByRole("status").filter({ hasText: "Sent to 1 provider." })).toContainText(
    "The new offer expires at 12:42 pm IST.",
  );
  expect(backend.retries.filter((id) => id === REQUESTED)).toHaveLength(1);

  await retry.click();
  await expect(detail.getByRole("alert")).toHaveText(
    "Dispatch was retried a moment ago. Try again in 28 seconds.",
  );

  await page
    .getByRole("region", { name: "Bookings" })
    .getByRole("button", { name: /52a82557/ })
    .click();
  await detail.getByRole("button", { name: "Retry dispatch" }).click();
  await expect(detail.getByRole("alert")).toHaveText(
    "No provider can take this booking right now: no provider offers everything in this booking.",
  );

  // Not on an accepted booking.
  await page
    .getByRole("region", { name: "Bookings" })
    .getByRole("button", { name: /634d27d9/ })
    .click();
  await expect(detail.getByRole("heading", { name: "Booking 634d27d9" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Retry dispatch" })).toHaveCount(0);
});

test("reassign Pro: ineligible Pros are disabled with the reason, and the pick lands", async ({
  page,
}) => {
  const backend = await mockBackend(page, "ops");
  // A full booking ID that found only that booking opens it straight away.
  await page.goto(`/support/lookup?q=${ACCEPTED}`);
  await expect(page).toHaveURL(new RegExp(`booking=${ACCEPTED}`));
  const detail = page.getByRole("region", { name: "Booking detail" });
  const group = detail.getByRole("group", { name: "Reassign Pro (same service provider)" });

  await expect(group.getByRole("radio", { name: /Kiran/ })).toBeDisabled();
  await expect(group.getByText("On this booking")).toBeVisible();
  await expect(group.getByRole("radio", { name: /Sunil/ })).toBeDisabled();
  await expect(group.getByText("Offline")).toBeVisible();
  const reassign = detail.getByRole("button", { name: "Reassign", exact: true });
  await expect(reassign).toBeDisabled();

  await group.getByRole("radio", { name: /Meera/ }).check();
  await reassign.click();
  await expect(
    detail.getByRole("status").filter({ hasText: "Reassigned to Meera." }),
  ).toBeVisible();
  expect(backend.reassigns).toEqual([{ professional_id: PRO_MEERA }]);
  await expect(group.getByRole("radio", { name: /Meera/ })).toBeDisabled();
  await expect(detail.getByRole("link", { name: "Meera" })).toBeVisible();

  // Refunds stay on their own screen.
  await expect(detail.getByRole("link", { name: "Disputes & refunds" }).first()).toHaveAttribute(
    "href",
    `/operator/refunds/${ACCEPTED}`,
  );
});

test("a customer: profile, a recent booking, back to them, and View all", async ({ page }) => {
  await mockBackend(page, "support");
  await page.goto("/support/lookup?q=9876543301");
  await page
    .getByRole("region", { name: "Customers" })
    .getByRole("button", { name: /Asha Rao/ })
    .click();

  const detail = page.getByRole("region", { name: "Customer detail" });
  await expect(detail.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
  await expect(detail).toContainText("4 (1 completed)");
  await expect(detail).toContainText("₹450");
  await expect(detail.getByRole("link", { name: "View all" })).toHaveAttribute(
    "href",
    `/operator/bookings?consumer=${CUSTOMER}`,
  );

  await detail.getByRole("button", { name: /33a823f6/ }).click();
  const booking = page.getByRole("region", { name: "Booking detail" });
  await expect(booking.getByRole("heading", { name: "Booking 33a823f6" })).toBeVisible();
  // A completed booking has neither status-bound action.
  await expect(booking.getByRole("button", { name: "Retry dispatch" })).toHaveCount(0);
  await expect(booking.getByRole("group", { name: /Reassign Pro/ })).toHaveCount(0);

  await booking.getByRole("button", { name: "Back to customer" }).click();
  await expect(page.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
});

test("nothing found, and a query too short to send", async ({ page }) => {
  const backend = await mockBackend(page, "support");
  await page.goto("/support/lookup");
  await page.getByLabel("Phone number, booking ID or name").fill("ab");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("alert")).toContainText("Type at least 3 characters");
  expect(backend.lookups).toHaveLength(0);

  await page.getByLabel("Phone number, booking ID or name").fill("zzz");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Nothing matches “zzz”.")).toBeVisible();
});

for (const role of ["ops", "support"] as const) {
  test(`${role} sees the lookup and every support action`, async ({ page }) => {
    await mockBackend(page, role);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Admin sections" });
    await expect(nav.getByRole("heading", { name: "Support" })).toBeVisible();
    await nav.getByRole("link", { name: "Lookup" }).click();
    await expect(page.getByRole("heading", { name: "Lookup" })).toBeVisible();

    await page.goto(`/support/lookup?q=9876543301&booking=${REQUESTED}`);
    const detail = page.getByRole("region", { name: "Booking detail" });
    await expect(detail.getByLabel("Add a note")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Mark contacted" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Retry dispatch" })).toBeVisible();

    await page.goto(`/support/lookup?q=9876543301&booking=${ACCEPTED}`);
    await expect(detail.getByRole("group", { name: /Reassign Pro/ })).toBeVisible();
    // Force cancel follows the bookings screen: ops yes, support no.
    await expect(detail.getByRole("button", { name: "Force cancel" })).toHaveCount(
      role === "ops" ? 1 : 0,
    );
  });
}

for (const width of [375, 320]) {
  test(`fits a ${width}px phone with a booking open`, async ({ page }) => {
    await mockBackend(page, "support");
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/support/lookup?q=9876543301&booking=${ACCEPTED}`);
    await expect(
      page
        .getByRole("region", { name: "Booking detail" })
        .getByRole("group", { name: /Reassign Pro/ }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}
