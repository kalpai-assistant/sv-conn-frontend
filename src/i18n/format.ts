/**
 * The one formatter for numbers, money and dates on provider and Pro screens
 * (SVC-375).
 *
 * Digits stay Latin in every language. Left to itself, `Intl` with `mr-IN`
 * prints १,२५,०००, and date-fns' `mr` locale prints English months, so neither
 * is used directly: dates go through `Intl` with the `-u-nu-latn` extension,
 * which gives Hindi/Marathi month names with Latin digits.
 *
 * Money and plain numbers are `en-IN` in every language, deliberately. They
 * contain no words, so there is nothing to translate, and ICU's `mr-IN` groups
 * the Western way (₹125,000 rather than ₹1,25,000) — the exact mistake
 * `currency.ts` warns about, which is identical to the right answer below one
 * lakh and so survives review by eye.
 *
 * English reproduces what each screen did before this module existed: `en-IN`
 * money, and dates in the device's own locale (`undefined`), so with i18n off
 * nothing a user sees changes.
 */
import { formatPaise as paiseEn, formatRupees as rupeesEn } from "@/lib/currency";
import type { AppLanguage } from "./languages";

const DATE_LOCALE: Record<AppLanguage, string | undefined> = {
  en: undefined,
  hi: "hi-IN-u-nu-latn",
  mr: "mr-IN-u-nu-latn",
};

/** Rupees, already in rupees: 1499 → "₹1,499". See `formatRupees` in currency.ts. */
export function formatRupees(rupees: number, _lang: AppLanguage = "en"): string {
  return rupeesEn(rupees);
}

/** A paise integer as rupees: 2400000 → "₹24,000". See `formatPaise` in currency.ts. */
export function formatPaise(paise: number, _lang: AppLanguage = "en"): string {
  return paiseEn(paise);
}

/** A count, Indian-grouped: 125000 → "1,25,000". */
export function formatNumber(value: number, _lang: AppLanguage = "en"): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

/** A calendar date, e.g. `{ day: "numeric", month: "short" }` → "18 Oct" / "18 ऑक्टो". */
export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions,
  lang: AppLanguage = "en",
): string {
  return new Date(value).toLocaleDateString(DATE_LOCALE[lang], options);
}

/** A clock time, e.g. `{ hour: "numeric", minute: "2-digit" }` → "2:30 pm". */
export function formatTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions,
  lang: AppLanguage = "en",
): string {
  return new Date(value).toLocaleTimeString(DATE_LOCALE[lang], options);
}
