/**
 * Admin sign-in (SVC-422): email + password, then a TOTP code, then a session.
 * The contract is /admin/auth/* in the backend's app/routers/admin_auth.py.
 */
import { ApiError, apiFetch, clearSessionToken, getSessionToken, setSessionToken } from "./api";

export type AdminRole = "admin" | "ops" | "support";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  last_login_at: string | null;
}

interface LoginResponse {
  requires_totp: boolean;
  totp_setup_required: boolean;
  challenge_token: string;
}

interface SessionResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  admin: AdminUser;
}

// The challenge lets its holder finish a login, so it stays in memory only: it
// is dropped on success, on leaving for /login, and by a reload.
let challengeToken: string | null = null;
let pendingSetup: { challenge: string; otpauthUrl: Promise<string> } | null = null;

export function getChallengeToken(): string | null {
  return challengeToken;
}

export function clearChallenge(): void {
  challengeToken = null;
  pendingSetup = null;
}

/** Password step. Returns whether the admin must set up an authenticator first. */
export async function login(email: string, password: string): Promise<{ setupRequired: boolean }> {
  const res = await apiFetch<LoginResponse>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  clearChallenge();
  challengeToken = res.challenge_token;
  return { setupRequired: res.totp_setup_required };
}

/**
 * Asks the backend for the authenticator QR. Every call makes a new secret and
 * invalidates the last QR, so a challenge shares one call however many times
 * the screen mounts (StrictMode runs effects twice). A failed call is forgotten
 * so that "Try again" can make another.
 */
export function startTotpSetup(challenge: string): Promise<string> {
  if (pendingSetup?.challenge === challenge) {
    return pendingSetup.otpauthUrl;
  }
  const otpauthUrl = apiFetch<{ otpauth_url: string }>("/admin/auth/totp/setup", {
    method: "POST",
    body: JSON.stringify({ challenge_token: challenge }),
  }).then((res) => res.otpauth_url);
  const setup = { challenge, otpauthUrl };
  pendingSetup = setup;
  otpauthUrl.catch(() => {
    if (pendingSetup === setup) {
      pendingSetup = null;
    }
  });
  return otpauthUrl;
}

/** Code step. On success the session token is stored and the challenge is spent. */
export async function verifyTotp(challenge: string, code: string): Promise<void> {
  const res = await apiFetch<SessionResponse>("/admin/auth/totp/verify", {
    method: "POST",
    body: JSON.stringify({ challenge_token: challenge, code }),
  });
  setSessionToken(res.access_token);
  clearChallenge();
}

// Long enough not to block every navigation on a round trip, short enough that
// a role change or an ended session reaches the UI soon. The backend checks the
// role on every request regardless, so this only ever affects what is shown.
const CURRENT_ADMIN_TTL_MS = 5 * 60 * 1000;

let currentAdmin: { admin: AdminUser; token: string | null; fetchedAt: number } | null = null;

/**
 * The signed-in admin, from GET /admin/auth/me. A failed refresh falls back to
 * the known admin when it says nothing about the session (offline, or a 5xx). A
 * 401 or 403 is always thrown, because it does say something.
 */
export async function loadCurrentAdmin(): Promise<AdminUser> {
  const known = currentAdmin?.token === getSessionToken() ? currentAdmin : null;
  if (known && Date.now() - known.fetchedAt < CURRENT_ADMIN_TTL_MS) {
    return known.admin;
  }
  try {
    const admin = await apiFetch<AdminUser>("/admin/auth/me");
    // Read the token after the call: this response may have just rolled it.
    currentAdmin = { admin, token: getSessionToken(), fetchedAt: Date.now() };
    return admin;
  } catch (err) {
    const saysNothing = !(err instanceof ApiError) || err.status >= 500;
    if (known && saysNothing) {
      return known.admin;
    }
    throw err;
  }
}

/** Forgets everything about the current sign-in, in this tab. */
export function resetAuthState(): void {
  clearSessionToken();
  clearChallenge();
  currentAdmin = null;
}

/**
 * Ends the session. The token always goes, so the tab is signed out either way.
 * Returns false when the backend did not confirm it: that session stays valid
 * on the server until it expires, and the user should know. A 401 counts as
 * confirmed, since it means the session had already ended.
 */
export async function signOut(): Promise<boolean> {
  let confirmed = true;
  try {
    await apiFetch("/admin/auth/logout", { method: "POST" });
  } catch (err) {
    confirmed = err instanceof ApiError && err.status === 401;
  }
  resetAuthState();
  return confirmed;
}

function waitPhrase(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * What to show for a failed sign-in call. The backend's own message covers the
 * 401s and the IP allowlist's 403.
 *
 * When the API is on another origin, the allowlist's 403 reaches the browser as
 * a failed fetch: it runs outside the backend's CORS middleware, so the response
 * has no CORS headers and can't be read. Hence the second sentence below.
 */
export function authErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "Couldn't reach the server. Check your connection; this network may not be allowed.";
  }
  if (err.status === 429) {
    return err.retryAfter
      ? `Too many attempts. Try again in ${waitPhrase(err.retryAfter)}.`
      : "Too many attempts. Try again later.";
  }
  if (err.status === 422) {
    return "Check what you entered and try again.";
  }
  if (err.status >= 500) {
    return "Something went wrong on our side. Try again.";
  }
  return err.message;
}
