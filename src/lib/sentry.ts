/**
 * Sentry initialization — client-side only.
 *
 * `initSentry()` is idempotent (guarded by a module-scoped flag) so both the
 * mobile SPA entry (`main.mobile.tsx`) and the SSR root (`__root.tsx`) can
 * call it without double-initializing.
 *
 * No-op when `VITE_SENTRY_DSN` is unset — dev-safe default. Also no-op on
 * the server side of SSR (window undefined), so importing from `__root.tsx`
 * doesn't crash during Cloudflare edge rendering.
 *
 * Env vars:
 *   VITE_SENTRY_DSN                — DSN from the Sentry project. Empty = disabled.
 *   VITE_SENTRY_ENVIRONMENT        — production | staging | dev
 *   VITE_SENTRY_TRACES_SAMPLE_RATE — 0.0..1.0 — keep low in prod, bump for debug.
 */
import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (typeof window === "undefined") return; // SSR safety
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "dev",
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0,
    // Match the backend default — don't ship request bodies / user tokens to
    // Sentry. Explicit user context is attached via setUser() elsewhere.
    sendDefaultPii: false,
    // Only report unhandled errors and explicit captureException calls.
    // Uncaught console warnings / logs stay local.
    integrations: [Sentry.browserTracingIntegration()],
  });
  initialized = true;
}

/**
 * Convenience wrapper for the ErrorBoundary + router error handler.
 * Falls back to console.error when Sentry isn't configured (dev).
 */
export function reportError(error: Error, context?: Record<string, unknown>): void {
  if (initialized) {
    Sentry.captureException(error, { extra: context });
  } else {
    console.error("[unreported]", error, context);
  }
}

/**
 * Attach / detach the current user on the Sentry scope. Wraps `Sentry.setUser`
 * so callers don't need a Sentry import and the no-init dev path stays silent.
 *
 * Only the opaque user id is sent — phone/email are PII and we ship with
 * `sendDefaultPii: false`. The id is enough to answer "did one user hit this
 * bug 100× or 100 users hit it once".
 *
 * Pass `null` on logout to clear the scope; otherwise a logged-out user's
 * errors would be tagged with the previous user.
 */
export function setSentryUser(user: { id: string } | null): void {
  if (!initialized) return;
  Sentry.setUser(user);
}
