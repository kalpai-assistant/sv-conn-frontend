// Pluggable API utility — replace API_BASE_URL with your backend
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

/**
 * Error thrown by `apiFetch` on any non-2xx response. Carries the status
 * code so callers can branch on it (`if (err instanceof ApiError && err.status
 * === 429) ...`) without parsing message text. Backwards-compatible with plain
 * `Error` — `err.message` still works.
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Auth-session persistence keys. Kept as constants so tests + auth-context
// can share the same names — swap for @capacitor/preferences later if we
// want to encrypt at rest on native, but localStorage is durable across
// cold starts on both PWA and Capacitor's WebView so the current default
// is fine for beta.
const ACCESS_TOKEN_KEY = "eazyserv:access_token";
const REFRESH_TOKEN_KEY = "eazyserv:refresh_token";

// SSR-safe localStorage. Vite's SSR pass hits this module before hydration;
// guarding here (rather than at every call site) keeps the callers terse.
function readStoredToken(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Some browsers (private mode) throw on any localStorage access.
    return null;
  }
}

function writeStoredToken(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private-mode fallback: tokens survive only for the current session.
    // Not great, but not this module's problem to fix.
  }
}

// Initialised from localStorage so a cold start finds any tokens the last
// session persisted. The AuthProvider on mount also reads them (via
// `hasStoredAuth()`) so it can decide whether to skip the AuthFlow while
// the refresh probe runs.
let accessToken: string | null = readStoredToken(ACCESS_TOKEN_KEY);
let refreshToken: string | null = readStoredToken(REFRESH_TOKEN_KEY);

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  writeStoredToken(ACCESS_TOKEN_KEY, access);
  writeStoredToken(REFRESH_TOKEN_KEY, refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  writeStoredToken(ACCESS_TOKEN_KEY, null);
  writeStoredToken(REFRESH_TOKEN_KEY, null);
}

export function getAccessToken() {
  return accessToken;
}

/** Whether the module found tokens in storage at boot. Used by the
 *  AuthProvider to render a splash instead of flashing the AuthFlow while
 *  the refresh probe runs. */
export function hasStoredAuth(): boolean {
  return accessToken !== null && refreshToken !== null;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      // Refresh token expired or revoked — clear both so we don't keep
      // retrying a dead token on every subsequent request, and so the
      // AuthProvider's restore path drops back to the AuthFlow.
      clearTokens();
      return false;
    }
    const data = await res.json();
    // Persist through setTokens so localStorage stays in sync (was in-memory
    // only before, which meant a successful mid-session refresh wouldn't
    // survive the NEXT cold start).
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    // Network error — don't clear tokens; a transient outage shouldn't
    // log the user out.
    return false;
  }
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    let errorMsg = `API error: ${res.status} ${res.statusText}`;
    try {
      const errorData = await res.json();
      if (errorData && errorData.message) {
        errorMsg = errorData.message;
      }
    } catch {
      // Ignored if response is not JSON
    }
    throw new ApiError(res.status, errorMsg);
  }

  // 204 No Content — return undefined without trying to parse JSON.
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}
