/**
 * The coupon screens in a real browser, with the API mocked (SVC-429). The shape
 * of each mock is the backend's app/schemas/admin_coupons.py, and the mock keeps
 * state and derives status the backend's way (inactive → expired → exhausted →
 * scheduled → active), so a reload shows what a write really persisted. A booking
 * that uses a coupon is simulated by the mock adding a redemption, as the
 * consumer's POST /bookings would. Each flow runs in both colour schemes,
 * because night mode only swaps tokens and fixed colours can clash.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";

type Role = "admin" | "ops" | "support";
type Json = Record<string, unknown>;

interface Redemption {
  booking_id: string;
  booking_status: string;
  redeemed_at: string;
  discount_applied: number;
  customer_id: string;
  customer_name: string | null;
}

interface Stored {
  id: string;
  code: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  max_discount: number | null;
  min_order_amount: number | null;
  valid_from: string;
  valid_until: string;
  usage_limit: number | null;
  usage_limit_per_user: number;
  is_active: boolean;
  user_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  created_at: string;
  redemptions: Redemption[];
}

const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

function stored(code: string, extra: Partial<Stored> = {}): Stored {
  return {
    id: `id-${code}`,
    code,
    discount_type: "percent",
    discount_value: 10,
    max_discount: 150,
    min_order_amount: 500,
    valid_from: at(-10),
    valid_until: at(30),
    usage_limit: 100,
    usage_limit_per_user: 1,
    is_active: true,
    user_id: null,
    owner_name: null,
    owner_phone: null,
    created_at: at(-10),
    redemptions: [],
    ...extra,
  };
}

function status(c: Stored): string {
  const now = Date.now();
  if (!c.is_active) return "inactive";
  if (new Date(c.valid_until).getTime() <= now) return "expired";
  if (c.usage_limit !== null && c.redemptions.length >= c.usage_limit) return "exhausted";
  if (new Date(c.valid_from).getTime() > now) return "scheduled";
  return "active";
}

function rowOf(c: Stored): Json {
  const { redemptions, ...rest } = c;
  return { ...rest, usage_count: redemptions.length, status: status(c) };
}

function detailOf(c: Stored): Json {
  return {
    ...rowOf(c),
    total_discount: c.redemptions.reduce((sum, r) => sum + r.discount_applied, 0),
    recent_redemptions: [...c.redemptions].reverse().slice(0, 20),
  };
}

function refusal(status: number, code: string, message: string, field?: string) {
  return { status, json: { error: true, message, code, details: field ? { field } : null } };
}

async function mockBackend(page: Page, role: Role) {
  const used = { booking_status: "completed", customer_id: "u1", customer_name: "Asha Rao" };
  const coupons: Stored[] = [
    stored("WELCOME10", { created_at: at(-1) }),
    stored("FLAT100", {
      discount_type: "flat",
      discount_value: 100,
      max_discount: null,
      usage_limit: null,
      created_at: at(-2),
    }),
    stored("REFTESTER", {
      user_id: "u9",
      owner_name: "Ravi Kumar",
      owner_phone: "+919999900009",
      usage_limit: 1,
      created_at: at(-3),
    }),
    stored("OLDPROMO", { valid_until: at(-1), created_at: at(-4) }),
    stored("SOONPROMO", { valid_from: at(5), created_at: at(-5) }),
    stored("PAUSED", { is_active: false, created_at: at(-6) }),
    stored("USEDUP", {
      usage_limit: 1,
      created_at: at(-7),
      redemptions: [
        {
          ...used,
          booking_id: "b0000000-0000-4000-8000-000000000001",
          redeemed_at: at(-1),
          discount_applied: 150,
        },
      ],
    }),
  ];
  const writes: { method: string; path: string; body: Json | null }[] = [];
  const find = (code: string) =>
    coupons.find((c) => c.code.toLowerCase() === decodeURIComponent(code).toLowerCase());

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
    if (method !== "GET") {
      writes.push({ method, path, body: request.postDataJSON() as Json | null });
      if (role === "support") return route.fulfill(refusal(403, "FORBIDDEN", "Forbidden"));
    }

    if (path === "/coupons" && method === "GET") {
      const q = url.searchParams.get("q")?.toLowerCase();
      const wanted = url.searchParams.get("status");
      const personal = url.searchParams.get("personal");
      const perPage = Number(url.searchParams.get("per_page") ?? 50);
      const pageNo = Number(url.searchParams.get("page") ?? 1);
      const items = [...coupons]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .filter((c) => !q || c.code.toLowerCase().includes(q))
        .filter((c) => !wanted || status(c) === wanted)
        .filter((c) => personal === null || (c.user_id !== null) === (personal === "true"));
      return route.fulfill({
        json: {
          items: items.slice((pageNo - 1) * perPage, pageNo * perPage).map(rowOf),
          total: items.length,
          page: pageNo,
          per_page: perPage,
        },
      });
    }
    if (path === "/coupons" && method === "POST") {
      const body = request.postDataJSON() as Json;
      const code = String(body.code).trim().toUpperCase();
      if (find(code)) {
        return route.fulfill(
          refusal(409, "COUPON_CODE_TAKEN", `A coupon with code ${code} already exists`, "code"),
        );
      }
      const created = stored(code, {
        id: `id-${code}`,
        discount_type: body.discount_type as "percent" | "flat",
        discount_value: body.discount_value as number,
        max_discount: (body.max_discount as number | undefined) ?? null,
        min_order_amount: (body.min_order_amount as number | undefined) ?? null,
        valid_from: (body.valid_from as string | undefined) ?? new Date().toISOString(),
        valid_until: body.valid_until as string,
        usage_limit: (body.usage_limit as number | undefined) ?? null,
        usage_limit_per_user: body.usage_limit_per_user as number,
        is_active: body.is_active as boolean,
        created_at: new Date().toISOString(),
      });
      coupons.push(created);
      return route.fulfill({ status: 201, json: rowOf(created) });
    }

    const match = path.match(/^\/coupons\/([^/]+)(?:\/(activate|deactivate))?$/);
    const coupon = match ? find(match[1]) : undefined;
    if (match && !coupon) {
      return route.fulfill(refusal(404, "COUPON_NOT_FOUND", "Coupon not found"));
    }
    if (coupon && method === "GET" && !match![2]) {
      return route.fulfill({ json: detailOf(coupon) });
    }
    if (coupon && method === "PATCH") {
      const body = request.postDataJSON() as Partial<Stored>;
      Object.assign(coupon, body);
      if (coupon.discount_type === "flat") coupon.max_discount = null;
      return route.fulfill({ json: rowOf(coupon) });
    }
    if (coupon && method === "POST" && match![2]) {
      coupon.is_active = match![2] === "activate";
      return route.fulfill({ json: rowOf(coupon) });
    }
    return route.fulfill({ status: 404, json: { message: `Unmocked ${method} ${path}` } });
  });

  /** A customer books with the coupon: what POST /bookings does to its usage. */
  function book(code: string, bookingId: string, discount: number) {
    find(code)!.redemptions.push({
      booking_id: bookingId,
      booking_status: "requested",
      redeemed_at: new Date().toISOString(),
      discount_applied: discount,
      customer_id: "u2",
      customer_name: "Meera Iyer",
    });
  }

  return { writes, book };
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const couponTable = (page: Page) => page.getByRole("table", { name: "Coupons" });

async function fillNewCoupon(page: Page, code: string) {
  await page.getByLabel("Code").fill(code);
  await page.getByLabel("Discount value").fill("20");
  await page.getByLabel("Max discount (₹)").fill("200");
  await page.getByLabel("Min order (₹)").fill("999");
  await page.getByLabel("Valid until").fill("2099-12-31T23:59");
  await page.getByLabel("Usage limit").fill("100");
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 900 } });

    test("admin creates a coupon, a booking uses it, and the usage count goes up", async ({
      page,
    }) => {
      const { writes, book } = await mockBackend(page, "admin");
      await page.goto("/operator/coupons");
      await page.getByRole("link", { name: "New coupon" }).click();
      await expect(page).toHaveURL(/\/operator\/coupons\/new$/);

      await fillNewCoupon(page, "expo-2025");
      await expect(page.getByLabel("Code")).toHaveValue("EXPO2025");
      await page.getByRole("button", { name: "Create coupon" }).click();

      await expect(page).toHaveURL(/\/operator\/coupons\/EXPO2025$/);
      await expect(page.getByRole("heading", { level: 1, name: "EXPO2025" })).toBeVisible();
      const usage = region(page, "Usage");
      await expect(usage).toContainText("0 / 100");
      await expect(usage).toContainText("Not used yet.");
      // Valid from was left empty, so the server's now applies.
      expect(writes[0]).toEqual({
        method: "POST",
        path: "/coupons",
        body: {
          code: "EXPO2025",
          discount_type: "percent",
          discount_value: 20,
          max_discount: 200,
          min_order_amount: 999,
          valid_until: "2099-12-31T23:59:00+05:30",
          usage_limit: 100,
          usage_limit_per_user: 1,
          is_active: true,
        },
      });

      book("EXPO2025", "b0000000-0000-4000-8000-0000000000ee", 200);
      await page.reload();
      await expect(usage).toContainText("1 / 100");
      await expect(usage).toContainText("₹200");
      await expect(usage).toContainText("Meera Iyer");
      await expect(usage.getByRole("link", { name: "Booking b0000000" })).toHaveAttribute(
        "href",
        "/operator/bookings?booking=b0000000-0000-4000-8000-0000000000ee",
      );

      await page.getByRole("link", { name: "All coupons" }).click();
      await expect(couponTable(page).getByRole("row", { name: /EXPO2025/ })).toContainText(
        "1 / 100",
      );
    });

    test("the filters narrow the list, live in the URL, and clear", async ({ page }) => {
      await mockBackend(page, "ops");
      await page.goto("/operator/coupons");
      const table = couponTable(page);
      await expect(table.getByRole("row")).toHaveCount(8); // header + 7

      await page.getByRole("combobox", { name: "Status" }).click();
      await page.getByRole("option", { name: "Limit reached" }).click();
      await expect(page).toHaveURL(/status=exhausted/);
      await expect(table.getByRole("row")).toHaveCount(2);
      await expect(table.getByRole("row", { name: /USEDUP/ })).toContainText("Limit reached");
      await expect(table.getByRole("row", { name: /USEDUP/ })).toContainText("1 / 1");

      await page.getByRole("combobox", { name: "Status" }).click();
      await page.getByRole("option", { name: "Expired" }).click();
      await expect(table.getByRole("row", { name: /OLDPROMO/ })).toBeVisible();
      await expect(table.getByRole("row")).toHaveCount(2);

      await page.getByRole("button", { name: "Clear filters" }).click();
      await page.getByRole("combobox", { name: "Personal" }).click();
      await page.getByRole("option", { name: "Personal only" }).click();
      await expect(page).toHaveURL(/personal=true/);
      await expect(table.getByRole("row")).toHaveCount(2);
      await expect(table.getByRole("row", { name: /REFTESTER/ })).toContainText(
        "Personal · Ravi Kumar",
      );

      await page.getByRole("button", { name: "Clear filters" }).click();
      await page.getByRole("textbox", { name: "Search" }).fill("promo");
      await page.getByRole("button", { name: "Search" }).click();
      await expect(page).toHaveURL(/q=promo/);
      await expect(table.getByRole("row")).toHaveCount(3);
      await expect(table.getByRole("row", { name: /SOONPROMO/ })).toContainText("Scheduled");

      await page.reload();
      await expect(table.getByRole("row")).toHaveCount(3);
    });

    test("ops deactivates after the confirm, then activates again", async ({ page }) => {
      const { writes } = await mockBackend(page, "ops");
      await page.goto("/operator/coupons/welcome10");
      await expect(page.getByRole("heading", { level: 1, name: "WELCOME10" })).toBeVisible();

      await page.getByRole("button", { name: "Deactivate" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Customers can no longer apply it.");
      await dialog.getByRole("button", { name: "Keep active" }).click();
      await expect(dialog).toBeHidden();
      expect(writes).toHaveLength(0);

      await page.getByRole("button", { name: "Deactivate" }).click();
      await dialog.getByRole("button", { name: "Deactivate" }).click();
      await expect(page.getByRole("status").filter({ hasText: "is deactivated" })).toBeVisible();
      await expect(page.getByText("Inactive", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Activate" }).click();
      await expect(page.getByText("WELCOME10 is active again.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Deactivate" })).toBeVisible();
      expect(writes.map((w) => w.path)).toEqual([
        "/coupons/WELCOME10/deactivate",
        "/coupons/WELCOME10/activate",
      ]);
    });

    test("an edit sends only what changed, and persists", async ({ page }) => {
      const { writes } = await mockBackend(page, "admin");
      await page.goto("/operator/coupons/WELCOME10");
      await page
        .getByRole("radiogroup", { name: "Discount type" })
        .getByText("Flat amount")
        .click();
      await expect(page.getByRole("radio", { name: "Flat amount" })).toBeChecked();
      await expect(page.getByLabel("Max discount (₹)")).toBeHidden();
      await page.getByLabel("Discount value").fill("75");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();
      expect(writes.at(-1)?.body).toEqual({
        discount_type: "flat",
        discount_value: 75,
        max_discount: null,
      });

      await page.reload();
      await expect(page.getByText("₹75 off").first()).toBeVisible();
    });

    test("a 409 shows under the code, and a 422 under the field it names", async ({ page }) => {
      await mockBackend(page, "admin");
      await page.goto("/operator/coupons/new");
      await fillNewCoupon(page, "welcome10");
      await page.getByRole("button", { name: "Create coupon" }).click();
      await expect(page.getByLabel("Code")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByText("A coupon with code WELCOME10 already exists")).toBeVisible();

      // Later routes win: refuse the next create as the backend would.
      await page.route("**/api/v1/admin/coupons", (route) =>
        route.request().method() === "POST"
          ? route.fulfill(
              refusal(
                422,
                "COUPON_INVALID",
                "min_order_amount takes at most 2 decimal places",
                "min_order_amount",
              ),
            )
          : route.fallback(),
      );
      await page.getByLabel("Code").fill("FRESH25");
      await page.getByRole("button", { name: "Create coupon" }).click();
      await expect(page.getByLabel("Min order (₹)")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByText("Min order takes at most 2 decimal places")).toBeVisible();
      await expect(page.getByLabel("Code")).not.toHaveAttribute("aria-invalid", "true");
    });

    test("support reads every screen with no write controls", async ({ page }) => {
      const { writes } = await mockBackend(page, "support");
      await page.goto("/operator/coupons");
      await expect(couponTable(page)).toBeVisible();
      await expect(page.getByRole("link", { name: "New coupon" })).toHaveCount(0);

      await couponTable(page).getByRole("link", { name: "Open REFTESTER" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "REFTESTER" })).toBeVisible();
      await expect(page.getByText("Personal · Ravi Kumar")).toBeVisible();
      await expect(region(page, "Terms")).toContainText("10% · cap ₹150");
      await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
      await expect(page.getByRole("textbox")).toHaveCount(0);

      await page.goto("/operator/coupons/PAUSED");
      await expect(page.getByRole("heading", { level: 1, name: "PAUSED" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Activate" })).toHaveCount(0);

      await page.goto("/operator/coupons/new");
      await expect(page).toHaveURL(/\/operator\/coupons$/);
      expect(writes).toHaveLength(0);
    });
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`at phone width, ${colorScheme}`, () => {
    test.use({ viewport: { width: 375, height: 800 }, colorScheme });

    test("cards instead of the table, and nothing scrolls sideways", async ({ page }) => {
      await mockBackend(page, "admin");
      await page.goto("/operator/coupons");
      const cards = page.getByRole("list", { name: "Coupons" });
      await expect(cards).toBeVisible();
      await expect(couponTable(page)).toBeHidden();
      await expect(cards.getByRole("link", { name: "Open REFTESTER" })).toContainText(
        "Personal · Ravi Kumar",
      );
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await page.goto("/operator/coupons/new");
      await expect(page.getByLabel("Valid until")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await page.goto("/operator/coupons/USEDUP");
      await expect(region(page, "Usage")).toContainText("1 / 1");
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await page.getByRole("button", { name: "Deactivate" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
