/**
 * An API failure in the screen's language (SVC-375).
 *
 * The backend tags select errors with a stable `code` (SVC-257); those are
 * mapped to `errors.<CODE>` in common.json. Only in Hindi and Marathi:
 *
 * - English shows exactly what it showed before — the backend's own message,
 *   or the caller's fallback — so nothing visible changes while i18n is off.
 * - hi/mr: a known code → its translation; an ApiError without one → the
 *   backend's English message (better than a generic line that hides what
 *   went wrong); anything else (a network failure's "Failed to fetch") → the
 *   caller's translated fallback, never a raw browser string.
 */
import { ApiError } from "@/lib/api";
import i18n from "./index";
import type { AppLanguage } from "./languages";

export function errorText(err: unknown, fallback: string, lang: AppLanguage = "en"): string {
  if (lang === "en") return err instanceof Error ? err.message : fallback;
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    if (err.code && i18n.exists(key, { lng: "en", ns: "common" })) {
      return i18n.getFixedT(lang, "common")(key);
    }
    return err.message;
  }
  return fallback;
}
