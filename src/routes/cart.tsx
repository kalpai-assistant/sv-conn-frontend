import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Minus,
  Plus,
  Trash2,
  Ticket,
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
import { formatRupees } from "@/lib/currency";

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

function CartPage() {
  const navigate = useNavigate();
  const { coupon: couponFromUrl } = useSearch({ from: Route.fullPath });
  const { items, subtotal, updateQuantity, remove, clear } = useCart();
  // Only for the header avatar's initials.
  const { user } = useAuth();
  const { selected: selectedAddress, setSelectedId } = useSelectedAddress();
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
  // SVC-310: open with the sheet already up when the hero banner handed us
  // a coupon code — the banner only navigates here when it has one, so a
  // user arriving via that path reads the pre-fill as "we remembered what
  // you tapped" instead of landing on the cart with nothing happening.
  const [couponsSheetOpen, setCouponsSheetOpen] = useState(() => Boolean(couponFromUrl));
  // Hold the code separately so the search param can be dropped from the
  // URL once consumed. Keeping it in the URL means a back nav or refresh
  // would re-trigger the auto-apply even after the user cancelled.
  const [pendingCouponCode, setPendingCouponCode] = useState<string | null>(couponFromUrl ?? null);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cash">("online");

  // Consume the ?coupon= handoff once, then scrub it from the URL. ``replace``
  // so the pre-handoff URL doesn't live in the back stack as its own entry.
  useEffect(() => {
    if (couponFromUrl) {
      void navigate({ to: "/cart", search: {}, replace: true });
    }
    // One-shot: fires on the mount that saw the param. Subsequent navigates
    // land with search = {} and this effect is a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return (
      <div className="min-h-screen pb-20">
        <CartHeader name={user?.name} />
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

      {/* Bill breakdown */}
      <section className="px-4 pt-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="pb-2 text-sm font-semibold text-foreground">Bill</p>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium text-foreground">{formatRupees(subtotal)}</span>
          </div>
          {bill.discount > 0 && (
            <div className="flex justify-between py-1 text-sm">
              <span className="text-success">Discount ({coupon?.code})</span>
              <span className="font-medium text-success">−{formatRupees(bill.discount)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-base">
            <span className="font-semibold text-foreground">Total</span>
            <span className="font-bold text-primary">{formatRupees(bill.total)}</span>
          </div>
        </div>
      </section>

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
            `Book${paymentMethod === "online" ? " & Pay" : ""} — ${formatRupees(bill.total)}`
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
            onApplied={(code, discountAmount) => setCoupon({ code, discount: discountAmount })}
            onRemoved={() => setCoupon(null)}
            onClose={() => {
              setCouponsSheetOpen(false);
              setPendingCouponCode(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
