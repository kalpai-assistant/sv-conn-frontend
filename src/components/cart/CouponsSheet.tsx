/**
 * Coupons picker on the Cart screen.
 *
 * Two ways to apply a code: pick one from the user's available list, or
 * type one in. Both go through the same ``POST /coupons/validate``, so a
 * hand-typed code and a tapped-from-list code succeed or fail on the
 * same rules — matches the server-side invariant that
 * ``GET /coupons/available`` and ``POST /coupons/validate`` share their
 * filter set.
 *
 * The sheet computes the discount against the current cart subtotal;
 * the actual booking-time discount is recomputed server-side on
 * ``POST /bookings/``, so a stale value here can never over-apply.
 */
import { useEffect, useRef, useState } from "react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { useDragDismiss } from "@/hooks/useDragDismiss";
import { motion } from "framer-motion";
import { X, Ticket, Loader2 } from "lucide-react";
import { useAvailableCoupons, useValidateCoupon } from "@/hooks/useCoupons";
import { formatRupees } from "@/lib/currency";

interface CouponsSheetProps {
  cartSubtotal: number;
  currentCode: string | null;
  onApplied: (code: string, discountAmount: number) => void;
  onRemoved: () => void;
  onClose: () => void;
  /**
   * Pre-fill the typed input and auto-apply this code when the sheet opens.
   * Set by callers that opened the sheet from somewhere already carrying a
   * code (SVC-310: hero banner tap on Home) rather than the user typing it
   * in by hand. Runs through the same validate mutation as the manual
   * path — the eligibility check cannot drift between entry points.
   */
  initialCode?: string | null;
}

export function CouponsSheet({
  cartSubtotal,
  currentCode,
  onApplied,
  onRemoved,
  onClose,
  initialCode,
}: CouponsSheetProps) {
  // Sheets are mounted only while open, so locking on mount is the same as
  // locking on open. Without this the page scrolls behind the backdrop.
  useLockBodyScroll(true);
  const { data: available, isLoading } = useAvailableCoupons();
  const validate = useValidateCoupon();
  const [typed, setTyped] = useState(() => (initialCode ?? "").toUpperCase());
  const [error, setError] = useState<string | null>(null);

  const applyCode = async (code: string) => {
    setError(null);
    try {
      const result = await validate.mutateAsync({
        code: code.trim(),
        cart_amount: cartSubtotal,
      });
      onApplied(result.code, result.discount_amount);
      onClose();
    } catch (e) {
      // ApiError carries the backend's message (e.g. "Minimum order ₹499
      // required"). Fall back to a generic string only when the shape
      // differs.
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as Error).message)
          : "Coupon not applicable";
      setError(msg);
    }
  };

  // Drag-to-dismiss (SVC-391). Coupons picking is non-destructive — a swipe
  // down loses no state the user cared about keeping, so the sheet matches
  // the iOS-style "pull down to dismiss" users have everywhere else.
  const drag = useDragDismiss(onClose);

  // Auto-apply the pre-filled code once per mount. StrictMode double-invokes
  // effects, so guard with a ref — a second validate call would either
  // double-charge the mutation or race the first onApplied → onClose and
  // leave an orphaned request in flight.
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (autoAppliedRef.current) return;
    const code = (initialCode ?? "").trim();
    if (!code) return;
    autoAppliedRef.current = true;
    void applyCode(code);
    // Only initialCode changes drive this effect; applyCode closes over
    // mutation state that changes every render and is already guarded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-foreground/40"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        {...drag}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[80vh] max-w-md flex-col rounded-t-3xl bg-card shadow-2xl safe-bottom"
      >
        {/* Drag affordance — matches ServiceSheet / CategorySubcategoriesSheet
            so the "I can pull this down" cue is consistent across sheets. */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-base font-semibold text-foreground">Coupons & offers</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
            aria-label="Close coupons"
          >
            <X className="h-4 w-4 text-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Enter-code row. Placed at the top so the muscle memory
              matches other apps (Swiggy/Zomato both do this). */}
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Have a code?
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value.toUpperCase().replace(/\s+/g, ""));
                  setError(null);
                }}
                placeholder="Enter code"
                className="flex-1 rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
                autoCapitalize="characters"
              />
              <button
                onClick={() => applyCode(typed)}
                disabled={!typed || validate.isPending}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {validate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </button>
            </div>
            {error && (
              <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          {currentCode && (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-primary bg-accent p-3">
              <div>
                <p className="text-sm font-semibold text-foreground uppercase">{currentCode}</p>
                <p className="text-xs text-muted-foreground">Applied</p>
              </div>
              <button
                onClick={() => {
                  onRemoved();
                  onClose();
                }}
                className="text-sm font-semibold text-destructive"
              >
                Remove
              </button>
            </div>
          )}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Available for you
          </p>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (available ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No coupons available right now.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(available ?? []).map((c) => {
                const isApplied = currentCode?.toLowerCase() === c.code.toLowerCase();
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => applyCode(c.code)}
                      disabled={isApplied || validate.isPending}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                        isApplied
                          ? "border-primary bg-accent"
                          : "border-border hover:border-primary"
                      }`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                        <Ticket className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground uppercase">{c.code}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.discount_type === "percent"
                            ? `${c.discount_value}% off`
                            : `${formatRupees(c.discount_value)} off`}
                          {c.min_order_amount ? ` · min ${formatRupees(c.min_order_amount)}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-primary">
                        {isApplied ? "Applied" : "Apply"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </motion.div>
    </>
  );
}
