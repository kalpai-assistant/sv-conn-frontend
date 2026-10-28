import { Link, useLocation } from "@tanstack/react-router";
import { Home, CalendarDays, Clock, User, IndianRupee, ShoppingCart } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { isBottomNavHidden, isProRoute } from "@/lib/nav-visibility";
import { useT } from "@/i18n/LanguageProvider";

// Two tab sets — the app is single-APK, role-gated (SVC-41). Selected in the
// render based on user.role. Cart is a consumer tab only; providers have no
// cart.
//
// Neither set carries Profile any more (SVC-273). It moved to the account
// avatar in each role's header — the Blinkit / Zepto pattern, where the bar
// holds the destinations people move between and the account sits apart in
// the corner. It was the least-visited entry in both sets while occupying a
// full slot of the most valuable area on the screen.
const consumerTabs = [
  { to: "/", icon: Home, label: "nav.home" },
  { to: "/bookings", icon: CalendarDays, label: "nav.bookings" },
  { to: "/cart", icon: ShoppingCart, label: "nav.cart" },
  { to: "/activity", icon: Clock, label: "nav.activity" },
] as const;

const providerTabs = [
  { to: "/provider", icon: Home, label: "nav.home" },
  { to: "/provider/bookings", icon: CalendarDays, label: "nav.jobs" },
  { to: "/provider/earnings", icon: IndianRupee, label: "nav.earnings" },
] as const;

// The Pro app (SVC-322). Chosen by route, not role: a Pro's role is consumer,
// and the same person gets the consumer tabs when they step out to book a
// service. No earnings tab — a team Pro's pay goes to their SP.
const proTabs = [
  { to: "/pro", icon: Home, label: "nav.home" },
  { to: "/pro/jobs", icon: CalendarDays, label: "nav.jobs" },
] as const;

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();
  // Safe for providers too: BottomNav renders inside CartProvider, and a
  // provider's cart is simply always empty.
  const { totalQuantity } = useCart();
  // SVC-375: in the route's language — English everywhere but provider and
  // Pro screens, so the consumer tabs never change.
  const { t } = useT();

  // Which routes have no nav lives in one shared module — see the drift
  // history in `nav-visibility.ts`.
  if (isBottomNavHidden(location.pathname)) {
    return null;
  }

  const tabs =
    user?.role === "provider"
      ? providerTabs
      : isProRoute(location.pathname)
        ? proTabs
        : consumerTabs;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {tabs.map(({ to, icon: Icon, label: labelKey }) => {
          const label = t(labelKey);
          // "/" and "/provider" are both home-tab roots — match them
          // exactly so nested paths don't keep the Home tab lit while
          // the user is on e.g. /provider/bookings/xyz. Non-home tabs
          // match by prefix.
          const isHome = to === "/" || to === "/provider" || to === "/pro";
          const active = isHome ? location.pathname === to : location.pathname.startsWith(to);
          const cartCount = to === "/cart" ? totalQuantity : 0;
          return (
            <Link
              key={to}
              to={to}
              // Tabs are lateral movement, not depth. Pushing let Home↔Bookings
              // taps stack up, so back walked the pile and read as a two-page
              // loop (SVC-230).
              replace
              className={`relative flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              aria-label={
                cartCount > 0 ? t("nav.withItems", { label, count: cartCount }) : undefined
              }
            >
              {/* SVC-391: animated active indicator. One `layoutId` for the
                  whole bar — framer-motion slides the pill from the previous
                  active tab to the new one, which reads as the active state
                  moving rather than snapping. */}
              {active && (
                <motion.span
                  layoutId="bottom-nav-active"
                  aria-hidden="true"
                  className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {cartCount > 0 && (
                  // Count, not a bare dot: "how many" is the question a user
                  // actually has, and the badge is the only cart signal on the
                  // tab routes now that CartFab has stepped back to /service/*.
                  // Capped so a runaway quantity can't widen the tab and shove
                  // its neighbours out of line.
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground"
                  >
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
