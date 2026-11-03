/**
 * Fetch wrapper for the admin app — duplicated from the consumer app's
 * src/lib/api.ts per SVC-421 ("duplicate now, extract later").
 *
 * Only the transport is copied: base URL, JSON headers, error parsing. There
 * is no token storage, Bearer header or refresh-on-401 here on purpose —
 * admin auth (email + password + MFA) is a different model from the
 * consumer's phone OTP and lands in SVC-407 A2, which adds it to this file.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

/** Thrown on any non-2xx response; carries the status so callers can branch on it. */
export class ApiError extends Error {
  status: number;
  /** Stable app-level code the backend's AppException sets on some errors (SVC-257). */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  // FormData sets its own multipart Content-Type; forcing JSON would corrupt it.
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let errorMsg = `API error: ${res.status} ${res.statusText}`;
    let errorCode: string | undefined;
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
    } catch {
      // Ignored if response is not JSON
    }
    throw new ApiError(res.status, errorMsg, errorCode);
  }

  // 204 No Content — return undefined without trying to parse JSON.
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}
