/**
 * Client-side platform + browser detection.
 *
 * User-agent sniffing is unreliable in general but for the /download page
 * we only need to show the right install path — a false negative just
 * shows QR-code fallback, not a broken flow.
 *
 * Values are derived once on module load — /download reads them for
 * initial render, no re-detection needed on route change.
 */

export type Platform = "android" | "ios" | "desktop";

interface PlatformInfo {
  platform: Platform;
  isSafari: boolean;
  isChromeIOS: boolean;
  isIosStandalone: boolean; // true when already added to home screen on iOS
}

export function detectPlatform(): PlatformInfo {
  if (typeof window === "undefined") {
    // SSR — default to desktop; runtime hydration corrects on the client.
    return { platform: "desktop", isSafari: false, isChromeIOS: false, isIosStandalone: false };
  }

  const ua = window.navigator.userAgent;

  // iOS detection is fussy since iPadOS 13 pretends to be Mac. Check
  // for touch + Mac substring to catch iPads too.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);

  const isAndroid = /Android/.test(ua);

  // iOS: distinguish real Safari from Chrome-on-iOS (which is a Safari
  // WebView but reports Chrome in UA). Only Safari can Add-to-Home-Screen.
  const isChromeIOS = isIOS && /CriOS/.test(ua);
  const isSafari = isIOS && !isChromeIOS && /Safari/.test(ua) && !/(Firefox|FxiOS|EdgiOS)/.test(ua);

  // iOS standalone mode = user has already added to home screen. In that
  // case they don't need the install walkthrough — show a "you're already
  // installed" state.
  const isIosStandalone =
    isIOS &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      // Legacy iOS uses window.navigator.standalone, not standard
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);

  let platform: Platform = "desktop";
  if (isAndroid) platform = "android";
  else if (isIOS) platform = "ios";

  return { platform, isSafari, isChromeIOS, isIosStandalone };
}
