import { Link, useLocation } from "@tanstack/react-router";
import { Home, CalendarDays, Clock, User, IndianRupee } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const consumerTabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/bookings", icon: CalendarDays, label: "Bookings" },
  { to: "/activity", icon: Clock, label: "Activity" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

const providerTabs = [
  { to: "/provider", icon: Home, label: "Home" },
  { to: "/provider/bookings", icon: CalendarDays, label: "Bookings" },
  { to: "/provider/earnings", icon: IndianRupee, label: "Earnings" },
  { to: "/provider/profile", icon: User, label: "Profile" },
] as const;

export function BottomNav() {
  const location = useLocation();
  const { user } = useAuth();

  // Hide on auth, tracking, and service detail screens
  if (location.pathname.startsWith("/tracking") || location.pathname.startsWith("/service/")) {
    return null;
  }

  const tabs = user?.role === "provider" ? providerTabs : consumerTabs;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card safe-bottom">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around">
        {tabs.map(({ to, icon: Icon, label }) => {
          // Home routes ("/" and "/provider") match exactly; others match by prefix
          // so nested paths keep the tab active.
          const isHome = to === "/" || to === "/provider";
          const active = isHome ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
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
