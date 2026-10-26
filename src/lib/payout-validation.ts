// Client-side payout validation for the onboarding payout step (SVC-133).
// These rules mirror the backend (SVC-147) exactly so anything that passes here
// is not rejected with a 422 — see the SVC-133 "digits-only" comment.
//
// Each validator returns null when valid, or a user-facing error message —
// in the screen's language when given its provider `t` (SVC-376), English
// otherwise.

import { englishT, type Translate } from "@/i18n";

// UPI VPA: local-part@handle, e.g. "name@okhdfcbank" (min 2 chars each side).
// Matches the backend set [word char, dot, hyphen]; hyphen last = literal.
export const UPI_VPA_RE = /^[\w.-]{2,}@[A-Za-z]{2,}$/;
// IFSC: 4 letters + "0" + 6 alphanumeric, e.g. "HDFC0001234".
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// Bank account number: digits only, 5–34 long.
export const ACCOUNT_RE = /^\d{5,34}$/;

export function validateVpa(value: string, t: Translate = englishT("provider")): string | null {
  const v = value.trim();
  if (!v) return t("payoutForm.vpaEmpty");
  if (!UPI_VPA_RE.test(v)) return t("payoutForm.vpaInvalid");
  return null;
}

export function validateAccountNumber(
  value: string,
  t: Translate = englishT("provider"),
): string | null {
  const v = value.trim();
  if (!v) return t("payoutForm.accountEmpty");
  if (!ACCOUNT_RE.test(v)) return t("payoutForm.accountInvalid");
  return null;
}

export function validateIfsc(value: string, t: Translate = englishT("provider")): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return t("payoutForm.ifscEmpty");
  if (!IFSC_RE.test(v)) return t("payoutForm.ifscInvalid");
  return null;
}
