/**
 * JS wrapper for the SVC-226 in-app APK update plugin.
 *
 * The native side (Android Java, at
 * `android/app/src/main/java/com/eazyserv/apkupdater/ApkUpdaterPlugin.java`)
 * exposes four methods and three events. Everything in this file is a
 * thin bridge; the interesting logic (DownloadManager, FileProvider,
 * package installer) lives natively.
 *
 * Non-Android paths (web/PWA/iOS) can't install an Android APK — this
 * module falls back to opening the URL in the browser, which is what
 * the pre-plugin code did.
 */
import { Capacitor, type PluginListenerHandle, registerPlugin } from "@capacitor/core";

// ---------------------------------------------------------------------------

export interface ApkDownloadResult {
  downloadId: number;
}

export interface DownloadProgressEvent {
  bytes: number;
  total: number;
  /** 0-100, or -1 if the server hasn't announced Content-Length yet. */
  percent: number;
}

export interface DownloadCompleteEvent {
  /** Absolute path on the device — informational only; install() uses
   *  its own internal handle so the JS layer doesn't need this. */
  path: string;
}

export interface DownloadFailedEvent {
  /** Raw DownloadManager COLUMN_REASON int, useful for Sentry tagging. */
  reason: number;
  reasonText: string;
}

export interface CanInstallResult {
  canInstall: boolean;
  reason?: string;
}

interface ApkUpdaterPluginContract {
  download(options: { url: string; sha256?: string }): Promise<ApkDownloadResult>;
  install(): Promise<void>;
  canInstall(): Promise<CanInstallResult>;
  openInstallSettings(): Promise<void>;

  addListener(
    eventName: "downloadProgress",
    listener: (event: DownloadProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "downloadComplete",
    listener: (event: DownloadCompleteEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "downloadFailed",
    listener: (event: DownloadFailedEvent) => void,
  ): Promise<PluginListenerHandle>;
}

// Web fallback stub — throws on any method call so a bug that reaches
// this on the wrong platform crashes loudly instead of silently doing
// nothing. Web/iOS callers should check `isSupported()` first.
const webStub: ApkUpdaterPluginContract = {
  async download() {
    throw new Error("ApkUpdater is Android-only. Fall back to <a href=url>.");
  },
  async install() {
    throw new Error("ApkUpdater is Android-only.");
  },
  async canInstall() {
    return { canInstall: false, reason: "not-android" };
  },
  async openInstallSettings() {
    /* no-op on non-Android */
  },
  addListener() {
    return Promise.resolve({
      remove: async () => {
        /* no-op */
      },
    } as PluginListenerHandle);
  },
};

// `registerPlugin` returns the native impl on native platforms and the
// provided web fallback on web. Cast to our contract so consumers get
// full types.
const impl = registerPlugin<ApkUpdaterPluginContract>("ApkUpdater", {
  web: () => webStub,
});

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * True iff the current runtime can install an APK in-app. Only Android
 * (native Capacitor) qualifies today. Callers should check this before
 * calling `download()` — on other platforms, drop back to the browser
 * download link.
 */
export function isSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * Start downloading the APK. Progress + completion arrive via the event
 * listeners below. Returns after the download is enqueued, not after
 * it finishes — the JS caller subscribes to events for the rest of the
 * lifecycle.
 */
export async function download(url: string, sha256?: string): Promise<ApkDownloadResult> {
  return impl.download({ url, sha256 });
}

/**
 * Ask Android to open the package installer on the most recently
 * downloaded APK. Precondition: `download` completed AND
 * `canInstall()` returned `canInstall: true`. If the second is false,
 * route the user through `openInstallSettings()` first.
 */
export async function install(): Promise<void> {
  return impl.install();
}

/**
 * Check whether the "Install unknown apps" toggle is on for our app.
 * Runtime permission on API 26+; the plugin returns true unconditionally
 * on older Android.
 */
export async function canInstall(): Promise<CanInstallResult> {
  return impl.canInstall();
}

/**
 * Deep-link to the "Install unknown apps" Settings screen filtered to
 * our app. User grants the toggle + returns. UI should re-check
 * canInstall() when the app returns to foreground.
 */
export async function openInstallSettings(): Promise<void> {
  return impl.openInstallSettings();
}

/**
 * Subscribe to download progress. Returns a `remove()` handle — call
 * it on unmount to stop receiving events.
 */
export function onProgress(cb: (e: DownloadProgressEvent) => void): Promise<PluginListenerHandle> {
  return impl.addListener("downloadProgress", cb);
}

export function onComplete(cb: (e: DownloadCompleteEvent) => void): Promise<PluginListenerHandle> {
  return impl.addListener("downloadComplete", cb);
}

export function onFailed(cb: (e: DownloadFailedEvent) => void): Promise<PluginListenerHandle> {
  return impl.addListener("downloadFailed", cb);
}
