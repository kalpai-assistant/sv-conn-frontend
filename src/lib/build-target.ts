/**
 * Which build we're in — "app" (default, app.eazyserv.com) or "marketing"
 * (eazyserv.com apex). Set by the Vite config at build time via `define`
 * so tree-shaking can drop the other branch's imports.
 *
 * Not runtime-derived from hostname on purpose: we want the marketing
 * bundle to physically NOT contain AuthProvider, FCM, PWA service
 * worker, etc. Runtime detection would still ship all of that.
 */
export const BUILD_TARGET = (import.meta.env.VITE_BUILD_TARGET as "app" | "marketing") ?? "app";

export const IS_MARKETING = BUILD_TARGET === "marketing";
