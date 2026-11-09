/**
 * The sidebar, as data: the areas of the admin console (SVC-407) and the screens
 * under each. An entry is a placeholder until its own story lands.
 */
import {
  BadgeCheck,
  BarChart3,
  ClipboardList,
  FolderTree,
  IndianRupee,
  RotateCcw,
  ScrollText,
  Search,
  Store,
  Ticket,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { FileRoutesByTo } from "@/routeTree.gen";
import type { AdminRole } from "@/lib/auth";

export interface NavItem {
  label: string;
  to: keyof FileRoutesByTo;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  /** Who sees this section. The role table is in SVC-422. */
  roles: AdminRole[];
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Operator",
    roles: ["admin", "ops", "support"],
    items: [
      { label: "KYC", to: "/operator/kyc", icon: BadgeCheck },
      { label: "Bookings", to: "/operator/bookings", icon: ClipboardList },
      { label: "Payouts", to: "/operator/payouts", icon: Wallet },
      { label: "Pricing", to: "/operator/pricing", icon: IndianRupee },
      { label: "Coupons", to: "/operator/coupons", icon: Ticket },
      { label: "Catalog", to: "/operator/catalog", icon: FolderTree },
      { label: "Service providers", to: "/operator/sps", icon: Store },
      { label: "Pros", to: "/operator/pros", icon: Users },
      { label: "Refunds", to: "/operator/refunds", icon: RotateCcw },
    ],
  },
  {
    title: "Analytics",
    roles: ["admin", "support"],
    items: [
      { label: "Overview", to: "/analytics/overview", icon: BarChart3 },
      { label: "Supply", to: "/analytics/supply", icon: Truck },
    ],
  },
  {
    title: "Support",
    roles: ["admin", "support"],
    items: [{ label: "Lookup", to: "/support/lookup", icon: Search }],
  },
  {
    title: "Audit",
    // Admin only: ops shouldn't review their own actions (SVC-423).
    roles: ["admin"],
    items: [{ label: "Audit log", to: "/audit", icon: ScrollText }],
  },
];

export function sectionsFor(role: AdminRole): NavSection[] {
  return NAV_SECTIONS.filter((section) => section.roles.includes(role));
}

/**
 * Whether this role may open a path. Deny by default: a screen is open only if
 * the role's sidebar lists it, so a route added without a nav entry stays
 * closed. The home page is the one exception, and the redirect target for the rest.
 */
export function canOpen(role: AdminRole, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") {
    return true;
  }
  return sectionsFor(role).some((section) =>
    section.items.some((item) => path === item.to || path.startsWith(`${item.to}/`)),
  );
}
