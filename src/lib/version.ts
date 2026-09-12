/**
 * App version — single source of truth for the JS bundle (SVC-162).
 *
 * Bumped on each beta release. Comparisons against
 * `/downloads/latest.json` use this value as the "installed" side for
 * PWA. Native Android reads the real installed version via
 * `App.getInfo().version` (Capacitor); this constant is only the
 * fallback + the PWA baseline.
 *
 * Keep in sync with:
 *   - `android/app/build.gradle` versionName (set in SVC-160)
 *   - Backend `app_versions` row for `pwa` platform
 *
 * When we ship a new build, bump this + `versionName` + the DB row.
 */
export const APP_VERSION = "1.0.8-beta";
