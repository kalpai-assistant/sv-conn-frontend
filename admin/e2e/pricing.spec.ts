/**
 * The pricing tabs in a real browser, with the API mocked (SVC-428). The shape
 * of each mock is the backend's app/schemas/admin_pricing.py, and the mock
 * keeps state and applies the backend's sensitive/bounds rules, so a reload
 * shows what a save really persisted. Each flow runs in both colour schemes,
 * because night mode only swaps tokens and fixed colours can clash.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";

type Role = "admin" | "ops" | "support";
type Json = Record<string, unknown>;

const CLEANING = "c0000000-0000-4000-8000-000000000001";
const DEEP = "c0000000-0000-4000-8000-000000000002";
const OLD_SALON = "c0000000-0000-4000-8000-000000000003";
const HOME_REPAIR = "c0000000-0000-4000-8000-000000000004";
const PLUMBING = "c0000000-0000-4000-8000-000000000005";
const MISC = "c0000000-0000-4000-8000-000000000006";

function category(id: string, name: string, parent: [string, string] | null, extra: Json = {}) {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    parent_id: parent?.[0] ?? null,
    parent_name: parent?.[1] ?? null,
    sort_order: 0,
    is_active: true,
    is_sensitive: false,
    reference_price: null,
    bounds_pct: null,
    platform_commission_pct: 20,
    platform_commission_min: 30,
    commission_gst_pct: 18,
    ...extra,
  } as Json;
}

function invalid(field: string, message: string) {
  return { status: 422, json: { message, code: "PRICING_INVALID", details: { field } } };
}

async function mockBackend(page: Page, role: Role) {
  const categories: Json[] = [
    category(CLEANING, "Cleaning", null),
    category(DEEP, "Deep cleaning", [CLEANING, "Cleaning"], { reference_price: 1499 }),
    category(OLD_SALON, "Old salon", [CLEANING, "Cleaning"], {
      is_active: false,
      reference_price: 499,
      platform_commission_pct: 25,
      platform_commission_min: 50,
    }),
    category(HOME_REPAIR, "Home repair", null),
    category(PLUMBING, "Plumbing", [HOME_REPAIR, "Home repair"], {
      is_sensitive: true,
      bounds_pct: 20,
      reference_price: 299,
    }),
    category(MISC, "Miscellaneous", null),
  ];
  const config: Json[] = [
    {
      key: "ranking_weights",
      value: { rating: 0.35, price_vs_ref: 0.25, distance: 0.2, reliability: 0.15, activity: 0.05 },
      updated_at: "2026-11-01T10:00:00Z",
      updated_by: null,
    },
    { key: "boost_window_days", value: 14, updated_at: "2026-11-01T10:00:00Z", updated_by: null },
    { key: "boost_window_jobs", value: 10, updated_at: "2026-11-01T10:00:00Z", updated_by: null },
    { key: "sheet_ttl_seconds", value: 600, updated_at: "2026-11-01T10:00:00Z", updated_by: null },
  ];
  const patches: { path: string; body: Json }[] = [];

  await page.addInitScript(
    ([key, token]) => window.sessionStorage.setItem(key, token),
    [TOKEN_KEY, "session-1"],
  );
  await page.route("**/api/v1/admin/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1\/admin/, "");
    const method = request.method();

    if (path === "/auth/me") {
      return route.fulfill({
        json: { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null },
      });
    }
    if (method === "GET" && path === "/pricing/categories") {
      return route.fulfill({ json: categories });
    }
    if (method === "GET" && path === "/pricing/config") {
      return route.fulfill({ json: config });
    }
    if (method === "PATCH" && role === "support") {
      return route.fulfill({ status: 403, json: { message: "Forbidden", code: "FORBIDDEN" } });
    }
    let match = path.match(/^\/pricing\/categories\/([^/]+)$/);
    if (method === "PATCH" && match) {
      const body = request.postDataJSON() as Json;
      patches.push({ path, body });
      const index = categories.findIndex((row) => row.id === match![1]);
      const next = { ...categories[index], ...body };
      if (body.is_sensitive === false) next.bounds_pct = null;
      if (next.is_sensitive && next.bounds_pct === null) {
        return route.fulfill(invalid("bounds_pct", "A sensitive category needs bounds_pct"));
      }
      if (!next.is_sensitive && body.bounds_pct != null) {
        return route.fulfill(
          invalid("bounds_pct", "bounds_pct applies only to a sensitive category"),
        );
      }
      categories[index] = next;
      return route.fulfill({ json: next });
    }
    match = path.match(/^\/pricing\/config\/([^/]+)$/);
    if (method === "PATCH" && match) {
      const body = request.postDataJSON() as Json;
      patches.push({ path, body });
      const index = config.findIndex((row) => row.key === match![1]);
      config[index] = { ...config[index], value: body.value, updated_at: "2026-11-09T06:30:00Z" };
      return route.fulfill({ json: config[index] });
    }
    return route.fulfill({ status: 404, json: { message: `Unmocked ${method} ${path}` } });
  });
  return { patches };
}

const categoriesTable = (page: Page) => page.getByRole("table", { name: "Categories" });

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 900 } });

    test("admin ticks Sensitive, enters bounds, saves, and it's still there after a reload", async ({
      page,
    }) => {
      const { patches } = await mockBackend(page, "admin");
      await page.goto("/operator/pricing");
      await expect(page).toHaveURL(/\/operator\/pricing\/categories$/);
      const table = categoriesTable(page);

      await table.getByRole("checkbox", { name: "Sensitive: Deep cleaning" }).check();
      const bounds = table.getByRole("textbox", { name: "Bounds for Deep cleaning" });
      await expect(bounds).toBeFocused();
      expect(patches).toHaveLength(0);
      await bounds.fill("25");
      await bounds.press("Enter");

      await expect(
        table.getByRole("button", { name: /^Edit Bounds for Deep cleaning, ±25%/ }),
      ).toBeVisible();
      expect(patches).toEqual([
        {
          path: `/pricing/categories/${DEEP}`,
          body: { is_sensitive: true, bounds_pct: 25 },
        },
      ]);

      await page.reload();
      await expect(table.getByRole("checkbox", { name: "Sensitive: Deep cleaning" })).toBeChecked();
      await expect(
        table.getByRole("button", { name: /^Edit Bounds for Deep cleaning, ±25%/ }),
      ).toBeVisible();

      // Unticking saves at once, and the bounds go with it.
      await table.getByRole("checkbox", { name: "Sensitive: Deep cleaning" }).uncheck();
      await page.reload();
      await expect(
        table.getByRole("checkbox", { name: "Sensitive: Deep cleaning" }),
      ).not.toBeChecked();
      await expect(table.getByRole("row", { name: /Deep cleaning/ })).toContainText("—");
      expect(patches.at(-1)?.body).toEqual({ is_sensitive: false });
    });

    test("a refused save rolls back, with the backend's message under the cell", async ({
      page,
    }) => {
      await mockBackend(page, "ops");
      // Later routes win: refuse just this one save, as the backend would.
      await page.route(`**/api/v1/admin/pricing/categories/${MISC}`, (route) =>
        route.request().method() === "PATCH"
          ? route.fulfill(
              invalid("platform_commission_min", "platform_commission_min must be 0 or more"),
            )
          : route.fallback(),
      );
      await page.goto("/operator/pricing/categories");
      const table = categoriesTable(page);

      await table.getByRole("button", { name: /^Edit Floor for Miscellaneous, ₹30/ }).click();
      const input = table.getByRole("textbox", { name: "Floor for Miscellaneous" });
      await input.fill("45");
      await input.press("Enter");

      const row = table.getByRole("row", { name: /Miscellaneous/ });
      await expect(row.getByRole("alert")).toHaveText("Commission floor must be 0 or more");
      await expect(
        row.getByRole("button", { name: /^Edit Floor for Miscellaneous, ₹30/ }),
      ).toBeVisible();

      // A value the client can see is wrong never leaves the browser.
      await row.getByRole("button", { name: /^Edit GST for Miscellaneous/ }).click();
      const gst = table.getByRole("textbox", { name: "GST for Miscellaneous" });
      await gst.fill("120");
      await gst.press("Enter");
      await expect(row.getByText("From 0 to 100.")).toBeVisible();
      await gst.press("Escape");
      await expect(
        row.getByRole("button", { name: /^Edit GST for Miscellaneous, 18%/ }),
      ).toBeFocused();
    });

    test("weights off the 1.00 sum disable Save; a good sum saves and persists", async ({
      page,
    }) => {
      const { patches } = await mockBackend(page, "ops");
      await page.goto("/operator/pricing/categories");
      await page.getByRole("link", { name: "Formula" }).click();
      await expect(page).toHaveURL(/\/operator\/pricing\/formula$/);
      await expect(page.getByRole("link", { name: "Formula" })).toHaveAttribute(
        "aria-current",
        "page",
      );

      const save = page.getByRole("button", { name: "Save weights" });
      await page.getByLabel("Rating", { exact: true }).fill("0.40");
      await expect(page.getByText(/Current sum: 1\.05 ✗/)).toBeVisible();
      await expect(save).toBeDisabled();

      await page.getByLabel("Price vs reference", { exact: true }).fill("0.20");
      await expect(page.getByText(/Current sum: 1\.00 ✓/)).toBeVisible();
      await save.click();
      await expect(page.getByText("Saved.")).toBeVisible();
      expect(patches.at(-1)).toEqual({
        path: "/pricing/config/ranking_weights",
        body: {
          value: {
            rating: 0.4,
            price_vs_ref: 0.2,
            distance: 0.2,
            reliability: 0.15,
            activity: 0.05,
          },
        },
      });

      await page.getByLabel("Days from KYC pass", { exact: true }).fill("21");
      await page.getByRole("button", { name: "Save Days from KYC pass" }).click();
      await expect(page.getByText("Saved.")).toHaveCount(2);
      expect(patches.at(-1)).toEqual({
        path: "/pricing/config/boost_window_days",
        body: { value: 21 },
      });

      await page.reload();
      await expect(page.getByLabel("Rating", { exact: true })).toHaveValue("0.4");
      await expect(page.getByLabel("Days from KYC pass", { exact: true })).toHaveValue("21");
      await expect(page.getByText("Last changed 9 Nov 2026")).toHaveCount(2);
    });

    test("support reads both tabs and has no edit controls", async ({ page }) => {
      await mockBackend(page, "support");
      await page.goto("/operator/pricing/categories");
      const table = categoriesTable(page);
      await expect(table.getByRole("row", { name: /Plumbing/ })).toContainText("±20%");
      await expect(table.getByRole("button")).toHaveCount(0);
      await expect(table.getByRole("checkbox", { name: "Sensitive: Plumbing" })).toBeDisabled();
      await expect(table.getByRole("row", { name: /Old salon/ })).toContainText("Inactive");

      await page.getByRole("link", { name: "Formula" }).click();
      await expect(page.getByText("Current sum: 1.00 ✓")).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
    });
  });
}

test.describe("at phone width", () => {
  test.use({ viewport: { width: 375, height: 800 }, colorScheme: "dark" });

  test("cards instead of the table, editable, and nothing scrolls sideways", async ({ page }) => {
    const { patches } = await mockBackend(page, "ops");
    await page.goto("/operator/pricing/categories");
    const cards = page.getByRole("list", { name: "Categories" });
    await expect(cards).toBeVisible();
    await expect(categoriesTable(page)).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    const card = cards.getByRole("article", { name: "Plumbing" });
    await card.getByRole("button", { name: /^Edit Reference for Plumbing/ }).click();
    const input = card.getByRole("textbox", { name: "Reference for Plumbing" });
    await input.fill("349");
    await input.press("Enter");
    await expect(
      card.getByRole("button", { name: /^Edit Reference for Plumbing, ₹349/ }),
    ).toBeVisible();
    expect(patches.at(-1)?.body).toEqual({ reference_price: 349 });

    await card.getByRole("checkbox", { name: "Sensitive: Plumbing" }).uncheck();
    await expect(card.getByRole("button", { name: /Bounds/ })).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page.getByRole("link", { name: "Formula" }).click();
    await expect(page.getByRole("button", { name: "Save weights" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
