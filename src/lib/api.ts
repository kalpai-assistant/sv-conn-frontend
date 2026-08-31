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
  /**
   * Seconds to wait before retrying, parsed from the response's `Retry-After`
   * header. The backend sets it on every 429 per RFC 6585 §4, computed from
   * the live TTL of the limiter key — so it is the real remaining lockout,
   * not a guess. Undefined when the header is absent or unparseable.
   */
  retryAfter?: number;
  /**
   * SVC-257: optional app-level error identifier the backend sets on select
   * exceptions (e.g. `SERVICE_AREA_MISSING`). Lets callers branch on a
   * stable code instead of parsing the human message. Absent when the
   * exception didn't set one — most 4xx bodies from FastAPI validation.
   */
  code?: string;
  constructor(status: number, message: string, retryAfter?: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
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
  // For FormData (file uploads — provider KYC docs / selfie / profile photo)
  // let the browser set Content-Type so the multipart boundary lands
  // correctly. Forcing application/json here would corrupt the request.
  // Ported from SVC-41.
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
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
    let errorCode: string | undefined;
    try {
      const errorData = await res.json();
      if (errorData && errorData.message) {
        errorMsg = errorData.message;
      } else if (errorData && typeof errorData.detail === "string") {
        // FastAPI's own HTTPException serialises as {"detail": ...}, not the
        // {"error", "message", "status_code"} shape our AppException handler
        // emits. SVC-253's Policy A rejection ("This phone is already
        // registered as consumer") is a raw HTTPException, so without this
        // branch its text never reaches the user and they get the useless
        // "API error: 400" placeholder instead — verified on device.
        // Strings only: FastAPI's 422 validation errors put an array here,
        // which would render as "[object Object]".
        errorMsg = errorData.detail;
      }
      // SVC-257: backend `AppException` optionally carries a stable app-level
      // code so callers can branch without parsing the message string.
      if (errorData && typeof errorData.code === "string") {
        errorCode = errorData.code;
      }
    } catch {
      // Ignored if response is not JSON
    }
    // Guard the parse rather than leaning on Number(): a missing header
    // coerces to 0, which would read as "retry immediately".
    const rawRetryAfter = res.headers.get("Retry-After");
    const retryAfter = rawRetryAfter === null ? NaN : Number(rawRetryAfter);
    throw new ApiError(
      res.status,
      errorMsg,
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined,
      errorCode,
    );
  }

  // 204 No Content — return undefined without trying to parse JSON.
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}
