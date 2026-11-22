/**
 * Profile → Service alerts (SVC-484, Jira 14950 #5, 14952 #13): the customer's
 * open "Notify me" alerts, opened from the row under Notifications on Profile.
 *
 * Each row: the service, what its tile said when they asked (the tile's own
 * wording), and when the alert lapses (45 days, silently). Swipe a row left
 * to remove it, or use its remove button (mouse, desktop PWA). No confirm and
 * no undo: the GET carries no point, so a removed alert can't be put back as
 * it was. Re-adding is one tap on the tile.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ArrowLeft, BellOff, Trash2 } from "lucide-react";
import {
  useCancelServiceAlert,
  useServiceAlerts,
  type API_ServiceAlert,
} from "@/hooks/useServiceAlerts";
import { alertExpiryText, alertKindText, isSwipeRemove } from "@/lib/service-alerts";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/service-alerts")({
  component: ServiceAlertsScreen,
});

export function ServiceAlertsScreen() {
  const { isAuthenticated } = useAuth();
  const { data: alerts, isLoading, isError, refetch } = useServiceAlerts(isAuthenticated);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <Link to="/profile" aria-label="Back to profile" className="rounded-lg p-1">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-semibold text-foreground">Service alerts</h1>
      </header>

      <div className="p-4">
        <p className="mb-4 text-xs text-muted-foreground">
          We&rsquo;ll send one notification when a service you asked about is available near you.
          Swipe left to remove an alert.
        </p>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading service alerts">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-sm text-foreground">Couldn&rsquo;t load your alerts.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 text-sm font-semibold text-primary"
            >
              Try again
            </button>
          </div>
        ) : !alerts || alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
            <BellOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No service alerts</p>
            <p className="text-xs text-muted-foreground">
              Tap &ldquo;Notify me&rdquo; on a service that says &ldquo;Coming soon&rdquo; or
              &ldquo;No pros online right now&rdquo;.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Service alerts">
            <AnimatePresence initial={false}>
              {alerts.map((alert) => (
                <AlertRow key={alert.service_id} alert={alert} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: API_ServiceAlert }) {
  const cancel = useCancelServiceAlert();
  // Held off-screen while the DELETE runs, so a swiped row doesn't spring
  // back first. On success the list drops it and AnimatePresence collapses
  // it; on failure it slides back (and the hook toasts).
  const [removing, setRemoving] = useState(false);

  const remove = () => {
    if (removing) return;
    setRemoving(true);
    cancel.mutate(alert.service_id, { onError: () => setRemoving(false) });
  };

  // The red layer exists only while a swipe is under way: left behind the
  // row at rest, it showed through the anti-aliased rounded corners (device).
  const [dragging, setDragging] = useState(false);

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    setDragging(false);
    if (isSwipeRemove(info)) remove();
  };

  return (
    <motion.li
      layout
      initial={false}
      exit={{ height: 0, opacity: 0, marginTop: 0 }}
      transition={{ duration: 0.2 }}
      className="relative overflow-hidden rounded-xl"
      data-alert-row={alert.service_id}
    >
      {/* What a swipe reveals. */}
      {(dragging || removing) && (
        <div
          aria-hidden="true"
          data-swipe-reveal
          className="absolute inset-0 flex items-center justify-end bg-destructive pr-5 text-destructive-foreground"
        >
          <Trash2 className="h-5 w-5" />
        </div>
      )}
      <motion.div
        drag={removing ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0 }}
        onDragStart={() => setDragging(true)}
        onDragEnd={onDragEnd}
        animate={{ x: removing ? "-100%" : 0 }}
        transition={{ type: "tween", duration: 0.2 }}
        // A vertical scroll of the list never starts a swipe.
        style={{ touchAction: "pan-y" }}
        className="relative flex items-center gap-3 border border-border bg-card p-3"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{alert.service_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {alertKindText(alert.kind)} · {alertExpiryText(alert.expires_at)}
          </p>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          aria-label={`Remove alert for ${alert.service_name}`}
          className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </motion.div>
    </motion.li>
  );
}
