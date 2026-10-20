/**
 * The languages the provider and Pro apps speak (SVC-288, SVC-375).
 *
 * Mirrors the backend's `Language` literal (SVC-374, `app/schemas/user.py`),
 * which the DB's CHECK constraint on `users.preferred_language` also mirrors.
 * A fourth language is a change in all three places.
 */
export const LANGUAGES = ["en", "hi", "mr"] as const;

export type AppLanguage = (typeof LANGUAGES)[number];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * How each language names itself, and its English name, for the picker tiles.
 * Each name is in its own script so a reader finds their language without
 * reading any other.
 */
export const LANGUAGE_NAMES: Record<AppLanguage, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  hi: { native: "हिन्दी", english: "Hindi" },
  mr: { native: "मराठी", english: "Marathi" },
};
