/**
 * The SP and Pro directories and pages in a real browser, with the API mocked
 * (SVC-427). The shape of each mock is the backend's app/schemas/admin_team.py.
 * The mock keeps state, so a reassign really moves the Pro and writes the
 * pro_reassigned row both SPs' histories read. Each flow runs in both colour
 * schemes, because night mode only swaps tokens and fixed colours can clash.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";

type Role = "admin" | "ops" | "support";

const SP_A = "5b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const SP_B = "6c2e3d4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f";
const SP_C = "7a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";
const PRO_SELF_A = "a1000000-0000-4000-8000-000000000001";
const PRO_ASHA = "a1000000-0000-4000-8000-000000000002";
const PRO_RAVI = "a1000000-0000-4000-8000-000000000003";
const PRO_GONE = "a1000000-0000-4000-8000-000000000004";
const PRO_SELF_B = "b1000000-0000-4000-8000-000000000001";
const PRO_ASHA_B = "b1000000-0000-4000-8000-000000000002";
const BOOKING_RAVI = "c1000000-0000-4000-8000-000000000001";

type Json = Record<string, unknown>;

function spRow(id: string, overrides: Json = {}): Json {
  return {
    user_id: id,
    name: "Vikram Sharma",
    phone: "+919876500001",
    business_name: "Sharma Plumbing",
    kyc_status: "verified",
    is_online: true,
    user_is_active: true,
    active_pro_count: 2,
    created_at: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

function teamPro(id: string, spId: string, overrides: Json = {}): Json {
  return {
    id,
    service_provider_id: spId,
    user_id: `user-${id}`,
    display_name: "Asha Rao",
    phone: "+919876500010",
    user_is_active: true,
    profile_photo_url: null,
    kyc_status: "verified",
    is_online: false,
    is_active: true,
    is_self: false,
    accepts_direct_jobs: true,
    active_job_count: 0,
    created_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

async function mockBackend(page: Page, role: Role) {
  const sps: Record<string, Json> = {
    [SP_A]: spRow(SP_A),
    [SP_B]: spRow(SP_B, {
      name: "Meera Kumar",
      business_name: "Kumar Cleaning",
      phone: "+919876500002",
      is_online: false,
      active_pro_count: 0,
    }),
    [SP_C]: spRow(SP_C, {
      name: "Old Shop",
      business_name: null,
      phone: "+919876500003",
      kyc_status: "rejected",
      user_is_active: false,
      active_pro_count: 0,
    }),
  };
  const teams: Record<string, Json[]> = {
    [SP_A]: [
      teamPro(PRO_SELF_A, SP_A, {
        display_name: "Vikram Sharma",
        phone: "+919876500001",
        is_self: true,
        is_online: true,
      }),
      teamPro(PRO_ASHA, SP_A),
      teamPro(PRO_RAVI, SP_A, {
        display_name: "Ravi Patil",
        phone: "+919876500011",
        active_job_count: 1,
      }),
      teamPro(PRO_GONE, SP_A, {
        display_name: "Sunil Gone",
        phone: "+919876500012",
        is_active: false,
        kyc_status: "pending",
      }),
    ],
    [SP_B]: [
      teamPro(PRO_SELF_B, SP_B, {
        display_name: "Meera Kumar",
        phone: "+919876500002",
        is_self: true,
      }),
    ],
    [SP_C]: [],
  };
  const actions: Json[] = [];
  const writes: { path: string; body: Json }[] = [];

  const ownerOf = (spId: string) => {
    const owner = sps[spId];
    return {
      user_id: spId,
      name: owner.name,
      phone: owner.phone,
      business_name: owner.business_name,
    };
  };
  const allPros = (): Json[] =>
    Object.entries(teams).flatMap(([spId, rows]) =>
      rows.map((row): Json => ({ ...row, service_provider: ownerOf(spId) })),
    );
  const detail = (spId: string) => ({
    ...sps[spId],
    service_area: spId === SP_A ? { lat: 12.97159, lng: 77.594566, radius_km: 5 } : null,
    avg_rating: spId === SP_A ? 4.56 : 0,
    total_completed_jobs: spId === SP_A ? 21 : 0,
    services: [
      { id: "s1", name: "Tap repair", is_active: true },
      { id: "s2", name: "Geyser fitting", is_active: false },
    ],
    bookings_30d: {
      since: "2026-10-11",
      total: 7,
      by_status: {
        requested: 1,
        accepted: 1,
        en_route: 0,
        in_progress: 1,
        completed: 3,
        cancelled: 1,
        expired: 0,
      },
    },
  });

  await page.addInitScript(
    ([key, token]) => window.sessionStorage.setItem(key, token),
    [TOKEN_KEY, "session-1"],
  );
  await page.route("**/api/v1/admin/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1\/admin/, "");
    const method = request.method();
    const q = url.searchParams;

    if (path === "/auth/me") {
      return route.fulfill({
        json: { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null },
      });
    }
    if (method === "GET" && path === "/providers") {
      let rows = Object.values(sps);
      if (q.get("is_active")) {
        rows = rows.filter((row) => String(row.user_is_active) === q.get("is_active"));
      }
      if (q.get("kyc_status")) rows = rows.filter((row) => row.kyc_status === q.get("kyc_status"));
      const term = q.get("q")?.toLowerCase();
      if (term) {
        rows = rows.filter((row) =>
          [row.name, row.business_name, row.phone].some((v) =>
            String(v ?? "")
              .toLowerCase()
              .includes(term),
          ),
        );
      }
      return route.fulfill({ json: rows });
    }
    let match = path.match(/^\/providers\/([^/]+)(?:\/(team|invites|payouts))?$/);
    if (method === "GET" && match) {
      const [, id, tail] = match;
      if (!sps[id]) {
        return route.fulfill({
          status: 404,
          json: { error: true, message: "No such SP", code: "SP_NOT_FOUND" },
        });
      }
      if (!tail) return route.fulfill({ json: detail(id) });
      if (tail === "team") return route.fulfill({ json: teams[id] });
      if (tail === "invites") {
        return route.fulfill({
          json:
            id === SP_A
              ? [
                  {
                    id: "i1",
                    invitee_phone: "+919876500020",
                    status: "pending",
                    expires_at: "2026-11-12T10:00:00Z",
                    created_at: "2026-11-05T10:00:00Z",
                    accepted_at: null,
                    accepted_by_user_id: null,
                    revoked_at: null,
                  },
                ]
              : [],
        });
      }
      return route.fulfill({
        json: {
          entries:
            id === SP_A
              ? [
                  {
                    audit_id: "p1",
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
                ]
              : [],
          total: id === SP_A ? 1 : 0,
          page: 1,
          per_page: 5,
        },
      });
    }
    if (method === "GET" && path === "/pros") {
      let rows = allPros();
      if (q.get("sp_user_id")) {
        rows = rows.filter((row) => row.service_provider_id === q.get("sp_user_id"));
      }
      if (q.get("is_active")) {
        rows = rows.filter((row) => String(row.is_active) === q.get("is_active"));
      }
      return route.fulfill({ json: { items: rows, total: rows.length, page: 1, per_page: 25 } });
    }
    match = path.match(/^\/pros\/([^/]+)$/);
    if (method === "GET" && match) {
      const row = allPros().find((p) => p.id === match![1]);
      if (!row) {
        return route.fulfill({
          status: 404,
          json: { error: true, message: "No such Pro", code: "PRO_NOT_FOUND" },
        });
      }
      return route.fulfill({
        json: {
          ...row,
          rating_avg: row.id === PRO_ASHA ? 4.5 : null,
          rating_count: row.id === PRO_ASHA ? 2 : 0,
          completed_job_count: row.id === PRO_ASHA ? 6 : 0,
        },
      });
    }
    if (method === "GET" && path === "/bookings") {
      return route.fulfill({ json: { bookings: [], total: 0, page: 1, per_page: 25 } });
    }
    if (method === "GET" && path === "/actions") {
      let rows = actions;
      const spId = q.get("sp_user_id");
      if (spId) rows = rows.filter((a) => a.sp_user_id === spId || a.to_sp_user_id === spId);
      if (q.get("target_id")) rows = rows.filter((a) => a.target_id === q.get("target_id"));
      return route.fulfill({ json: rows });
    }

    match = path.match(/^\/pros\/([^/]+)\/(force-remove|reassign)$/);
    if (method === "POST" && match) {
      if (role === "support") {
        return route.fulfill({ status: 403, json: { detail: "Requires role: admin, ops" } });
      }
      const [, id, verb] = match;
      const body = request.postDataJSON() as Json;
      writes.push({ path, body });
      const fromSp = Object.keys(teams).find((spId) => teams[spId].some((p) => p.id === id))!;
      const row = teams[fromSp].find((p) => p.id === id)!;
      if (row.active_job_count) {
        return route.fulfill({
          status: 409,
          json: {
            error: true,
            message: "Ravi Patil is on a job.",
            code: "PRO_HAS_ACTIVE_JOB",
            details: { booking_ids: [BOOKING_RAVI] },
          },
        });
      }
      row.is_active = false;
      row.is_online = false;
      if (verb === "force-remove") {
        actions.unshift({
          id: `act-${actions.length + 1}`,
          admin_user_id: "a1",
          admin_name: "Ops Person",
          action: "pro_force_removed",
          target_type: "professional",
          target_id: id,
          sp_user_id: fromSp,
          to_sp_user_id: null,
          reason: body.reason,
          details: { self_reenabled: false },
          created_at: "2026-11-09T06:00:00Z",
        });
        return route.fulfill({ json: { professional_id: id, self_reenabled: false } });
      }
      const target = String(body.target_sp_user_id);
      const moved = teamPro(PRO_ASHA_B, target, {
        display_name: row.display_name,
        phone: row.phone,
        user_id: row.user_id,
        kyc_status: "pending",
      });
      teams[target].push(moved);
      actions.unshift({
        id: `act-${actions.length + 1}`,
        admin_user_id: "a1",
        admin_name: "Ops Person",
        action: "pro_reassigned",
        target_type: "professional",
        target_id: id,
        sp_user_id: fromSp,
        to_sp_user_id: target,
        reason: body.reason,
        details: { to_professional_id: PRO_ASHA_B, reactivated: false, kyc_status: "pending" },
        created_at: "2026-11-09T06:00:00Z",
      });
      return route.fulfill({
        json: {
          old_professional_id: id,
          professional: moved,
          reactivated: false,
          self_reenabled: false,
        },
      });
    }
    return route.fulfill({ status: 404, json: { detail: `Unmocked ${method} ${path}` } });
  });

  return { writes };
}

const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 900 } });

    test("ops reassigns a Pro from SP A to SP B: in B's roster, and in B's history", async ({
      page,
    }) => {
      const backend = await mockBackend(page, "ops");
      await page.goto("/");
      await page
        .getByRole("navigation", { name: "Admin sections" })
        .getByRole("link", { name: "Service providers" })
        .click();
      await page
        .getByRole("region", { name: "Service provider list" })
        .getByRole("link", { name: "Open Vikram Sharma · Sharma Plumbing" })
        .click();
      await expect(page).toHaveURL(new RegExp(`/operator/sps/${SP_A}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Vikram Sharma" })).toBeVisible();

      // The aggregates the ticket asks for.
      await expect(region(page, "Overview")).toContainText("12.9716, 77.5946 · 5 km radius");
      await expect(region(page, "Overview")).toContainText("4.6 / 5");
      await expect(region(page, "Services offered")).toContainText("Retired");
      await expect(
        region(page, "Bookings in the last 30 days").getByRole("link", { name: "7 bookings" }),
      ).toHaveAttribute("href", `/operator/bookings?provider_id=${SP_A}&from=2026-10-11`);
      await expect(
        region(page, "Payouts").getByRole("link", { name: "Open in Payouts" }),
      ).toHaveAttribute("href", `/operator/payouts?sp=${SP_A}`);

      // No writes on the SP's own row or a removed one.
      const team = region(page, "Team");
      await expect(team.getByRole("button", { name: "Reassign Vikram Sharma" })).toHaveCount(0);
      await expect(team.getByRole("button", { name: "Reassign Sunil Gone" })).toHaveCount(0);

      await team.getByRole("button", { name: "Reassign Asha Rao" }).click();
      const dialog = page.getByRole("dialog");
      // The picker asks only for active, verified SPs; the Pro's own SP can't be picked.
      await expect(dialog.getByRole("button", { name: /Old Shop/ })).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Vikram Sharma · Sharma Plumbing, Current team" }),
      ).toBeDisabled();
      await dialog.getByLabel("New SP").fill("kumar");
      await dialog.getByRole("button", { name: "Pick Meera Kumar · Kumar Cleaning" }).click();
      await dialog.getByLabel("Reason (required)").fill("Business merged into Kumar Cleaning");
      await dialog.getByRole("button", { name: "Move" }).click();

      await expect(dialog.getByRole("status")).toContainText("KYC not submitted");
      expect(backend.writes).toEqual([
        {
          path: `/pros/${PRO_ASHA}/reassign`,
          body: { target_sp_user_id: SP_B, reason: "Business merged into Kumar Cleaning" },
        },
      ]);
      await expect(dialog.getByRole("link", { name: "Open the new SP" })).toHaveAttribute(
        "href",
        `/operator/sps/${SP_B}`,
      );
      await expect(dialog.getByRole("link", { name: "Open their new Pro row" })).toHaveAttribute(
        "href",
        `/operator/pros/${PRO_ASHA_B}`,
      );
      // Closing it shows what was refetched behind it: Asha is removed on A, with the
      // move in A's history. (A modal hides the page from the accessibility tree.)
      await dialog.getByRole("button", { name: "Done" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(team.getByRole("button", { name: "Reassign Asha Rao" })).toHaveCount(0);
      const aHistory = region(page, "Admin history");
      await expect(aHistory).toContainText("Asha Rao was moved to another team");

      await aHistory.getByRole("link", { name: "Open the other SP" }).click();
      await expect(page).toHaveURL(new RegExp(`/operator/sps/${SP_B}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Meera Kumar" })).toBeVisible();
      await expect(region(page, "Team").getByRole("link", { name: "Asha Rao" })).toBeVisible();
      const history = region(page, "Admin history");
      await expect(history.locator('[data-action="pro_reassigned"]')).toHaveCount(1);
      await expect(history).toContainText("Asha Rao was moved here from another team");
      await expect(history).toContainText("Business merged into Kumar Cleaning");
    });

    test("ops force removes a Pro, and an active job blocks it with a link", async ({ page }) => {
      const backend = await mockBackend(page, "ops");
      await page.goto(`/operator/sps/${SP_A}`);
      const team = region(page, "Team");

      await team.getByRole("button", { name: "Force remove Ravi Patil" }).click();
      let dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Force remove" }).click();
      await expect(dialog.getByRole("alert")).toContainText("at least 3 characters");
      expect(backend.writes).toHaveLength(0);

      await dialog.getByLabel("Reason (required)").fill("SP asked us to");
      await dialog.getByRole("button", { name: "Force remove" }).click();
      await expect(dialog.getByRole("alert")).toContainText("They're on a job");
      await expect(dialog.getByRole("link", { name: "Open booking c1000000" })).toHaveAttribute(
        "href",
        `/operator/bookings?booking=${BOOKING_RAVI}`,
      );
      await dialog.getByRole("button", { name: "Keep on team" }).click();

      await team.getByRole("button", { name: "Force remove Asha Rao" }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("Reason (required)").fill("Left the business");
      await dialog.getByRole("button", { name: "Force remove" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: "was removed" })).toContainText(
        "Asha Rao was removed from the team.",
      );
      await expect(team.getByRole("button", { name: "Force remove Asha Rao" })).toHaveCount(0);
      await expect(region(page, "Admin history")).toContainText(
        "Asha Rao was force-removed from the team",
      );
    });

    test("support reads the SP and Pro pages and has no write buttons", async ({ page }) => {
      await mockBackend(page, "support");
      await page.goto(`/operator/sps/${SP_A}`);
      await expect(region(page, "Team").getByRole("link", { name: "Asha Rao" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Reassign|Force remove/ })).toHaveCount(0);

      await region(page, "Team").getByRole("link", { name: "Asha Rao" }).click();
      await expect(page).toHaveURL(new RegExp(`/operator/pros/${PRO_ASHA}$`));
      await expect(region(page, "Overview")).toContainText("4.5 / 5 (2 reviews)");
      await expect(
        region(page, "Overview").getByRole("link", { name: /Sharma Plumbing/ }),
      ).toHaveAttribute("href", `/operator/sps/${SP_A}`);
      await expect(page.getByRole("button", { name: /Reassign|Force remove/ })).toHaveCount(0);
    });

    test("the Pro directory narrows to one SP from its page, and links each Pro", async ({
      page,
    }) => {
      await mockBackend(page, "admin");
      await page.goto(`/operator/sps/${SP_A}`);
      await region(page, "Team").getByRole("link", { name: "Open in Pro directory" }).click();
      await expect(page).toHaveURL(new RegExp(`/operator/pros\\?sp=${SP_A}$`));
      await expect(page.getByRole("group", { name: "SP filter" })).toContainText(
        "SP: Vikram Sharma · Sharma Plumbing",
      );
      const list = page.getByRole("region", { name: "Pro list" });
      await expect(list.getByRole("link", { name: "Open Sunil Gone" })).toBeVisible();
      await expect(list.getByRole("link", { name: "Open Meera Kumar" })).toHaveCount(0);

      await page.getByRole("button", { name: "Clear the SP filter" }).click();
      await expect(page).toHaveURL(/\/operator\/pros$/);
      await expect(list.getByRole("link", { name: "Open Meera Kumar" })).toBeVisible();

      await list.getByRole("link", { name: "Open Ravi Patil" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Ravi Patil" })).toBeVisible();
      await expect(region(page, "Overview")).toContainText("No reviews yet");
      await expect(page.getByRole("button", { name: "Reassign" })).toBeVisible();
    });

    test("an SP's own profile and a removed row offer no writes on the Pro page", async ({
      page,
    }) => {
      await mockBackend(page, "admin");
      await page.goto(`/operator/pros/${PRO_SELF_A}`);
      await expect(page.getByRole("heading", { level: 1, name: "Vikram Sharma" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Reassign|Force remove/ })).toHaveCount(0);
      await page.goto(`/operator/pros/${PRO_GONE}`);
      await expect(page.getByRole("heading", { level: 1, name: "Sunil Gone" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Reassign|Force remove/ })).toHaveCount(0);
    });
  });
}

test.describe("the SP directory", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("keeps the search and filters in the URL, and refuses a 1-character search", async ({
    page,
  }) => {
    await mockBackend(page, "support");
    await page.goto("/operator/sps");
    const list = page.getByRole("region", { name: "Service provider list" });
    await expect(list.getByRole("link", { name: /^Open / })).toHaveCount(3);

    const box = page.getByRole("searchbox").or(page.getByLabel("Search"));
    await box.first().fill("k");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Type at least 2 characters.")).toBeVisible();
    await expect(page).toHaveURL(/\/operator\/sps$/);

    await box.first().fill("kumar");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=kumar/);
    await expect(list.getByRole("link", { name: /^Open / })).toHaveCount(1);

    await page.reload();
    await expect(
      list.getByRole("link", { name: "Open Meera Kumar · Kumar Cleaning" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/operator\/sps$/);
  });

  test("an unknown SP id says so", async ({ page }) => {
    await mockBackend(page, "support");
    await page.goto("/operator/sps/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("No service provider with this id.")).toBeVisible();
  });
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 375, height: 800 }, colorScheme: "dark" });

  test("cards instead of tables, and nothing scrolls sideways", async ({ page }) => {
    await mockBackend(page, "ops");
    await page.goto("/operator/sps");
    await expect(page.getByRole("list", { name: "Service providers" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page.goto(`/operator/sps/${SP_A}`);
    await expect(page.getByRole("list", { name: "Team" })).toBeVisible();
    await expect(region(page, "Team").getByRole("table")).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await region(page, "Team").getByRole("button", { name: "Reassign Asha Rao" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");

    await page.goto("/operator/pros");
    await expect(page.getByRole("list", { name: "Pros" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page.goto(`/operator/pros/${PRO_ASHA}`);
    await expect(page.getByRole("heading", { level: 1, name: "Asha Rao" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
