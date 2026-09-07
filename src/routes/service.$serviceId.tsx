import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, LockKeyhole, Clock, Loader2, Check } from "lucide-react";
import { useServices } from "@/hooks/useApi";
import { ErrorState } from "@/components/ErrorState";
import { usePageCtaHeight } from "@/hooks/usePageCtaHeight";
import { useCart } from "@/lib/cart-context";
import { VariantPicker } from "@/components/service/VariantPicker";
import { BackButton } from "@/components/BackButton";

export const Route = createFileRoute("/service/$serviceId")({
  component: ServiceDetailPage,
});

function ServiceDetailPage() {
  const { serviceId } = Route.useParams();
  const { data: services, isLoading, isError, refetch } = useServices();
  const service = services?.find((s) => s.id === serviceId);
  const cart = useCart();
  const navigate = useNavigate();

  // Undefined until the catalogue resolves, then defaulted to the first
  // variant below. Deliberately not seeded from `service` in an effect: the
  // service arrives asynchronously, and a null-selection render would flash
  // the CTA with no price.
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);

  // This page's sticky CTA is taller than the BottomNav it replaces, and
  // changes height between its two states. Publishing the measured height
  // keeps CartFab clear of it in both.
  const ctaRef = usePageCtaHeight<HTMLDivElement>();

  const variants = service?.variants ?? [];
  // Default to the first variant, matching the backend's own fallback — so a
  // user who never touches the picker gets exactly what they were getting
  // before, at the price the page is showing them.
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? variants[0];

  // A booking can hold only one row per service (uix_booking_item_service),
  // so the cart holds at most one line for this service. Three CTA states:
  // not added, added with THIS variant, added with a DIFFERENT one.
  const cartLine = service ? cart.items.find((i) => i.serviceId === service.id) : undefined;
  const inCart = !!cartLine && cartLine.variantId === selectedVariant?.id;
  const inCartAsOtherVariant = !!cartLine && cartLine.variantId !== selectedVariant?.id;

  // Price the CTA from the selection; fall back to the service's headline for
  // a service the catalogue hasn't given variants yet.
  const ctaPrice = selectedVariant?.price ?? service?.price ?? 0;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Ahead of the not-found branch: a failed catalogue request leaves
  // `services` undefined, the lookup misses, and the user is told the service
  // does not exist — a 500 reported as a 404.
  if (isError) {
    return <ErrorState message="Couldn't load this service." onRetry={refetch} fullScreen />;
  }

  if (!service) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Service not found</p>
          <Link to="/" className="mt-2 text-sm font-medium text-primary">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const handleAddToCart = () => {
    cart.add(service, 1, selectedVariant?.id);
  };

  const handleGoToCart = () => {
    navigate({ to: "/cart" });
  };

  return (
    // Bottom padding tracks the CTA rather than guessing it. `pb-32` (128px)
    // was already short of the CTA's tall state (140px), and CartFab now
    // floats above the CTA rather than behind it, so the page has to clear
    // both: CTA height + the FAB (3.5rem) + its 0.5rem gap + breathing room.
    // Without this the last variant card can never be scrolled into view.
    <div
      className="min-h-screen"
      style={{ paddingBottom: "calc(var(--page-cta-height, 4rem) + 4.5rem)" }}
    >
      {/* Header */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        {/* Home only when this page was opened cold — from a category listing,
            back belongs on that listing. See BackButton. */}
        <BackButton fallbackTo="/" />
        <h1 className="truncate text-base font-semibold text-foreground">{service.name}</h1>
      </div>

      {/* Service body */}
      <div className="px-4 pt-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground">{service.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {service.description}
          </p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {selectedVariant?.duration ?? service.duration}
            </div>
            <span className="text-xl font-bold text-primary">
              {/* "from" only where there is a genuine choice — on a
                  single-variant service the price is simply the price. */}
              {variants.length > 1 && (
                <span className="mr-1 text-xs font-medium text-muted-foreground">from</span>
              )}
              ₹{service.price.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>

      {/* Variant picker. Only meaningful with a real choice: a service with a
          single variant shows its price inline above and needs no picker. */}
      {variants.length > 1 && (
        <VariantPicker
          variants={variants}
          selectedId={selectedVariant?.id}
          onSelect={setSelectedVariantId}
        />
      )}

      {/* Honest trust statements. Refer WIREFRAMES.md social-proof rule:
          no fabricated ratings or aggregate counts; only claims the
          platform can back. */}
      <div className="px-4 pt-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">KYC-verified professionals</p>
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

      {/* Sticky bottom CTA. Two states — not yet added, and already in cart.
          The ref publishes this container's height so CartFab can float
          above it; the two states differ by ~50px. */}
      <div
        ref={ctaRef}
        className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-md border-t border-border bg-card p-4 safe-bottom"
      >
        {inCart ? (
          <div className="flex flex-col gap-2">
            <div className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-success/10 text-sm font-medium text-success">
              <Check className="h-4 w-4" /> Added to your cart
            </div>
            <button
              onClick={handleGoToCart}
              className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
            >
              Go to cart →
            </button>
          </div>
        ) : (
          <button
            onClick={handleAddToCart}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
          >
            {/* Say "Update" rather than "Add" when this service is already in
                the cart under another option — tapping replaces the choice,
                it does not add a second line, and the label should not
                promise otherwise. */}
            {inCartAsOtherVariant ? "Update to" : "Add to cart —"} ₹
            {ctaPrice.toLocaleString("en-IN")}
          </button>
        )}
      </div>
    </div>
  );
}
