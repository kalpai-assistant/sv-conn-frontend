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
 */
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppVersionCheck } from "@/lib/useAppVersionCheck";

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

  return (
    <>
      {children}
      {showNudge && (
        <NudgeToast
          latest={info.latest ?? ""}
          releaseNotes={info.releaseNotes}
          url={info.url ?? "/download"}
          onDismiss={dismissNudge}
        />
      )}
      {showBlock && (
        <BlockOverlay
          latest={info.latest ?? ""}
          minSupported={info.minSupported ?? ""}
          url={info.url ?? "/download"}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function NudgeToast({
  latest,
  releaseNotes,
  url,
  onDismiss,
}: {
  latest: string;
  releaseNotes?: string;
  url: string;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg mx-4">
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">Update available (v{latest})</p>
        {releaseNotes && <p className="mt-1 text-xs text-muted-foreground">{releaseNotes}</p>}
        <div className="mt-3 flex gap-2">
          <a
            href={url}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Update
          </a>
          <button
            onClick={onDismiss}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Later
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
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
}: {
  latest: string;
  minSupported: string;
  url: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
      <div className="max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Update required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This version of Eazyserv is no longer supported. Please update to continue.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Minimum required: v{minSupported} · Latest: v{latest}
        </p>
        <a
          href={url}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Update now
        </a>
      </div>
    </div>
  );
}
