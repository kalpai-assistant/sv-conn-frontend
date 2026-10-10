/**
 * The admin surface's routing rules, kept out of `__root.tsx` so they can be
 * tested without driving auth state, the router and the restore probe.
 */
import { z } from "zod";

/** Every admin page, in menu order. /admin/login is deliberately absent. */
export const ADMIN_MENU_ITEMS = [
  { to: "/admin/bookings", label: "Bookings" },
  { to: "/admin/kyc", label: "KYC" },
  { to: "/admin/payouts", label: "Payouts" },
  { to: "/admin/teams", label: "Teams" },
] as const;

export type AdminGateVerdict =
  /** /admin/login for someone who isn't a signed-in admin: show the login. */
  | "login-page"
  /** /admin/login for a signed-in admin: skip it, go to /admin/kyc. */
  | "to-kyc"
  /** Any other /admin/* route for anyone but a signed-in admin. */
  | "to-login"
  /** Not an admin decision: the rest of AppGate applies. */
  | "pass";

/**
 * SVC-345's admin branches of AppGate. Applies to every /admin/* route by
 * prefix, so a new admin page is guarded without being listed anywhere.
 */
export function adminGate(
  pathname: string,
  isAuthenticated: boolean,
  role: string | null,
): AdminGateVerdict {
  const isAdmin = isAuthenticated && role === "admin";
  if (pathname === "/admin/login") return isAdmin ? "to-kyc" : "login-page";
  if (pathname.startsWith("/admin") && !isAdmin) return "to-login";
  return "pass";
}

/**
 * `?booking=<id>` opens that booking's sheet on load (SVC-329), so another
 * admin page (e.g. a Pro's active-job refusal on /admin/teams) can link
 * straight to it. Anything that isn't a UUID is dropped rather than erroring
 * the page: it's a link, and a bad one should land on the plain list.
 */
export const bookingsSearchSchema = z.object({
  booking: z.string().uuid().optional().catch(undefined),
});
