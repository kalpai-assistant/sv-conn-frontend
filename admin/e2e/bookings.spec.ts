/**
 * The bookings screen in a real browser, with the API mocked (SVC-425). The shape
 * of each mock is GET /admin/bookings, /admin/bookings/{id}, its /timeline and
 * POST .../cancel in the backend's app/routers/admin.py. Each flow runs in both
 * colour schemes, because night mode only swaps tokens and fixed colours can clash.
 *
 * The mocks can't see an audit row: booking.force_cancel is the backend's test.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";

type Role = "admin" | "ops" | "support";

const ID_A = "3f2c9a1e-0b6d-4c1e-9a7f-1d2e3f4a5b6c";
const ID_B = "7a8b9c0d-1e2f-4a5b-8c6d-7e8f9a0b1c2d";

function makeBooking(id: string, status: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    consumer_id: "c1",
    provider_id: "sp1",
    items: [
      {
        id: `${id}-i1`,
        service_id: "s1",
        service_name: "Deep Clean",
        variant_label: "2 BHK",
        quantity: 1,
        unit_price: 1499,
        total_price: 1499,
      },
    ],
    status,
    service_amount: 1499,
    platform_commission: 224.85,
    provider_payout: 1274.15,
    discount_amount: 0,
    tip_amount: 0,
    payment_method: "cash",
    payment_status: "pending",
    address: null,
    is_disputed: false,
    consumer_phone: "+919876542501",
    provider_name: "Sharma Plumbing",
    professional: { id: "p1", display_name: "Vikram Sharma", is_self: true },
    service_provider: { user_id: "sp1", business_name: "Sharma Plumbing" },
    scheduled_at: null,
    created_at: "2026-11-05T06:30:00Z",
    ...overrides,
  };
}

/** Signs in by seeding the token, and keeps two bookings that change as a cancel lands. */
async function mockBackend(page: Page, role: Role = "admin") {
  const bookings = [
    makeBooking(ID_A, "en_route"),
    makeBooking(ID_B, "completed", {
      provider_name: "Ramesh Cleaning Co",
      consumer_phone: "+919876542502",
      is_disputed: true,
      created_at: "2026-11-01T10:00:00Z",
    }),
  ];
  const timelines: Record<string, unknown[]> = {
    [ID_A]: [
      {
        type: "status",
        created_at: "2026-11-05T06:31:00Z",
        from_status: "requested",
        to_status: "accepted",
        actor_user_id: "sp1",
        actor_name: "Sharma Plumbing",
        note: null,
      },
      {
        type: "assignment",
        created_at: "2026-11-05T06:31:05Z",
        kind: "claimed",
        from_professional: null,
        to_professional: { id: "p1", display_name: "Vikram Sharma" },
        actor_user_id: "sp1",
        actor_name: "Sharma Plumbing",
        note: null,
      },
      {
        type: "status",
        created_at: "2026-11-05T07:00:00Z",
        from_status: "accepted",
        to_status: "en_route",
        actor_user_id: null,
        actor_name: null,
        note: "Started by the system",
      },
    ],
    [ID_B]: [],
  };
  const listCalls: URLSearchParams[] = [];
  const cancels: { id: string; body: unknown }[] = [];

  await page.addInitScript(
    ([key, token]) => window.sessionStorage.setItem(key, token),
    [TOKEN_KEY, "session-1"],
  );
  await page.route("**/api/v1/admin/auth/me", (route) =>
    route.fulfill({
      json: { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null },
    }),
  );
  await page.route("**/api/v1/admin/bookings**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const [, id, tail] = url.pathname.match(/\/admin\/bookings(?:\/([^/]+))?(?:\/(\w+))?$/) ?? [];
    if (!id) {
      listCalls.push(url.searchParams);
      const status = url.searchParams.get("status");
      const rows = bookings.filter((b) => !status || b.status === status);
      return route.fulfill({ json: { bookings: rows, total: rows.length, page: 1, per_page: 25 } });
    }
    const found = bookings.find((b) => b.id === id);
    if (!found) {
      return route.fulfill({
        status: 404,
        json: { error: true, message: `Booking ${id} not found`, code: "BOOKING_NOT_FOUND" },
      });
    }
    if (tail === "timeline") {
      return route.fulfill({ json: timelines[id] });
    }
    if (tail === "cancel" && request.method() === "POST") {
      const body = request.postDataJSON() as { reason: string };
      cancels.push({ id, body });
      found.status = "cancelled";
      timelines[id].push({
        type: "status",
        created_at: "2026-11-05T08:00:00Z",
        from_status: "en_route",
        to_status: "cancelled",
        actor_user_id: "a1",
        actor_name: "Ops Person",
        note: body.reason,
      });
      return route.fulfill({ json: { ...found, cancellation_reason: body.reason } });
    }
    return route.fulfill({
      json: {
        ...found,
        address: {
          id: "addr1",
          label: "Home",
          full_address: "42, 7th Cross, JP Nagar, Bengaluru 560078",
          lat: null,
          lng: null,
        },
        cancellation_reason: found.status === "cancelled" ? "Provider unreachable" : null,
      },
    });
  });

  return { listCalls, cancels };
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const pane = (page: Page) => page.getByRole("region", { name: "Booking detail" });
const listRegion = (page: Page) => page.getByRole("region", { name: "Booking list" });

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 800 } });

    test("filter, open a booking, see its timeline", async ({ page }) => {
      const backend = await mockBackend(page);
      await page.goto("/");
      await page
        .getByRole("navigation", { name: "Admin sections" })
        .getByRole("link", { name: "Bookings" })
        .click();
      await expect(page.getByRole("heading", { level: 1, name: "Bookings" })).toBeVisible();
      await expect(listRegion(page).getByRole("button", { name: /^Open booking/ })).toHaveCount(2);

      await page.getByRole("combobox", { name: "Status" }).click();
      await page.getByRole("option", { name: "En route" }).click();
      await expect(page).toHaveURL(/status=en_route/);
      await expect(listRegion(page).getByRole("button", { name: /^Open booking/ })).toHaveCount(1);
      expect(backend.listCalls.at(-1)?.get("status")).toBe("en_route");

      await listRegion(page).getByRole("button", { name: "Open booking 3f2c9a1e" }).click();
      await expect(page).toHaveURL(new RegExp(`booking=${ID_A}`));
      await expect(pane(page).getByText(/JP Nagar/)).toBeVisible();

      const timeline = pane(page).getByRole("list", { name: "Timeline entries" });
      await expect(timeline.getByRole("listitem")).toHaveCount(3);
      await expect(timeline).toContainText("Requested → Accepted");
      await expect(timeline).toContainText("Pro assigned");
      await expect(timeline).toContainText("nobody → Vikram Sharma");
      await expect(timeline).toContainText("By System");

      // A refresh reopens the same booking under the same filter.
      await page.reload();
      await expect(pane(page).getByRole("heading", { name: "Booking 3f2c9a1e" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Status" })).toHaveText("En route");
    });

    test("ops force-cancels a booking with a reason", async ({ page }) => {
      const backend = await mockBackend(page, "ops");
      await page.goto(`/operator/bookings?booking=${ID_A}`);

      await pane(page).getByRole("button", { name: "Force cancel" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Cash booking: no money moves.");

      await dialog.getByRole("button", { name: "Force cancel" }).click();
      await expect(dialog.getByRole("alert")).toHaveText("Enter a reason.");
      expect(backend.cancels).toEqual([]);

      await dialog.getByLabel("Reason (required)").fill("  Provider unreachable  ");
      await dialog.getByRole("button", { name: "Force cancel" }).click();

      await expect(pane(page).getByRole("status")).toHaveText("Booking cancelled.");
      await expect(dialog).toHaveCount(0);
      expect(backend.cancels).toEqual([{ id: ID_A, body: { reason: "Provider unreachable" } }]);
      await expect(pane(page).getByRole("button", { name: "Force cancel" })).toHaveCount(0);
      await expect(pane(page).getByText("Provider unreachable").first()).toBeVisible();
      await expect(
        pane(page).getByRole("list", { name: "Timeline entries" }).getByRole("listitem"),
      ).toHaveCount(4);
      // With the detail open the list pane is narrow, so it shows cards, not the table.
      const card = listRegion(page).getByRole("button", { name: "Open booking 3f2c9a1e" });
      await expect(card).toContainText("Cancelled");
    });

    test("support reads a booking and can't cancel it", async ({ page }) => {
      await mockBackend(page, "support");
      await page.goto(`/operator/bookings?booking=${ID_A}`);
      await expect(pane(page).getByRole("region", { name: "Payment" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Force cancel" })).toHaveCount(0);
    });
  });
}

test.describe("at phone width", () => {
  test.use({ viewport: { width: 375, height: 800 }, colorScheme: "dark" });

  test("cards instead of a table, the detail stacks below, and nothing scrolls sideways", async ({
    page,
  }) => {
    await mockBackend(page);
    await page.goto("/operator/bookings");
    await expect(page.getByRole("list", { name: "Bookings" })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();

    await page
      .getByRole("list", { name: "Bookings" })
      .getByRole("button", { name: "Open booking 3f2c9a1e" })
      .click();
    await expect(pane(page).getByRole("region", { name: "Payment" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("a wrong ID says so, and an unknown one says there's no such booking", async ({ page }) => {
    await mockBackend(page);
    await page.goto("/operator/bookings");
    await page.getByLabel("Booking ID").fill("3f2c9a1e");
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByText("Paste the full booking ID")).toBeVisible();

    await page.getByLabel("Booking ID").fill("00000000-0000-4000-8000-000000000000");
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(pane(page).getByText("No booking with this ID")).toBeVisible();
  });
});
