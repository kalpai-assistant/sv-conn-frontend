/**
 * The Overview and Supply dashboards in a real browser, with the API mocked
 * (SVC-432). Each mock's shape is the backend's app/analytics/schemas.py, built
 * dense the way app/analytics/service.py sends it: every day and every week of
 * the range. Each flow runs in both colour schemes, because night mode only
 * swaps tokens and a fixed colour would clash.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";
const AS_OF = "2026-11-11T10:15:00Z"; // 3:45 pm IST
const TODAY = Date.UTC(2026, 10, 11);
const DAY_MS = 86_400_000;

type Role = "admin" | "ops" | "support";
type Json = Record<string, unknown>;

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Monday-started weeks ending with this one, oldest first. */
function weekStarts(weeks: number): string[] {
  const today = new Date(TODAY);
  const monday = TODAY - ((today.getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: weeks }, (_, i) => iso(monday - (weeks - 1 - i) * 7 * DAY_MS));
}

function overview(weeks: number): Json {
  const starts = weekStarts(weeks);
  const first = Date.parse(starts[0]);
  const days = Math.round((TODAY - first) / DAY_MS) + 1;
  return {
    as_of: AS_OF,
    gmv: [
      { days: 7, gmv: 12_450, completed: 9, previous_gmv: 10_000, change_pct: 0.245 },
      { days: 30, gmv: 48_200.5, completed: 35, previous_gmv: 52_000, change_pct: -0.073 },
      { days: 90, gmv: 131_000, completed: 96, previous_gmv: null, change_pct: null },
    ],
    weekly: starts.map((week_start, i) =>
      // The oldest week sold nothing: take rate and AOV are null, not 0.
      i === 0
        ? { week_start, gmv: 0, completed: 0, commission: 0, take_rate: null, aov: null }
        : {
            week_start,
            gmv: 8000 + i * 500,
            completed: 6 + (i % 3),
            commission: 1200 + i * 60,
            take_rate: 0.15,
            aov: 1300 + i * 20,
          },
    ),
    daily: Array.from({ length: days }, (_, i) => ({
      day: iso(first + i * DAY_MS),
      requested: i % 2,
      accepted: i % 3 === 0 ? 1 : 0,
      en_route: 0,
      in_progress: i % 5 === 0 ? 1 : 0,
      completed: i % 4,
      cancelled: i % 6 === 0 ? 1 : 0,
      expired: i % 7 === 0 ? 1 : 0,
      refunded: i % 9 === 0 ? 1 : 0,
    })),
    cohorts: [
      {
        signup_week: starts[0],
        size: 12,
        d7: { matured: 12, rebooked: 4, rate: 4 / 12 },
        d30: { matured: 10, rebooked: 5, rate: 0.5 },
        d90: { matured: 0, rebooked: 0, rate: null },
      },
      {
        signup_week: starts[starts.length - 1],
        size: 3,
        d7: { matured: 0, rebooked: 0, rate: null },
        d30: { matured: 0, rebooked: 0, rate: null },
        d90: { matured: 0, rebooked: 0, rate: null },
      },
    ],
  };
}

const SERVICES = [
  { id: "s0000000-0000-4000-8000-000000000001", name: "Deep cleaning" },
  { id: "s0000000-0000-4000-8000-000000000002", name: "Plumbing" },
  { id: "s0000000-0000-4000-8000-000000000003", name: "AC service" },
];

function supply(weeks: number): Json {
  const starts = weekStarts(weeks);
  const pincodes = [...Array.from({ length: 29 }, (_, i) => String(560001 + i)), "Unknown"];
  const cells = pincodes.flatMap((pincode, p) =>
    SERVICES.flatMap((service, s) =>
      // Some cells have no demand at all: those stay blank.
      (p + s) % 4 === 3
        ? []
        : [
            {
              pincode,
              service_id: service.id,
              demand: 4,
              unmet: (p + s) % 5 === 0 ? 4 : (p + s) % 4,
            },
          ],
    ),
  );
  // Pin one cell the test reads.
  cells[0] = { pincode: "560001", service_id: SERVICES[0].id, demand: 4, unmet: 3 };
  return {
    as_of: AS_OF,
    active: {
      sps_7d: 14,
      sps_30d: 22,
      pros_7d: 31,
      pros_30d: 40,
      weekly: starts.map((week_start, i) => ({
        week_start,
        active_sps: 10 + (i % 4),
        active_pros: 20 + (i % 5),
      })),
    },
    sp_cohorts: [
      { kyc_week: starts[0], size: 5, d30: 0.8, d60: 0.6, d90: null },
      { kyc_week: starts[starts.length - 1], size: 2, d30: null, d60: null, d90: null },
    ],
    churn: [
      { signup_month: "2026-06", verified: 10, churned: 4, rate: 0.4 },
      { signup_month: "2026-07", verified: 8, churned: 1, rate: 0.125 },
      { signup_month: "2026-11", verified: 2, churned: 2, rate: 1 },
    ],
    supply_gap: {
      pincodes,
      services: SERVICES,
      cells,
      truncated: true,
      total_pincodes: 41,
    },
    prices: [
      {
        category_id: "c1",
        name: "Cleaning",
        count: 40,
        min: 299,
        p25: 699,
        median: 999,
        p75: 1499,
        max: 3999,
      },
      {
        category_id: "c2",
        name: "Plumbing",
        count: 1,
        min: 450,
        p25: 450,
        median: 450,
        p75: 450,
        max: 450,
      },
    ],
    time_to_accept: starts.map((week_start, i) =>
      i === 0
        ? { week_start, accepted: 0, p50_seconds: null, p90_seconds: null }
        : { week_start, accepted: 5, p50_seconds: 240 + i * 30, p90_seconds: 3600 + i * 600 },
    ),
  };
}

function emptyOverview(weeks: number): Json {
  const starts = weekStarts(weeks);
  const first = Date.parse(starts[0]);
  const days = Math.round((TODAY - first) / DAY_MS) + 1;
  return {
    as_of: AS_OF,
    gmv: [7, 30, 90].map((d) => ({
      days: d,
      gmv: 0,
      completed: 0,
      previous_gmv: null,
      change_pct: null,
    })),
    weekly: starts.map((week_start) => ({
      week_start,
      gmv: 0,
      completed: 0,
      commission: 0,
      take_rate: null,
      aov: null,
    })),
    daily: Array.from({ length: days }, (_, i) => ({
      day: iso(first + i * DAY_MS),
      requested: 0,
      accepted: 0,
      en_route: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      expired: 0,
      refunded: 0,
    })),
    cohorts: [],
  };
}

function emptySupply(weeks: number): Json {
  const starts = weekStarts(weeks);
  return {
    as_of: AS_OF,
    active: {
      sps_7d: 0,
      sps_30d: 0,
      pros_7d: 0,
      pros_30d: 0,
      weekly: starts.map((week_start) => ({ week_start, active_sps: 0, active_pros: 0 })),
    },
    sp_cohorts: [],
    churn: [],
    supply_gap: { pincodes: [], services: [], cells: [], truncated: false, total_pincodes: 0 },
    prices: [],
    time_to_accept: starts.map((week_start) => ({
      week_start,
      accepted: 0,
      p50_seconds: null,
      p90_seconds: null,
    })),
  };
}

async function mockBackend(
  page: Page,
  role: Role,
  { empty = false, failing = false }: { empty?: boolean; failing?: boolean } = {},
) {
  const requests: string[] = [];
  // Fails every analytics call until a test flips it: StrictMode's double
  // mount would otherwise spend a one-shot failure on the aborted first call.
  const state = { failing };
  await page.addInitScript(
    ([key, token]) => window.sessionStorage.setItem(key, token),
    [TOKEN_KEY, "session-1"],
  );
  await page.route("**/api/v1/admin/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1\/admin/, "");
    if (path === "/providers/kyc/pending/count") {
      return route.fulfill({ json: { count: 0 } }); // the sidebar's KYC badge
    }
    if (path === "/auth/me") {
      return route.fulfill({
        json: { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null },
      });
    }
    const match = path.match(/^\/analytics\/(overview|supply)$/);
    if (match) {
      requests.push(`${path}${url.search}`);
      if (role === "support") {
        return route.fulfill({ status: 403, json: { message: "Forbidden", code: "FORBIDDEN" } });
      }
      if (state.failing) {
        return route.fulfill({ status: 500, json: { message: "boom" } });
      }
      const weeks = Number(url.searchParams.get("weeks") ?? 12);
      const body =
        match[1] === "overview"
          ? empty
            ? emptyOverview(weeks)
            : overview(weeks)
          : empty
            ? emptySupply(weeks)
            : supply(weeks);
      return route.fulfill({ json: body });
    }
    return route.fulfill({ status: 404, json: { message: `Unmocked ${path}` } });
  });
  return { requests, state };
}

/** Each path asked for, once: StrictMode mounts twice in dev and repeats the call. */
const unique = (paths: string[]) => [...new Set(paths)];

/** Uncaught errors and console errors, so a chart that throws fails the test. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const card = (page: Page, title: string) =>
  page.locator(".rounded-xl", { has: page.getByRole("heading", { level: 2, name: title }) });

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 900 } });

    test("ops sees the overview, with N/A for missing history, and the range lives in the URL", async ({
      page,
    }) => {
      const errors = watchErrors(page);
      const { requests } = await mockBackend(page, "ops");
      await page.goto("/analytics/overview");

      await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
      await expect(page.getByTestId("as-of")).toHaveText(
        "Data as of 11 Nov 2026, 3:45 pm IST. The figures refresh every 15 minutes.",
      );

      const gmv = page.getByRole("region", { name: "GMV" });
      await expect(gmv).toContainText("₹12,450");
      await expect(gmv).toContainText("+24.5% vs previous period (₹10,000)");
      await expect(gmv).toContainText("−7.3% vs previous period");
      await expect(gmv).toContainText("₹48,200.50");
      await expect(gmv).toContainText("N/A vs previous period (not enough history)");

      for (const title of ["Weekly GMV", "Take rate", "Average order value", "Bookings per day"]) {
        await expect(card(page, title).locator("svg.recharts-surface").first()).toBeVisible();
      }
      await expect(card(page, "Marketplace health")).toContainText("Not tracked yet");
      await expect(card(page, "Marketplace health")).not.toContainText(/\d+%/);

      const cohorts = page.getByRole("table", { name: "Consumer retention by signup week" });
      await expect(cohorts.getByRole("row")).toHaveCount(3);
      await expect(cohorts.getByRole("row").nth(1)).toContainText("33.3%");
      await expect(cohorts.getByRole("row").nth(1)).toContainText("4/12");
      await expect(cohorts.getByRole("row").nth(1)).toContainText("N/A");
      await expect(cohorts.getByRole("row").nth(2)).toContainText("not matured");

      expect(unique(requests)).toEqual(["/analytics/overview?weeks=12"]);
      const weeks = page.getByRole("radiogroup", { name: "Weeks shown" });
      await expect(weeks.getByRole("radio", { name: "12 weeks" })).toBeChecked();
      await weeks.getByText("26 weeks").click();
      await expect(page).toHaveURL(/[?&]weeks=26\b/);
      await expect(weeks.getByRole("radio", { name: "26 weeks" })).toBeChecked();
      await expect.poll(() => requests).toContain("/analytics/overview?weeks=26");

      // A pasted link opens the same range.
      await page.goto("/analytics/overview?weeks=52");
      await expect(weeks.getByRole("radio", { name: "52 weeks" })).toBeChecked();
      await expect(card(page, "Bookings per day").locator("svg.recharts-surface")).toBeVisible();

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });

    test("ops sees supply: heatmap cells, the truncation note, box plots and readable times", async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await mockBackend(page, "ops");
      await page.goto("/analytics/supply");

      await expect(page.getByRole("heading", { level: 1, name: "Supply" })).toBeVisible();
      const tiles = page.getByRole("region", { name: "Active supply" });
      await expect(tiles).toContainText("Active SPs, last 7 days14");
      await expect(tiles).toContainText("Active Pros, last 30 days40");

      const heatmap = page.getByRole("table", { name: "Supply gap" });
      await expect(page.getByTestId("gap-truncated")).toHaveText("Top 30 of 41 pincodes");
      await expect(heatmap.getByRole("row")).toHaveCount(31);
      const cell = heatmap.getByRole("cell", { name: "560001, Deep cleaning: 3 of 4 unmet (75%)" });
      await expect(cell).toHaveText("3/4");
      // A shaded cell takes its colour from the --destructive token, mixed into the card.
      const background = await cell.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
      await expect(heatmap.getByRole("cell", { name: /: no demand$/ }).first()).toHaveText("");
      await expect(heatmap.getByRole("rowheader", { name: "Unknown" })).toBeVisible();

      await expect(card(page, "Price distribution by category").getByTestId("box")).toHaveCount(2);

      const cohorts = page.getByRole("table", { name: "New-SP retention by KYC week" });
      await expect(cohorts.getByRole("row").nth(1)).toContainText("80.0%");
      await expect(cohorts.getByRole("row").nth(1)).toContainText("N/A");

      const accept = card(page, "Time to accept");
      await expect(accept.locator("svg.recharts-surface")).toBeVisible();
      await expect(accept.locator(".recharts-cartesian-axis-tick-value").last()).toHaveText(
        /\d+ (s|min|h)/,
      );
      // Hover the latest week: the tooltip reads minutes and hours, not seconds.
      const box = await accept.locator("svg.recharts-surface").boundingBox();
      await page.mouse.move(box!.x + box!.width - 12, box!.y + box!.height / 2);
      const tooltip = accept.locator(".recharts-tooltip-wrapper");
      await expect(tooltip.getByText("10 min", { exact: true })).toBeVisible();
      await expect(tooltip.getByText("2 h 50 min", { exact: true })).toBeVisible();

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });

    test("at 375px both pages fit the screen; wide charts and the heatmap scroll in their card", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await mockBackend(page, "ops");

      await page.goto("/analytics/overview?weeks=26");
      await expect(card(page, "Bookings per day").locator("svg.recharts-surface")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      const daily = card(page, "Bookings per day").getByTestId("card-scroll");
      expect(await daily.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

      await page.goto("/analytics/supply");
      await expect(page.getByRole("table", { name: "Supply gap" })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      const gap = card(page, "Supply gap by pincode and service").getByTestId("card-scroll");
      expect(await gap.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    });

    // Tushar's iPhone SE pass: the weeks row was wider than the phone and the
    // whole page widened to fit it. 320 is the narrowest phone we size for.
    for (const [width, height] of [
      [375, 667],
      [320, 568],
    ]) {
      test(`at ${width}x${height} the header fits: no page overflow and "52 weeks" on screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await mockBackend(page, "ops");

        for (const path of ["/analytics/overview", "/analytics/supply"]) {
          await page.goto(path);
          await expect(page.getByTestId("as-of")).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
          const option = await page
            .getByRole("radiogroup", { name: "Weeks shown" })
            .getByText("52 weeks")
            .boundingBox();
          expect(option!.x).toBeGreaterThanOrEqual(0);
          expect(option!.x + option!.width).toBeLessThanOrEqual(width);
        }
      });
    }

    test("a fresh database shows an empty state on both pages, not zero-filled charts", async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await mockBackend(page, "admin", { empty: true });

      await page.goto("/analytics/overview");
      await expect(page.getByText("No bookings yet.")).toBeVisible();
      await expect(page.getByTestId("as-of")).toBeVisible();
      await expect(page.locator("svg.recharts-surface")).toHaveCount(0);

      await page.goto("/analytics/supply");
      await expect(page.getByText("No supply data yet.")).toBeVisible();
      await expect(page.getByRole("table", { name: "Supply gap" })).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test("a failed load says so and retries", async ({ page }) => {
      const { state } = await mockBackend(page, "admin", { failing: true });
      await page.goto("/analytics/overview");

      await expect(page.getByRole("alert")).toContainText("Couldn't load the overview.");
      state.failing = false;
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page.getByRole("region", { name: "GMV" })).toContainText("₹12,450");
    });

    test("support has no Analytics section, and typing the URL lands on home", async ({ page }) => {
      const { requests } = await mockBackend(page, "support");
      await page.goto("/analytics/supply");

      await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
      const nav = page.getByRole("navigation", { name: "Admin sections" });
      await expect(nav.getByRole("link", { name: "Lookup" })).toBeVisible();
      await expect(nav.getByRole("heading", { name: "Analytics" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Supply" })).toHaveCount(0);
      expect(requests).toEqual([]);
    });
  });
}
