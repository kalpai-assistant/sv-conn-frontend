import { createFileRoute } from "@tanstack/react-router";
import { AccountAvatar } from "@/components/AccountAvatar";
import { useAuth } from "@/lib/auth-context";

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
  // Only for the header avatar's initials.
  const { user } = useAuth();

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">Earnings</h1>
        {/* Present even on a stub screen: Profile left the tab bar, so an
            absent avatar here would strand a provider who landed on this tab. */}
        <AccountAvatar to="/provider/profile" name={user?.name} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
