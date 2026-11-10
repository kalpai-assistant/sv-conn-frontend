/**
 * The catalog screens in a real browser, with the API mocked (SVC-430). The shape
 * of each mock is the backend's app/schemas/admin_catalog.py, and the mock keeps
 * state and applies the backend's refusals (CATEGORY_NOT_EMPTY,
 * SERVICE_HAS_ACTIVE_BOOKINGS without confirm, CATALOG_NAME_TAKEN, min_qty for
 * PER_SQFT / PER_HOUR), so a reload shows what a write really persisted. The
 * write-heavy flows run in both colour schemes, because night mode only swaps
 * tokens and fixed colours can clash.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";

type Role = "admin" | "ops" | "support";
type Json = Record<string, unknown>;

interface Category {
  id: string;
  name: string;
  slug: string;
  icon_key: string | null;
  sort_order: number;
  is_active: boolean;
  parent_id: string | null;
  created_at: string;
}

interface Variant {
  id: string;
  label: string;
  subcategory: string | null;
  base_price: number;
  duration_minutes: number | null;
  sort_order: number;
  is_active: boolean;
}

interface Service {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_unit: string;
  min_qty: number | null;
  base_price: number;
  duration_minutes: number;
  icon_key: string | null;
  is_active: boolean;
  active_bookings: number;
  variants: Variant[];
}

const CREATED = "2026-11-01T04:30:00Z";

function cat(id: string, name: string, extra: Partial<Category> = {}): Category {
  return {
    id,
    name,
    slug: name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    icon_key: null,
    sort_order: 0,
    is_active: true,
    parent_id: null,
    created_at: CREATED,
    ...extra,
  };
}

function svc(id: string, categoryId: string, name: string, extra: Partial<Service> = {}): Service {
  return {
    id,
    category_id: categoryId,
    name,
    description: null,
    price_unit: "PER_VISIT",
    min_qty: null,
    base_price: 499,
    duration_minutes: 60,
    icon_key: null,
    is_active: true,
    active_bookings: 0,
    variants: [],
    ...extra,
  };
}

const variant = (id: string, label: string, price: number, is_active = true): Variant => ({
  id,
  label,
  subcategory: null,
  base_price: price,
  duration_minutes: 60,
  sort_order: Number(id.slice(-1)),
  is_active,
});

function refusal(status: number, code: string, message: string, details: Json | null = null) {
  return { status, json: { error: true, message, code, details } };
}

async function mockBackend(page: Page, role: Role) {
  const categories: Category[] = [
    cat("c-home", "Electrician, plumber, carpenter", {
      sort_order: 1,
      slug: "electrician-plumber-carpenter",
    }),
    cat("c-plumber", "Plumber", { parent_id: "c-home", sort_order: 1, icon_key: "wrench" }),
    cat("c-carpenter", "Carpenter", { parent_id: "c-home", sort_order: 2 }),
    cat("c-old", "Old trade", { parent_id: "c-home", sort_order: 3, is_active: false }),
    cat("c-misc", "Miscellaneous", { sort_order: 2 }),
    cat("c-cctv", "CCTV & light (event)", { sort_order: 3, slug: "cctv-light-event" }),
  ];
  const services: Service[] = [
    svc("s-basin", "c-plumber", "Basin installation", {
      active_bookings: 1,
      description: "**Includes:**\n- Fitting\n- Leak test",
      variants: [
        variant("v1", "Wall-mounted", 599),
        variant("v2", "Pedestal", 799, false),
        variant("v3", "Counter-top", 699),
      ],
    }),
    svc("s-tap", "c-plumber", "Tap repair", { base_price: 199 }),
    svc("s-door", "c-carpenter", "Door repair", {
      price_unit: "PER_HOUR",
      min_qty: 2,
      base_price: 350,
    }),
    svc("s-odd", "c-misc", "Odd jobs", { is_active: false }),
    svc("s-emergency", "c-cctv", "Emergency/last-minute setup", { base_price: 0 }),
  ];
  const writes: { method: string; path: string; body: Json | null }[] = [];

  // The tree row: no description, no variants, just their active count.
  const row = (s: Service): Json => {
    const fields: Json = { ...s };
    delete fields.description;
    delete fields.variants;
    return { ...fields, active_variant_count: s.variants.filter((v) => v.is_active).length };
  };
  const serviceDetail = (s: Service) => ({
    ...row(s),
    description: s.description,
    created_at: CREATED,
    updated_at: CREATED,
    variants: s.variants,
  });
  const sorted = (list: Category[]) =>
    [...list].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const node = (c: Category): Json => ({
    ...c,
    description: null,
    children: sorted(categories.filter((k) => k.parent_id === c.id)).map(node),
    services: services
      .filter((s) => s.category_id === c.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(row),
  });
  const categoryDetail = (c: Category) => {
    const kids = categories.filter((k) => k.parent_id === c.id);
    const held = services.filter((s) => s.category_id === c.id);
    return {
      ...c,
      description: null,
      subcategory_count: kids.length,
      active_subcategory_count: kids.filter((k) => k.is_active).length,
      service_count: held.length,
      active_service_count: held.filter((s) => s.is_active).length,
    };
  };

  await page.addInitScript(
    ([key, token]) => window.sessionStorage.setItem(key, token),
    [TOKEN_KEY, "session-1"],
  );
  await page.route("**/api/v1/admin/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1\/admin/, "");
    const method = request.method();
    const body = (method === "GET" ? null : request.postDataJSON()) as Json | null;

    if (path === "/auth/me") {
      return route.fulfill({
        json: { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null },
      });
    }
    if (method !== "GET") {
      writes.push({ method, path, body });
      if (role === "support") return route.fulfill(refusal(403, "FORBIDDEN", "Forbidden"));
    }

    if (path === "/catalog" && method === "GET") {
      return route.fulfill({
        json: { categories: sorted(categories.filter((c) => c.parent_id === null)).map(node) },
      });
    }
    if (path === "/catalog/categories" && method === "POST") {
      const name = String(body!.name).trim();
      if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        return route.fulfill(
          refusal(409, "CATALOG_NAME_TAKEN", `A category named ${name} already exists`, {
            field: "name",
          }),
        );
      }
      const created = cat(`c-new-${categories.length}`, name, {
        parent_id: (body!.parent_id as string | null) ?? null,
        sort_order: body!.sort_order as number,
        icon_key: body!.icon_key as string | null,
        is_active: body!.is_active as boolean,
      });
      categories.push(created);
      return route.fulfill({ status: 201, json: categoryDetail(created) });
    }
    if (path === "/catalog/services" && method === "POST") {
      const unit = String(body!.price_unit);
      if ((unit === "PER_SQFT" || unit === "PER_HOUR") && body!.min_qty == null) {
        return route.fulfill(
          refusal(422, "CATALOG_INVALID", `min_qty is required for ${unit}`, { field: "min_qty" }),
        );
      }
      const created = svc(
        `s-new-${services.length}`,
        String(body!.category_id),
        String(body!.name),
        {
          description: body!.description as string | null,
          price_unit: unit,
          min_qty: body!.min_qty as number | null,
          base_price: body!.base_price as number,
          duration_minutes: body!.duration_minutes as number,
          icon_key: body!.icon_key as string | null,
          is_active: body!.is_active as boolean,
        },
      );
      services.push(created);
      return route.fulfill({ status: 201, json: serviceDetail(created) });
    }

    const catMatch = path.match(/^\/catalog\/categories\/([^/]+)(?:\/(activate|deactivate))?$/);
    if (catMatch) {
      const found = categories.find((c) => c.id === decodeURIComponent(catMatch[1]));
      if (!found) return route.fulfill(refusal(404, "CATEGORY_NOT_FOUND", "Category not found"));
      if (method === "GET") return route.fulfill({ json: categoryDetail(found) });
      if (method === "PATCH") {
        Object.assign(found, body);
        return route.fulfill({ json: categoryDetail(found) });
      }
      if (catMatch[2] === "deactivate") {
        const detail = categoryDetail(found);
        if (detail.active_service_count || detail.active_subcategory_count) {
          return route.fulfill(
            refusal(
              409,
              "CATEGORY_NOT_EMPTY",
              "Deactivate or move this category's active services and sub-categories first",
              {
                active_services: detail.active_service_count,
                active_subcategories: detail.active_subcategory_count,
              },
            ),
          );
        }
      }
      found.is_active = catMatch[2] === "activate";
      return route.fulfill({ json: categoryDetail(found) });
    }

    const svcMatch = path.match(/^\/catalog\/services\/([^/]+)(?:\/(activate|deactivate))?$/);
    if (svcMatch) {
      const found = services.find((s) => s.id === decodeURIComponent(svcMatch[1]));
      if (!found) return route.fulfill(refusal(404, "SERVICE_NOT_FOUND", "Service not found"));
      if (method === "GET") return route.fulfill({ json: serviceDetail(found) });
      if (method === "PATCH") {
        Object.assign(found, body);
        return route.fulfill({ json: serviceDetail(found) });
      }
      if (svcMatch[2] === "deactivate" && found.active_bookings > 0 && body?.confirm !== true) {
        return route.fulfill(
          refusal(409, "SERVICE_HAS_ACTIVE_BOOKINGS", "bookings in progress", {
            active_bookings: found.active_bookings,
          }),
        );
      }
      found.is_active = svcMatch[2] === "activate";
      return route.fulfill({ json: serviceDetail(found) });
    }
    return route.fulfill({ status: 404, json: { message: `Unmocked ${method} ${path}` } });
  });

  /** A customer books the service: what POST /bookings does to its count. */
  function book(serviceId: string, count: number) {
    services.find((s) => s.id === serviceId)!.active_bookings = count;
  }

  return { writes, book };
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const tree = (page: Page) => page.getByRole("list", { name: "Catalog" });
const serviceLink = (page: Page, name: string) =>
  page.getByRole("link", { name: `Open service ${name}`, exact: true });
const categoryLink = (page: Page, name: string) =>
  page.getByRole("link", { name: `Open category ${name}`, exact: true });

async function pick(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** The radios are sr-only under their labels, as on the coupon form: click the label. */
async function choose(page: Page, group: string, label: string) {
  await page.getByRole("radiogroup", { name: group }).getByText(label, { exact: true }).click();
  await expect(page.getByRole("radio", { name: label, exact: true })).toBeChecked();
}

test.use({ viewport: { width: 1280, height: 900 } });

test("the tree shows every level, inactive rows, prices, variants and bookings", async ({
  page,
}) => {
  await mockBackend(page, "admin");
  await page.goto("/operator/catalog");

  await expect(categoryLink(page, "Electrician, plumber, carpenter")).toBeVisible();
  await expect(categoryLink(page, "Plumber")).toBeVisible();
  await expect(categoryLink(page, "Old trade")).toContainText("Inactive");
  await expect(serviceLink(page, "Basin installation")).toContainText("₹499 / visit");
  await expect(serviceLink(page, "Basin installation")).toContainText("2 active variants");
  await expect(serviceLink(page, "Basin installation")).toContainText("1 active booking");
  await expect(serviceLink(page, "Door repair")).toContainText("₹350 / hour · min 2");
  // An L1 that holds services directly, inactive service included.
  await expect(serviceLink(page, "Odd jobs")).toContainText("Inactive");
  await expect(serviceLink(page, "Emergency/last-minute setup")).toContainText("₹0 / visit");
  await expect(page.getByText("6 categories · 5 services")).toBeVisible();

  await page.getByLabel("Filter by name").fill("basin");
  await expect(serviceLink(page, "Basin installation")).toBeVisible();
  await expect(serviceLink(page, "Tap repair")).toHaveCount(0);
  await expect(categoryLink(page, "Miscellaneous")).toHaveCount(0);
  await page.getByLabel("Filter by name").fill("zzz");
  await expect(page.getByText("Nothing matches that name.")).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test("admin creates a category; its slug shows read-only", async ({ page }) => {
      const { writes } = await mockBackend(page, "admin");
      await page.goto("/operator/catalog");
      await page.getByRole("link", { name: "New category" }).click();
      await expect(page).toHaveURL(/\/operator\/catalog\/categories\/new$/);

      await page.getByRole("button", { name: "Create category" }).click();
      await expect(page.getByText("Enter a name.")).toBeVisible();
      expect(writes).toEqual([]);

      await page.getByLabel("Name", { exact: true }).fill("Water tank cleaning");
      await page.getByLabel("Sort order").fill("5");
      // The icon picker by keyboard: from "No icon", the arrow keys move the choice.
      await page.getByRole("radio", { name: "No icon" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: "Sparkles" })).toBeChecked();
      await choose(page, "Icon", "Droplets");
      await expect(page.getByText("only on categories added here")).toBeVisible();
      await page.getByRole("button", { name: "Create category" }).click();

      await expect(page).toHaveURL(/\/operator\/catalog\/categories\/c-new-6$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Water tank cleaning" }),
      ).toBeVisible();
      await expect(page.getByText("water-tank-cleaning", { exact: true })).toBeVisible();
      await expect(page.getByText("It never changes")).toBeVisible();
      expect(writes).toEqual([
        {
          method: "POST",
          path: "/catalog/categories",
          body: {
            name: "Water tank cleaning",
            parent_id: null,
            icon_key: "droplets",
            sort_order: 5,
            is_active: true,
          },
        },
      ]);

      // A taken name comes back under the name.
      await page.goto("/operator/catalog/categories/new");
      await page.getByLabel("Name", { exact: true }).fill("plumber");
      await page.getByRole("button", { name: "Create category" }).click();
      await expect(page.getByText("A category named plumber already exists")).toBeVisible();
    });

    test("admin creates a per-sq-ft service with a markdown description", async ({ page }) => {
      const { writes } = await mockBackend(page, "admin");
      await page.goto("/operator/catalog");
      await page.getByRole("link", { name: "New service" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "New service" })).toBeVisible();

      await page.getByLabel("Name", { exact: true }).fill("Floor polishing");
      // An empty description reads as empty, not as sample content.
      await expect(page.getByLabel("Description", { exact: true })).toHaveAttribute(
        "placeholder",
        "No description yet. Write what's included…",
      );
      await pick(page, "Category", "Carpenter");
      await page
        .getByLabel("Description", { exact: true })
        .fill("**Includes:**\n- Sanding\n- Two coats\n\n<script>x</script>");
      await expect(page.getByText("55 / 2,000")).toBeVisible();
      await choose(page, "Description view", "Preview");
      const preview = page.getByRole("region", { name: "Description preview" });
      await expect(preview.locator("strong")).toHaveText("Includes:");
      await expect(preview.locator("li")).toHaveText(["Sanding", "Two coats"]);
      await expect(preview).toContainText("<script>x</script>");
      await choose(page, "Description view", "Write");

      await expect(page.getByLabel("Minimum sq ft")).toHaveCount(0);
      await choose(page, "Price unit", "Per sq ft");
      await page.getByLabel("Base price (₹)").fill("12.50");
      await page.getByRole("button", { name: "Create service" }).click();
      await expect(page.getByText("Required for per sq ft.")).toBeVisible();
      expect(writes).toEqual([]);

      await page.getByLabel("Minimum sq ft").fill("100");
      await choose(page, "Icon", "Drill");
      await page.getByRole("button", { name: "Create service" }).click();

      await expect(page).toHaveURL(/\/operator\/catalog\/services\/s-new-5$/);
      await expect(page.getByRole("heading", { level: 1, name: "Floor polishing" })).toBeVisible();
      await expect(page.getByText("₹12.50 / sq ft · min 100").first()).toBeVisible();
      expect(writes).toEqual([
        {
          method: "POST",
          path: "/catalog/services",
          body: {
            name: "Floor polishing",
            category_id: "c-carpenter",
            description: "**Includes:**\n- Sanding\n- Two coats\n\n<script>x</script>",
            base_price: 12.5,
            duration_minutes: 60,
            price_unit: "PER_SQFT",
            min_qty: 100,
            icon_key: "drill",
            is_active: true,
          },
        },
      ]);
    });

    test("an edit sends only what changed, and persists", async ({ page }) => {
      const { writes } = await mockBackend(page, "ops");
      // The seeded zero-price row: re-sending base_price would be refused.
      await page.goto("/operator/catalog/services/s-emergency");
      await page.getByLabel("Name", { exact: true }).fill("Emergency setup");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
      expect(writes.at(-1)).toEqual({
        method: "PATCH",
        path: "/catalog/services/s-emergency",
        body: { name: "Emergency setup" },
      });

      // Off PER_HOUR: the minimum goes, and min_qty: null goes with the unit.
      await page.goto("/operator/catalog/services/s-door");
      await expect(page.getByLabel("Minimum hours")).toHaveValue("2");
      await choose(page, "Price unit", "Per visit");
      await expect(page.getByLabel("Minimum hours")).toHaveCount(0);
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
      expect(writes.at(-1)).toEqual({
        method: "PATCH",
        path: "/catalog/services/s-door",
        body: { price_unit: "PER_VISIT", min_qty: null },
      });

      await page.reload();
      await expect(page.getByRole("radio", { name: "Per visit" })).toBeChecked();
      await expect(page.getByText("₹350 / visit").first()).toBeVisible();

      // A category edit: the sort order alone.
      await page.goto("/operator/catalog/categories/c-carpenter");
      await page.getByLabel("Sort order").fill("7");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
      expect(writes.at(-1)).toEqual({
        method: "PATCH",
        path: "/catalog/categories/c-carpenter",
        body: { sort_order: 7 },
      });
    });

    test("deactivating a service with bookings warns, then confirms", async ({ page }) => {
      const { writes, book } = await mockBackend(page, "admin");
      await page.goto("/operator/catalog/services/s-basin");
      await expect(page.getByRole("region", { name: "Variants" })).toContainText("Pedestal");

      await page.getByRole("button", { name: "Deactivate" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("1 booking is in progress; they'll carry on.");
      await dialog.getByRole("button", { name: "Deactivate anyway" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByText("is deactivated. Customers can no longer book it."),
      ).toBeVisible();
      expect(writes).toEqual([
        { method: "POST", path: "/catalog/services/s-basin/deactivate", body: { confirm: true } },
      ]);
      await page.getByRole("button", { name: "Activate" }).click();
      await expect(page.getByText("is active again.")).toBeVisible();

      // The count moved after the page loaded: no warning at first, the 409 brings it.
      await page.goto("/operator/catalog/services/s-tap");
      await expect(page.getByRole("heading", { level: 1, name: "Tap repair" })).toBeVisible();
      book("s-tap", 2);
      await page.getByRole("button", { name: "Deactivate" }).click();
      await expect(dialog).not.toContainText("in progress");
      await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();
      await expect(dialog).toContainText(
        "The count changed since the page loaded. 2 bookings are in progress; they'll carry on.",
      );
      await dialog.getByRole("button", { name: "Deactivate anyway" }).click();
      await expect(dialog).toHaveCount(0);
      expect(writes.slice(-2)).toEqual([
        { method: "POST", path: "/catalog/services/s-tap/deactivate", body: { confirm: false } },
        { method: "POST", path: "/catalog/services/s-tap/deactivate", body: { confirm: true } },
      ]);
    });

    test("a category that isn't empty can't be deactivated; the counts show", async ({ page }) => {
      await mockBackend(page, "admin");
      await page.goto("/operator/catalog/categories/c-plumber");
      await page.getByRole("button", { name: "Deactivate" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Deactivate" }).click();
      await expect(dialog).toContainText(
        "It still holds 2 active services. Deactivate or move them first.",
      );
      await dialog.getByRole("button", { name: "OK", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Plumber" })).toBeVisible();

      // An L1 with sub-categories: its parent can't change, and the page says why.
      await page.goto("/operator/catalog/categories/c-home");
      await expect(page.getByRole("combobox", { name: "Parent" })).toBeDisabled();
      await expect(page.getByText("It has sub-categories, so it stays top-level")).toBeVisible();
      await page.getByRole("button", { name: "Deactivate" }).click();
      await dialog.getByRole("button", { name: "Deactivate" }).click();
      await expect(dialog).toContainText("2 active sub-categories");

      // An empty one goes, and comes back.
      await page.goto("/operator/catalog/categories/c-old");
      await page.getByRole("button", { name: "Activate" }).click();
      await expect(page.getByText("Old trade is active again.")).toBeVisible();
      await page.getByRole("button", { name: "Deactivate" }).click();
      await dialog.getByRole("button", { name: "Deactivate" }).click();
      await expect(page.getByText("Old trade is deactivated.")).toBeVisible();
    });

    test("support reads every screen with no write controls", async ({ page }) => {
      const { writes } = await mockBackend(page, "support");
      await page.goto("/operator/catalog");
      await expect(serviceLink(page, "Basin installation")).toBeVisible();
      await expect(page.getByText("Read only")).toBeVisible();
      await expect(page.getByRole("link", { name: "New category" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "New service" })).toHaveCount(0);

      await serviceLink(page, "Basin installation").click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Basin installation" }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
      const details = page.getByRole("region", { name: "Details" });
      await expect(details.locator("strong")).toHaveText("Includes:");
      await expect(details).toContainText("Per visit");

      await page.goto("/operator/catalog/categories/c-plumber");
      await expect(page.getByRole("heading", { level: 1, name: "Plumber" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Details" })).toContainText("Wrench");

      await page.goto("/operator/catalog/services/new");
      await expect(page).toHaveURL(/\/operator\/catalog$/);
      expect(writes).toEqual([]);
    });
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`at phone width, ${colorScheme}`, () => {
    test.use({ viewport: { width: 375, height: 800 }, colorScheme });

    test("the tree, a service and the forms fit, with nothing scrolling sideways", async ({
      page,
    }) => {
      await mockBackend(page, "admin");
      await page.goto("/operator/catalog");
      await expect(serviceLink(page, "Emergency/last-minute setup")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await page.goto("/operator/catalog/services/s-basin");
      await expect(page.getByRole("list", { name: "Variants" })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await page.goto("/operator/catalog/services/new");
      await expect(page.getByRole("radio", { name: "Washing machine" })).toBeAttached();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      await page.goto("/operator/catalog/categories/c-home");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await expect(tree(page)).toBeVisible();
    });
  });
}
