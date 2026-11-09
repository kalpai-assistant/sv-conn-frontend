/**
 * The payouts screen in a real browser, with the API mocked (SVC-426). The shape of
 * each mock is the backend's app/schemas/payout.py. Each flow runs in both colour
 * schemes, because night mode only swaps tokens and fixed colours can clash.
 *
 * The mocks can't see an audit row: payout.enqueue is the backend's test.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";

type Role = "admin" | "ops" | "support";

const SP_A = "5b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const SP_B = "6c2e3d4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f";
const BOOKING_A = "8d3f4e5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";

function provider(id: string, overrides: Record<string, unknown> = {}) {
  return {
    provider_id: id,
    name: "Ramesh Kumar",
    business_name: "Ramesh Cleaning Co",
    phone: "+919876500001",
    is_active: true,
    payout_set: true,
    kyc_status: "verified",
    pending_count: 5,
    pending_paise: 749_950,
    processing_count: 0,
    processing_paise: 0,
    completed_count: 4,
    completed_paise: 512_000,
    failed_count: 0,
    failed_paise: 0,
    reversed_count: 0,
    reversed_paise: 0,
    earned_count: 9,
    earned_paise: 1_261_950,
    payable_paise: 749_950,
    latest_failure_reason: null,
    ...overrides,
  };
}

async function mockBackend(page: Page, role: Role = "admin") {
  const providers = [
    provider(SP_A),
    provider(SP_B, {
      name: "Vikram Sharma",
      business_name: "Sharma Plumbing",
      phone: "+919876500002",
      pending_count: 2,
      pending_paise: 300_000,
      payable_paise: 300_000,
      failed_count: 3,
      failed_paise: 450_000,
      earned_count: 5,
      earned_paise: 750_000,
      completed_count: 0,
      completed_paise: 0,
      latest_failure_reason: "IMPS_BENEFICIARY_ACCOUNT_INVALID",
    }),
  ];
  const history: Record<string, Record<string, unknown>[]> = {
    [SP_A]: [
      {
        audit_id: "a0000000-0000-4000-8000-000000000001",
        payout_id: "pout_1",
        reference_id: "ref-1",
        amount_paise: 512_000,
        booking_count: 4,
        outcome: "processed",
        source: "admin",
        admin_user_id: "a1",
        admin_name: "Asha Admin",
        error: null,
        created_at: "2026-11-01T10:00:00Z",
      },
      {
        audit_id: "a0000000-0000-4000-8000-000000000002",
        payout_id: "pout_0",
        reference_id: "ref-0",
        amount_paise: 100_000,
        booking_count: 1,
        outcome: "completed",
        source: "reconciliation",
        admin_user_id: null,
        admin_name: null,
        error: null,
        created_at: "2026-10-20T10:00:00Z",
      },
    ],
    [SP_B]: [],
  };
  const payouts: string[] = [];
  const exports: URLSearchParams[] = [];

  await page.addInitScript(
    ([key, token]) => window.sessionStorage.setItem(key, token),
    [TOKEN_KEY, "session-1"],
  );
  await page.route("**/api/v1/admin/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1\/admin/, "");
    const method = request.method();

    if (path === "/auth/me") {
      return route.fulfill({
        json: { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null },
      });
    }
    if (path === "/payouts/providers") {
      return route.fulfill({
        json: { providers, total: providers.length, page: 1, per_page: 25 },
      });
    }
    if (path === "/payouts/export.csv") {
      exports.push(url.searchParams);
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="payouts_${url.searchParams.get("from")}_${url.searchParams.get("to")}.csv"`,
        },
        body: "sp_id,sp_name,booking_id,locked_price,commission,sp_payout,booking_completed_at,payout_status\n",
      });
    }
    const match = path.match(/^\/providers\/([^/]+)\/(payout-bookings|payouts|payout)$/);
    if (match) {
      const [, id, tail] = match;
      if (tail === "payout-bookings") {
        const rows =
          id === SP_A
            ? [
                {
                  booking_id: BOOKING_A,
                  completed_at: "2026-11-05T09:30:00Z",
                  service_amount_paise: 149_900,
                  discount_amount_paise: 10_000,
                  platform_commission_paise: 22_485,
                  provider_payout_paise: 117_415,
                  tip_amount_paise: 5_000,
                  settlement_status: "pending",
                  settlement_payout_id: null,
                  settlement_failure_reason: null,
                  professional_name: "Vikram Sharma",
                },
              ]
            : [];
        return route.fulfill({
          json: { bookings: rows, total: rows.length, page: 1, per_page: 25 },
        });
      }
      if (tail === "payouts") {
        const entries = history[id] ?? [];
        return route.fulfill({ json: { entries, total: entries.length, page: 1, per_page: 25 } });
      }
      if (tail === "payout" && method === "POST") {
        if (role === "support") {
          return route.fulfill({ status: 403, json: { detail: "Requires role: admin, ops" } });
        }
        payouts.push(id);
        history[id].unshift({
          audit_id: "a0000000-0000-4000-8000-000000000009",
          payout_id: null,
          reference_id: "ref-9",
          amount_paise: 749_950,
          booking_count: 5,
          outcome: "attempting",
          source: "admin",
          admin_user_id: "a1",
          admin_name: "Ops Person",
          error: null,
          created_at: new Date().toISOString(),
        });
        return route.fulfill({
          status: 202,
          json: { status: "queued", task_id: "t1", amount_paise: 749_950, booking_count: 5 },
        });
      }
    }
    return route.fulfill({ status: 404, json: { detail: `Unmocked ${method} ${path}` } });
  });

  return { payouts, exports };
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const pane = (page: Page) => page.getByRole("region", { name: "Service provider detail" });
const listRegion = (page: Page) => page.getByRole("region", { name: "Service provider list" });

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 800 } });

    test("pick an SP, see the bookings behind it, then its history", async ({ page }) => {
      await mockBackend(page, "support");
      await page.goto("/");
      await page
        .getByRole("navigation", { name: "Admin sections" })
        .getByRole("link", { name: "Payouts" })
        .click();
      await expect(page.getByRole("heading", { level: 1, name: "Payouts" })).toBeVisible();
      // Wide enough for the table before an SP opens.
      await expect(listRegion(page).getByRole("table")).toBeVisible();

      await listRegion(page).getByRole("button", { name: "Open Ramesh Cleaning Co" }).click();
      await expect(page).toHaveURL(new RegExp(`sp=${SP_A}`));

      const recon = pane(page).getByRole("region", { name: "Reconciliation" });
      await expect(recon).toContainText("Sends now");
      await expect(recon).toContainText("₹7,499.50");

      const bookings = pane(page).getByRole("region", { name: "Contributing bookings" });
      await expect(bookings).toContainText("₹1,174.15");
      const link = bookings.getByRole("link", { name: "Booking 8d3f4e5a" }).first();
      await expect(link).toHaveAttribute("href", `/operator/bookings?booking=${BOOKING_A}`);

      const history = pane(page).getByRole("region", { name: "Payout history" });
      await expect(history).toContainText("Asha Admin");
      await expect(history).toContainText("System");

      // A refresh reopens the same SP.
      await page.reload();
      await expect(pane(page).getByRole("heading", { name: "Ramesh Cleaning Co" })).toBeVisible();
    });

    test("ops pays out an SP and the attempt holds the button", async ({ page }) => {
      const backend = await mockBackend(page, "ops");
      await page.goto(`/operator/payouts?sp=${SP_A}`);

      await pane(page).getByRole("button", { name: "Pay out ₹7,499.50" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("for 5 bookings pending");
      await dialog.getByRole("button", { name: "Pay out ₹7,499.50" }).click();

      await expect(pane(page).getByRole("status")).toContainText("Queued ₹7,499.50 for 5 bookings");
      await expect(dialog).toHaveCount(0);
      expect(backend.payouts).toEqual([SP_A]);
      await expect(pane(page).getByRole("button", { name: "Pay out ₹7,499.50" })).toBeDisabled();
      await expect(
        pane(page).getByRole("region", { name: "Payout history" }).getByText("Attempting").first(),
      ).toBeVisible();
      // Ops never sees the admin-only requeue, and this SP has nothing failed.
      await expect(pane(page).getByRole("button", { name: /Re-queue/ })).toHaveCount(0);
    });

    test("support reads an SP and has no buttons", async ({ page }) => {
      await mockBackend(page, "support");
      await page.goto(`/operator/payouts?sp=${SP_B}`);
      await expect(pane(page).getByRole("note", { name: "Latest failure" })).toContainText(
        "IMPS_BENEFICIARY_ACCOUNT_INVALID",
      );
      await expect(pane(page).getByRole("region", { name: "Reconciliation" })).toBeVisible();
      await expect(pane(page).getByRole("button", { name: /Pay out|Re-queue/ })).toHaveCount(0);
    });

    test("downloads the CSV for a date range", async ({ page }) => {
      const backend = await mockBackend(page, "support");
      await page.goto("/operator/payouts");
      const form = page.getByRole("form", { name: "Export CSV" });
      await form.getByLabel("Completed from (IST)").fill("2026-10-01");
      await form.getByLabel("Completed to (IST)").fill("2026-10-31");

      const download = page.waitForEvent("download");
      await form.getByRole("button", { name: "Download CSV" }).click();
      expect((await download).suggestedFilename()).toBe("payouts_2026-10-01_2026-10-31.csv");
      expect(backend.exports.at(-1)?.toString()).toBe("from=2026-10-01&to=2026-10-31");
      await expect(form.getByRole("status")).toContainText(
        "Saved payouts_2026-10-01_2026-10-31.csv",
      );
    });
  });
}

test.describe("at phone width", () => {
  test.use({ viewport: { width: 375, height: 800 }, colorScheme: "dark" });

  test("cards instead of tables, the detail stacks below, and nothing scrolls sideways", async ({
    page,
  }) => {
    await mockBackend(page, "admin");
    await page.goto("/operator/payouts");
    await expect(page.getByRole("list", { name: "Service providers" })).toBeVisible();
    await expect(listRegion(page).getByRole("table")).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page
      .getByRole("list", { name: "Service providers" })
      .getByRole("button", { name: "Open Sharma Plumbing" })
      .click();
    // Stacked below the list: the tap has to bring the detail on screen.
    await expect(pane(page).getByRole("heading", { name: "Sharma Plumbing" })).toBeInViewport();
    await expect(pane(page).getByRole("button", { name: "Re-queue failed (3)" })).toBeVisible();
    await expect(pane(page).getByRole("region", { name: "Payout history" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page.goto(`/operator/payouts?sp=${SP_A}`);
    await expect(pane(page).getByRole("region", { name: "Contributing bookings" })).toContainText(
      "₹1,174.15",
    );
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
