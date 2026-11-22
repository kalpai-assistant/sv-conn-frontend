/**
 * SVC-484 "Notify me" on a service tile (Jira 14950, 14952 #11–#14).
 *
 * Shown only where the tile says "No pros online right now" or "Coming soon",
 * and only to a signed-in customer (from-prices needs login anyway). A priced
 * tile, or one with no data (the catalogue fallback), shows nothing. Reads
 * the tile's own state through useTileState, so it can't appear on a tile
 * that shows a price.
 *
 * "Notify me" saves an alert at the point the tile priced from; with an open
 * alert for the service it reads "Notify me enabled — tap to cancel" (Vipul's
 * words) and a tap cancels it. State comes from the shared ["service-alerts"]
 * list.
 *
 * Its own tap target inside a card that opens the service sheet: click and
 * key presses stop here, so a tap neither opens the sheet nor sends SVC-419's
 * tile_coming_soon_tapped (14952 #14).
 *
 * An alert arrives only as a push, so it is never saved where push can't
 * work. "prompt" asks, from this same tap (iOS honours the request only from
 * a user gesture, so the permission is read ahead of the tap, not inside it);
 * "denied" / "unsupported" say why, with the Profile row's own messages and
 * install sheet (usePushGate).
 *
 * Known gap: a customer who turned notifications Off on Profile (SVC-277)
 * still reads "granted" (only the token was cleared), so the alert is saved
 * and waits on the backend until a token returns. The app can't see that
 * state today.
 */
import { useCallback, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TilePoint } from "@/hooks/useTilePoint";
import { useTileState } from "@/hooks/useTileState";
import {
  useCancelServiceAlert,
  useSaveServiceAlert,
  useServiceAlerts,
} from "@/hooks/useServiceAlerts";
import { usePushGate } from "@/hooks/usePushGate";
import { enablePushNotifications, getPushPermission, type PushRegistrationResult } from "@/lib/fcm";
import { useT } from "@/i18n/LanguageProvider";
import { useOptionalAuth } from "@/lib/auth-context";
import { NOTIFY_ME_ENABLED_TEXT, NOTIFY_ME_TEXT } from "@/lib/tile-price-state";
import type { Service } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface NotifyMeButtonProps {
  service: Pick<Service, "id" | "price">;
  /** Layout per place (margin, alignment). */
  className?: string;
}

export function NotifyMeButton({ service, className }: NotifyMeButtonProps) {
  const { point, state } = useTileState(service);
  if (state.kind === "price" || !point) return null;
  return <NotifyMe serviceId={service.id} point={point} className={className} />;
}

interface NotifyMeProps {
  serviceId: string;
  point: TilePoint;
  className?: string;
}

/** Signed-in customers only; outside an AuthProvider (tests), nothing. */
function NotifyMe(props: NotifyMeProps) {
  const auth = useOptionalAuth();
  return auth?.isAuthenticated ? <NotifyMeControl {...props} /> : null;
}

/** One read shared by every tile on screen; refreshed after an enable. */
const PUSH_PERMISSION_QUERY_KEY = ["push-permission"] as const;

function NotifyMeControl({ serviceId, point, className }: NotifyMeProps) {
  const queryClient = useQueryClient();
  const { t } = useT();
  const { data: alerts } = useServiceAlerts(true);
  const enabled = alerts?.some((a) => a.service_id === serviceId) ?? false;
  const save = useSaveServiceAlert();
  const cancel = useCancelServiceAlert();
  const [enabling, setEnabling] = useState(false);

  const { data: permission } = useQuery({
    queryKey: PUSH_PERMISSION_QUERY_KEY,
    queryFn: getPushPermission,
    staleTime: 30 * 1000,
  });

  const saveAlert = useCallback(() => {
    save.mutate({ serviceId, point });
  }, [save, serviceId, point]);

  /** After a permission request: save only when push really is on. */
  const settleEnable = useCallback(
    (result: PushRegistrationResult) => {
      queryClient.setQueryData(PUSH_PERMISSION_QUERY_KEY, result.status);
      if (result.error) {
        toast.error(t("notifications.enableFailed"), {
          description: t("notifications.enableFailedDetail"),
        });
      } else if (result.status === "granted") {
        saveAlert();
      } else {
        // Declined, or the prompt was dismissed: nothing saved, and said so.
        toast.error(t("notifications.denied"), { description: t("notifications.deniedDetail") });
      }
    },
    [queryClient, saveAlert, t],
  );

  const { explainUnavailable, installSheet } = usePushGate({
    audience: "consumer",
    onEnabledAfterInstall: settleEnable,
  });

  const busy = save.isPending || cancel.isPending || enabling;

  const handleTap = async (event: MouseEvent) => {
    event.stopPropagation();
    if (busy) return;
    if (enabled) {
      cancel.mutate(serviceId);
      return;
    }
    // Normally already read; awaited only on a tap in the first moments.
    const current = permission ?? (await getPushPermission());
    if (explainUnavailable(current)) return;
    if (current === "granted") {
      saveAlert();
      return;
    }
    // "prompt": enablePushNotifications is called with no await before it on
    // the usual path, so the request stays inside the user gesture.
    setEnabling(true);
    try {
      settleEnable(await enablePushNotifications());
    } finally {
      setEnabling(false);
    }
  };

  // Nothing in here reaches the card: not its click (open the sheet + the
  // SVC-419 event), not its Enter / Space handler. The install sheet is
  // portalled, but React events still bubble through the portal to the card,
  // so the wrapper stops them too.
  const stop = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();

  const Icon = busy ? Loader2 : enabled ? BellRing : Bell;
  return (
    <span className="contents" onClick={stop} onKeyDown={stop}>
      <button
        type="button"
        onClick={(e) => void handleTap(e)}
        disabled={busy}
        aria-pressed={enabled}
        data-notify-me={enabled ? "enabled" : "off"}
        className={cn(
          "inline-flex min-h-6 max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-left text-[11px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          enabled
            ? "bg-primary text-primary-foreground"
            : "bg-primary/10 text-primary hover:bg-primary/15",
          className,
        )}
      >
        <Icon aria-hidden="true" className={cn("size-3 shrink-0", busy && "animate-spin")} />
        <span>{enabled ? NOTIFY_ME_ENABLED_TEXT : NOTIFY_ME_TEXT}</span>
      </button>
      {installSheet}
    </span>
  );
}
