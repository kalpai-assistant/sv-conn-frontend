/**
 * SPA entry point for the Capacitor mobile build.
 *
 * Uses a plain React DOM render (no TanStack Start SSR).
 * TanStack Router still handles client-side routing exactly
 * as it does in the web app.
 *
 * Boot-time observability (SVC-316): the fix tickets SVC-314 + SVC-315
 * address the root causes of the intermittent white-screen on APK update
 * (SVC-313), but the failure mode is *silent* — a sync throw before Sentry
 * boots, or a lazy-import that never resolves, produces zero telemetry. This
 * file wraps the pre-render phase in try/catch + a queued global-error
 * capture + a `boot_ok` heartbeat so the next white-screen becomes an event
 * we can see, and so a regression in the fixes is measurable (drop in
 * `boot_ok` count within N minutes of a release).
 */
import { StrictMode, useEffect } from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import { RouterProvider } from "@tanstack/react-router";
import { toast } from "sonner";
import { getRouter } from "./router";
import { initSentry } from "./lib/sentry";
import { APP_VERSION } from "./lib/version";
import { runBackInterceptors } from "./lib/back-interceptor";
import { isProRoute, isProviderRoute } from "./lib/nav-visibility";
import { startAppLinks } from "./lib/app-link";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Capacitor native plugins (status bar, splash screen, etc.)
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

// --- SVC-316: pre-Sentry error queue ---------------------------------------
//
// Attach the queue BEFORE initSentry() so a throw during Sentry init (or any
// module-eval error surfaced via window.onerror between now and Sentry's own
// handlers taking over) is preserved and flushed once Sentry is up. Without
// this, the first cold-boot throw — the exact class of bug SVC-313 exhibits —
// vanishes into a blank WebView.
type StagedError = { error: unknown; stage: string };
const preSentryErrors: StagedError[] = [];

const stashPreSentryError = (stage: string) => (event: ErrorEvent | PromiseRejectionEvent) => {
  const error = "error" in event ? event.error : (event as PromiseRejectionEvent).reason;
  preSentryErrors.push({ error, stage });
};

window.addEventListener("error", stashPreSentryError("window.error"));
window.addEventListener("unhandledrejection", stashPreSentryError("unhandledrejection"));

try {
  initSentry();
} catch (err) {
  preSentryErrors.push({ error: err, stage: "initSentry" });
}

// Sentry's own global handlers take over from here; drain anything that landed
// in the pre-init window so it's still attributable in the issue stream.
for (const { error, stage } of preSentryErrors) {
  Sentry.captureException(error, { tags: { boot_stage: stage } });
}

/**
 * Window for the double-tap-to-exit gesture. Android's convention is 2s, but
 * that measures from the press, not from when the toast finishes animating in
 * — by the time a user sees it and reacts, much of it is gone. 3s is what the
 * apps this is modelled on actually use.
 */
const EXIT_PROMPT_WINDOW_MS = 3000;

async function initNative(router: ReturnType<typeof getRouter>) {
  if (!Capacitor.isNativePlatform()) return;

  // SVC-354: open an App Link's page (the invite SMS → /invite) rather than the
  // start page. First, before the awaits below, so a cold start's link is
  // routed as early as possible. `replace` (SVC-273): the start page it
  // replaces is not somewhere back should return to. Listens for the app's
  // lifetime, like the back button below. See app-link.ts.
  void startAppLinks(App, (path) => {
    void router.navigate({ href: path, replace: true });
  });

  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#1957D2" });
  } catch {
    // StatusBar API may not be available on all devices
  }

  try {
    await SplashScreen.hide();
  } catch {
    // ignore
  }

  // Android hardware back button.
  //
  // Ask the router, not the WebView: the event's own `canGoBack` reflects
  // window.history, which TanStack Router doesn't drive one-to-one, and
  // window.history.back() bypasses the router entirely.
  let lastBackPress = 0;

  App.addListener("backButton", () => {
    // UI mounted outside the router gets first refusal — the auth gate in
    // __root.tsx is not a route, so nothing below this line can see it.
    if (runBackInterceptors()) return;

    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }

    // Nothing to pop. Anywhere but home, land on home rather than offering to
    // exit from a deep-linked page (/privacy, /tracking/…). `replace` so the
    // dead-end entry doesn't become somewhere back returns to.
    //
    // "Home" is role-dependent (SVC-273). A provider sent to "/" hits the role
    // guard in __root.tsx and gets redirected to /provider — it arrives, but
    // via a visible double navigation, and it means back momentarily shows a
    // consumer screen to a provider. Since the provider app lost its tab bar,
    // back is now the primary way off Jobs and Profile, so this path runs
    // often enough to be worth getting right rather than leaning on the guard.
    //
    // The Pro app (SVC-322) has its own root for the same reason: "/" would
    // drop a Pro into the consumer app, which they reach only on purpose.
    const pathname = router.state.location.pathname;
    const home = isProviderRoute(pathname) ? "/provider" : isProRoute(pathname) ? "/pro" : "/";
    if (pathname !== home) {
      router.navigate({ to: home, replace: true });
      return;
    }

    // Home with nothing behind it: double-tap to exit.
    const now = Date.now();
    if (now - lastBackPress < EXIT_PROMPT_WINDOW_MS) {
      App.exitApp();
    } else {
      lastBackPress = now;
      // Duration must match the window: a toast that outlives it tells the
      // user to press back again when doing so only restarts the timer.
      // Fixed `id` so repeated presses replace the toast instead of stacking.
      toast("Press back again to exit", {
        id: "exit-prompt",
        duration: EXIT_PROMPT_WINDOW_MS,
      });
    }
  });
}

/**
 * Wipe any service worker + Cache Storage the WebView carried over from a
 * prior install (SVC-314). Nothing in the current mobile bundle registers a
 * SW, but Android preserves WebView data across APK updates, so a poisoned
 * registration from an older version can still be serving a stale
 * `index.html` that points at hashes this APK doesn't ship.
 *
 * Fire-and-forget on purpose: the caller does not await this — cleanup must
 * never delay first render, and a hung `getRegistrations()` must not brick
 * boot. Errors are swallowed for the same reason.
 */
async function cleanupStalePwaState() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in globalThis) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Never block boot on cleanup.
  }
}

// --- SVC-316: first-render heartbeat ---------------------------------------
//
// Module-level guard, not a useRef: React 19 StrictMode double-invokes effects
// in dev, and even the ref-in-a-remounted-component approach can be defeated
// by hot reload. A file-scope boolean fires exactly once per JS context, which
// is what the dashboard alert ("drop >30% in boot_ok count within 30min of a
// release") depends on to be a reliable proxy for "boot succeeded".
let bootOkFired = false;

function BootHeartbeat() {
  useEffect(() => {
    if (bootOkFired) return;
    bootOkFired = true;
    Sentry.addBreadcrumb({
      category: "boot",
      message: "app_first_render",
      level: "info",
    });
    Sentry.captureMessage("boot_ok", {
      level: "info",
      tags: {
        version_name: APP_VERSION,
        platform: Capacitor.getPlatform(),
      },
    });
  }, []);
  return null;
}

/**
 * Inline fallback UI rendered when the pre-render phase throws. Uses no
 * imports and no external CSS — the whole point is that this has to work
 * when Vite's chunks failed to load, or a native plugin import blew up,
 * or the router construction itself threw. System font, inline styles,
 * `location.reload()` on click.
 *
 * Exported for the unit test in main.mobile.test.tsx.
 */
export function renderBootFallback(root: HTMLElement) {
  // #1957D2 = brand primary (OKLCH 0.5 0.2 262 → sRGB). Must be a literal
  // hex here: this path runs when Vite's chunk JS failed to load, so the
  // Tailwind token classes and the --primary CSS variable aren't guaranteed
  // to resolve. Keep it in sync with capacitor.config.ts + the HTML
  // first-paint skeleton.
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#111">
      <div style="max-width:320px;text-align:center">
        <h2 style="margin:0 0 8px;font-size:18px;font-weight:600">Something went wrong</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#666;line-height:1.4">The app failed to start. Reload to try again.</p>
        <button onclick="location.reload()" style="padding:10px 20px;font-size:14px;font-family:inherit;background:#1957D2;color:#fff;border:none;border-radius:6px;cursor:pointer">Reload</button>
      </div>
    </div>
  `;
}

// --- SVC-316: guarded boot -------------------------------------------------
//
// Everything from `getRouter()` through `createRoot(...).render(...)` runs
// synchronously; any throw here today produces a white screen because nothing
// commits into #root. Wrap the whole chain so a throw becomes (a) a Sentry
// event tagged `boot_stage=pre_render` and (b) a visible reload UI.
const rootElement = document.getElementById("root");
if (rootElement) {
  try {
    const router = getRouter();
    void initNative(router);
    void cleanupStalePwaState();
    ReactDOM.createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <BootHeartbeat />
          <RouterProvider router={router} />
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { boot_stage: "pre_render" } });
    renderBootFallback(rootElement);
  }
}
