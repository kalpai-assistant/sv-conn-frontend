/**
 * The full sign-in flow in a real browser, with the API mocked (SVC-422). The
 * shape of each mock is /admin/auth/* in the backend's app/routers/admin_auth.py.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const TOKEN_KEY = "eazyserv-admin:session_token";
const SECRET = "JBSWY3DPEHPK3PXP";
const GOOD_CODE = "123456";
const WRONG_CODE = "000000";

type Role = "admin" | "ops" | "support";

interface BackendOptions {
  role?: Role;
  setupRequired?: boolean;
  /** Overrides for a route, by its path under /admin/auth. */
  overrides?: Record<string, (route: Route) => Promise<void>>;
}

/** A stand-in for the backend that also records what it was asked. */
async function mockBackend(page: Page, options: BackendOptions = {}) {
  const { role = "admin", setupRequired = false, overrides = {} } = options;
  const admin = { id: "a1", email: `${role}@eazyserv.local`, role, last_login_at: null };
  const calls: { path: string; authorization?: string }[] = [];

  await page.route("**/api/v1/admin/auth/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1/admin/auth", "");
    calls.push({ path, authorization: request.headers().authorization });

    const override = overrides[path];
    if (override) {
      return override(route);
    }

    switch (path) {
      case "/login":
        return route.fulfill({
          json: {
            requires_totp: true,
            totp_setup_required: setupRequired,
            challenge_token: "challenge-1",
          },
        });
      case "/totp/setup":
        return route.fulfill({
          json: {
            otpauth_url: `otpauth://totp/EazyServ%20Admin:${admin.email}?secret=${SECRET}&issuer=EazyServ%20Admin`,
          },
        });
      case "/totp/verify":
        return request.postDataJSON().code === GOOD_CODE
          ? route.fulfill({
              json: { access_token: "session-1", token_type: "bearer", expires_in: 43200, admin },
            })
          : route.fulfill({
              status: 401,
              json: {
                error: true,
                message: "Code is incorrect",
                status_code: 401,
                code: "INVALID_TOTP_CODE",
              },
            });
      case "/me":
        return route.fulfill({ json: admin });
      case "/logout":
        return route.fulfill({ status: 204 });
      default:
        throw new Error(`Unmocked: ${path}`);
    }
  });

  return {
    count: (path: string) => calls.filter((call) => call.path === path).length,
    last: (path: string) => calls.filter((call) => call.path === path).at(-1),
  };
}

async function submitPassword(page: Page, email = "admin@eazyserv.local") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-password");
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function submitCode(page: Page, code: string) {
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

async function signIn(page: Page) {
  await submitPassword(page);
  await submitCode(page, GOOD_CODE);
  await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();
}

const storedToken = (page: Page) =>
  page.evaluate((key) => window.sessionStorage.getItem(key), TOKEN_KEY);

test("first login: QR, wrong code, right code, then signed in and out", async ({ page }) => {
  const backend = await mockBackend(page, { setupRequired: true });

  await submitPassword(page);

  await expect(page).toHaveURL(/\/totp-setup$/);
  await expect(page.getByRole("heading", { name: "Set up your authenticator" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Authenticator QR code" })).toBeVisible();
  await expect(page.getByTestId("totp-setup-key")).toHaveText(SECRET);

  // Dev build, so StrictMode has run the effect twice by now.
  expect(backend.count("/totp/setup")).toBe(1);

  await submitCode(page, WRONG_CODE);
  await expect(page.getByRole("alert")).toContainText("wrong or was just used");
  await expect(page).toHaveURL(/\/totp-setup$/);
  await expect(page.getByTestId("totp-setup-key")).toHaveText(SECRET);
  expect(backend.count("/totp/setup")).toBe(1);

  await submitCode(page, GOOD_CODE);
  await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();
  await expect(page.getByText("admin@eazyserv.local")).toBeVisible();

  // Token: sessionStorage only, sent as Bearer.
  expect(await storedToken(page)).toBe("session-1");
  expect(await page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  expect(backend.last("/me")?.authorization).toBe("Bearer session-1");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(backend.last("/logout")?.authorization).toBe("Bearer session-1");
  expect(await storedToken(page)).toBeNull();

  // Back must not reveal the shell once signed out.
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("returning admin goes straight to the code screen and never asks for a QR", async ({
  page,
}) => {
  const backend = await mockBackend(page);

  await submitPassword(page);

  await expect(page).toHaveURL(/\/totp$/);
  await submitCode(page, GOOD_CODE);
  await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();
  expect(backend.count("/totp/setup")).toBe(0);
});

test("a wrong password is a form error", async ({ page }) => {
  await mockBackend(page, {
    overrides: {
      "/login": (route) =>
        route.fulfill({
          status: 401,
          json: {
            error: true,
            message: "Invalid email or password",
            status_code: 401,
            code: "INVALID_CREDENTIALS",
          },
        }),
    },
  });

  await submitPassword(page);

  await expect(page.getByRole("alert")).toHaveText("Invalid email or password");
  await expect(page).toHaveURL(/\/login$/);
});

test("the login rate limit shows the wait from Retry-After", async ({ page }) => {
  await mockBackend(page, {
    overrides: {
      "/login": (route) =>
        route.fulfill({
          status: 429,
          headers: { "Retry-After": "600" },
          json: { error: true, message: "Too many requests", status_code: 429 },
        }),
    },
  });

  await submitPassword(page);

  await expect(page.getByRole("alert")).toHaveText("Too many attempts. Try again in 10 minutes.");
});

test("an expired challenge returns to /login with a message", async ({ page }) => {
  await mockBackend(page, {
    overrides: {
      "/totp/verify": (route) =>
        route.fulfill({
          status: 401,
          json: {
            error: true,
            message: "Login has expired, please sign in again",
            status_code: 401,
            code: "INVALID_CHALLENGE",
          },
        }),
    },
  });

  await submitPassword(page);
  await submitCode(page, GOOD_CODE);

  await expect(page.getByRole("alert")).toContainText("Your sign-in timed out");
  await expect(page).toHaveURL(/\/login\?reason=challenge_expired$/);
});

test("reloading the code screen starts over, because the challenge is memory-only", async ({
  page,
}) => {
  await mockBackend(page);

  await submitPassword(page);
  await expect(page).toHaveURL(/\/totp$/);
  await page.reload();

  await expect(page.getByRole("alert")).toContainText("Your sign-in timed out");
  await expect(page).toHaveURL(/\/login/);
});

test("a blocked network shows a plain message even though the response can't be read", async ({
  page,
}) => {
  await mockBackend(page, { overrides: { "/login": (route) => route.abort("accessdenied") } });

  await submitPassword(page);

  await expect(page.getByRole("alert")).toContainText("this network may not be allowed");
});

test("ops sees Operator and Analytics, and a hidden route by URL goes home", async ({ page }) => {
  await mockBackend(page, { role: "ops" });
  await signIn(page);

  const nav = page.getByRole("navigation", { name: "Admin sections" });
  await expect(nav.getByRole("link", { name: "KYC" })).toBeVisible();
  await expect(nav.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(nav.getByRole("heading", { name: "Support" })).toHaveCount(0);

  await page.goto("/support/lookup");
  await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();
  await expect(page).toHaveURL(/localhost:5174\/$/);
});

test("support sees Operator and Support, and Analytics by URL goes home (SVC-432)", async ({
  page,
}) => {
  await mockBackend(page, { role: "support" });
  await signIn(page);

  const nav = page.getByRole("navigation", { name: "Admin sections" });
  for (const section of ["Operator", "Support"]) {
    await expect(nav.getByRole("heading", { name: section })).toBeVisible();
  }
  await expect(nav.getByRole("heading", { name: "Analytics" })).toHaveCount(0);

  await page.goto("/analytics/overview");
  await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();
  await expect(page).toHaveURL(/localhost:5174\/$/);
});

test("the session survives a reload and picks up a rolled token", async ({ page }) => {
  const backend = await mockBackend(page);
  await signIn(page);

  await page.unroute("**/api/v1/admin/auth/**");
  await page.route("**/api/v1/admin/auth/me", (route) =>
    route.fulfill({
      headers: { "X-Admin-Token": "session-2" },
      json: { id: "a1", email: "admin@eazyserv.local", role: "admin", last_login_at: null },
    }),
  );
  await page.reload();

  await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();
  expect(await storedToken(page)).toBe("session-2");
  expect(backend.count("/me")).toBe(1);
});

test("an ended session sends the user to /login with a message", async ({ page }) => {
  let sessionAlive = true;
  await mockBackend(page, {
    overrides: {
      "/me": (route) =>
        sessionAlive
          ? route.fulfill({
              json: { id: "a1", email: "admin@eazyserv.local", role: "admin", last_login_at: null },
            })
          : route.fulfill({ status: 401, json: { detail: "Session has ended" } }),
    },
  });
  await signIn(page);

  sessionAlive = false;
  await page.reload();

  await expect(page.getByRole("alert")).toContainText("Your session has ended");
  await expect(page).toHaveURL(/\/login/);
  expect(await storedToken(page)).toBeNull();
});

test("a signed-in user landing on /login goes home", async ({ page }) => {
  await mockBackend(page);
  await signIn(page);

  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Admin console" })).toBeVisible();
  await expect(page).toHaveURL(/localhost:5174\/$/);
});

test("at phone width the menu is role-filtered and sign-out is reachable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockBackend(page, { role: "support" });
  await signIn(page);

  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog");
  await expect(menu.getByRole("link", { name: "KYC" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Overview" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // No sideways scroll: a long email must truncate, not push the button off screen.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
