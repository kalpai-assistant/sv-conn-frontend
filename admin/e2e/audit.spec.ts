/**
 * The audit log in a real browser, with the API mocked (SVC-423). The shape of
 * each mock is /admin/audit in the backend's app/routers/admin_audit.py.
 *
 * The time zone is fixed to India so the local-date and local-time checks mean
 * something on a CI runner in UTC.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";

type Role = "admin" | "ops" | "support";

const FILTERS = {
  admins: [
    { id: "a1", name: "Asha", email: "asha@eazyserv.local" },
    { id: "a2", name: null, email: "noname@eazyserv.local" },
  ],
  actions: ["kyc.approve", "service.create"],
  target_types: ["provider", "service"],
};

const ENTRY = {
  id: "e1",
  admin_user_id: "a1",
  admin_name: "Asha",
  admin_email: "asha@eazyserv.local",
  action: "kyc.approve",
  target_type: "provider",
  target_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  sp_user_id: null,
  to_sp_user_id: null,
  reason: '<img src=x onerror="window.pwned=1">',
  details: {},
  before_json: { kyc_status: "pending" },
  after_json: { kyc_status: "verified" },
  ip_address: null,
  user_agent:
    "Mozilla/5.0 (Linux; Android 14; a-very-long-device-name-with-no-spaces-at-all-0123456789-0123456789-0123456789)",
  created_at: "2026-11-06T14:37:03Z",
};

/** Signs in by seeding the token: the sign-in flow itself is login.spec.ts. */
async function mockBackend(page: Page, role: Role = "admin") {
  const auditQueries: URLSearchParams[] = [];

  await page.addInitScript(
    ([key, token]) => window.sessionStorage.setItem(key, token),
    [TOKEN_KEY, "session-1"],
  );
  await page.route("**/api/v1/admin/auth/me", (route) =>
    route.fulfill({
      json: { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null },
    }),
  );
  await page.route("**/api/v1/admin/audit/filters", (route) => route.fulfill({ json: FILTERS }));
  await page.route("**/api/v1/admin/audit?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    auditQueries.push(query);
    const pageNumber = Number(query.get("page"));
    const action = query.get("action");
    const items =
      action === "service.create"
        ? []
        : [
            {
              ...ENTRY,
              id: `e${pageNumber}`,
              action: pageNumber === 2 ? "page.two" : ENTRY.action,
            },
          ];
    return route.fulfill({
      json: { items, total: action === "service.create" ? 0 : 68, page: pageNumber, per_page: 50 },
    });
  });

  return { lastQuery: () => auditQueries.at(-1), queryCount: () => auditQueries.length };
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.use({ timezoneId: "Asia/Kolkata", locale: "en-IN" });

test("an admin filters, pages and expands a row", async ({ page }) => {
  const backend = await mockBackend(page);
  await page.goto("/");

  await page
    .getByRole("navigation", { name: "Admin sections" })
    .getByRole("link", { name: "Audit log" })
    .click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

  // 14:37 UTC is 20:07 in India.
  await expect(page.getByRole("cell", { name: /8:07:03/ })).toBeVisible();
  await expect(page.getByText("Page 1 of 2 · 68 entries")).toBeVisible();
  expect(backend.lastQuery()?.get("per_page")).toBe("50");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("cell", { name: "page.two" })).toBeVisible();
  await expect(page.getByText("Page 2 of 2 · 68 entries")).toBeVisible();

  // A filter goes back to page 1.
  await page.getByRole("combobox", { name: "Target type" }).click();
  await page.getByRole("option", { name: "provider" }).click();
  await expect(page.getByRole("cell", { name: "kyc.approve" })).toBeVisible();
  expect(backend.lastQuery()?.get("target_type")).toBe("provider");
  expect(backend.lastQuery()?.get("page")).toBe("1");

  // A day in India starts at 18:30 UTC the day before. To includes its whole day.
  await page.getByLabel("From").fill("2026-11-01");
  await page.getByLabel("To").fill("2026-11-06");
  await expect.poll(() => backend.lastQuery()?.get("date_to")).toBe("2026-11-06T18:30:00.000Z");
  expect(backend.lastQuery()?.get("date_from")).toBe("2026-10-31T18:30:00.000Z");

  await page.getByRole("button", { name: "Show details" }).click();
  await expect(page.getByText('"kyc_status": "pending"')).toBeVisible();
  await expect(page.getByText('"kyc_status": "verified"')).toBeVisible();
  await expect(page.getByText(ENTRY.user_agent)).toBeVisible();

  // The reason is markup from outside: it shows as text, and nothing runs.
  await expect(page.getByText(ENTRY.reason)).toBeVisible();
  await expect(page.locator("main img")).toHaveCount(0);
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);

  // Empty values read "None": the IP, and Details.
  await expect(page.getByText("None", { exact: true })).toHaveCount(2);

  await page.getByRole("button", { name: "Hide details" }).click();
  await expect(page.getByText('"kyc_status": "pending"')).toHaveCount(0);
});

test("a filter that matches nothing shows the empty message", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/audit");

  await page.getByRole("combobox", { name: "Action" }).click();
  await page.getByRole("option", { name: "service.create" }).click();

  await expect(page.getByText("No audit entries match these filters")).toBeVisible();
});

test("a failed load shows an error, and Try again recovers", async ({ page }) => {
  await mockBackend(page);
  await page.route("**/api/v1/admin/audit?*", (route) =>
    route.fulfill({ status: 500, json: { error: true, message: "Boom", status_code: 500 } }),
  );
  await page.goto("/audit");

  await expect(page.getByText("Couldn't load the audit log.")).toBeVisible();

  await page.unroute("**/api/v1/admin/audit?*");
  await mockBackend(page);
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("cell", { name: "kyc.approve" })).toBeVisible();
});

test("in night mode the date inputs draw their calendar icon for a dark page", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await mockBackend(page);
  await page.goto("/audit");

  await expect(page.getByLabel("From")).toHaveCSS("color-scheme", "light dark");
  await expect(page.getByLabel("To")).toHaveCSS("color-scheme", "light dark");
});

test("before and after sit side by side on a desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockBackend(page);
  await page.goto("/audit");

  await page.getByRole("button", { name: "Show details" }).click();

  const before = await page.getByRole("heading", { name: "Before" }).boundingBox();
  const after = await page.getByRole("heading", { name: "After" }).boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x);
  expect(after!.y).toBe(before!.y);
});

test("at phone width they stack, and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockBackend(page);
  await page.goto("/audit");

  await expect(page.getByRole("cell", { name: "kyc.approve" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Show details" }).click();

  const before = await page.getByRole("heading", { name: "Before" }).boundingBox();
  const after = await page.getByRole("heading", { name: "After" }).boundingBox();
  expect(after!.x).toBe(before!.x);
  expect(after!.y).toBeGreaterThan(before!.y);

  // A User-Agent with no spaces has to wrap, not widen the page.
  await expect(page.getByText(ENTRY.user_agent)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

for (const role of ["ops", "support"] as const) {
  test(`${role} has no sidebar entry, and /audit by URL goes home`, async ({ page }) => {
    const backend = await mockBackend(page, role);
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Admin sections" });
    await expect(nav.getByRole("link", { name: "KYC" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Audit log" })).toHaveCount(0);

    await page.goto("/audit");

    await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();
    await expect(page).toHaveURL(/localhost:5174\/$/);
    expect(backend.queryCount()).toBe(0);
  });
}
