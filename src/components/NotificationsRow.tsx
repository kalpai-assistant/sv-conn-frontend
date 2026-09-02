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
 *
 * SVC-255: the row used to return null when push was `unsupported`, on the
 * reasoning that a dead control is worse than none. That is right for a
 * consumer and exactly wrong for a provider — `unsupported` is what iOS Safari
 * reports until the site is installed to the Home Screen, so the one persona
 * whose income depends on push got silence and no explanation. It now renders,
 * and says which of the two situations it is: a remedy the provider can act on,
 * or a browser that genuinely cannot.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enablePushNotifications, getPushPermission, type PushPermission } from "@/lib/fcm";
import { detectPlatform } from "@/lib/platform";

export function NotificationsRow() {
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Permission can be granted while registration still failed (bad VAPID key,
  // PATCH rejected). Tracked separately so the row can't claim "On" when no
  // token actually reached the backend — that reassurance is exactly what AC4
  // is trying to prevent.
  const [hasFailed, setHasFailed] = useState(false);

  // Why push is unavailable, when it is. `unsupported` is one value from
  // `getPushPermission()` but it covers two very different situations, and only
  // one of them the provider can do anything about:
  //
  //   ios-add-to-home  iOS Safari, not yet installed. Apple refuses a push
  //                    subscription until the site is on the Home Screen, so
  //                    there is a real remedy and we should name it.
  //   hopeless         an in-app browser, a private tab, an old engine. No
  //                    amount of tapping fixes it; say so and stop.
  //
  // Chrome on iOS is deliberately in the second bucket: it cannot Add to Home
  // Screen at all, so sending someone there would be a dead end. The remedy is
  // to open Safari first.
  const unsupportedReason = useMemo<"ios-add-to-home" | "ios-wrong-browser" | "hopeless">(() => {
    const { platform, isSafari, isIosStandalone, isChromeIOS } = detectPlatform();
    if (platform !== "ios") return "hopeless";
    if (isChromeIOS) return "ios-wrong-browser";
    if (isSafari && !isIosStandalone) return "ios-add-to-home";
    return "hopeless";
  }, []);

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
    // No API can trigger Add to Home Screen — Apple only offers it through the
    // Share menu — so the most this button can do is say what to do. Silence
    // was the previous behaviour and is what SVC-255 was raised about.
    if (permission === "unsupported") {
      if (unsupportedReason === "ios-add-to-home") {
        toast("Add EazyServ to your Home Screen", {
          description:
            "Tap Share in Safari, then “Add to Home Screen”. Open it from there and you can turn job alerts on.",
        });
      } else if (unsupportedReason === "ios-wrong-browser") {
        toast("Open EazyServ in Safari", {
          description:
            "Chrome on iPhone can’t add apps to the Home Screen. Open this page in Safari first, then Share → “Add to Home Screen”.",
        });
      } else {
        toast.error("This browser can’t receive job alerts", {
          description:
            "Private windows and in-app browsers block notifications. Use the EazyServ app, or open the site in your normal browser.",
        });
      }
      return;
    }

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
  }, [isBusy, permission, unsupportedReason]);

  // Still reading the permission — render nothing rather than flashing a
  // wrong state for a frame.
  if (permission === null) return null;

  const isOn = permission === "granted" && !hasFailed;
  const isUnsupported = permission === "unsupported";
  const isBad = permission === "denied" || hasFailed || isUnsupported;
  const Icon = isBad ? BellOff : Bell;

  const status = isUnsupported
    ? // iOS Safari can subscribe to push only once the site is installed to the
      // Home Screen, so for that case the status names the remedy rather than
      // the problem. Everywhere else "Unavailable" is the honest word: an
      // in-app browser or a private tab cannot be talked into it.
      unsupportedReason === "ios-add-to-home"
      ? "Add to Home Screen"
      : "Unavailable"
    : hasFailed
      ? "Retry"
      : isOn
        ? "On"
        : permission === "denied"
          ? "Blocked"
          : "Enable";

  // Colour the word, not just the icon — the status is what gets read. Green
  // matches the readiness ticks on Provider Home so the row belongs to that
  // vocabulary. "Enable" stays neutral: nothing has gone wrong, the provider
  // simply hasn't chosen yet, and colouring it would cry wolf.
  const statusColor = isOn
    ? "text-emerald-600"
    : isBad
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <button
      onClick={handleClick}
      disabled={isBusy}
      className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-secondary disabled:opacity-50"
    >
      <Icon className={`h-5 w-5 ${isBad ? "text-destructive" : "text-muted-foreground"}`} />
      <span className="flex-1 text-left text-sm font-medium text-foreground">Notifications</span>
      <span className={`text-xs font-medium ${statusColor}`}>{isBusy ? "" : status}</span>
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        !isOn && <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
