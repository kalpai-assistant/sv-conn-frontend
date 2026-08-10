import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, LockKeyhole, Clock, ArrowLeft, Loader2, Check } from "lucide-react";
import { useServices } from "@/hooks/useApi";
import { useCart } from "@/lib/cart-context";

export const Route = createFileRoute("/service/$serviceId")({
  component: ServiceDetailPage,
});

function ServiceDetailPage() {
  const { serviceId } = Route.useParams();
  const { data: services, isLoading } = useServices();
  const service = services?.find((s) => s.id === serviceId);
  const cart = useCart();
  const navigate = useNavigate();

  const inCart = service ? cart.items.some((i) => i.serviceId === service.id) : false;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
    cart.add(service, 1);
  };

  const handleGoToCart = () => {
    navigate({ to: "/cart" });
  };

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Link
          to="/"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </Link>
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
              {service.duration}
            </div>
            <span className="text-xl font-bold text-primary">
              ₹{service.price.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>

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

      {/* Sticky bottom CTA. Two states — not yet added, and already in cart. */}
      <div className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-md border-t border-border bg-card p-4 safe-bottom">
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
            Add to cart — ₹{service.price.toLocaleString("en-IN")}
          </button>
        )}
      </div>
    </div>
  );
}
