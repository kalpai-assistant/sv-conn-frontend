/**
 * SPA entry point for the Capacitor mobile build.
 *
 * Uses a plain React DOM render (no TanStack Start SSR).
 * TanStack Router still handles client-side routing exactly
 * as it does in the web app.
 */
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { toast } from "sonner";
import { getRouter } from "./router";
import { initSentry } from "./lib/sentry";
import { runBackInterceptors } from "./lib/back-interceptor";
import { isProviderRoute } from "./lib/nav-visibility";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Init before anything else renders — even the RouterProvider's first render
// should be inside Sentry's error capture window.
initSentry();

// Capacitor native plugins (status bar, splash screen, etc.)
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Window for the double-tap-to-exit gesture. Android's convention is 2s, but
 * that measures from the press, not from when the toast finishes animating in
 * — by the time a user sees it and reacts, much of it is gone. 3s is what the
 * apps this is modelled on actually use.
 */
const EXIT_PROMPT_WINDOW_MS = 3000;

async function initNative(router: ReturnType<typeof getRouter>) {
  if (!Capacitor.isNativePlatform()) return;

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
    const home = isProviderRoute(router.state.location.pathname) ? "/provider" : "/";
    if (router.state.location.pathname !== home) {
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

const router = getRouter();

initNative(router);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
