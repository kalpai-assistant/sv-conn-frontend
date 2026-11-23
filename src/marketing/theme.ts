/**
 * Marketing-only theme helper (SVC-378 Phase 1.5).
 *
 * Marketing has no auth, no React Query, no provider tree — a theme
 * context would be overkill. These three functions are all the UI
 * needs: read the current preference, write a new one, subscribe for
 * cross-tab changes.
 *
 * STORAGE
 * `sc_theme` prefix — SVC-350's logout sweep cleans `sc_*` keys for
 * logged-in users, but marketing visitors are anonymous. The prefix
 * matters anyway: when a visitor later signs up and enters the app on
 * the same browser, logout should NOT wipe their theme preference. In
 * practice SVC-350 only runs on explicit logout, so `sc_theme` survives
 * that flow — but the value is a device-level preference, not a
 * per-user state, and that is worth protecting by the shared-prefix
 * contract.
 *
 * BOOTSTRAP
 * The inline <script> in index.marketing.html already applied .dark /
 * .light to <html> before React mounted (no flash). These helpers
 * assume that bootstrap has run and keep the class in sync with later
 * user toggles.
 */
const STORAGE_KEY = "sc_theme";

export type ThemeChoice = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

/** Read the user's stored choice. "system" is the default. */
export function getStoredTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // storage blocked — fall through
  }
  return "system";
}

/** Read what the OS currently prefers. SSR-safe. */
export function getSystemTheme(): EffectiveTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Resolve a user choice to the concrete theme that should render. */
export function resolveTheme(choice: ThemeChoice): EffectiveTheme {
  return choice === "system" ? getSystemTheme() : choice;
}

/**
 * Apply an effective theme to <html>. Removes both class names first so
 * flipping choices never leaves both on. Mirrors the bootstrap script in
 * index.marketing.html — any change there must be mirrored here.
 */
function applyTheme(effective: EffectiveTheme): void {
  const html = document.documentElement;
  html.classList.remove("dark", "light");
  html.classList.add(effective);
}

/**
 * Change the stored preference AND apply it immediately. Returns the
 * effective theme that is now showing. Returns `getSystemTheme()` when
 * the new choice is "system".
 */
export function setTheme(choice: ThemeChoice): EffectiveTheme {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // ignore — the class change below still works for this session
  }
  const effective = resolveTheme(choice);
  applyTheme(effective);
  return effective;
}

/**
 * Subscribe to OS theme changes. The returned unsubscribe only needs
 * to fire on component unmount; we don't need to debounce or batch.
 *
 * Only useful when the user picked "system" — if they picked explicit
 * light or dark, OS changes don't re-flip the page. Caller filters.
 */
export function subscribeToSystemTheme(onChange: (next: EffectiveTheme) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? "dark" : "light");
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
