/**
 * The visible half of the SVC-162 version-check flow.
 *
 * Consumes `useAppVersionCheck` state and renders one of three things:
 *
 * - `ok` / `unknown` → nothing. The check never blocks the app.
 * - `nudge` → sticky bottom toast with release notes + Download + Later.
 *             The "Later" dismissal is remembered for 24h in localStorage
 *             so users aren't nagged every minute.
 * - `block` → full-screen modal overlay, no dismiss, single Download CTA.
 *             This is the emergency lever — only fires when the admin
 *             has bumped `min_supported_version` past what the user has
 *             installed. Design assumption: the user WILL download, or
 *             they simply can't use the app.
 *
 * Wraps whatever is passed as children — mount at the very top of the
 * component tree so the block state can cover everything below.
 *
 * SVC-226: on Android-native runtimes the Download CTA is replaced by
 * a stateful in-app download flow (progress → install) using the
 * ApkUpdater plugin. Non-Android (web/PWA/iOS) still uses the plain
 * `<a href>` fallback since neither Android's DownloadManager nor the
 * package installer exists off-Android.
 *
 * SVC-366: the native iOS app gets neither. Its url is an App Store link
 * opened outside the app, and with no url (no iOS pipeline yet) there is
 * no update button at all — never the APK flow, never "/download".
 *
 * SVC-395: the copy follows the screen's language, so an SP or Pro on their
 * own screens reads it in Hindi/Marathi (the "Update available" push before it
 * already was). Customer screens stay English. The release notes are typed
 * once, in English, at release time and are shown as they are.
 */
import { AlertCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  canInstall as apkCanInstall,
  download as apkDownload,
  install as apkInstall,
  isSupported as apkIsSupported,
  onComplete,
  onFailed,
  onProgress,
  openInstallSettings,
} from "@/lib/apkUpdater";
import { reportError } from "@/lib/sentry";
import { useAppVersionCheck } from "@/lib/useAppVersionCheck";
import type { Translate } from "@/i18n";
import { useT } from "@/i18n/LanguageProvider";
import type { AppLanguage } from "@/i18n/languages";

const NUDGE_DISMISS_KEY = "eazyserv:version-nudge-dismissed-until";

export function AppVersionGate({ children }: { children: React.ReactNode }) {
  const info = useAppVersionCheck();
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  // Re-check localStorage on every render so a dismissal fired an hour ago
  // shows the nudge again if we come back after the 24h expires.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const until = window.localStorage.getItem(NUDGE_DISMISS_KEY);
    setNudgeDismissed(Boolean(until && Number(until) > Date.now()));
  }, [info]);

  const dismissNudge = () => {
    if (typeof window === "undefined") return;
    const until = Date.now() + 24 * 60 * 60 * 1000;
    window.localStorage.setItem(NUDGE_DISMISS_KEY, String(until));
    setNudgeDismissed(true);
  };

  const showNudge = info.state === "nudge" && !nudgeDismissed;
  const showBlock = info.state === "block";
  const nativeIos = info.platform === "ios-native";
  // "/download" serves an APK — fine for Android and the PWA, never iOS.
  const url = nativeIos ? info.url : (info.url ?? "/download");

  return (
    <>
      {children}
      {showNudge && (
        <NudgeToast
          latest={info.latest ?? ""}
          releaseNotes={info.releaseNotes}
          url={url}
          nativeIos={nativeIos}
          onDismiss={dismissNudge}
        />
      )}
      {showBlock && (
        <BlockOverlay
          latest={info.latest ?? ""}
          minSupported={info.minSupported ?? ""}
          url={url}
          nativeIos={nativeIos}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SVC-226: the shared in-app download state machine used by both the
// nudge and the block UIs. Hook so both can render their own container
// styling around the same behaviour.
// ---------------------------------------------------------------------------

type UpdaterState =
  | { kind: "idle" }
  | { kind: "downloading"; percent: number; bytes: number; total: number }
  | { kind: "ready-to-install" }
  | { kind: "needs-install-permission" }
  | { kind: "error"; message: string };

interface UseInAppUpdaterOpts {
  url: string;
  t: Translate;
  lang: AppLanguage;
}

function useInAppUpdater({ url, t, lang }: UseInAppUpdaterOpts) {
  const [state, setState] = useState<UpdaterState>({ kind: "idle" });
  // English shows the raw failure, as it always has. Hindi/Marathi get a
  // translated line instead of a native or browser message in English.
  const shown = useCallback(
    (message: string) => (lang === "en" ? message : t("update.failed")),
    [lang, t],
  );
  // Track handles for cleanup + so a re-render doesn't create duplicate
  // subscribers.
  const handlesRef = useRef<{ remove: () => Promise<void> | void }[]>([]);

  const cleanup = useCallback(async () => {
    for (const h of handlesRef.current) {
      try {
        await h.remove();
      } catch {
        /* remove is best-effort */
      }
    }
    handlesRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  const startDownload = useCallback(async () => {
    // Non-Android → let the anchor tag handle it (parent falls back).
    if (!apkIsSupported()) return;

    try {
      // Permission gate: on Android 8+, we can't install without the
      // "unknown sources" toggle for our app. If it's off, route the
      // user to Settings first — download would succeed but install
      // would silently fail.
      const permit = await apkCanInstall();
      if (!permit.canInstall) {
        setState({ kind: "needs-install-permission" });
        return;
      }

      setState({ kind: "downloading", percent: 0, bytes: 0, total: 0 });

      // Subscribe BEFORE the download call so early progress events
      // aren't missed.
      const progressHandle = await onProgress((evt) => {
        setState({
          kind: "downloading",
          percent: evt.percent,
          bytes: evt.bytes,
          total: evt.total,
        });
      });
      const completeHandle = await onComplete(() => {
        setState({ kind: "ready-to-install" });
      });
      const failedHandle = await onFailed((evt) => {
        setState({
          kind: "error",
          message: t("update.downloadFailed", { reason: evt.reasonText }),
        });
      });
      handlesRef.current = [progressHandle, completeHandle, failedHandle];

      await apkDownload(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reportError(err instanceof Error ? err : new Error(message), {
        source: "apk-updater.download",
      });
      setState({ kind: "error", message: shown(message) });
    }
  }, [url, t, shown]);

  const triggerInstall = useCallback(async () => {
    try {
      await apkInstall();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reportError(err instanceof Error ? err : new Error(message), {
        source: "apk-updater.install",
      });
      setState({ kind: "error", message: shown(message) });
    }
  }, [shown]);

  const openPermissionSettings = useCallback(async () => {
    try {
      await openInstallSettings();
      // Reset to idle so the user can retry after granting.
      setState({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message: shown(message) });
    }
  }, [shown]);

  return {
    state,
    isNativeAndroid: apkIsSupported(),
    startDownload,
    triggerInstall,
    openPermissionSettings,
  };
}

// ---------------------------------------------------------------------------
// Shared UI: the button (or button-cluster) that swaps in for the raw
// <a href>. Renders based on the updater state.
// ---------------------------------------------------------------------------

function UpdateCta({
  url,
  variant,
}: {
  url: string;
  /** "nudge" = small buttons in a toast; "block" = full-width primary CTA. */
  variant: "nudge" | "block";
}) {
  const { t, lang } = useT();
  const { state, isNativeAndroid, startDownload, triggerInstall, openPermissionSettings } =
    useInAppUpdater({ url, t, lang });

  // Off Android: keep the original anchor-tag behaviour. It opens the
  // system browser, Chrome downloads, notification-shade install.
  if (!isNativeAndroid) {
    return variant === "nudge" ? (
      <a
        href={url}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t("update.update")}
      </a>
    ) : (
      <a
        href={url}
        className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {t("update.updateNow")}
      </a>
    );
  }

  const primaryClass =
    variant === "nudge"
      ? "rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
      : "mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70";

  if (state.kind === "idle") {
    return (
      <button onClick={startDownload} className={primaryClass}>
        {t("update.update")}
      </button>
    );
  }

  if (state.kind === "downloading") {
    const known = state.percent >= 0;
    return (
      <div className="w-full">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {known
              ? t("update.downloadingPercent", { percent: Math.round(state.percent) })
              : t("update.downloadingUnknown")}
          </span>
          {state.total > 0 && (
            <span>
              {formatBytes(state.bytes)} / {formatBytes(state.total)}
            </span>
          )}
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: known ? `${Math.max(2, state.percent)}%` : "40%" }}
          />
        </div>
      </div>
    );
  }

  if (state.kind === "ready-to-install") {
    return (
      <button onClick={triggerInstall} className={primaryClass}>
        {t("update.install")}
      </button>
    );
  }

  if (state.kind === "needs-install-permission") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{t("update.allowInstall")}</p>
        <button onClick={openPermissionSettings} className={primaryClass}>
          {t("update.openSettings")}
        </button>
      </div>
    );
  }

  // Error
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>{state.message}</span>
      </div>
      <button onClick={startDownload} className={primaryClass}>
        {t("update.tryAgain")}
      </button>
    </div>
  );
}

/**
 * The update action for either container. Native iOS never mounts
 * `UpdateCta`, so the APK updater is unreachable there; with no url it
 * renders nothing rather than a button that leads nowhere.
 */
function UpdateAction({
  url,
  nativeIos,
  variant,
}: {
  url?: string;
  nativeIos: boolean;
  variant: "nudge" | "block";
}) {
  const { t } = useT();
  if (!url) return null;
  if (!nativeIos) return <UpdateCta url={url} variant={variant} />;
  return (
    // Leaves the app, so it opens in a new context rather than replacing it.
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        variant === "nudge"
          ? "rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          : "mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      }
    >
      {variant === "nudge" ? t("update.update") : t("update.updateNow")}
    </a>
  );
}

// ---------------------------------------------------------------------------

function NudgeToast({
  latest,
  releaseNotes,
  url,
  nativeIos,
  onDismiss,
}: {
  latest: string;
  releaseNotes?: string;
  url?: string;
  nativeIos: boolean;
  onDismiss: () => void;
}) {
  const { t } = useT();
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg mx-4">
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">
          {t("update.available", { version: latest })}
        </p>
        {releaseNotes && <p className="mt-1 text-xs text-muted-foreground">{releaseNotes}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <UpdateAction url={url} nativeIos={nativeIos} variant="nudge" />
          <button
            onClick={onDismiss}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            {t("update.later")}
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        aria-label={t("update.dismiss")}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function BlockOverlay({
  latest,
  minSupported,
  url,
  nativeIos,
}: {
  latest: string;
  minSupported: string;
  url?: string;
  nativeIos: boolean;
}) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
      <div className="max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">{t("update.requiredTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("update.requiredBody")}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("update.requiredVersions", { min: minSupported, latest })}
        </p>
        <UpdateAction url={url} nativeIos={nativeIos} variant="block" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
