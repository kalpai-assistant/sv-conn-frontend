/**
 * Blinkit / Zomato-style quick-add control on a service card.
 *
 * Zero-state: a single "+" pill. Tap adds one of the default variant to the
 * cart, matching what `cart.add(service)` does when called with no variant
 * — the service's first variant, which is what the backend would have
 * fallen back to anyway (SVC-232). Users who want a specific variant open
 * the service sheet, which is the tap-on-card path.
 *
 * In-cart state: a horizontal stepper — [-] [n] [+] — driven by
 * `updateQuantity`. Decrement past 1 removes the line entirely, same shape
 * as `updateQuantity`'s own semantics.
 *
 * Sits inside a clickable parent (a ServiceCard row that opens the service
 * sheet on tap). Every button here stops event propagation so tapping the
 * control does not also open the sheet — the two hit targets deliberately
 * do different things, as they do in Blinkit / Zomato.
 *
 * The control renders nothing when the service has no active variants: a
 * catalogue row without a variant cannot be added (see `cart.add` which
 * falls through to `undefined` in that case), so an ADD button would be a
 * button that appears to work and silently doesn't.
 */
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import type { Service } from "@/lib/mock-data";

interface QuickAddButtonProps {
  service: Service;
  /** Compact removes the "ADD" label from the zero-state so the control
   *  fits inside a small rail card. Off by default. */
  compact?: boolean;
}

export function QuickAddButton({ service, compact = false }: QuickAddButtonProps) {
  const cart = useCart();

  if (service.variants.length === 0) return null;

  const line = cart.items.find((i) => i.serviceId === service.id);
  const qty = line?.quantity ?? 0;

  const handleAdd = (event: React.MouseEvent) => {
    // The card wrapping this control opens the service sheet on tap — the
    // control does something different, so it must not also fire the card's
    // handler.
    event.stopPropagation();
    event.preventDefault();
    cart.add(service, 1);
  };

  const handleDecrement = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    cart.updateQuantity(service.id, qty - 1);
  };

  const handleIncrement = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    cart.updateQuantity(service.id, qty + 1);
  };

  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={handleAdd}
        aria-label={`Add ${service.name} to cart`}
        className={`flex items-center justify-center gap-1 rounded-lg border border-primary bg-primary/5 font-semibold text-primary transition-colors hover:bg-primary/10 ${
          compact ? "h-8 w-8" : "h-8 px-3 text-xs"
        }`}
      >
        {compact ? (
          <Plus className="h-4 w-4" />
        ) : (
          <>
            ADD
            <Plus className="h-3.5 w-3.5" />
          </>
        )}
      </button>
    );
  }

  return (
    <div
      // Fixed width so incrementing 1→10 doesn't jitter the surrounding
      // layout on rails where every pixel of width is fought over.
      className={`flex h-8 items-center justify-between rounded-lg bg-primary text-primary-foreground ${
        compact ? "w-20" : "w-24"
      }`}
    >
      <button
        type="button"
        onClick={handleDecrement}
        aria-label={qty === 1 ? `Remove ${service.name} from cart` : `Decrease quantity`}
        className="flex h-full w-8 items-center justify-center rounded-l-lg hover:bg-primary/85"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="text-sm font-semibold tabular-nums">{qty}</span>
      <button
        type="button"
        onClick={handleIncrement}
        aria-label={`Increase quantity`}
        className="flex h-full w-8 items-center justify-center rounded-r-lg hover:bg-primary/85"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
