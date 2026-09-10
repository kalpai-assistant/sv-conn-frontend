import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/provider/earnings")({
  component: ProviderEarningsPage,
});

/**
 * Still a stub. SVC-275 would fill it in, and is blocked on two things: the
 * backend's `/providers/me/earnings` takes only `today | week | month`, so the
 * lifetime total that ticket asks for cannot be requested at all; and this
 * page has no figure for a Home shortcut to agree with.
 *
 * No back arrow: this is a tab destination, and its tab is still in the bar.
 */
function ProviderEarningsPage() {
  return (
    <div className="min-h-screen p-6 pb-24">
      <h1 className="text-lg font-semibold text-foreground">Earnings</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
