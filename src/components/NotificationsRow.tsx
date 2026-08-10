/**
 * Profile → Notifications row (SVC-67).
 *
 * Exists because permission can't always be requested automatically. Safari —
 * and therefore every iOS PWA, our only iOS target — only honours
 * `Notification.requestPermission()` from a user gesture, so without a button
 * somewhere an iPhone can never obtain a token. This is that button. On
 * Android it doubles as a retry after a declined prompt.
 *
 * It also gives push a visible state. AC4's concern is a provider who silently
 * receives no jobs and is the last to find out; a row that reads "Blocked" is
 * how they find out before a customer does.
 */
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enablePushNotifications, getPushPermission, type PushPermission } from "@/lib/fcm";

export function NotificationsRow() {
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Permission can be granted while registration still failed (bad VAPID key,
  // PATCH rejected). Tracked separately so the row can't claim "On" when no
  // token actually reached the backend — that reassurance is exactly what AC4
  // is trying to prevent.
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPushPermission().then((p) => {
      if (!cancelled) setPermission(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (isBusy) return;

    // Once denied, the prompt is gone — only the OS/browser settings can undo
    // it. Re-calling requestPermission() here would resolve "denied" instantly
    // and look like a no-op button, so say what actually needs to happen.
    if (permission === "denied") {
      toast.error("Notifications are blocked", {
        description: "Turn them back on for EazyServ in your browser or device settings.",
      });
      return;
    }
    if (permission === "unsupported") return;

    setIsBusy(true);
    try {
      const result = await enablePushNotifications();
      setPermission(result.status);
      setHasFailed(!!result.error);

      if (result.error) {
        // Registration got far enough to try and then broke — config gap, or a
        // failed PATCH. Already in Sentry; this is the human-facing half.
        toast.error("Couldn't turn on notifications", {
          description: "We've logged the problem. Please try again shortly.",
        });
      } else if (result.status === "granted") {
        toast.success("Notifications are on");
      } else if (result.status === "denied") {
        toast.error("Permission denied", {
          description: "You won't be alerted about booking updates.",
        });
      }
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, permission]);

  // Hide entirely where push can't work at all (older iOS Safari, in-app
  // browsers, or a missing Firebase config) rather than offering a dead row.
  if (permission === null || permission === "unsupported") return null;

  const isOn = permission === "granted" && !hasFailed;
  const isBad = permission === "denied" || hasFailed;
  const Icon = isBad ? BellOff : Bell;

  const status = hasFailed ? "Retry" : isOn ? "On" : permission === "denied" ? "Blocked" : "Enable";

  return (
    <button
      onClick={handleClick}
      disabled={isBusy}
      className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-secondary disabled:opacity-50"
    >
      <Icon className={`h-5 w-5 ${isBad ? "text-destructive" : "text-muted-foreground"}`} />
      <span className="flex-1 text-left text-sm font-medium text-foreground">Notifications</span>
      <span className="text-xs text-muted-foreground">{isBusy ? "" : status}</span>
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        !isOn && <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
