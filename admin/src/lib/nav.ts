/**
 * The sidebar, as data: the three areas of the admin console (SVC-407) and the
 * screens under each. Every entry is a placeholder until its own story lands.
 */
import {
  BadgeCheck,
  BarChart3,
  FolderTree,
  IndianRupee,
  RotateCcw,
  Search,
  Ticket,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FileRoutesByTo } from "@/routeTree.gen";

export interface NavItem {
  label: string;
  to: keyof FileRoutesByTo;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Operator",
    items: [
      { label: "KYC", to: "/operator/kyc", icon: BadgeCheck },
      { label: "Pricing", to: "/operator/pricing", icon: IndianRupee },
      { label: "Coupons", to: "/operator/coupons", icon: Ticket },
      { label: "Catalog", to: "/operator/catalog", icon: FolderTree },
      { label: "Teams", to: "/operator/teams", icon: Users },
      { label: "Refunds", to: "/operator/refunds", icon: RotateCcw },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Overview", to: "/analytics/overview", icon: BarChart3 },
      { label: "Supply", to: "/analytics/supply", icon: Truck },
    ],
  },
  {
    title: "Support",
    items: [{ label: "Lookup", to: "/support/lookup", icon: Search }],
  },
];
