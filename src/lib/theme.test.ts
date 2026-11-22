/**
 * SVC-489 · theme.ts unit tests.
 *
 * Each case names the failure it catches. The hook lives on every page
 * via `__root.tsx` so a regression here shows up as "dark mode doesn't
 * flip" on a release — exactly the SVC-255 class of silent breakage.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { prefersDark, useSyncSystemColorScheme } from "./theme";

type MediaListener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<MediaListener>();
  const mediaQueryList: Partial<MediaQueryList> = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: ((_: string, listener: MediaListener) => {
      listeners.add(listener);
    }) as MediaQueryList["addEventListener"],
    removeEventListener: ((_: string, listener: MediaListener) => {
      listeners.delete(listener);
    }) as MediaQueryList["removeEventListener"],
    dispatchEvent: (() => true) as MediaQueryList["dispatchEvent"],
  };
  const matchMedia = vi.fn().mockReturnValue(mediaQueryList);
  // jsdom defines window.matchMedia as `undefined` by default; override it.
  vi.stubGlobal("matchMedia", matchMedia);
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: matchMedia,
  });
  const fire = (next: boolean) => {
    (mediaQueryList as { matches: boolean }).matches = next;
    listeners.forEach((listener) => {
      listener({ matches: next } as MediaQueryListEvent);
    });
  };
  return { matchMedia, fire, listenerCount: () => listeners.size };
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSyncSystemColorScheme", () => {
  // Catches: "dark-OS cold boot paints light mode because the hook never
  // sets the initial class." Regression of SVC-489's whole point.
  it("adds .dark on mount when the OS prefers dark", () => {
    mockMatchMedia(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    renderHook(() => useSyncSystemColorScheme());

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // Catches: "dark-OS flip works once, but switching OS back to light
  // leaves the class stuck on." Would read as the app ignoring the user.
  it("removes .dark on mount when the OS prefers light", () => {
    document.documentElement.classList.add("dark");
    mockMatchMedia(false);

    renderHook(() => useSyncSystemColorScheme());

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // Catches: "user flips OS theme mid-session, app doesn't follow until
  // reload." The pattern on any modern UC/Rapido clone.
  it("follows OS changes while mounted", () => {
    const { fire } = mockMatchMedia(false);
    renderHook(() => useSyncSystemColorScheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fire(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fire(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // Catches: "stale listener after route swap or logout mutates the class
  // on an unmounted tree." Classic effect-cleanup leak.
  it("unsubscribes on unmount", () => {
    const { fire, listenerCount } = mockMatchMedia(false);
    const { unmount } = renderHook(() => useSyncSystemColorScheme());
    expect(listenerCount()).toBe(1);

    unmount();
    expect(listenerCount()).toBe(0);

    // A stale listener firing after unmount would still mutate the DOM —
    // fire once and prove nothing happens.
    document.documentElement.classList.remove("dark");
    fire(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("prefersDark", () => {
  // Catches: "`window` access throws during SSR" — the exact class of bug
  // that keeps `npm run dev` broken (frontend/CLAUDE.md:308).
  it("returns false when window is undefined", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error — simulating SSR by removing window.
    delete globalThis.window;
    try {
      expect(prefersDark()).toBe(false);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  // Catches: "prefersDark lies about OS preference, inline script and hook
  // disagree, flash on cold boot." Smoke test to keep the two paths aligned.
  it("mirrors matchMedia(prefers-color-scheme: dark).matches", () => {
    mockMatchMedia(true);
    expect(prefersDark()).toBe(true);
  });
});
