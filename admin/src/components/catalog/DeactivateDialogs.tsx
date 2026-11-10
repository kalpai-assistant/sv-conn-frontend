/**
 * Deactivate a category or a service (SVC-430): the soft delete. Nothing is ever
 * deleted, because historical bookings reference both, and Activate undoes it.
 * Audited as category.deactivate / service.deactivate.
 *
 * A category is refused while it still holds active services or sub-categories
 * (409 CATEGORY_NOT_EMPTY); the dialog then says how many.
 *
 * A service with bookings in flight needs an explicit confirm (ticket). Those
 * bookings carry on; only new ones are refused. The dialog shows the tree's count
 * up front and sends confirm: true only from the button under that warning. If
 * the count moved since the page loaded (the backend's 409 carries the new one),
 * the dialog shows the new count and asks again rather than sending anything.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError } from "@/components/catalog/Field";
import {
  activeBookingsCount,
  catalogErrorMessage,
  deactivateService,
  notEmptyCounts,
  notEmptyMessage,
  setCategoryActive,
  type CategoryDetail,
  type ServiceDetail,
} from "@/lib/catalog";

function useOnce() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}

export function DeactivateCategoryDialog({
  category,
  open,
  onClose,
  onDeactivated,
}: {
  category: CategoryDetail;
  open: boolean;
  onClose: () => void;
  onDeactivated: (row: CategoryDetail) => void;
}) {
  const { busy, run } = useOnce();
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  function close() {
    if (busy) return;
    setError(null);
    setBlocked(false);
    onClose();
  }

  const deactivate = () =>
    run(async () => {
      setError(null);
      try {
        onDeactivated(await setCategoryActive(category.id, false));
      } catch (err) {
        const counts = notEmptyCounts(err);
        setBlocked(counts !== null);
        setError(counts ? notEmptyMessage(counts) : catalogErrorMessage(err));
      }
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">
            Deactivate {category.name}?
          </DialogTitle>
          <DialogDescription>
            Customers stop seeing it. Past bookings keep it, and you can activate it again later.
          </DialogDescription>
        </DialogHeader>
        {error && <FormError message={error} />}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            {blocked ? "OK" : "Keep active"}
          </Button>
          {!blocked && (
            <Button type="button" variant="destructive" disabled={busy} onClick={deactivate}>
              {busy ? "Deactivating…" : "Deactivate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const bookingsText = (count: number) =>
  `${count} ${count === 1 ? "booking is" : "bookings are"} in progress; they'll carry on.`;

export function DeactivateServiceDialog({
  service,
  open,
  onClose,
  onDeactivated,
}: {
  service: ServiceDetail;
  open: boolean;
  onClose: () => void;
  onDeactivated: (row: ServiceDetail) => void;
}) {
  const { busy, run } = useOnce();
  const [error, setError] = useState<string | null>(null);
  // What the dialog last told the admin. A newer count from a 409 replaces it.
  const [shownBookings, setShownBookings] = useState(service.active_bookings);
  const [countMoved, setCountMoved] = useState(false);

  function close() {
    if (busy) return;
    setError(null);
    setCountMoved(false);
    setShownBookings(service.active_bookings);
    onClose();
  }

  // confirm: true only when the admin has just seen a count above 0.
  const deactivate = () =>
    run(async () => {
      setError(null);
      try {
        onDeactivated(await deactivateService(service.id, shownBookings > 0));
      } catch (err) {
        const moved = activeBookingsCount(err);
        if (moved !== null) {
          setShownBookings(moved);
          setCountMoved(true);
        } else {
          setError(catalogErrorMessage(err));
        }
      }
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">Deactivate {service.name}?</DialogTitle>
          <DialogDescription>
            Customers can no longer book it. Past bookings keep it, and you can activate it again
            later.
          </DialogDescription>
        </DialogHeader>
        {shownBookings > 0 && (
          <p
            role="alert"
            className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-foreground"
          >
            {countMoved && "The count changed since the page loaded. "}
            {bookingsText(shownBookings)} New bookings will be refused.
          </p>
        )}
        {error && <FormError message={error} />}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            Keep active
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={deactivate}>
            {busy ? "Deactivating…" : shownBookings > 0 ? "Deactivate anyway" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
