/**
 * App version — single source of truth for the JS bundle (SVC-162, SVC-372).
 *
 * These two constants are **independent on purpose**:
 *
 * - `APP_VERSION` is the JS bundle label, shown everywhere by default: the
 *   PWA, iOS Safari, native Android. Bumped on each Android/PWA release in
 *   lockstep with `android/app/build.gradle` versionName + the backend
 *   `app_versions` row for `pwa` / `android`.
 * - `IOS_APP_VERSION` is the label shown inside the native iOS app only.
 *   It tracks `MARKETING_VERSION` in `ios/App/App.xcodeproj/project.pbxproj`
 *   (which Apple refuses to accept with a `-beta` suffix, so the suffix
 *   lives on the JS side). Bumped on each native-iOS release — not when
 *   Android or the PWA ship.
 *
 * Native Android reads the real installed version via `App.getInfo().version`
 * (Capacitor); `APP_VERSION` is only the PWA baseline + fallback for the
 * update check. Native iOS likewise reads `MARKETING_VERSION` through
 * `App.getInfo()` for the update check — `IOS_APP_VERSION` is purely the
 * displayed label and need not match beyond a numeric prefix.
 *
 * See `displayVersion()` below for the pick-at-runtime rule.
 *
 * Keep in sync with:
 *   - `android/app/build.gradle` versionName (set in SVC-160)
 *   - Backend `app_versions` row for `pwa` platform
 *   - `ios/App/App.xcodeproj/project.pbxproj` MARKETING_VERSION (iOS releases)
 *   - Backend `app_versions.ios` row (iOS releases, SVC-366)
 */
import { Capacitor } from "@capacitor/core";

export const APP_VERSION = "2.0.0-beta";

/**
 * Label shown in the native iOS app only. Must have the same numeric prefix
 * as `MARKETING_VERSION` in `project.pbxproj`; the `-beta` suffix lives here
 * because App Store Connect rejects a non-numeric `MARKETING_VERSION`.
 */
export const IOS_APP_VERSION = "1.0.0-beta";

/**
 * Pick the version label to show in the UI. Returns `IOS_APP_VERSION` only
 * inside the Capacitor iOS shell; everywhere else (PWA, iOS Safari, native
 * Android, SSR, test runners) returns `APP_VERSION`.
 *
 * The platform check mirrors `useAppVersionCheck`'s `isNativeIos()` —
 * `Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios"` —
 * so the two agree on what "native iOS" means. On the PWA / iOS Safari
 * `@capacitor/core` is still loaded (it ships with the web bundle too),
 * but `isNativePlatform()` returns `false`, so this cleanly falls through
 * to `APP_VERSION`.
 *
 * **SSR safety.** On the Cloudflare SSR worker there is no `window`;
 * Capacitor's `isNativePlatform()` returns `false` server-side, so the
 * server renders `APP_VERSION`. The client PWA bundle resolves to the
 * same branch — no hydration mismatch. The native iOS build uses
 * `main.mobile.tsx` with a plain React DOM render (no SSR), so hydration
 * never runs on native iOS at all.
 */
export function displayVersion(): string {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
    return IOS_APP_VERSION;
  }
  return APP_VERSION;
}
