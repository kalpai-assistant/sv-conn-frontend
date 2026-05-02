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
import { getRouter } from "./router";
import "./styles.css";

// Capacitor native plugins (status bar, splash screen, etc.)
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

async function initNative() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#7C3AED" });
  } catch {
    // StatusBar API may not be available on all devices
  }

  try {
    await SplashScreen.hide();
  } catch {
    // ignore
  }

  // Handle Android hardware back button — navigate back or minimize
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.minimizeApp();
    }
  });
}

initNative();

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
