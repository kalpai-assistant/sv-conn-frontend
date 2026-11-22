/**
 * OS color-scheme → `.dark` class on `<html>` (SVC-489 · Phase 0 of SVC-378).
 *
 * The OKLCH tokens in `src/styles.css` already carry a dark variant under
 * `@media (prefers-color-scheme: dark)` (landed in SVC-383). That block
 * swaps the token values on `:root` automatically, but Tailwind's `dark:`
 * variant is wired to a class (`@custom-variant dark (&:is(.dark *))`) —
 * so hundreds of pre-authored `dark:bg-…` utility classes stayed inert.
 *
 * This hook flips that switch. On mount we read `prefers-color-scheme`,
 * toggle `.dark` on `<html>`, and subscribe to OS changes so the class
 * follows the system the rest of the session. SSR-safe (guards `window`).
 *
 * The mobile build ALSO has an inline pre-hydration script in
 * `index.mobile.html` that sets the class before the Vite bundle loads —
 * without it, a cold boot on a dark-OS device paints one tick of light-mode
 * before React mounts, which reads as a flicker on the ~500ms splash → app
 * hand-off. The web (SSR) build accepts that one tick and relies on this
 * hook alone; the hydration mismatch is benign because className is one of
 * React's explicitly tolerated attributes on `<html>` / `<body>`.
 */
import { useEffect } from "react";

const QUERY = "(prefers-color-scheme: dark)";

/**
 * Synchronise `.dark` on `<html>` with the OS color scheme for the mount's
 * lifetime. Idempotent: calling it from multiple roots is safe because the
 * class and the listener converge on the same answer.
 */
export function useSyncSystemColorScheme() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(QUERY);
    const apply = (dark: boolean) => {
      document.documentElement.classList.toggle("dark", dark);
    };
    apply(media.matches);
    const listener = (event: MediaQueryListEvent) => apply(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
}

/**
 * Standalone read for callers outside React (e.g. the pre-hydration path
 * in `index.mobile.html`'s inline script — this export is not consumed
 * there because it's inline, but mirrors the shape so the hook and the
 * script stay in sync). Returns `false` on the server.
 */
export function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(QUERY).matches;
}
