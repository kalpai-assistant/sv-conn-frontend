/**
 * Fetch wrapper for the admin app. The transport is duplicated from the
 * consumer app's src/lib/api.ts per SVC-421 ("duplicate now, extract later").
 * The session handling below is the admin model (SVC-422), not the consumer's:
 * one token, no refresh token, and it lives in sessionStorage so it dies with
 * the tab.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

const SESSION_TOKEN_KEY = "eazyserv-admin:session_token";

/** Thrown on any non-2xx response; carries the status so callers can branch on it. */
export class ApiError extends Error {
  status: number;
  /** Stable app-level code the backend's AppException sets on some errors (SVC-257). */
  code?: string;
  /** Seconds from the Retry-After header. A 429 is identified by status, never by code. */
  retryAfter?: number;
  /**
   * The AppException's structured context, when it sends one: a team refusal's
   * blocking booking ids, say (SVC-427). Read each key defensively; it's untyped.
   */
  details?: Record<string, unknown>;
  constructor(
    status: number,
    message: string,
    code?: string,
    retryAfter?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

// Storage can throw (blocked site data). The variable is the source of truth,
// so a blocked store costs only surviving a reload, not the session itself.
function readStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token === null) window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    else window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // See readStoredToken.
  }
}

let sessionToken: string | null = readStoredToken();

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setSessionToken(token: string): void {
  sessionToken = token;
  writeStoredToken(token);
}

export function clearSessionToken(): void {
  sessionToken = null;
  writeStoredToken(null);
}

let onSessionLost: (() => void) | null = null;

/** Called when a session-gated call gets a 401. The router registers its redirect here. */
export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

// The two steps before a session exists. A 401 from them is a form error (wrong
// password, wrong code), so it must not sign anyone out.
function isSessionGated(path: string): boolean {
  return !/^\/admin\/auth\/(login|totp\/)/.test(path);
}

function parseRetryAfter(res: Response): number | undefined {
  const seconds = Number(res.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * The transport under apiFetch: the session token, its roll and the 401 sign-out,
 * and an ApiError for any non-2xx. It hands back the raw Response, for the one
 * caller whose body isn't JSON (the payouts CSV, SVC-426).
 */
export async function apiFetchResponse(path: string, options: RequestInit = {}): Promise<Response> {
  // FormData sets its own multipart Content-Type; forcing JSON would corrupt it.
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };

  const gated = isSessionGated(path);
  const sentToken = gated ? sessionToken : null;
  if (sentToken) {
    headers["Authorization"] = `Bearer ${sentToken}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  // Only a response to the current token may change the session. Otherwise a
  // request still in flight at sign-out would bring the token back on its way
  // in, or a late 401 from an old session would sign out a newer one. Parallel
  // requests are safe too: the backend keeps the old token valid after rolling it.
  if (sentToken && sentToken === sessionToken) {
    const rolled = res.headers.get("X-Admin-Token");
    if (rolled) {
      setSessionToken(rolled);
    }
    if (res.status === 401) {
      clearSessionToken();
      onSessionLost?.();
    }
  }

  if (!res.ok) {
    let errorMsg = `API error: ${res.status} ${res.statusText}`;
    let errorCode: string | undefined;
    let errorDetails: Record<string, unknown> | undefined;
    try {
      const errorData = await res.json();
      if (errorData && errorData.message) {
        errorMsg = errorData.message;
      } else if (res.status < 500 && errorData && typeof errorData.detail === "string") {
        // FastAPI's raw HTTPException shape. 5xx detail stays hidden: it
        // describes infrastructure, not anything an operator can act on.
        errorMsg = errorData.detail;
      }
      if (errorData && typeof errorData.code === "string") {
        errorCode = errorData.code;
      }
      const details = errorData?.details;
      if (details && typeof details === "object" && !Array.isArray(details)) {
        errorDetails = details as Record<string, unknown>;
      }
    } catch {
      // Ignored if response is not JSON
    }
    throw new ApiError(res.status, errorMsg, errorCode, parseRetryAfter(res), errorDetails);
  }

  return res;
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetchResponse(path, options);

  // 204 No Content — return undefined without trying to parse JSON.
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}
