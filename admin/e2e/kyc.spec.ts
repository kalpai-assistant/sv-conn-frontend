/**
 * The KYC queue in a real browser, with the API mocked (SVC-424). The shape of each
 * mock is the "KYC queue" section of the backend's ADMIN.md. Each flow runs in both
 * colour schemes, because night mode only swaps tokens and fixed colours can clash.
 *
 * These mocks can't see an audit row. The exact-count check for approve and reject
 * is test_write_route_writes_exactly_one_correct_row in the backend.
 */
import { expect, test, type Page } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";

type Role = "admin" | "ops" | "support";

const ASHA = {
  kind: "sp",
  id: "u-asha",
  phone: "+919000000001",
  name: "Asha Rao",
  email: null,
  kyc_status: "submitted",
  kyc_submitted_at: "2026-11-05T10:00:00Z",
  kyc_reviewed_at: null,
  kyc_rejection_reason: null,
  professional_id: null,
  sp_user_id: null,
  sp_business_name: null,
};

const HARI = {
  ...ASHA,
  kind: "pro",
  id: "u-hari",
  phone: "+919000000002",
  name: "Hari Kumar",
  professional_id: "p-hari",
  sp_user_id: "u-owner",
  sp_business_name: "Bright Homes",
};

const VERDICT = {
  outcome: "needs_review",
  confidence: 0.61,
  extracted: {
    aadhaar_last4: "5678",
    name_en: "Asha R Different",
    name_local: null,
    dob: "1988-11-02",
    gender: "F",
    address: "House No. 42, 7th Cross, JP Nagar 3rd Phase, Bengaluru KA 560078 near the metro",
  },
  flags: ["name_mismatch"],
  raw_response: { model: "raw-model-output" },
};

type Row = typeof ASHA | typeof HARI;

const DOCS = "https://docs.example.test";

function detail(row: Row, overrides: Record<string, unknown> = {}) {
  return {
    user_id: row.id,
    name: row.name,
    phone: row.phone,
    kyc_status: row.kyc_status,
    kyc_submitted_at: row.kyc_submitted_at,
    kyc_reviewed_at: null,
    kyc_rejection_reason: null,
    aadhaar_url: `${DOCS}/front.svg`,
    aadhaar_front_url: `${DOCS}/front.svg`,
    aadhaar_back_url: `${DOCS}/back.svg`,
    selfie_url: `${DOCS}/selfie.svg`,
    ai_verdict: VERDICT,
    ...overrides,
  };
}

const SAMPLE_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#789"/></svg>`;

/** Signs in by seeding the token, and keeps a small queue that changes as actions land. */
async function mockBackend(page: Page, role: Role = "admin") {
  let queue: Row[] = [ASHA, HARI];
  const posts: { url: string; body: unknown }[] = [];
  let details = (row: Row) => detail(row);

  await page.addInitScript(
    ([key, token]) => window.sessionStorage.setItem(key, token),
    [TOKEN_KEY, "session-1"],
  );
  await page.route("**/api/v1/admin/auth/me", (route) =>
    route.fulfill({
      json: { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null },
    }),
  );
  await page.route("**/api/v1/admin/providers/kyc/pending/count?*", (route) =>
    route.fulfill({ json: { count: queue.length } }),
  );
  await page.route("**/api/v1/admin/providers/kyc/pending?*", (route) =>
    route.fulfill({ json: queue }),
  );
  for (const [path, row] of [
    ["providers/u-asha", ASHA],
    ["pros/p-hari", HARI],
  ] as const) {
    await page.route(`**/api/v1/admin/${path}/kyc`, (route) =>
      route.fulfill({ json: details(row) }),
    );
    for (const action of ["verify", "reject"]) {
      await page.route(`**/api/v1/admin/${path}/kyc/${action}`, (route) => {
        posts.push({ url: route.request().url(), body: route.request().postDataJSON() });
        queue = queue.filter((item) => item !== row);
        return route.fulfill({ json: { kyc_status: "verified" } });
      });
    }
  }
  await page.route(`${DOCS}/**`, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: SAMPLE_IMAGE }),
  );

  return {
    posts,
    setDetails: (next: typeof details) => {
      details = next;
    },
  };
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const pane = (page: Page) => page.getByRole("region", { name: "KYC detail" });
const queue = (page: Page) => page.getByRole("region", { name: "KYC queue" });

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme, viewport: { width: 1280, height: 800 } });

    test("an admin approves a row, and the queue and badge move on", async ({ page }) => {
      const backend = await mockBackend(page);
      await page.goto("/operator/kyc");

      const nav = page.getByRole("navigation", { name: "Admin sections" });
      await expect(nav.getByRole("link", { name: "KYC, 2 pending" })).toBeVisible();

      await queue(page)
        .getByRole("button", { name: /Asha Rao/ })
        .click();
      await pane(page).getByRole("button", { name: "Approve" }).click();

      await expect(page.getByRole("status")).toHaveText("KYC verified: Asha Rao");
      await expect(pane(page).getByRole("heading", { name: "Asha Rao" })).toHaveCount(0);
      await expect(queue(page).getByRole("button", { name: /Asha Rao/ })).toHaveCount(0);
      await expect(queue(page).getByRole("button", { name: /Hari Kumar/ })).toBeVisible();
      await expect(nav.getByRole("link", { name: "KYC, 1 pending" })).toBeVisible();

      expect(backend.posts.map((post) => new URL(post.url).pathname)).toEqual([
        "/api/v1/admin/providers/u-asha/kyc/verify",
      ]);
    });

    test("an admin rejects a Pro with a reason, on the Pro route", async ({ page }) => {
      const backend = await mockBackend(page);
      await page.goto("/operator/kyc");

      await queue(page)
        .getByRole("button", { name: /Hari Kumar/ })
        .click();
      await pane(page).getByRole("button", { name: "Reject" }).click();

      // A blank reason goes nowhere.
      await pane(page).getByRole("button", { name: "Confirm rejection" }).click();
      await expect(pane(page).getByRole("alert")).toHaveText("Enter a reason for the rejection.");
      expect(backend.posts).toEqual([]);

      await pane(page).getByLabel("Reason for rejection").fill("  Blurred photo  ");
      await pane(page).getByRole("button", { name: "Confirm rejection" }).click();

      await expect(page.getByRole("status")).toHaveText("KYC rejected: Hari Kumar");
      expect(backend.posts).toHaveLength(1);
      expect(new URL(backend.posts[0].url).pathname).toBe("/api/v1/admin/pros/p-hari/kyc/reject");
      expect(backend.posts[0].body).toEqual({ reason: "Blurred photo" });
    });

    test("support reads everything and can't act", async ({ page }) => {
      await mockBackend(page, "support");
      await page.goto("/operator/kyc");

      await queue(page)
        .getByRole("button", { name: /Asha Rao/ })
        .click();

      await expect(pane(page).getByText("AI Analysis")).toBeVisible();
      await expect(pane(page).getByRole("img", { name: "Selfie" })).toBeVisible();
      await expect(pane(page).getByText(/Read-only/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
    });

    test("a thumbnail expands in a modal, in the same window", async ({ page, context }) => {
      await mockBackend(page);
      await page.goto("/operator/kyc");
      await queue(page)
        .getByRole("button", { name: /Asha Rao/ })
        .click();

      const thumbnail = await pane(page).getByRole("img", { name: "Aadhaar back" }).boundingBox();
      await pane(page).getByRole("button", { name: "Open Aadhaar back" }).click();

      const dialog = page.getByRole("dialog", { name: "Aadhaar back" });
      const large = dialog.getByRole("img", { name: "Aadhaar back, large view" });
      await expect(large).toBeVisible();
      const box = await large.boundingBox();
      expect(box!.width).toBeGreaterThan(thumbnail!.width * 2);
      expect(context.pages()).toHaveLength(1);
      expect(page.url()).not.toContain("docs.example.test");

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(pane(page).getByRole("button", { name: "Open Aadhaar back" })).toBeFocused();
    });

    test("the mismatch cell and pills stay readable", async ({ page }) => {
      await mockBackend(page);
      await page.goto("/operator/kyc");
      await queue(page)
        .getByRole("button", { name: /Asha Rao/ })
        .click();

      const stated = pane(page).getByRole("cell", { name: "Asha Rao" });
      await expect(stated).toBeVisible();
      const { text, background } = await stated.evaluate((element) => {
        const style = getComputedStyle(element);
        return { text: style.color, background: style.backgroundColor };
      });
      // Dark text on the fixed light amber, in either scheme.
      expect(text).toBe(await colourOf(page, "text-amber-950", "color"));
      expect(background).toBe(await colourOf(page, "bg-amber-100", "backgroundColor"));
      expect(await page.locator("body").textContent()).not.toContain("raw-model-output");
    });
  });
}

/** What the browser resolves a Tailwind class to, for comparing colours in any notation. */
function colourOf(page: Page, className: string, property: "color" | "backgroundColor") {
  return page.evaluate(
    ([name, prop]) => {
      const probe = document.createElement("div");
      probe.className = name;
      document.body.append(probe);
      const value = getComputedStyle(probe)[prop as "color"];
      probe.remove();
      return value;
    },
    [className, property],
  );
}

test("two panes sit side by side on a desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockBackend(page);
  await page.goto("/operator/kyc");
  await queue(page)
    .getByRole("button", { name: /Asha Rao/ })
    .click();
  await expect(pane(page).getByRole("heading", { name: "Asha Rao" })).toBeVisible();

  const left = await queue(page).boundingBox();
  const right = await pane(page).boundingBox();
  expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width);
  expect(right!.y).toBe(left!.y);
});

test("at phone width they stack, selecting scrolls to the detail, nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockBackend(page);
  await page.goto("/operator/kyc");

  await expect(queue(page).getByRole("button", { name: /Asha Rao/ })).toBeVisible();
  // With nothing selected, the empty detail pane doesn't take up the phone's screen.
  await expect(pane(page)).toBeHidden();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await queue(page)
    .getByRole("button", { name: /Asha Rao/ })
    .click();
  const heading = pane(page).getByRole("heading", { name: "Asha Rao" });
  await expect(heading).toBeInViewport();

  const top = await queue(page).boundingBox();
  const bottom = await pane(page).boundingBox();
  expect(bottom!.x).toBe(top!.x);
  expect(bottom!.y).toBeGreaterThan(top!.y);
  await expect(pane(page).getByText("AI Analysis")).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await pane(page).getByRole("button", { name: "Open Selfie" }).click();
  await expect(page.getByRole("img", { name: "Selfie, large view" })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.keyboard.press("Escape");

  await pane(page).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toBeInViewport();
});

test("on a short desktop screen, the page scrolls back to show the outcome", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await mockBackend(page);
  await page.goto("/operator/kyc");

  // A refusal first: the row stays selected, and the button is far below the banner.
  await page.route("**/api/v1/admin/pros/p-hari/kyc/verify", (route) =>
    route.fulfill({
      status: 403,
      json: { error: true, message: "Can only verify SUBMITTED KYC", status_code: 403 },
    }),
  );
  await queue(page)
    .getByRole("button", { name: /Hari Kumar/ })
    .click();
  const approve = pane(page).getByRole("button", { name: "Approve" });
  await approve.scrollIntoViewIfNeeded();
  await approve.click();
  await expect(page.getByRole("alert")).toContainText("Can only verify SUBMITTED KYC");
  await expect(page.getByRole("alert")).toBeInViewport({ ratio: 1 });

  await queue(page)
    .getByRole("button", { name: /Asha Rao/ })
    .click();
  const next = pane(page).getByRole("button", { name: "Approve" });
  await next.scrollIntoViewIfNeeded();
  await next.click();
  await expect(page.getByRole("status")).toHaveText("KYC verified: Asha Rao");
  await expect(page.getByRole("status")).toBeInViewport({ ratio: 1 });
});

test("in night mode the panes that scroll get dark scrollbars", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockBackend(page);
  await page.goto("/operator/kyc");
  await queue(page)
    .getByRole("button", { name: /Asha Rao/ })
    .click();

  await expect(pane(page)).toHaveCSS("color-scheme", "light dark");
  await pane(page).getByRole("button", { name: "Open Selfie" }).click();
  await expect(page.getByRole("dialog", { name: "Selfie" })).toHaveCSS(
    "color-scheme",
    "light dark",
  );
});

test("with a long queue scrolled down, the outcome still comes into view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockBackend(page);
  const rows = Array.from({ length: 30 }, (_, i) => ({
    ...ASHA,
    id: `extra-${i}`,
    name: `Extra ${i}`,
  }));
  rows[25] = ASHA;
  let approved = false;
  await page.route("**/api/v1/admin/providers/kyc/pending?*", (route) =>
    route.fulfill({ json: approved ? rows.filter((row) => row !== ASHA) : rows }),
  );
  await page.route("**/api/v1/admin/providers/u-asha/kyc/verify", (route) => {
    approved = true;
    return route.fulfill({ json: { kyc_status: "verified" } });
  });
  await page.goto("/operator/kyc");

  await queue(page)
    .getByRole("button", { name: /Asha Rao/ })
    .click();
  const approve = pane(page).getByRole("button", { name: "Approve" });
  await approve.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await approve.click();

  await expect(page.getByRole("status")).toHaveText("KYC verified: Asha Rao");
  await expect(page.getByRole("status")).toBeInViewport({ ratio: 1 });
});

test("each row opens at the top of the pane, with its name in view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await mockBackend(page);
  await page.goto("/operator/kyc");

  await queue(page)
    .getByRole("button", { name: /Asha Rao/ })
    .click();
  await pane(page).getByRole("button", { name: "Approve" }).scrollIntoViewIfNeeded();
  await expect.poll(() => pane(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await queue(page)
    .getByRole("button", { name: /Hari Kumar/ })
    .click();

  await expect(pane(page).getByRole("heading", { name: "Hari Kumar" })).toBeVisible();
  expect(await pane(page).evaluate((el) => el.scrollTop)).toBe(0);
});

test("the phone menu shows the badge", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockBackend(page);
  await page.goto("/operator/kyc");

  await page.getByRole("button", { name: "Open menu" }).click();

  await expect(page.getByRole("link", { name: "KYC, 2 pending" })).toBeVisible();
});

test("a filter survives a reload, and Back restores the last one", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/operator/kyc");

  const filters = page.getByRole("navigation", { name: "KYC filters" });
  await filters.getByRole("link", { name: "Rejected" }).click();
  await expect(page).toHaveURL(/\?tab=rejected$/);
  await page.reload();
  await expect(filters.getByRole("link", { name: "Rejected" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await filters.getByRole("link", { name: "All" }).click();
  await expect(page).toHaveURL(/\?tab=all$/);
  await page.goBack();
  await expect(page).toHaveURL(/\?tab=rejected$/);
});

test("a bad filter or page in the URL falls back to the default", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/operator/kyc?tab=nonsense&page=-3");

  await expect(
    page.getByRole("navigation", { name: "KYC filters" }).getByRole("link", { name: "Pending" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(queue(page).getByRole("button", { name: /Asha Rao/ })).toBeVisible();
});

test("a broken image offers a retry that fetches a new link", async ({ page }) => {
  const backend = await mockBackend(page);
  await page.route(`${DOCS}/expired.svg`, (route) => route.fulfill({ status: 403 }));
  backend.setDetails((row) => detail(row, { selfie_url: `${DOCS}/expired.svg` }));
  await page.goto("/operator/kyc");
  await queue(page)
    .getByRole("button", { name: /Asha Rao/ })
    .click();

  const retry = pane(page).getByRole("button", { name: "Retry Selfie" });
  await expect(retry).toBeVisible();

  backend.setDetails((row) => detail(row));
  await retry.click();

  await expect(pane(page).getByRole("img", { name: "Selfie" })).toBeVisible();
  await expect(retry).toHaveCount(0);
});
