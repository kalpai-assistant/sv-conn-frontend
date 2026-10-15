/**
 * useAppVersionCheck — the "you're on an old version" hook (SVC-162).
 *
 * Polls `/downloads/latest.json` on cold start + every app foreground event.
 * Compares the installed version to the backend's advertised versions and
 * returns one of four states:
 *
 * - `ok`     — installed >= latest. No UI needed.
 * - `nudge`  — installed >= min_supported but < latest. Show a dismissible
 *              toast with the release notes + Download link.
 * - `block`  — installed < min_supported. Show a hard-block modal with
 *              Download link, no dismiss.
 * - `unknown` — initial state (before first fetch) OR fetch failed.
 *              Render nothing; NEVER block the app on a failed check.
 *
 * The compare is per-platform: Android reads `latest.android`, PWA reads
 * `latest.pwa`, and the native iOS app reads `latest.ios` (SVC-366). The
 * `platform` module's UA sniff can't tell the native iOS app from iOS
 * Safari — both say "iPhone" — so native iOS is detected via Capacitor.
 *
 * **Fetch failures are silent by design.** A dead backend, network blip,
 * or bad JSON must never surface to the user as a blocking error — the
 * check is best-effort. Sentry catches the error via `reportError`.
 */
import { useCallback, useEffect, useState } from "react";
import * as semver from "semver";

import { apiFetch } from "@/lib/api";
import { detectPlatform } from "@/lib/platform";
import { reportError } from "@/lib/sentry";
import { APP_VERSION } from "@/lib/version";

export type VersionState = "ok" | "nudge" | "block" | "unknown";

export interface VersionInfo {
  state: VersionState;
  latest?: string;
  minSupported?: string;
  url?: string;
  releaseNotes?: string;
  /** Set only on the native iOS app, which has no APK and no /download page. */
  platform?: "ios-native";
}

interface PlatformVersionResponse {
  version: string;
  min_supported_version: string;
  url: string | null;
  release_notes: string | null;
  released_at: string;
}

interface LatestVersionResponse {
  android: PlatformVersionResponse;
  pwa: PlatformVersionResponse;
  /** Optional so a backend from before SVC-366 still parses. */
  ios?: PlatformVersionResponse;
}

/**
 * Compare `installed` vs `latest` + `minSupported`. Pure function — no
 * side effects, easy to unit-test. Returns 'unknown' if any version
 * string isn't valid SemVer (defensive; we shouldn't ever ship invalid
 * strings but a bad admin edit shouldn't brick the app).
 */
export function compareVersions(
  installed: string,
  latest: string,
  minSupported: string,
): VersionState {
  const coerce = (v: string) => semver.coerce(v)?.version ?? null;
  const i = coerce(installed);
  const l = coerce(latest);
  const m = coerce(minSupported);
  if (!i || !l || !m) return "unknown";

  if (semver.lt(i, m)) return "block";
  if (semver.lt(i, l)) return "nudge";
  return "ok";
}

/**
 * Read the installed app version. On native (Capacitor), reads from the
 * platform (Android's versionName). On web/PWA, uses the JS constant.
 */
async function getInstalledVersion(): Promise<string> {
  if (typeof window === "undefined") return APP_VERSION;
  try {
    // Lazy-import so the web bundle doesn't drag in Capacitor native code.
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      return info.version;
    }
  } catch {
    // Fall through — PWA/web path.
  }
  return APP_VERSION;
}

/** True only inside the Capacitor iOS shell — never iOS Safari or the PWA. */
async function isNativeIos(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

export function useAppVersionCheck(): VersionInfo {
  const [info, setInfo] = useState<VersionInfo>({ state: "unknown" });

  const check = useCallback(async () => {
    try {
      const latest = await apiFetch<LatestVersionResponse>("/downloads/latest.json");
      const installed = await getInstalledVersion();

      // Native iOS reads its own row and nothing else. Without one (an
      // older backend), skip the check: the pwa row would nudge or block
      // an iPhone that has no way to update.
      if (await isNativeIos()) {
        const ios = latest.ios;
        if (!ios) {
          setInfo({ state: "ok" });
          return;
        }
        setInfo({
          state: compareVersions(installed, ios.version, ios.min_supported_version),
          latest: ios.version,
          minSupported: ios.min_supported_version,
          url: ios.url ?? undefined,
          releaseNotes: ios.release_notes ?? undefined,
          platform: "ios-native",
        });
        return;
      }

      const platform = detectPlatform().platform;

      // Desktop doesn't have an "installed version" concept — the user is
      // on the website, always fresh. Skip the check entirely.
      if (platform === "desktop") {
        setInfo({ state: "ok" });
        return;
      }

      const target = platform === "android" ? latest.android : latest.pwa;
      const state = compareVersions(installed, target.version, target.min_supported_version);

      setInfo({
        state,
        latest: target.version,
        minSupported: target.min_supported_version,
        url: target.url ?? undefined,
        releaseNotes: target.release_notes ?? undefined,
      });
    } catch (err) {
      // Silent — never block the app on a failed version check.
      reportError(err instanceof Error ? err : new Error(String(err)), {
        source: "version-check",
      });
      setInfo({ state: "unknown" });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Fire once on mount (cold start).
    check();

    // Fire again on foreground. Capacitor's App.addListener('appStateChange')
    // covers native. The DOM 'visibilitychange' event covers PWA/web.
    let cleanupNative: (() => void) | undefined;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform()) {
          const { App } = await import("@capacitor/app");
          const handle = await App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) check();
          });
          cleanupNative = () => {
            handle.remove();
          };
        }
      } catch {
        // Native import failed → web path. Fall through.
      }
    })();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cleanupNative?.();
    };
  }, [check]);

  return info;
}
