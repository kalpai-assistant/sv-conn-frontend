/**
 * The admin surface's routing rules, kept out of `__root.tsx` so they can be
 * tested without driving auth state, the router and the restore probe.
 */

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
