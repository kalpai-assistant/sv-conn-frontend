import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, MapPin, WalletCards } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationsRow } from "@/components/NotificationsRow";
import { ServicesPicker } from "@/components/provider/ServicesPicker";
import { useProviderProfile } from "@/hooks/useApi";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/provider/profile")({
  component: ProviderProfilePage,
});

function ProviderProfilePage() {
  const { data: profile } = useProviderProfile();

  return (
    <div className="min-h-screen p-6">
      {/* SVC-273: the tab bar was the way back until it was removed, so every
          provider screen below Home needs its own arrow. BackButton follows
          history and agrees with the hardware button — see SVC-278 for why
          two back affordances must not disagree. */}
      <div className="flex items-center gap-3">
        <BackButton fallbackTo="/provider" />
        <h1 className="text-lg font-semibold text-foreground">Provider Profile</h1>
      </div>

      {/* Payout method summary → the SVC-148 edit screen. Shows the active method's
          label inline so the common case (checking where the money goes) needs no tap. */}
      <Link
        to="/provider/payout"
        className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <WalletCards className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Payout method</p>
            <p className="truncate text-sm text-muted-foreground">
              {profile?.payout_set
                ? (profile.payout_display ??
                  (profile.payout_method === "bank" ? "Bank account on file" : "UPI ID on file"))
                : "Not set up yet"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* Service location (SVC-279). Sits with the payout row rather than in the
          list below because both report *readiness* — a provider missing either
          one earns nothing, and neither failure announces itself. A missing
          service area is the quieter of the two: the dispatch geo-fence simply
          never matches them. */}
      <Link
        to="/provider/location"
        className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Service location</p>
            <p className="truncate text-sm text-muted-foreground">
              {profile?.service_area_lat != null && profile?.service_area_lng != null
                ? `Within ${profile.service_area_radius_km ?? 10} km of your centre`
                : "Not set — you won't receive jobs"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* The only way back from a declined notification prompt.
          
          This row has existed since SVC-67 but was mounted solely on the
          consumer profile, and `__root.tsx` bounces a provider off every
          non-provider route — so the one persona that depends on push had no
          route to the control that restores it. Android prompts once; after
          that the OS settings were the only recovery, with nothing in the app
          saying so.
          
          Placed above the services list because it reports readiness, like the
          payout row above it, rather than being something to browse. */}
      <div className="mt-4">
        <NotificationsRow />
      </div>

      <ServicesPicker />

      {/* Sign out (SVC-269). Providers had no way to do this at all: the button
          was consumer-only and `__root.tsx` bounces them off that route.

          Bottom of the screen, matching the consumer profile — it is a long
          scroll past the services list, but signing out should not be the first
          thing a thumb lands on.

          `isOnline` makes this more than a button. Nothing else clears
          `is_online` on the way out, and the booking broadcast filters on that
          flag alone, so a signed-out provider would keep being matched to jobs
          they can no longer receive. */}
      <div className="mt-8">
        <LogoutButton isOnline={profile?.is_online ?? false} />
      </div>

      {/* Running bundle version, same as the consumer profile. Doubles as a
          live check that the release pipeline (SVC-227.2) landed the intended
          bundle — worth having on the provider surface too, since providers are
          the ones we ask "which version are you on?" when a job goes missing. */}
      <p className="pb-6 pt-4 text-center text-[10px] text-muted-foreground">
        EazyServ · v{APP_VERSION}
      </p>
    </div>
  );
}
