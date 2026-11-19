import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
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
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { CartEmptyIllustration } from "@/components/EmptyStateIllustrations";
import { Celebration } from "@/components/Celebration";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OUT_OF_RANGE_WARNING } from "@/components/service/ProSelectionSheet";
import { useCart, type CartLineItem } from "@/lib/cart-context";
import { applyPriceChanges } from "@/lib/cart-pricing";
import { useProSelection } from "@/lib/pro-selection-context";
import { proDisplayName } from "@/lib/pro-selection";
import type { Service } from "@/lib/mock-data";
import { useServices } from "@/hooks/useApi";
import { AccountAvatar } from "@/components/AccountAvatar";
import { useAuth } from "@/lib/auth-context";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { useBookAndPay, type PriceChangedItem } from "@/hooks/useBookAndPay";
import { SavedAddressesSheet } from "@/components/SavedAddressesSheet";
import { SlotPickerSheet } from "@/components/cart/SlotPickerSheet";
import { CouponsSheet } from "@/components/cart/CouponsSheet";
import { PricingBreakdown } from "@/components/cart/PricingBreakdown";
import { formatRupees } from "@/lib/currency";
import { clearPendingCoupon, getPendingCoupon } from "@/lib/pending-coupon";
import { clearRebookAddressConfirm, getRebookAddressConfirm } from "@/lib/rebook-address-confirm";
import { readLastPaymentMethod, writeLastPaymentMethod } from "@/lib/last-payment-method";
import { hapticSuccess } from "@/lib/haptics";
import { track } from "@/lib/analytics";

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

export const CHOOSE_PRO_FOR_EACH = "Choose a pro for each service";
export const REMOVE_UNAVAILABLE = "Remove unavailable services to continue";

/**
 * Where a line's "Choose a pro" / "Change pro" opens the sheet, if anywhere.
 * The variant is the line's, or the service's first, as `cart.add()` picks.
 * `null` while the catalogue is unknown; "gone" once it is known and the
 * service (or every variant of it) is not in it.
 */
type ProTarget = { service: Service; variantId: string } | "gone" | null;

function proTargetFor(line: CartLineItem, catalogue: Map<string, Service> | null): ProTarget {
  if (!catalogue) return null;
  const service = catalogue.get(line.serviceId);
  const variant = service?.variants.find((v) => v.id === line.variantId) ?? service?.variants[0];
  return service && variant ? { service, variantId: variant.id } : "gone";
}

/** A 409 the cart answers with a dialog (SVC-411), with the pro it was for. */
type CartConflict =
  | { kind: "price-changed"; spId: string; items: PriceChangedItem[] }
  | { kind: "sp-unavailable"; spId: string };

export function CartPage() {
  const navigate = useNavigate();
  const { coupon: couponFromUrl } = useSearch({ from: Route.fullPath });
  const {
    items,
    needsProCount,
    updateQuantity,
    remove,
    clear,
    applyPriceChanges: storePriceChanges,
    clearPro,
  } = useCart();
  const { openProSelection } = useProSelection();
  const queryClient = useQueryClient();
  // SVC-417: the Service a "Choose a pro" line opens the sheet with. The same
  // ["services", undefined] cache entry `addMany` reads.
  const { data: catalogueList } = useServices();
  const catalogue = useMemo(
    () => (catalogueList ? new Map(catalogueList.map((s) => [s.id, s])) : null),
    [catalogueList],
  );
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

  // SVC-393: the "please confirm address" banner for a rebook that fell
  // back to the user's default (the historical booking's address was
  // deleted). Read once per route entry — the signal is written by
  // `handleRebook` on the bookings page just before navigation, so by
  // the time this component mounts the sessionStorage slot is populated.
  // `useState` initialiser form keeps the read out of render and lets a
  // "Looks good" tap clear it without racing a re-read.
  const [rebookAddressConfirmLabel, setRebookAddressConfirmLabel] = useState<string | null>(() =>
    getRebookAddressConfirm(userId),
  );
  const dismissRebookAddressConfirm = () => {
    clearRebookAddressConfirm(userId);
    setRebookAddressConfirmLabel(null);
  };

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

  // SVC-417: lines whose service left the catalogue. The backend refuses an
  // inactive or unknown service (400), with a pro or without, so they can
  // only be removed, and Book waits until they are.
  const unavailableIds = new Set(
    items.filter((i) => proTargetFor(i, catalogue) === "gone").map((i) => i.serviceId),
  );
  // The cart's subtotal (lines with a pro) minus any of those: they won't be
  // booked, so they're not in the bill, and not what a coupon is checked on.
  const subtotal = items.reduce(
    (sum, i) => (i.spId && !unavailableIds.has(i.serviceId) ? sum + i.unitPrice * i.quantity : sum),
    0,
  );

  const bill = useMemo(() => {
    const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
    const total = Math.max(0, subtotal - discount);
    return { discount, total };
  }, [subtotal, coupon]);

  // SVC-417: one booking goes to one pro, at the price they quoted. Book
  // waits until every line has a pro, all the same one.
  const cartSpIds = new Set(items.map((i) => i.spId).filter(Boolean));
  const everyLineHasThePro = items.length > 0 && needsProCount === 0 && cartSpIds.size === 1;
  const canBook = everyLineHasThePro && unavailableIds.size === 0 && !!selectedAddress && !isBusy;

  const [conflict, setConflict] = useState<CartConflict | null>(null);

  // SVC-419: one `price_change_at_checkout` per changed line, once per
  // "Price updated" dialog. The dialog answered is remembered by identity:
  // Radix's Action also fires onOpenChange(false) right after its onClick,
  // which must not send "abandoned" on top of "confirmed".
  const answeredPriceChange = useRef<CartConflict | null>(null);
  const trackPriceChange = (userAction: "confirmed" | "abandoned") => {
    if (conflict?.kind !== "price-changed" || answeredPriceChange.current === conflict) return;
    answeredPriceChange.current = conflict;
    for (const c of conflict.items) {
      track("marketplace.price_change_at_checkout", {
        service_id: c.serviceId,
        service_variant_id: c.serviceVariantId,
        sp_id: conflict.spId,
        old_price: c.quotedPrice,
        new_price: c.currentPrice,
        user_action: userAction,
      });
    }
  };

  const openSheetFor = (line: CartLineItem) => {
    const target = proTargetFor(line, catalogue);
    if (target && target !== "gone") openProSelection(target.service, target.variantId);
  };

  // SVC-390: celebration overlay bridges the gap between "payment succeeded"
  // and "tracking page loads". The cart isn't cleared and nav isn't fired
  // until the overlay's 1.5s hold ends — a user who kills the app during
  // the celebration still has an intact cart and a valid booking to resume
  // from, same as before.
  const [celebratingBookingId, setCelebratingBookingId] = useState<string | null>(null);

  // Takes the lines rather than reading `items`, so the "Price updated"
  // Confirm can book the repriced lines in the same tap that stores them.
  const book = async (lines: CartLineItem[]) => {
    if (!selectedAddress) {
      toast.error("Add an address first.");
      return;
    }
    // canBook already holds this; re-checked because `lines` may not be the
    // rendered `items`, and a line without its quote would be a 422.
    const spId = lines[0]?.spId;
    if (
      !spId ||
      lines.some((l) => l.spId !== spId || !l.serviceVariantId || l.quotedPrice == null)
    ) {
      return;
    }
    // SVC-259: the whole booking-and-pay intent is one tap now. Checkout opens
    // on top of the cart instead of the user being dropped on a status screen
    // with a Pay Now button they have to go looking for.
    await bookAndPay({
      booking: {
        // SVC-411: the chosen pro once, and per line the variant and unit
        // price they quoted. The backend books at that price or answers 409.
        sp_id: spId,
        items: lines.map((i) => ({
          service_id: i.serviceId,
          quantity: i.quantity,
          service_variant_id: i.serviceVariantId,
          quoted_price: i.quotedPrice,
        })),
        address_id: selectedAddress.id,
        scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
        payment_method: paymentMethod,
        coupon_code: coupon?.code,
      },
      isOnline: paymentMethod === "online",
      items: lines,
      onConflict: (c) => {
        // The pro sheet reuses its list for the quote's TTL (SVC-416). After a
        // 409 that list is known wrong: the old price, or a pro who can't take
        // the booking. Removed rather than invalidated, so the next sheet
        // opens on a fresh fetch instead of first rendering the stale list.
        queryClient.removeQueries({ queryKey: ["service-providers"] });
        setConflict(c.kind === "price-changed" ? { ...c, spId } : { kind: c.kind, spId });
      },
      // Only once the money is in (or the booking is cash) — a dismissed
      // checkout must leave the cart intact to retry from.
      onComplete: (bookingId) => {
        // SVC-385: remember the method the user actually went through with.
        // Written here (not on toggle tap) because a tap the user then
        // dismissed off the Razorpay sheet is not a preference — it is a
        // thing they tried. The on-mount read in state init picks this up
        // on the next cart open.
        writeLastPaymentMethod(paymentMethod);
        // SVC-398: server-confirmed success → triple-buzz. The Light impact
        // fired earlier (Razorpay handler for online, cash branch of
        // useBookAndPay for cash) was "payment posted"; this is "booking
        // live", paired with the SVC-390 celebration overlay.
        hapticSuccess();
        // SVC-390: trigger the celebration overlay. The overlay unmounts
        // via its own 1.5s timer and fires handleCelebrationComplete below,
        // which clears the cart and navigates to tracking.
        setCelebratingBookingId(bookingId);
      },
    });
  };

  const handleBookAndPay = () => book(items);

  // SVC-411 "Price updated" -> Confirm: store the pro's live prices and book
  // again at them. The new tap mints a new idempotency key, as any tap does.
  const confirmPriceChange = (changed: PriceChangedItem[]) => {
    const changes = changed.map((c) => ({
      serviceVariantId: c.serviceVariantId,
      currentPrice: c.currentPrice,
    }));
    storePriceChanges(changes);
    setConflict(null);
    void book(applyPriceChanges(items, changes));
  };

  // SVC-411 SP_UNAVAILABLE: that pro's lines go back to "Choose a pro", and
  // the sheet opens for the first of them.
  const repickPro = (spId: string) => {
    const first = items.find((i) => i.spId === spId);
    clearPro(spId);
    setConflict(null);
    if (first) openSheetFor(first);
  };

  const handleCelebrationComplete = () => {
    const bookingId = celebratingBookingId;
    if (!bookingId) return;
    clear();
    void navigate({
      to: "/tracking/$bookingId",
      params: { bookingId },
      // The cart was just cleared, so backing into it renders EmptyCart.
      // Replace it: back from tracking returns where the user came from.
      replace: true,
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
          illustration={<CartEmptyIllustration />}
          title="Your cart is empty"
          description="Add services to see pricing and book."
          action={{ label: "Browse services", to: "/" }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-48">
      <CartHeader name={user?.name} />

      {/* SVC-393: rebook address fallback. Rendered above the selector so
          the "please confirm" message sits in the eye-path to Change, and
          clears once the user has either confirmed or picked a different
          address below. */}
      {rebookAddressConfirmLabel !== null && (
        <RebookAddressConfirmRow
          previousLabel={rebookAddressConfirmLabel}
          onConfirm={dismissRebookAddressConfirm}
        />
      )}

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
          {items.map((item) => (
            <CartLine
              key={item.serviceId}
              item={item}
              target={proTargetFor(item, catalogue)}
              onChoosePro={() => openSheetFor(item)}
              onRemove={() => remove(item.serviceId)}
              onQuantity={(q) => updateQuantity(item.serviceId, q)}
            />
          ))}
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
      {/* SVC-417: no total while a line has no price, or can't be booked. A
          subtotal of only the other lines would read as the bill. */}
      {unavailableIds.size > 0 || needsProCount > 0 ? (
        <p className="mx-4 mt-4 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          {unavailableIds.size > 0
            ? "Remove unavailable services to see your total."
            : "Choose a pro for each service to see your total."}
        </p>
      ) : (
        <PricingBreakdown
          subtotal={subtotal}
          discount={bill.discount}
          couponCode={coupon?.code ?? null}
        />
      )}

      {/* Cancellation policy notice */}
      <p className="mx-4 mt-4 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
        Free cancellation until a pro is assigned. ₹50 fee after that. See our{" "}
        <Link to="/refund" className="font-medium text-primary underline">
          cancellation policy
        </Link>
        .
      </p>

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
          ) : unavailableIds.size > 0 ? (
            REMOVE_UNAVAILABLE
          ) : !everyLineHasThePro ? (
            CHOOSE_PRO_FOR_EACH
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
              // SVC-393: picking an address is the explicit confirmation
              // the rebook sticky row was asking for — clear it so the
              // row doesn't linger below the newly chosen address.
              dismissRebookAddressConfirm();
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

      {/* SVC-411: 409 PRICE_CHANGED. Cancel leaves the cart as it was. */}
      <AlertDialog
        open={conflict?.kind === "price-changed"}
        onOpenChange={(open) => {
          if (open) return;
          // Cancel or Escape (an AlertDialog ignores taps outside it). After
          // the Action this is a no-op.
          trackPriceChange("abandoned");
          setConflict(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Price updated</AlertDialogTitle>
            <AlertDialogDescription>
              Your pro's price changed since you picked them. Book at the new price?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {conflict?.kind === "price-changed" && (
            <ul aria-label="Changed prices" className="flex flex-col gap-2">
              {conflict.items.map((c) => (
                <li
                  key={c.serviceVariantId}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 text-foreground">{changedLineName(items, c)}</span>
                  <span className="shrink-0 font-semibold text-foreground">
                    <span className="text-muted-foreground line-through">
                      {formatRupees(c.quotedPrice)}
                    </span>
                    {" → "}
                    {formatRupees(c.currentPrice)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (conflict?.kind !== "price-changed") return;
                trackPriceChange("confirmed");
                confirmPriceChange(conflict.items);
              }}
            >
              Book at new price
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SVC-411: 409 SP_UNAVAILABLE. The pro went offline, left the area, or
          switched the price off between the pick and the tap. */}
      <AlertDialog
        open={conflict?.kind === "sp-unavailable"}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This pro can't take your booking right now</AlertDialogTitle>
            <AlertDialogDescription>
              Pick another pro for your services. Your cart stays as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                if (conflict) repickPro(conflict.spId);
              }}
            >
              Choose another pro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SVC-390: celebration overlay bridges payment success and tracking. */}
      {celebratingBookingId && <Celebration onComplete={handleCelebrationComplete} />}
    </div>
  );
}

/** "Deep cleaning · 2 BHK" for a PRICE_CHANGED line, matched by variant. */
function changedLineName(items: CartLineItem[], c: PriceChangedItem): string {
  const line =
    items.find((i) => i.serviceVariantId === c.serviceVariantId) ??
    items.find((i) => i.serviceId === c.serviceId);
  if (!line) return "A service";
  return line.variantLabel ? `${line.name} · ${line.variantLabel}` : line.name;
}

/**
 * One cart line (SVC-417).
 *
 * With a pro: who does it, the line total at their quoted price, the
 * out-of-range note the sheet showed, and "Change pro".
 *
 * Without one ("Book again", an old cart, a variant change): "Choose a pro"
 * where the price would be.
 *
 * A service the catalogue no longer has shows "No longer available" and can
 * only be removed, pro or not: the backend refuses an inactive service.
 *
 * Keyed on serviceId by the caller: a booking can hold only one row per
 * service (uix_booking_item_service), so the variant lives ON the line.
 */
function CartLine({
  item,
  target,
  onChoosePro,
  onRemove,
  onQuantity,
}: {
  item: CartLineItem;
  target: ProTarget;
  onChoosePro: () => void;
  onRemove: () => void;
  onQuantity: (quantity: number) => void;
}) {
  // Name the controls by variant too, so the label reads "Remove Vehicle
  // wash SUV" rather than being ambiguous.
  const itemLabel = item.variantLabel ? `${item.name} ${item.variantLabel}` : item.name;
  const hasPro = !!item.spId;
  const gone = target === "gone";
  const showPro = hasPro && !gone;
  const subtitle = [item.variantLabel, showPro ? proDisplayName(item.spName ?? null) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{item.name}</p>
          {subtitle && (
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{subtitle}</p>
          )}
          {item.duration && <p className="text-xs text-muted-foreground">{item.duration}</p>}
          {gone ? (
            <p className="mt-1 text-sm font-semibold text-destructive">No longer available</p>
          ) : hasPro ? (
            <p className="mt-1 text-sm font-bold text-primary">
              {formatRupees(item.unitPrice * item.quantity)}
            </p>
          ) : (
            <button
              type="button"
              onClick={onChoosePro}
              disabled={target === null}
              aria-label={`Choose a pro for ${itemLabel}`}
              className="mt-1.5 rounded-lg border border-primary px-3 py-1 text-xs font-semibold text-primary disabled:opacity-50"
            >
              Choose a pro
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={onRemove}
            aria-label={`Remove ${itemLabel}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {!gone && (
            <div className="flex items-center gap-2 rounded-full border border-border">
              <button
                onClick={() => onQuantity(item.quantity - 1)}
                aria-label={`Decrease ${itemLabel} quantity`}
                className="flex h-7 w-7 items-center justify-center text-foreground"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-4 text-center text-sm font-semibold">{item.quantity}</span>
              <button
                onClick={() => onQuantity(item.quantity + 1)}
                aria-label={`Increase ${itemLabel} quantity`}
                className="flex h-7 w-7 items-center justify-center text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      {showPro && item.outsideRecommendedRange && (
        // Destructive at low strength, as on the sheet: there is no warning
        // token, and a literal amber would clash in night mode (SVC-383).
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-2">
          <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-xs text-foreground">{OUT_OF_RANGE_WARNING}</p>
        </div>
      )}
      {showPro && target !== null && (
        <button
          type="button"
          onClick={onChoosePro}
          aria-label={`Change pro for ${itemLabel}`}
          className="self-start text-xs font-semibold text-primary"
        >
          Change pro
        </button>
      )}
    </li>
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
/**
 * SVC-393: the "please confirm address" banner shown when a rebook fell
 * back to the user's default (the historical booking's address was
 * deleted). Mirrors `PendingCouponStickyRow` so the two feel like one
 * pattern — explicit, dismissable, honest about what the app did.
 */
function RebookAddressConfirmRow({
  previousLabel,
  onConfirm,
}: {
  previousLabel: string;
  onConfirm: () => void;
}) {
  // Named-address copy when we have one, generic copy when the historical
  // blob was already anonymised. The two shapes keep the message truthful
  // without inventing a label the backend has already dropped.
  const description = previousLabel
    ? `The "${previousLabel}" address isn't saved any more — booking will use the one below.`
    : "Your original delivery address isn't saved any more — booking will use the one below.";
  return (
    <div
      className="mx-4 mt-3 flex items-start gap-3 rounded-xl border border-primary/40 bg-accent p-3"
      aria-live="polite"
    >
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">Please confirm the address</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        onClick={onConfirm}
        className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
      >
        Looks good
      </button>
    </div>
  );
}

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
