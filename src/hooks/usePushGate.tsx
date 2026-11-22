/**
 * What to say when push can't be turned on from a tap: blocked in settings,
 * or unsupported (an iOS Safari tab that must be installed first, or a
 * browser that cannot do push at all). Lifted out of NotificationsRow
 * (SVC-67 / SVC-255) so SVC-484's Notify me says exactly the same thing, with
 * the same `notifications.*` messages and the same install sheet.
 *
 * Only that part. The caller still decides what to do when push IS possible
 * (NotificationsRow's On → Off confirm, Notify me's save), and owns its own
 * state after an install.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  enablePushNotifications,
  type PushPermission,
  type PushRegistrationResult,
} from "@/lib/fcm";
import { useInstallState } from "@/lib/install";
import { InstallSheet } from "@/components/InstallSheet";
import { useT } from "@/i18n/LanguageProvider";

interface PushGateOptions {
  /** InstallSheet's copy. Defaults to the provider wording, as before. */
  audience?: "provider" | "consumer";
  /**
   * After an install accepted from the sheet (Android installs in place),
   * push is enabled straight away and the result handed here. iOS never gets
   * here: the app relaunches from the Home Screen.
   */
  onEnabledAfterInstall: (result: PushRegistrationResult) => void;
}

interface PushGate {
  /**
   * For "denied" or "unsupported": says why (a toast, or the install sheet)
   * and returns true. For "granted" / "prompt" it does nothing and returns
   * false, and the caller goes on.
   */
  explainUnavailable: (permission: PushPermission) => boolean;
  /** Render this once, anywhere in the caller's tree. */
  installSheet: ReactNode;
}

export function usePushGate({ audience, onEnabledAfterInstall }: PushGateOptions): PushGate {
  const [showInstall, setShowInstall] = useState(false);
  const { state: installState, promptInstall } = useInstallState();
  const { t } = useT();
  const onEnabledRef = useRef(onEnabledAfterInstall);
  useEffect(() => {
    onEnabledRef.current = onEnabledAfterInstall;
  }, [onEnabledAfterInstall]);

  const explainUnavailable = useCallback(
    (permission: PushPermission): boolean => {
      // Once denied, the prompt is gone — only the OS/browser settings can undo
      // it. Re-calling requestPermission() here would resolve "denied" instantly
      // and look like a no-op button, so say what actually needs to happen.
      if (permission === "denied") {
        toast.error(t("notifications.blocked"), { description: t("notifications.blockedDetail") });
        return true;
      }
      // No API can trigger Add to Home Screen — Apple only offers it through the
      // Share menu — so the most this can do is say what to do. Silence was the
      // previous behaviour and is what SVC-255 was raised about.
      if (permission === "unsupported") {
        // A browser that genuinely cannot do this gets a straight answer; the
        // rest get the walkthrough, because for them there is something to do.
        if (installState === "unavailable" || installState === "installed") {
          toast.error(t("notifications.browserCant"), {
            description: t("notifications.browserCantDetail"),
          });
          return true;
        }
        setShowInstall(true);
        return true;
      }
      return false;
    },
    [installState, t],
  );

  const handleInstall = useCallback(async () => {
    const accepted = await promptInstall();
    if (accepted) {
      setShowInstall(false);
      // Android installs in place, so the permission prompt can follow straight
      // away.
      const result = await enablePushNotifications();
      onEnabledRef.current(result);
    }
  }, [promptInstall]);

  const installSheet = (
    <InstallSheet
      open={showInstall}
      onOpenChange={setShowInstall}
      state={installState}
      onInstall={handleInstall}
      audience={audience}
    />
  );

  return { explainUnavailable, installSheet };
}
