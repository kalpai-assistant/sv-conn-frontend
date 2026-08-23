import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { useCart } from "@/lib/cart-context";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { useCreateBookingFromCart } from "@/hooks/useCreateBookingFromCart";
import { AddressPickerSheet } from "@/components/AddressPickerSheet";
import { SlotPickerSheet } from "@/components/cart/SlotPickerSheet";
import { CouponsSheet } from "@/components/cart/CouponsSheet";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Cart — EazyServ" },
      { name: "description", content: "Review your services before booking." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const navigate = useNavigate();
  const { items, subtotal, updateQuantity, remove, clear } = useCart();
  const { selected: selectedAddress } = useSelectedAddress();
  const createBooking = useCreateBookingFromCart();

  // Slot state — null = "Now (instant)", non-null = scheduled datetime.
  // Default label matches the wireframe's smart-default hint.
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [scheduledLabel, setScheduledLabel] = useState<string>("Now (~30 min)");

  // Coupon state. Kept as ({code, discount}) rather than fetching by code
  // on every render so the sheet can hand back the pre-computed number.
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);

  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [couponsSheetOpen, setCouponsSheetOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cash">("online");

  const bill = useMemo(() => {
    const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
    const total = Math.max(0, subtotal - discount);
    return { discount, total };
  }, [subtotal, coupon]);

  const canBook = items.length > 0 && !!selectedAddress && !createBooking.isPending;

  const handleBookAndPay = async () => {
    if (!selectedAddress) {
      toast.error("Add an address first.");
      return;
    }
    try {
      const booking = await createBooking.mutateAsync({
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
        // Fresh key per tap of Book & Pay. React-query's own retry replays
        // the same key (backend collapses those). A subsequent user tap
        // after failure is a new intent — new key.
        idempotencyKey: crypto.randomUUID(),
      });
      clear();
      navigate({
        to: "/tracking/$bookingId",
        params: { bookingId: booking.id as string },
        // The cart was just cleared, so backing into it renders EmptyCart.
        // Replace it: back from tracking returns where the user came from.
        replace: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create booking. Please try again.";
      toast.error(msg);
    }
  };

  if (items.length === 0) {
    return <EmptyCart />;
  }

  return (
    <div className="min-h-screen pb-40">
      {/* Header */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Link
          to="/"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
        <h1 className="text-base font-semibold text-foreground">Cart</h1>
      </div>

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
                    ₹{(item.unitPrice * item.quantity).toLocaleString("en-IN")}
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
                <p className="text-xs text-success">
                  You save ₹{coupon.discount.toLocaleString("en-IN")}
                </p>
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
            <span className="font-medium text-foreground">₹{subtotal.toLocaleString("en-IN")}</span>
          </div>
          {bill.discount > 0 && (
            <div className="flex justify-between py-1 text-sm">
              <span className="text-success">Discount ({coupon?.code})</span>
              <span className="font-medium text-success">
                −₹{bill.discount.toLocaleString("en-IN")}
              </span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-base">
            <span className="font-semibold text-foreground">Total</span>
            <span className="font-bold text-primary">₹{bill.total.toLocaleString("en-IN")}</span>
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
      <div className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-md border-t border-border bg-card p-4 safe-bottom">
        <button
          onClick={handleBookAndPay}
          disabled={!canBook}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {createBooking.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            `Book${paymentMethod === "online" ? " & Pay" : ""} — ₹${bill.total.toLocaleString("en-IN")}`
          )}
        </button>
      </div>

      {/* Sheets */}
      <AnimatePresence>
        {addressPickerOpen && <AddressPickerSheet onClose={() => setAddressPickerOpen(false)} />}
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
            onApplied={(code, discountAmount) => setCoupon({ code, discount: discountAmount })}
            onRemoved={() => setCoupon(null)}
            onClose={() => setCouponsSheetOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
        <ShoppingCart className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Your cart is empty</h1>
      <p className="text-sm text-muted-foreground">Browse services and add them to get started.</p>
      <Link
        to="/"
        className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
      >
        Browse services
      </Link>
    </div>
  );
}
