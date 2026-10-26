import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Minus,
  Plus,
  Trash2,
  Ticket,
  X,
  CreditCard,
  Banknote,
  Loader2,
  ShoppingCart,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { useCart } from "@/lib/cart-context";
import { AccountAvatar } from "@/components/AccountAvatar";
import { useAuth } from "@/lib/auth-context";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { useBookAndPay } from "@/hooks/useBookAndPay";
import { SavedAddressesSheet } from "@/components/SavedAddressesSheet";
import { SlotPickerSheet } from "@/components/cart/SlotPickerSheet";
import { CouponsSheet } from "@/components/cart/CouponsSheet";
import { PricingBreakdown } from "@/components/cart/PricingBreakdown";
import { formatRupees } from "@/lib/currency";
import { clearPendingCoupon, getPendingCoupon } from "@/lib/pending-coupon";
import { readLastPaymentMethod, writeLastPaymentMethod } from "@/lib/last-payment-method";

// SVC-310: the hero banner's "coupon" destination hands off the code
// through this param so the cart opens with the coupons sheet pre-filled.
// Kept to a single optional string — anything beyond "a coupon to pre-fill"
// belongs on the cart's own UI, not in the URL.
const searchSchema = z.object({
  coupon: z.string().optional(),
});

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Cart — EazyServ" },
      { name: "description", content: "Review your services before booking." },
    ],
  }),
  validateSearch: searchSchema,
  component: CartPage,
});

/**
 * Shared by both branches below — the cart proper and the empty state.
 *
 * Extracted rather than written twice: the empty branch used to return a bare
 * EmptyState with no header at all, which left Profile unreachable from this
 * tab once the Profile tab was removed (SVC-273). One header means the two
 * cannot drift apart again.
 */
function CartHeader({ name }: { name?: string | null }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
      <Link
        to="/"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4 text-foreground" />
      </Link>
      <h1 className="flex-1 text-base font-semibold text-foreground">Cart</h1>
      {/* Right-aligned by the flex-1 title, which keeps it clear of the arrow. */}
      <AccountAvatar to="/profile" name={name} />
    </div>
  );
}

export function CartPage() {
  const navigate = useNavigate();
  const { coupon: couponFromUrl } = useSearch({ from: Route.fullPath });
  const { items, subtotal, updateQuantity, remove, clear } = useCart();
  // Only for the header avatar's initials.
  const { user } = useAuth();
  const userId = user?.id;
  const {
    selected: selectedAddress,
    setSelectedId,
    addresses: savedAddresses,
    isLoading: addressesLoading,
  } = useSelectedAddress();
  const { bookAndPay, isBusy } = useBookAndPay();

  // Slot state — null = "Now (instant)", non-null = scheduled datetime.
  // Default label matches the wireframe's smart-default hint.
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [scheduledLabel, setScheduledLabel] = useState<string>("Now (~30 min)");

  // Coupon state. Kept as ({code, discount}) rather than fetching by code
  // on every render so the sheet can hand back the pre-computed number.
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);

  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);

  // SVC-385: open the picker on cart entry only when the user has no address
  // on file — the smart-defaults "the app remembers me" rule is pre-select,
  // never auto-expand for a returning user. `useSelectedAddress` already
  // resolves the stored id (or `addresses[0]`) as the pre-selection, so the
  // row paints with that label without any work here; this effect only
  // handles the empty-list case, where there is nothing to pre-select and
  // the user has to add one before Book is reachable.
  //
  // Guarded by a ref so dismissing the sheet without adding does not reopen
  // it on the next render — the row below is a tap target, and a sheet that
  // reappears every time the user dismisses it is an app you cannot escape.
  const autoOpenedAddressRef = useRef(false);
  useEffect(() => {
    if (autoOpenedAddressRef.current) return;
    if (addressesLoading) return;
    if ((savedAddresses?.length ?? 0) === 0) {
      autoOpenedAddressRef.current = true;
      setAddressPickerOpen(true);
    }
  }, [addressesLoading, savedAddresses]);

  // SVC-347: coupon code the user tapped a banner for on Home, waiting to
  // auto-apply here. Two entry points, same slot:
  //   1. ``?coupon=CODE`` — the SVC-310 handoff, kept for backwards compat.
  //      A user hand-typing the URL still works.
  //   2. ``pendingCouponStore`` — the new store, written by every coupon-*
  //      banner tap. Survives a kill-and-reopen that the search param can't.
  // URL wins when both are set (the user's most recent action), otherwise
  // the store. ``null`` when neither — the normal "walked into cart from
  // the bottom nav" case.
  const [pendingCouponCode, setPendingCouponCode] = useState<string | null>(() => {
    const stashed = getPendingCoupon(userId);
    return couponFromUrl ?? stashed ?? null;
  });
  // Sheet opens as soon as we have both a code AND something to apply it
  // against. Opening it on an empty cart would show the sheet above an
  // empty bill, which looks like the sheet is broken.
  const [couponsSheetOpen, setCouponsSheetOpen] = useState(
    () => Boolean(pendingCouponCode) && items.length > 0,
  );
  // SVC-385: default to whatever the user last paid with. Falls back to
  // "online" when the memory is empty (fresh install, cleared on logout) —
  // same business-preferred default this toggle always had.
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cash">(
    () => readLastPaymentMethod() ?? "online",
  );

  // Consume the ?coupon= handoff once, then scrub it from the URL. ``replace``
  // so the pre-handoff URL doesn't live in the back stack as its own entry.
  // The stashed code in pendingCouponStore is cleared on successful apply
  // or on explicit "Clear" (see onApplied + the sticky-row Clear button) —
  // not here, so a mid-mutation error leaves the code recoverable.
  useEffect(() => {
    if (couponFromUrl) {
      void navigate({ to: "/cart", search: {}, replace: true });
    }
    // One-shot: fires on the mount that saw the param. Subsequent navigates
    // land with search = {} and this effect is a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-open the sheet when the cart transitions from empty → non-empty
  // with a stash still in place — covers the "sticky row told the user it
  // would apply when they added items" promise from the empty-cart branch.
  // Guarded by a ref so dismissing the sheet without applying doesn't
  // reopen it on the next render; the code stays stashed and the user can
  // re-trigger via the "Apply coupon" row (same route as hand-typing).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!autoOpenedRef.current && pendingCouponCode && items.length > 0) {
      autoOpenedRef.current = true;
      setCouponsSheetOpen(true);
    }
  }, [items.length, pendingCouponCode]);

  const bill = useMemo(() => {
    const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
    const total = Math.max(0, subtotal - discount);
    return { discount, total };
  }, [subtotal, coupon]);

  const canBook = items.length > 0 && !!selectedAddress && !isBusy;

  const handleBookAndPay = async () => {
    if (!selectedAddress) {
      toast.error("Add an address first.");
      return;
    }
    // SVC-259: the whole booking-and-pay intent is one tap now. Checkout opens
    // on top of the cart instead of the user being dropped on a status screen
    // with a Pay Now button they have to go looking for.
    await bookAndPay({
      booking: {
        // service_variant_id is what the booking is actually priced against.
        // Omitted only for a service the catalogue hasn't given variants —
        // the backend then falls back as it always did.
        items: items.map((i) => ({
          service_id: i.serviceId,
          quantity: i.quantity,
          ...(i.variantId ? { service_variant_id: i.variantId } : {}),
        })),
        address_id: selectedAddress.id,
        scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
        payment_method: paymentMethod,
        coupon_code: coupon?.code,
      },
      isOnline: paymentMethod === "online",
      items,
      // Only once the money is in (or the booking is cash) — a dismissed
      // checkout must leave the cart intact to retry from.
      onComplete: (bookingId) => {
        // SVC-385: remember the method the user actually went through with.
        // Written here (not on toggle tap) because a tap the user then
        // dismissed off the Razorpay sheet is not a preference — it is a
        // thing they tried. The on-mount read in state init picks this up
        // on the next cart open.
        writeLastPaymentMethod(paymentMethod);
        clear();
        navigate({
          to: "/tracking/$bookingId",
          params: { bookingId },
          // The cart was just cleared, so backing into it renders EmptyCart.
          // Replace it: back from tracking returns where the user came from.
          replace: true,
        });
      },
    });
  };

  if (items.length === 0) {
    // Keeps the header rather than early-returning a bare EmptyState. Found on
    // device: without it an empty cart had no avatar and no back arrow, so
    // Profile was unreachable from this tab and the only way out was another
    // tab. `fullScreen` is dropped for the same reason — the empty state now
    // sits under a header instead of owning the whole viewport.
    //
    // SVC-347: when a banner tap stashed a coupon and the cart is still
    // empty, surface a sticky row above the empty state so the user has
    // honest feedback — "we remembered FIRST20; it'll apply once you add
    // items" — instead of silently landing on an empty cart that looks
    // identical to a cold open.
    return (
      <div className="min-h-screen pb-20">
        <CartHeader name={user?.name} />
        {pendingCouponCode && (
          <PendingCouponStickyRow
            code={pendingCouponCode}
            onClear={() => {
              clearPendingCoupon(userId);
              setPendingCouponCode(null);
            }}
          />
        )}
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          subtitle="Browse services and add them to get started."
          action={{ label: "Browse services", to: "/" }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-48">
      <CartHeader name={user?.name} />

      {/* Address selector */}
      <button
        onClick={() => setAddressPickerOpen(true)}
        className="flex w-full items-center gap-3 border-b border-border bg-card px-4 py-3 text-left"
      >
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground capitalize">
            {selectedAddress?.label || "Select address"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {selectedAddress?.full || "Tap to add an address"}
          </p>
        </div>
        <span className="text-xs font-medium text-primary">Change</span>
      </button>

      {/* Slot selector */}
      <button
        onClick={() => setSlotPickerOpen(true)}
        className="flex w-full items-center gap-3 border-b border-border bg-card px-4 py-3 text-left"
      >
        <Clock className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{scheduledLabel}</p>
          <p className="text-xs text-muted-foreground">Tap to reschedule</p>
        </div>
        <span className="text-xs font-medium text-primary">Change</span>
      </button>

      {/* Items */}
      <section className="px-4 pt-4">
        <h2 className="pb-3 text-sm font-semibold text-foreground">Services ({items.length})</h2>
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            // Keyed on serviceId: a booking can hold only one row per service
            // (uix_booking_item_service), so the variant lives ON the line
            // rather than making a second one.
            // Name the control by variant too, so the label reads
            // "Remove Vehicle wash SUV" rather than being ambiguous.
            const itemLabel = item.variantLabel ? `${item.name} ${item.variantLabel}` : item.name;
            return (
              <li
                key={item.serviceId}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{item.name}</p>
                  {item.variantLabel && (
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      {item.variantLabel}
                    </p>
                  )}
                  {item.duration && (
                    <p className="text-xs text-muted-foreground">{item.duration}</p>
                  )}
                  <p className="mt-1 text-sm font-bold text-primary">
                    {formatRupees(item.unitPrice * item.quantity)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => remove(item.serviceId)}
                    aria-label={`Remove ${itemLabel}`}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-2 rounded-full border border-border">
                    <button
                      onClick={() => updateQuantity(item.serviceId, item.quantity - 1)}
                      aria-label={`Decrease ${itemLabel} quantity`}
                      className="flex h-7 w-7 items-center justify-center text-foreground"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-4 text-center text-sm font-semibold">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.serviceId, item.quantity + 1)}
                      aria-label={`Increase ${itemLabel} quantity`}
                      className="flex h-7 w-7 items-center justify-center text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Coupon */}
      <section className="px-4 pt-4">
        <button
          onClick={() => setCouponsSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-card p-3 text-left"
        >
          <Ticket className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            {coupon ? (
              <>
                <p className="text-sm font-semibold text-foreground uppercase">
                  {coupon.code} applied
                </p>
                <p className="text-xs text-success">You save {formatRupees(coupon.discount)}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">Apply coupon</p>
                <p className="text-xs text-muted-foreground">See offers available for you</p>
              </>
            )}
          </div>
          <span className="text-xs font-medium text-primary">{coupon ? "Change" : "Browse"}</span>
        </button>
      </section>

      {/* Payment method */}
      <section className="px-4 pt-4">
        <h2 className="pb-2 text-sm font-semibold text-foreground">Payment method</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setPaymentMethod("online")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
              paymentMethod === "online"
                ? "border-primary bg-accent text-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            <CreditCard className="h-4 w-4" /> Pay online
          </button>
          <button
            onClick={() => setPaymentMethod("cash")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
              paymentMethod === "cash"
                ? "border-primary bg-accent text-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            <Banknote className="h-4 w-4" /> Cash after service
          </button>
        </div>
      </section>

      {/*
        Bill breakdown — SVC-384 replaces the always-expanded card with a
        chip that reveals the lines on tap. Shape is identical: Service
        subtotal / Discount (if applied) / GST / Convenience fee / Total.
      */}
      <PricingBreakdown
        subtotal={subtotal}
        discount={bill.discount}
        couponCode={coupon?.code ?? null}
      />

      {/* Cancellation policy notice */}
      <p className="mx-4 mt-4 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
        Free cancellation until a pro is assigned. ₹50 fee after that. See our{" "}
        <Link to="/refund" className="font-medium text-primary underline">
          cancellation policy
        </Link>
        .
      </p>

      {/* Multi-service note. Honest about matching-policy (i). */}
      {items.length > 1 && (
        <p className="mx-4 mt-3 rounded-xl bg-accent/50 p-3 text-xs text-muted-foreground">
          We'll look for a pro who can do all {items.length} services. If none is available for the
          combination, we'll suggest booking them separately.
        </p>
      )}

      {/* Sticky Book & Pay */}
      {/*
        Offset above the bottom nav rather than pinned to bottom-0.
        The nav used to hide itself on /cart precisely because both are
        `fixed bottom-0 z-40` and the nav renders after <Outlet/>, so it
        painted over this button. Now that Cart is a nav tab, the nav has to
        stay — a tab that disappears on the screen it navigates to is never
        seen in its own active state — so the CTA moves up by the nav's
        height (h-16) plus the safe-area inset the nav also reserves.
      */}
      <div
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
        className="fixed left-0 right-0 z-40 mx-auto max-w-md border-t border-border bg-card p-4"
      >
        <button
          onClick={handleBookAndPay}
          disabled={!canBook}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isBusy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            `Book${paymentMethod === "online" ? " & Pay" : ""} · ${formatRupees(bill.total)}`
          )}
        </button>
      </div>

      {/* Sheets */}
      <AnimatePresence>
        {addressPickerOpen && (
          <SavedAddressesSheet
            onClose={() => setAddressPickerOpen(false)}
            onPick={(id) => {
              setSelectedId(id);
              setAddressPickerOpen(false);
            }}
          />
        )}
        {slotPickerOpen && (
          <SlotPickerSheet
            onClose={() => setSlotPickerOpen(false)}
            onSelect={(date, label) => {
              setScheduledAt(date);
              setScheduledLabel(label);
              setSlotPickerOpen(false);
            }}
          />
        )}
        {couponsSheetOpen && (
          <CouponsSheet
            cartSubtotal={subtotal}
            currentCode={coupon?.code ?? null}
            initialCode={pendingCouponCode}
            onApplied={(code, discountAmount) => {
              setCoupon({ code, discount: discountAmount });
              // SVC-347: successful apply is the ONLY path that clears the
              // store. A validate error (e.g. min-order) must leave the code
              // in place so the user can retry after adjusting their cart.
              clearPendingCoupon(userId);
              setPendingCouponCode(null);
            }}
            onRemoved={() => setCoupon(null)}
            onClose={() => {
              setCouponsSheetOpen(false);
              // Dismiss keeps the stash — the user may re-open manually.
              // Only drop the LOCAL mirror; the store is cleared on apply
              // or on explicit "Clear" from the sticky row.
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The empty-cart row that promises a stashed banner-tap coupon will apply
 * once the user adds items.
 *
 * Rendered only on the empty branch — the non-empty branch auto-opens the
 * sheet (see ``autoOpenedRef`` above). The "Clear" affordance is the only
 * way for a user who tapped by accident to drop the stash without going
 * through an apply attempt; without it a mis-tap on Home would leave a
 * coupon riding every subsequent cart visit until it expired or applied.
 * A toast would be lighter but can't survive the next route change, which
 * is exactly where the user is going when the row appears.
 */
function PendingCouponStickyRow({ code, onClear }: { code: string; onClear: () => void }) {
  return (
    <div
      // Not actually position:sticky — "sticky" in the SVC-347 sense is
      // "always visible on the empty-cart screen", which is a tall thin
      // viewport where the row sits right under the header and is
      // guaranteed on-screen without needing position tricks.
      className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-primary/40 bg-accent p-3"
      aria-live="polite"
    >
      <Ticket className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="flex-1 text-sm text-foreground">
        <span className="font-semibold uppercase">{code}</span> will apply when you add items.
      </p>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${code}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
