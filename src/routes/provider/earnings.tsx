import { createFileRoute } from "@tanstack/react-router";
import { BackButton } from "@/components/BackButton";

export const Route = createFileRoute("/provider/earnings")({
  component: ProviderEarningsPage,
});

/**
 * Still a stub — and now harder to reach, because SVC-273 removed the Earnings
 * tab that was its only entry point. Nothing links here until the page is real
 * (SVC-275), but the route stays: it is a live URL that a bookmark, a stale
 * deep link, or a typed address can still land on, and a route that renders
 * nothing is worse than one that says so.
 *
 * The back arrow is why this file changed at all. Without a tab bar there was
 * no way off this screen but the hardware button, which does not exist on the
 * web build.
 */
function ProviderEarningsPage() {
  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center gap-3">
        <BackButton fallbackTo="/provider" />
        <h1 className="text-lg font-semibold text-foreground">Earnings</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
