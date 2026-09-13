/**
 * SVC-290: the service detail as a bottom sheet.
 *
 * Previously a dedicated `/service/$serviceId` route. The route still exists
 * as a redirect for shared deep-links (see `routes/service.$serviceId.tsx`),
 * but the primary path is now a card tap that slides this sheet up over
 * whatever page the user is on — Home, category listing, search results.
 *
 * Add-to-cart is the ONLY affordance that puts something in the cart. Card
 * taps used to be ambiguous ("did I open the service or add it?"); a card is
 * now purely a preview trigger, and the button in here is the commit.
 *
 * Mirrors AddAddressSheet's backdrop + slide-up motion pattern rather than
 * the shadcn Sheet primitive because that pattern is what the app's other
 * sheets (Coupons, SlotPicker, AddressPicker, Search) already look like.
 * Drag-to-dismiss is real: framer-motion's `drag="y"` with a downward-only
 * constraint. Backdrop tap + hardware back also close it.
 */
import { useEffect, useState } from "react";
import { motion, useMotionValue, type PanInfo } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { X, ShieldCheck, LockKeyhole, Clock, Loader2, Check } from "lucide-react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { pushBackInterceptor } from "@/lib/back-interceptor";
import { useServices } from "@/hooks/useApi";
import { useCart } from "@/lib/cart-context";
import { VariantPicker } from "@/components/service/VariantPicker";
import { ErrorState } from "@/components/ErrorState";

interface ServiceSheetProps {
  serviceId: string;
  onClose: () => void;
}

export function ServiceSheet({ serviceId, onClose }: ServiceSheetProps) {
  useLockBodyScroll(true);

  const navigate = useNavigate();
  const { data: services, isLoading, isError, refetch } = useServices();
  const service = services?.find((s) => s.id === serviceId);
  const cart = useCart();

  // Undefined until the catalogue resolves, then defaulted to the first
  // variant in render. Deliberately not seeded from `service` in an effect:
  // the service arrives asynchronously, and a null-selection render would
  // flash the CTA with no price.
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);

  // Android hardware back closes the sheet before the router pops the page
  // underneath. Push-then-cleanup keeps this scoped to the mounted lifetime;
  // last-registered wins in `runBackInterceptors`, so a sheet on top of a
  // sheet still claims back first.
  useEffect(
    () =>
      pushBackInterceptor(() => {
        onClose();
        return true;
      }),
    [onClose],
  );

  const variants = service?.variants ?? [];
  // Match the backend fallback — a user who never touches the picker gets
  // exactly what they were getting before, at the price the sheet shows them.
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? variants[0];

  // Cart holds at most one line per service (uix_booking_item_service). Three
  // CTA states: not added, added with THIS variant, added with a different one.
  const cartLine = service ? cart.items.find((i) => i.serviceId === service.id) : undefined;
  const inCart = !!cartLine && cartLine.variantId === selectedVariant?.id;
  const inCartAsOtherVariant = !!cartLine && cartLine.variantId !== selectedVariant?.id;

  const ctaPrice = selectedVariant?.price ?? service?.price ?? 0;

  const handleAddToCart = () => {
    if (!service) return;
    cart.add(service, 1, selectedVariant?.id);
  };

  const handleGoToCart = () => {
    onClose();
    void navigate({ to: "/cart" });
  };

  // Drag-to-dismiss: framer-motion drags the sheet by `y`, snap back if the
  // gesture is short and slow, close if it's long or fast. Numbers copied from
  // the drawer-close heuristic in shadcn/ui: 100px OR >500px/s.
  const y = useMotionValue(0);
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        onDragEnd={handleDragEnd}
        style={{ y }}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex h-[85vh] max-w-md flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl safe-bottom"
      >
        {/* Drag handle. Visual affordance for the drag-to-dismiss gesture —
            iOS/Android users read this as "I can pull this down". */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between px-4">
          <h2 className="truncate text-base font-semibold text-foreground">
            {service?.name ?? "Service"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-secondary"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <ErrorState message="Couldn't load this service." onRetry={refetch} />
          </div>
        ) : !service ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-sm text-muted-foreground">Service not found.</p>
          </div>
        ) : (
          <>
            {/* Scrollable body — leaves room for the sticky CTA below. */}
            <div className="flex-1 overflow-y-auto pb-4">
              <div className="px-4 pt-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-lg font-semibold text-foreground">{service.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {service.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {selectedVariant?.duration ?? service.duration}
                    </div>
                    <span className="text-xl font-bold text-primary">
                      {variants.length > 1 && (
                        <span className="mr-1 text-xs font-medium text-muted-foreground">from</span>
                      )}
                      ₹{service.price.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>

              {variants.length > 1 && (
                <VariantPicker
                  variants={variants}
                  selectedId={selectedVariant?.id}
                  onSelect={setSelectedVariantId}
                />
              )}

              <div className="px-4 pt-5">
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        KYC-verified professionals
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Every service pro on EazyServ has passed our identity + document check.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                      <LockKeyhole className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Doorstep OTP required</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Service starts only after you share a 4-digit OTP at your door.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky CTA — the sole add-to-cart affordance now. */}
            <div className="shrink-0 border-t border-border bg-card p-4">
              {inCart ? (
                <div className="flex flex-col gap-2">
                  <div className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-success/10 text-sm font-medium text-success">
                    <Check className="h-4 w-4" /> Added to your cart
                  </div>
                  <button
                    type="button"
                    onClick={handleGoToCart}
                    className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
                  >
                    Go to cart →
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
                >
                  {/* "Update" not "Add" when the service is already in the cart
                      under another variant — tapping replaces the choice, it
                      does not add a second line. */}
                  {inCartAsOtherVariant ? "Update to" : "Add to cart —"} ₹
                  {ctaPrice.toLocaleString("en-IN")}
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}
