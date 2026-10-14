/**
 * Deep-link to the OS settings page for EazyServ (SVC-356).
 *
 * Reached from the denied-permission branch of the location flows (`MapPicker`
 * and `LocationGate`). The toast / banner there used to name "Settings" as the
 * remedy and then leave the user to find it themselves — a two-level dig under
 * iOS Settings > Privacy > Location Services, and worse on Android where
 * Settings > Apps > EazyServ is three to five taps depending on the OEM skin.
 *
 * ## Native only
 *
 * The web has no reliable way to open browser-permission settings from a page
 * (Chrome has `chrome://settings/content/location`, which the URL bar refuses
 * to navigate to from a script; Safari has nothing comparable). Callers gate
 * on `Capacitor.isNativePlatform()` and omit the button on the PWA — pretending
 * the button works there would strand the user on a tap that goes nowhere.
 *
 * ## The URLs
 *
 * - **iOS**: `app-settings:` is Apple's documented URL scheme that opens the
 *   current app's settings page (Settings > EazyServ, where Location sits
 *   under a toggle the user can flip in one tap). Verified in `@capacitor/app`
 *   docs and Apple's URL Scheme reference.
 *
 * - **Android**: `package:com.eazyserv.app` is the Android documented URI for
 *   `ACTION_APPLICATION_DETAILS_SETTINGS`. `@capacitor/app-launcher` dispatches
 *   it via `Intent.ACTION_VIEW` with `Uri.parse(url)` — on devices where the
 *   system resolves this to the app's details page, the user lands directly
 *   on the Permissions row. On devices where it does not, the OS raises a
 *   chooser or falls through, and the user is no worse off than the previous
 *   "find Settings yourself" copy.
 *
 * The package name mirrors `capacitor.config.ts > appId` deliberately — if
 * that ever changes, this file is the second place to update.
 *
 * ## Not a permission request
 *
 * `openUrl` navigates the OS to a URL; it does **not** re-prompt for
 * permission. Callers that want the dialog use `requestLocation` from
 * `lib/geolocation.ts` instead — and on Android, a denied permission is final
 * for the install's lifetime, which is exactly why this exit matters.
 */
import { Capacitor } from "@capacitor/core";

const ANDROID_SETTINGS_URL = "package:com.eazyserv.app";
const IOS_SETTINGS_URL = "app-settings:";

/**
 * True on a real iOS/Android device, where the native plugin is in play. On
 * the PWA this is false and callers hide the button entirely.
 */
export function canOpenAppSettings(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open the OS settings page for EazyServ.
 *
 * Dynamically imports `@capacitor/app-launcher` so the web bundle does not
 * include it on PWAs that will never reach this branch — the plugin lazy-loads
 * only when the native user actually taps "Open settings".
 *
 * Resolves on success and swallows failures: this is a best-effort exit from
 * a denied-permission state, and the error paths — a device that cannot
 * resolve the scheme, a plugin registration failure after an OS upgrade — are
 * the same kind of "worst case, the user does what they would have done
 * anyway" that the previous copy already covered.
 */
export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { AppLauncher } = await import("@capacitor/app-launcher");
  const url = Capacitor.getPlatform() === "ios" ? IOS_SETTINGS_URL : ANDROID_SETTINGS_URL;
  try {
    await AppLauncher.openUrl({ url });
  } catch {
    // Nothing to do here — the toast / banner the button sits beside already
    // names Settings as the remedy, so a failed deeplink leaves the user with
    // the fallback path that worked before this ticket.
  }
}
