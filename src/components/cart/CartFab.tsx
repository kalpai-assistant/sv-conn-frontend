/**
 * Floating "N items · ₹X · View Cart" bar.
 *
 * Sits at the bottom of category / service-detail screens where a user
 * might add multiple items before checking out. Renders nothing when the
 * cart is empty (a persistent "View Cart" with zero inside would be
 * confusing negative-space signal) and hides itself on the /cart page
 * itself so it doesn't stack on top of the Book & Pay CTA down there.
 */
import { Link, useLocation } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-context";

export function CartFab() {
  const { totalQuantity, subtotal } = useCart();
  const location = useLocation();

  // Same hide list as BottomNav — plus /cart itself (redundant while
  // already there) and tracking (the tracking screen has a stack of
  // status + payment CTAs; a floating "view cart" on top would fight
  // for attention with the one action the user's actually on).
  const path = location.pathname;
  const hidden =
    path === "/cart" ||
    path.startsWith("/tracking") ||
    path.startsWith("/admin") ||
    path === "/privacy" ||
    path === "/terms" ||
    path === "/refund";
  const shouldShow = totalQuantity > 0 && !hidden;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="cart-fab"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          // 4rem from the bottom on tabs where the BottomNav is visible;
          // adjustment lives on the container so the sticky primary CTA
          // on service detail doesn't need to know about the FAB.
          className="fixed bottom-16 left-0 right-0 z-30 mx-auto max-w-md px-4 pb-2 safe-bottom"
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
                  ₹{subtotal.toLocaleString("en-IN")}
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
