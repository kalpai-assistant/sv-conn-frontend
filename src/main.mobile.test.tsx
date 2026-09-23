/**
 * Regression test for SVC-316's pre-render fallback: if `getRouter()` throws
 * synchronously, the mobile entry must render an inline "Reload" UI into
 * `#root` instead of leaving a white screen. This is the exact class of
 * failure SVC-313 exhibited in the wild — silent, undetectable, unrecoverable
 * without a full app reinstall — so the assertion here is the wire tripped by
 * the sibling fixes if they regress.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./router", () => ({
  getRouter: vi.fn(() => {
    throw new Error("test: router failed to construct");
  }),
}));

vi.mock("./lib/sentry", () => ({
  initSentry: vi.fn(),
}));

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: vi.fn(), setBackgroundColor: vi.fn() },
  Style: { Light: "Light" },
}));

vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: { hide: vi.fn() },
}));

vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn(), exitApp: vi.fn() },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { dismiss: vi.fn() }) }));

vi.mock("./styles.css", () => ({}));

describe("main.mobile boot", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.resetModules();
  });

  it("renders the reload fallback into #root when getRouter throws", async () => {
    const Sentry = await import("@sentry/react");
    await import("./main.mobile");

    const root = document.getElementById("root")!;
    expect(root.innerHTML).toContain("Something went wrong");
    const button = root.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("onclick")).toContain("location.reload");

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "test: router failed to construct" }),
      { tags: { boot_stage: "pre_render" } },
    );
  });
});
