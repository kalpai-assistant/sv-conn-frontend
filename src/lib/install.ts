/**
 * Home Screen install — detection and, where the platform allows it, the prompt
 * itself (SVC-255 item 3).
 *
 * ## Why this exists
 *
 * Apple permits Web Push only for a site installed to the Home Screen. In a
 * plain Safari tab there is no API to call and no permission to request — the
 * capability is simply absent. So the fix for "iOS providers never hear about
 * jobs" is not a code path we were failing to invoke; it is getting the
 * provider installed. Verified on a real iPhone on 2026-09-03: once installed,
 * a booking push arrives with the app backgrounded, exactly as on Android.
 *
 * ## The two platforms need opposite things
 *
 * Android fires `beforeinstallprompt` and hands us a real prompt we can show
 * from a tap — one button, done. iOS fires nothing and exposes nothing; the
 * user has to go through the Share menu themselves, so the most we can do is
 * show them how. That asymmetry is the whole reason this module has both a
 * `canPrompt` and a `needsManualSteps` notion rather than one "install" call.
 *
 * ## Installing signs the provider out (iOS)
 *
 * The standalone app gets its own storage container, so `localStorage` tokens
 * do not carry across from Safari — confirmed on device. Anything that offers
 * the install must say so first, or the provider taps "install", lands on an
 * OTP screen, and reasonably concludes the app is broken at the exact moment we
 * promised it would get better. `INSTALL_COSTS_SESSION` is exported so the copy
 * and the callers cannot drift apart on that point.
 */
import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { detectPlatform } from "./platform";

/**
 * Chrome's install prompt event. Not in TypeScript's DOM lib — it is a
 * Chromium extension to the standard, so the shape is declared here.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState =
  /** Native APK, or already installed to the Home Screen. Nothing to offer. */
  | "installed"
  /** Android: we hold a real prompt and can install in one tap. */
  | "can-prompt"
  /** iOS Safari: only the Share menu can do it, so we show the steps. */
  | "ios-manual"
  /** Chrome/Firefox on iOS: cannot install at all. Send them to Safari. */
  | "ios-wrong-browser"
  /** Desktop, unsupported engines, private tabs. Not worth asking. */
  | "unavailable";

/**
 * Whether installing costs the user their session. True only on iOS, where the
 * standalone app has separate storage from Safari.
 */
export function installCostsSession(state: InstallState): boolean {
  return state === "ios-manual";
}

/**
 * Fires before the browser shows its own install UI. Captured at module scope
 * rather than inside the hook because Chrome fires it *once*, early — often
 * before any component that cares has mounted. A hook-local listener would miss
 * it on a cold load and report "not installable" on a device that plainly is.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress Chrome's own mini-infobar so the install happens where we put
    // it, in context, rather than as an unexplained browser banner.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    subscribers.forEach((notify) => notify());
  });

  // Fired when the install completes by any route, including Chrome's menu.
  // Without this the UI would keep offering an install that already happened.
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    subscribers.forEach((notify) => notify());
  });
}

function readInstallState(): InstallState {
  // The APK is already "installed" in every sense that matters here.
  if (Capacitor.isNativePlatform()) return "installed";
  if (typeof window === "undefined") return "unavailable";

  const { platform, isSafari, isChromeIOS, isIosStandalone } = detectPlatform();

  if (platform === "ios") {
    if (isIosStandalone) return "installed";
    if (isChromeIOS) return "ios-wrong-browser";
    return isSafari ? "ios-manual" : "ios-wrong-browser";
  }

  // Android and desktop both report standalone the same way once installed.
  if (window.matchMedia?.("(display-mode: standalone)").matches) return "installed";
  if (deferredPrompt) return "can-prompt";

  // No prompt in hand. Either the browser does not support installing, or it
  // has not decided we are eligible yet. Either way there is nothing to offer,
  // and guessing "installable" would produce a button that does nothing.
  return "unavailable";
}

/**
 * Current install state, kept live as `beforeinstallprompt` arrives.
 *
 * `promptInstall` resolves to whether the user accepted. It is only meaningful
 * in `can-prompt`; elsewhere it resolves false, because there is nothing to
 * prompt with and pretending otherwise would hide the manual path the user
 * actually needs.
 */
export function useInstallState(): {
  state: InstallState;
  promptInstall: () => Promise<boolean>;
} {
  const [state, setState] = useState<InstallState>(() => readInstallState());

  useEffect(() => {
    const refresh = () => setState(readInstallState());
    subscribers.add(refresh);
    // The event may have landed between the initial read and this subscribe.
    refresh();
    return () => {
      subscribers.delete(refresh);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const prompt = deferredPrompt;
    if (!prompt) return false;
    // Chrome allows a captured prompt to be shown once. Clearing it up front
    // means a double-tap can't throw "already used" — and if the user dismisses
    // it, the browser will hand us a fresh one on a later visit.
    deferredPrompt = null;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    subscribers.forEach((notify) => notify());
    return outcome === "accepted";
  }, []);

  return { state, promptInstall };
}
