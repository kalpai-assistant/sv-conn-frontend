/**
 * The admin guard and menu (SVC-329).
 *
 * `adminGate` is AppGate's SVC-345 admin branches moved out unchanged, so a
 * new admin page is guarded by its /admin prefix alone. The menu is rendered
 * once by AppGate's admin shell; the source assertions keep it there and off
 * the login page, the same way `__root.safe-area.test.ts` pins its rule.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "@/routeTree.gen";
import { ADMIN_MENU_ITEMS, adminGate } from "@/lib/admin";

describe("adminGate", () => {
  it.each([
    ["signed out", false, null],
    ["a consumer", true, "consumer"],
    ["a provider", true, "provider"],
  ])("sends %s away from /admin/teams and an owner's page", (_who, authed, role) => {
    expect(adminGate("/admin/teams", authed, role)).toBe("to-login");
    expect(adminGate("/admin/teams/3f1c0000-0000-0000-0000-000000000000", authed, role)).toBe(
      "to-login",
    );
  });

  it("lets an admin through to /admin/teams", () => {
    expect(adminGate("/admin/teams", true, "admin")).toBe("pass");
    expect(adminGate("/admin/teams/abc", true, "admin")).toBe("pass");
  });

  it("keeps /admin/login reachable signed out, and skips it for a signed-in admin", () => {
    expect(adminGate("/admin/login", false, null)).toBe("login-page");
    expect(adminGate("/admin/login", true, "consumer")).toBe("login-page");
    expect(adminGate("/admin/login", true, "admin")).toBe("to-kyc");
  });

  it("has no say outside /admin", () => {
    expect(adminGate("/", false, null)).toBe("pass");
    expect(adminGate("/provider", true, "provider")).toBe("pass");
  });
});

describe("the admin menu", () => {
  it("lists every admin page in the route tree, and not the login", () => {
    const router = createRouter({ routeTree, history: createMemoryHistory() });
    const adminPages = Object.keys(router.routesByPath)
      .filter((p) => p.startsWith("/admin") && p !== "/admin/login" && !p.includes("$"))
      .map((p) => p.replace(/\/$/, ""))
      .sort();
    expect(ADMIN_MENU_ITEMS.map((i) => i.to).sort()).toEqual(adminPages);
  });

  const source = readFileSync(join(process.cwd(), "src", "routes", "__root.tsx"), "utf8");
  const appGate = source.slice(
    source.indexOf("function AppGate("),
    source.indexOf("\nfunction ", source.indexOf("function AppGate(") + 1),
  );

  it("is rendered by the admin shell, so every admin page has it", () => {
    expect(appGate).toMatch(/if \(isAdminRoute\) \{\s*return \(\s*<div[^>]*>\s*<AdminMenu \/>/);
  });

  it("is rendered nowhere else in AppGate (the login branch returns before it)", () => {
    expect(appGate.match(/<AdminMenu \/>/g)).toHaveLength(1);
    const login = appGate.indexOf('adminVerdict === "login-page"');
    const menu = appGate.indexOf("<AdminMenu />");
    expect(login).toBeGreaterThan(-1);
    expect(login).toBeLessThan(menu);
  });
});
