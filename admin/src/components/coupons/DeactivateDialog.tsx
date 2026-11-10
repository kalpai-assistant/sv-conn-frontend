/**
 * Deactivate a coupon (SVC-429): the soft delete. Historical bookings keep their
 * discount, and Activate undoes it. Audited as coupon.deactivate.
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
import { couponErrorMessage, setCouponActive, type CouponRow } from "@/lib/coupons";

export function DeactivateDialog({
  code,
  open,
  onClose,
  onDeactivated,
}: {
  code: string;
  open: boolean;
  onClose: () => void;
  onDeactivated: (row: CouponRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function close() {
    if (busy) return;
    setError(null);
    onClose();
  }

  async function deactivate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      onDeactivated(await setCouponActive(code, false));
    } catch (err) {
      setError(couponErrorMessage(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">Deactivate {code}?</DialogTitle>
          <DialogDescription>
            Customers can no longer apply it. Bookings that already used it keep their discount, and
            you can activate it again later.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive [overflow-wrap:anywhere]"
          >
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            Keep active
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={deactivate}>
            {busy ? "Deactivating…" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
