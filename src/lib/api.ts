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

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    return true;
  } catch {
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
