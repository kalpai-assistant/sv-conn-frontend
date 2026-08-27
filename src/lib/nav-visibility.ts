/**
 * Where the bottom nav lives, and where the cart FAB stands in for it.
 *
 * Both answers used to be written out twice — once in `BottomNav`, once in
 * `CartFab` under a comment claiming "same hide list as BottomNav". They had
 * already drifted, and the drift is what let a real bug sit unnoticed: the nav
 * painted over the cart's Book & Pay button because BottomNav's own list was
 * missing `/cart` (fixed in SVC-230, b3c6527). CartFab behaved correctly
 * throughout — but its comment asserted the two lists agreed, so nobody
 * checked whether they did. One source of truth removes the place that
 * assertion could be wrong.
 */

/**
 * Routes that render no bottom nav: full-screen flows whose own CTA owns the
 * bottom of the screen, admin, and the public legal pages a logged-out
 * visitor can land on.
 *
 * `/cart` is deliberately NOT in this list. It used to be — the nav and the
 * Book & Pay CTA are both `fixed bottom-0 z-40` and the nav renders after
 * `<Outlet/>`, so at equal z-index it painted straight over the button. Now
 * that Cart is a tab, vanishing on the screen the tab navigates to would mean
 * the tab is never seen in its own active state; the CTA is offset above the
 * nav instead.
 */
export function isBottomNavHidden(pathname: string): boolean {
  return (
    pathname.startsWith("/tracking") ||
    pathname.startsWith("/service/") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/provider/onboarding") ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/refund"
  );
}

/**
 * Where the floating cart bar shows.
 *
 * It exists to carry the cart signal where the nav's Cart tab cannot. Service
 * detail is the one browsing surface with no nav, and it is precisely where
 * items get added — a user who taps "Add" there would otherwise get no
 * confirmation that anything landed in the cart.
 *
 * Invariant: every route this returns true for must be one
 * `isBottomNavHidden` also returns true for. Showing both at once puts two
 * cart entry points on one screen, which is the redundancy the Cart tab was
 * added to remove.
 */
export function showsCartFab(pathname: string): boolean {
  return pathname.startsWith("/service/");
}
