/**
 * No frame of Hindi on a customer route (SVC-375).
 *
 * A Pro in Hindi taps the avatar on /pro and lands on /profile, a customer
 * route. The language is decided during render, so /profile — and the nav
 * that sits outside the route outlet — must be English from their very first
 * render, not one commit later. Every render of the probes is recorded, so a
 * single stale frame fails the test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from "@tanstack/react-router";

const useAuth = vi.fn();
vi.mock("@/lib/auth-context", () => ({ useAuth: () => useAuth() }));
vi.mock("@/lib/cart-context", () => ({ useCart: () => ({ totalQuantity: 0 }) }));

import { useLayoutEffect } from "react";
import { BottomNav } from "@/components/BottomNav";
import { LanguageProvider, useT } from "./LanguageProvider";
import { resetStoredLanguageForTests, setStoredLanguage } from "./language";

type Frame = { where: string; pathname: string; text: string };
let frames: Frame[] = [];
/** The real BottomNav's text after every commit, before paint. */
let navFrames: { pathname: string; text: string }[] = [];

function NavRecorder() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useLayoutEffect(() => {
    navFrames.push({ pathname, text: document.querySelector("nav")?.textContent ?? "" });
  });
  return null;
}

function Probe({ where }: { where: string }) {
  const { t } = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const text = t("language.row");
  frames.push({ where, pathname, text });
  return (
    <p>
      {where}:{text}
    </p>
  );
}

function renderAt(initial: string) {
  const root = createRootRoute({
    component: () => (
      <LanguageProvider>
        <Outlet />
        {/* Where BottomNav sits in __root: beside the outlet, not in it. */}
        <Probe where="nav" />
        <BottomNav />
        <NavRecorder />
      </LanguageProvider>
    ),
  });
  const routes = ["/pro", "/pro/jobs", "/profile", "/"].map((path) =>
    createRoute({ getParentRoute: () => root, path, component: () => <Probe where={path} /> }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  frames = [];
  navFrames = [];
  resetStoredLanguageForTests();
});
afterEach(() => resetStoredLanguageForTests());

describe("LanguageProvider", () => {
  it("renders /profile and the nav in English from their first frame after /pro in Hindi", async () => {
    useAuth.mockReturnValue({ user: { id: "u1", i18n_enabled: true, preferred_language: "hi" } });
    setStoredLanguage("hi");
    const router = renderAt("/pro");

    expect(await screen.findByText("/pro:भाषा")).toBeInTheDocument();
    expect(screen.getByText("nav:भाषा")).toBeInTheDocument();

    const before = frames.length;
    await act(() => router.navigate({ to: "/profile" }));
    expect(await screen.findByText("/profile:Language")).toBeInTheDocument();

    const after = frames.slice(before);
    const onProfile = after.filter((f) => f.where === "/profile" || f.pathname === "/profile");
    expect(onProfile.length).toBeGreaterThan(0);
    expect(onProfile.filter((f) => f.text !== "Language")).toEqual([]);
    expect(screen.getByText("nav:Language")).toBeInTheDocument();

    // The real BottomNav (SVC-375 review): Hindi Pro tabs on /pro, and never a
    // committed frame of Hindi once the path is /profile.
    expect(navFrames.find((f) => f.pathname === "/pro")?.text).toBe("होमकाम");
    const navOnProfile = navFrames.filter((f) => f.pathname === "/profile");
    expect(navOnProfile.length).toBeGreaterThan(0);
    for (const f of navOnProfile) expect(f.text).not.toMatch(/[ऀ-ॿ]/);
    expect(navOnProfile.at(-1)?.text).toBe("HomeBookingsCartActivity");
  });

  it("switches back to Hindi on the way back into the Pro app", async () => {
    useAuth.mockReturnValue({ user: { id: "u1", i18n_enabled: true, preferred_language: "hi" } });
    setStoredLanguage("hi");
    const router = renderAt("/profile");
    expect(await screen.findByText("/profile:Language")).toBeInTheDocument();

    await act(() => router.navigate({ to: "/pro/jobs" }));
    expect(await screen.findByText("/pro/jobs:भाषा")).toBeInTheDocument();
    expect(frames.filter((f) => f.where === "/pro/jobs" && f.text !== "भाषा")).toEqual([]);
  });

  it("stays English on /pro while the kill switch is off", async () => {
    useAuth.mockReturnValue({ user: { id: "u1", i18n_enabled: false, preferred_language: "hi" } });
    setStoredLanguage("hi");
    renderAt("/pro");
    expect(await screen.findByText("/pro:Language")).toBeInTheDocument();
    expect(frames.filter((f) => f.text !== "Language")).toEqual([]);
  });

  it("re-renders at once when a language is picked", async () => {
    useAuth.mockReturnValue({ user: { id: "u1", i18n_enabled: true, preferred_language: null } });
    renderAt("/pro");
    expect(await screen.findByText("/pro:Language")).toBeInTheDocument();
    act(() => setStoredLanguage("mr"));
    expect(screen.getByText("/pro:भाषा")).toBeInTheDocument();
  });

  it("sets <html lang> to the active language", async () => {
    useAuth.mockReturnValue({ user: { id: "u1", i18n_enabled: true, preferred_language: "mr" } });
    setStoredLanguage("mr");
    const router = renderAt("/pro");
    await screen.findByText("/pro:भाषा");
    expect(document.documentElement.lang).toBe("mr");
    await act(() => router.navigate({ to: "/" }));
    await screen.findByText("/:Language");
    expect(document.documentElement.lang).toBe("en");
  });
});
