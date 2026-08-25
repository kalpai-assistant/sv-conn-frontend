import { Link, useLocation } from "@tanstack/react-router";
import { Home, CalendarDays, Clock, User, IndianRupee } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

// Two tab sets — the app is single-APK, role-gated (SVC-41). Consumer sees
// home / bookings / activity / profile; provider sees home / jobs /
// earnings / profile. Selected in the render based on user.role.
const consumerTabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/bookings", icon: CalendarDays, label: "Bookings" },
  { to: "/activity", icon: Clock, label: "Activity" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

const providerTabs = [
  { to: "/provider", icon: Home, label: "Home" },
  { to: "/provider/bookings", icon: CalendarDays, label: "Jobs" },
  { to: "/provider/earnings", icon: IndianRupee, label: "Earnings" },
  { to: "/provider/profile", icon: User, label: "Profile" },
] as const;

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();

  // Hide on auth, cart, tracking, service detail, admin, and public legal pages.
  //
  // /cart matters for more than tidiness: the cart's "Book & Pay" CTA is also
  // fixed bottom-0 z-40, and this nav renders after <Outlet /> in __root, so at
  // equal z-index it painted straight over the button. CartFab already assumed
  // /cart was in this list ("redundant while already there") — it wasn't.
  //
  // Provider onboarding also hides the nav — that route is a full-screen
  // wizard, tabs would compete for attention.
  if (
    location.pathname === "/cart" ||
    location.pathname.startsWith("/tracking") ||
    location.pathname.startsWith("/service/") ||
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/provider/onboarding") ||
    location.pathname === "/privacy" ||
    location.pathname === "/terms" ||
    location.pathname === "/refund"
  ) {
    return null;
  }

  const tabs = user?.role === "provider" ? providerTabs : consumerTabs;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {tabs.map(({ to, icon: Icon, label }) => {
          // "/" and "/provider" are both home-tab roots — match them
          // exactly so nested paths don't keep the Home tab lit while
          // the user is on e.g. /provider/bookings/xyz. Non-home tabs
          // match by prefix.
          const isHome = to === "/" || to === "/provider";
          const active = isHome ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              // Tabs are lateral movement, not depth. Pushing let Home↔Bookings
              // taps stack up, so back walked the pile and read as a two-page
              // loop (SVC-230).
              replace
              className={`flex flex-col items-center gap-1 px-3 py-1 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
