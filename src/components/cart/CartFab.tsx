/**
 * Floating "N items · ₹X · View Cart" bar.
 *
 * Narrower in scope than it used to be. The bottom nav now carries a Cart
 * tab with a count badge, so on every route that has a nav this bar was the
 * second cart entry point on one screen. It now shows only where the nav
 * cannot: service detail, which is full-screen and is exactly where items get
 * added — see `showsCartFab`.
 *
 * Still renders nothing when the cart is empty: a persistent "View cart" with
 * zero inside is confusing negative-space signal, and the tab badge is the
 * thing that carries state now.
 */
import { Link, useLocation } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { showsCartFab } from "@/lib/nav-visibility";
import { PAGE_CTA_HEIGHT_VAR } from "@/hooks/usePageCtaHeight";
import { formatRupees } from "@/lib/currency";

export function CartFab() {
  const { totalQuantity, subtotal } = useCart();
  const location = useLocation();

  // An allow-list now, not a hide-list. The old one had to be kept in sync
  // with BottomNav's by hand and wasn't; see `nav-visibility.ts` for what that
  // drift went on to hide.
  const shouldShow = totalQuantity > 0 && showsCartFab(location.pathname);

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="cart-fab"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          // Sits above whatever occupies the bottom of the screen. The 4rem
          // fallback is the BottomNav's height, which is the case on every
          // tab route. Pages with their own taller sticky CTA publish its
          // measured height via `usePageCtaHeight` — service detail does,
          // because its CTA is ~88px or ~140px depending on whether the item
          // is already in the cart, and a fixed offset collides with one of
          // those. The adjustment still lives here, so the CTA doesn't need
          // to know the FAB exists.
          style={{ bottom: `calc(var(${PAGE_CTA_HEIGHT_VAR}, 4rem) + 0.5rem)` }}
          className="fixed left-0 right-0 z-30 mx-auto max-w-md px-4 pb-2 safe-bottom"
        >
          <Link
            to="/cart"
            className="flex items-center justify-between rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-lg"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold leading-tight">
                  {totalQuantity} {totalQuantity === 1 ? "item" : "items"}
                </p>
                <p className="text-xs text-primary-foreground/85 leading-tight">
                  {formatRupees(subtotal)}
                </p>
              </div>
            </div>
            <span className="text-sm font-semibold">View cart →</span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
