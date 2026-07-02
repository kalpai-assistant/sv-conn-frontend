// Client-side payout validation for the onboarding payout step (SVC-133).
// These rules mirror the backend (SVC-147) exactly so anything that passes here
// is not rejected with a 422 — see the SVC-133 "digits-only" comment.
//
// Each validator returns null when valid, or a user-facing error message.

// UPI VPA: local-part@handle, e.g. "name@okhdfcbank" (min 2 chars each side).
export const UPI_VPA_RE = /^[\w.\-]{2,}@[A-Za-z]{2,}$/;
// IFSC: 4 letters + "0" + 6 alphanumeric, e.g. "HDFC0001234".
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// Bank account number: digits only, 5–34 long.
export const ACCOUNT_RE = /^\d{5,34}$/;

export function validateVpa(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your UPI ID.";
  if (!UPI_VPA_RE.test(v)) return "Enter a valid UPI ID, e.g. name@bank.";
  return null;
}

export function validateAccountNumber(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your account number.";
  if (!ACCOUNT_RE.test(v)) return "Account number must be 5–34 digits.";
  return null;
}

export function validateIfsc(value: string): string | null {
  const v = value.trim().toUpperCase();
  if (!v) return "Enter the IFSC code.";
  if (!IFSC_RE.test(v)) return "Enter a valid IFSC, e.g. HDFC0001234.";
  return null;
}
