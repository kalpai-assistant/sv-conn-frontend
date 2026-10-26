import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, MapPin, Users, WalletCards } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationsRow } from "@/components/NotificationsRow";
import { LanguageRow } from "@/components/language/LanguageRow";
import { useT } from "@/i18n/LanguageProvider";
import { useAuth } from "@/lib/auth-context";
import { BusinessSection } from "@/components/provider/BusinessSection";
import { ServicesPicker } from "@/components/provider/ServicesPicker";
import { useProviderProfile } from "@/hooks/useApi";
import { useTeam } from "@/hooks/useTeam";
import { displayVersion } from "@/lib/version";

export const Route = createFileRoute("/provider/profile")({
  component: ProviderProfilePage,
});

function ProviderProfilePage() {
  const { user } = useAuth();
  const { data: profile } = useProviderProfile();
  const { data: team } = useTeam();
  const teamSize = team?.filter((member) => !member.is_self).length ?? 0;
  const { t } = useT("provider");
  // Brand + version, the same in every language — built here rather than as
  // JSX text so the no-literal-string rule has nothing to translate (SVC-376).
  const versionLabel = `EazyServ · v${displayVersion()}`;

  return (
    <div className="min-h-screen p-6 pb-24">
      {/* The one provider screen that gains an arrow in SVC-273, because it is
          the one that stops being a tab. Reached from the Home header avatar,
          which is a normal push — so unlike Jobs and Earnings there is real
          history to pop, and BackButton returns the provider to wherever they
          actually came from. It also agrees with the hardware button, which is
          the whole point of SVC-278. */}
      <div className="flex items-center gap-3">
        <BackButton fallbackTo="/provider" />
        <h1 className="text-lg font-semibold text-foreground">{t("profile.title")}</h1>
      </div>

      {/* The business the provider trades as, editable after onboarding
          (SVC-337). First because it is who they are, before the readiness rows.
          Waits for the profile so it never flashes "Add your business name" at
          a provider who has one. */}
      {profile && <BusinessSection profile={profile} />}

      {/* Payout method summary → the SVC-148 edit screen. Shows the active method's
          label inline so the common case (checking where the money goes) needs no tap. */}
      <Link
        to="/provider/payout"
        className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <WalletCards className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("profile.payout")}</p>
            <p className="truncate text-sm text-muted-foreground">
              {profile?.payout_set
                ? (profile.payout_display ??
                  (profile.payout_method === "bank"
                    ? t("payout.onFileBank")
                    : t("payout.onFileUpi")))
                : t("profile.payoutNone")}
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
            <p className="text-sm font-medium text-foreground">{t("profile.location")}</p>
            <p className="truncate text-sm text-muted-foreground">
              {profile?.service_area_lat != null && profile?.service_area_lng != null
                ? t("profile.locationWithin", { km: profile.service_area_radius_km ?? 10 })
                : t("profile.locationNone")}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* My Team (SVC-321). Here and not on Home: almost every SP works alone
          and never invites anyone, so it stays one tap deep. */}
      <Link
        to="/provider/team"
        className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("profile.team")}</p>
            <p className="truncate text-sm text-muted-foreground">
              {teamSize > 0 ? t("profile.teamCount", { count: teamSize }) : t("profile.teamNone")}
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

      {/* SVC-375: the SP's language. Only while i18n_enabled — the wrapper too,
          so with the switch off the screen's spacing is exactly as before. */}
      {user?.i18n_enabled === true && (
        <div className="mt-4">
          <LanguageRow />
        </div>
      )}

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

      {/* SVC-367, below Logout. No go-offline step: the delete itself sets
          is_online false, and a refusal changes nothing. */}
      <div className="mt-3">
        <DeleteAccountButton persona="provider" />
      </div>

      {/* Running bundle version, same as the consumer profile. Doubles as a
          live check that the release pipeline (SVC-227.2) landed the intended
          bundle — worth having on the provider surface too, since providers are
          the ones we ask "which version are you on?" when a job goes missing. */}
      <p className="pb-6 pt-4 text-center text-[10px] text-muted-foreground">{versionLabel}</p>
    </div>
  );
}
