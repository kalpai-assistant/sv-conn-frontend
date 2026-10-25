/**
 * Which language a screen renders in, and the device's remembered choice
 * (SVC-375).
 *
 * ## The gate
 *
 * Language applies by route, never by account: a Pro is a consumer-role
 * account, and the same person books services as a customer from `/`. So
 * Hindi or Marathi is used only on `/provider/*` and `/pro/*`, and only while
 * the backend's kill switch (`i18n_enabled`, from `I18N_MODE`) is on for this
 * user. Everywhere else — customer screens, `/profile`, sign-in, `/invite` —
 * is English whatever was chosen, which is what keeps the customer app
 * untouched.
 *
 * ## The remembered choice
 *
 * Kept on the device under `eazyserv:language`, deliberately not an `sc_` key:
 * `clearSession` wipes every `sc_*` key on logout, and a Pro who signs out
 * should come back to their own language. No cookie, so the server render
 * stays as it was. The backend's `preferred_language` is copied in on every
 * sign-in and cold-start probe (see `auth-context`), which covers a new phone
 * or a reinstall. A sign-in whose account never chose clears it instead (see
 * `adoptSignInLanguage`), so a shared phone doesn't pass one person's
 * language to the next.
 */
import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { isProRoute, isProviderRoute } from "@/lib/nav-visibility";
import type { components } from "@/types/api";
import { isAppLanguage, type AppLanguage } from "./languages";

const STORAGE_KEY = "eazyserv:language";

/**
 * The account whose last pick on this device never reached the backend
 * (SVC-395). Holds a user id, so another account signing in on the same
 * phone is not mistaken for the one who picked.
 */
const UNSAVED_KEY = "eazyserv:language-unsaved";

/** What `activeLanguage` needs from the signed-in user. */
export interface LanguageUser {
  id?: string;
  i18n_enabled?: boolean;
  preferred_language?: AppLanguage | null;
}

/**
 * The language a route renders in.
 *
 * The device's choice wins over the backend's copy: a pick whose save failed
 * (offline) is still the Pro's choice, and the next probe that succeeds brings
 * the two back in step.
 */
export function activeLanguage({
  pathname,
  user,
  stored,
}: {
  pathname: string;
  user: LanguageUser | null | undefined;
  stored: AppLanguage | null;
}): AppLanguage {
  if (user?.i18n_enabled !== true) return "en";
  if (!isProviderRoute(pathname) && !isProRoute(pathname)) return "en";
  return stored ?? user.preferred_language ?? "en";
}

function read(): AppLanguage | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isAppLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
}

let current: AppLanguage | null = read();
const listeners = new Set<() => void>();

export function getStoredLanguage(): AppLanguage | null {
  return current;
}

/** Remember a language on this device; every screen re-renders in it at once. */
export function setStoredLanguage(lang: AppLanguage): void {
  if (lang === current) return;
  current = lang;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Private mode: the choice lasts for this session only.
    }
  }
  listeners.forEach((listener) => listener());
}

/**
 * Copy the backend's language onto the device. A null means "never chosen",
 * which says nothing about this device, so it leaves the stored value alone.
 *
 * Skipped while this account has an unsaved pick: the backend still holds the
 * old language, and copying it in would undo the pick on the next cold start
 * (found on device, SVC-395). `retryLanguageSave` sends the pick instead.
 */
export function syncStoredLanguage(user: LanguageUser | null | undefined): void {
  if (user?.id && languageUnsavedFor(user.id)) return;
  if (isAppLanguage(user?.preferred_language)) setStoredLanguage(user.preferred_language);
}

function readUnsaved(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(UNSAVED_KEY);
  } catch {
    return null;
  }
}

/** The pick for this account could not be saved; keep it until it can. */
export function markLanguageUnsaved(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UNSAVED_KEY, userId);
  } catch {
    // Private mode: the pick lasts for this session only, as before.
  }
}

/** The device and the backend agree again, or the pick no longer applies. */
export function clearLanguageUnsaved(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(UNSAVED_KEY);
  } catch {
    // ignore
  }
}

/** Whether this account has a pick on this device the backend never got. */
export function languageUnsavedFor(userId: string): boolean {
  return readUnsaved() === userId;
}

/**
 * Send this account's unsaved pick to the backend. Resolves to the language
 * once saved, or null when there was nothing to send or it failed again (the
 * marker stays, so the next start tries once more).
 */
export async function retryLanguageSave(userId: string): Promise<AppLanguage | null> {
  const lang = current;
  if (!lang || !languageUnsavedFor(userId)) return null;
  try {
    const body: components["schemas"]["UpdateLanguageRequest"] = { language: lang };
    await apiFetch("/users/me/language", { method: "PATCH", body: JSON.stringify(body) });
    clearLanguageUnsaved();
    return lang;
  } catch {
    return null;
  }
}

/** Forget the device's language; every screen falls back to the account's. */
export function clearStoredLanguage(): void {
  if (current === null) return;
  current = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  listeners.forEach((listener) => listener());
}

/**
 * A fresh sign-in takes the account's own choice, or none.
 *
 * Unlike `syncStoredLanguage`, a null clears the device: the stored language
 * survives logout on purpose, and on a shared phone that would otherwise hand
 * SP A's Marathi to Pro B, who never chose it — under a first-run prompt
 * asking B to choose. Only for sign-in: on the cold-start probe and within a
 * session the device's choice still wins (a save that failed offline).
 */
export function adoptSignInLanguage(user: LanguageUser | null | undefined): void {
  // The same account signing back in keeps its unsaved pick (see
  // `syncStoredLanguage`); anyone else starts from their own.
  if (user?.id && languageUnsavedFor(user.id)) return;
  clearLanguageUnsaved();
  if (isAppLanguage(user?.preferred_language)) setStoredLanguage(user.preferred_language);
  else clearStoredLanguage();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The stored language, subscribed. The server snapshot is null so the first
 * client render matches the English SSR output, then corrects itself.
 */
export function useStoredLanguage(): AppLanguage | null {
  return useSyncExternalStore(subscribe, getStoredLanguage, () => null);
}

// ---------------------------------------------------------------------------
// The first-run prompt's "once per sign-in". Here rather than beside the
// component so `auth-context` can re-arm it on logout without importing UI.

let askedFor: string | null = null;

/** The prompt was shown to this user in this sign-in. */
export function markLanguageAsked(userId: string): void {
  askedFor = userId;
}

/** Called on logout, so the next sign-in can be asked. */
export function resetLanguagePrompt(): void {
  askedFor = null;
}

/**
 * Whether to ask for a language now: kill switch on, never chosen, not yet
 * asked this sign-in, and on a provider/Pro screen.
 *
 * `/provider/onboarding` included (SVC-376): the wizard is translated, so a
 * new SP is asked at its start and does the whole sign-up in their language.
 */
export function shouldAskLanguage(
  pathname: string,
  user: { id: string; i18n_enabled?: boolean; preferred_language?: string | null } | null,
): boolean {
  if (!user || user.i18n_enabled !== true || user.preferred_language != null) return false;
  if (askedFor === user.id) return false;
  return isProviderRoute(pathname) || isProRoute(pathname);
}

/** Tests only: forget the stored language between cases. */
export function resetStoredLanguageForTests(): void {
  clearStoredLanguage();
  clearLanguageUnsaved();
  askedFor = null;
}
