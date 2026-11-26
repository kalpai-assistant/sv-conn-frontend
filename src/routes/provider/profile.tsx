import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, MapPin, Users, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { BackButton } from "@/components/BackButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationsRow } from "@/components/NotificationsRow";
import { LanguageRow } from "@/components/language/LanguageRow";
import { useT } from "@/i18n/LanguageProvider";
import { useAuth } from "@/lib/auth-context";
import { BusinessSection } from "@/components/provider/BusinessSection";
import { ProfileHero } from "@/components/provider/ProfileHero";
import { ReferralCard } from "@/components/provider/ReferralCard";
import { ServicesPicker } from "@/components/provider/ServicesPicker";
import { useProviderProfile } from "@/hooks/useApi";
import { useTeam } from "@/hooks/useTeam";
import { displayVersion } from "@/lib/version";

export const Route = createFileRoute("/provider/profile")({
  component: ProviderProfilePage,
});

/**
 * One section of the profile. Sections make a flat list of eight rows
 * legible on a small screen: a thumb scrolling a titled block knows what
 * it's scrolling through, where a thumb scrolling an uncaptioned list only
 * knows "more rows".
 *
 * `label` is rendered as `aria-label` on the wrapping group rather than as
 * a semantic heading — the headings are visual chrome. Screen readers
 * already get the h1, the one BackButton, and each row's own labelled Link;
 * another level of heading would be noise.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6" aria-label={title}>
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

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

      {/* SVC-494: profile hero — photo + name + rating + jobs completed. The
          first thing a provider sees of themselves as the platform sees them,
          where before the screen opened on a form. Null-safe on every field;
          the pre-first-job case hides the rating cluster entirely. */}
      <ProfileHero name={user?.name} />

      {/* ── Your identity ─────────────────────────────────────────────── */}
      <Section title={t("profile.sectionIdentity")}>
        {/* The business the provider trades as, editable after onboarding
            (SVC-337). Inside the identity section rather than up top so the
            hero stays the first thing and this becomes the editable detail
            under it. Waits for the profile so it never flashes "Add your
            business name" at a provider who has one.

            BusinessSection ships with its own `mt-4` (legacy layout). The
            `[&>div]:mt-0` wrapper scrubs that so section spacing stays
            consistent — same technique used by the Phase-2 home cards. */}
        {profile && (
          <div className="[&>div]:mt-0">
            <BusinessSection profile={profile} />
          </div>
        )}
      </Section>

      {/* ── Where money and jobs go ───────────────────────────────────── */}
      <Section title={t("profile.sectionMoney")}>
        {/* Payout method summary → the SVC-148 edit screen. Shows the active
            method's label inline so the common case (checking where the money
            goes) needs no tap. */}
        <Link
          to="/provider/payout"
          className="flex items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
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

        {/* Service location (SVC-279). Sits with the payout row because both
            report *readiness* — a provider missing either one earns nothing,
            and neither failure announces itself. A missing service area is
            the quieter of the two: the dispatch geo-fence simply never
            matches them. */}
        <Link
          to="/provider/location"
          className="flex items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
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
      </Section>

      {/* ── Your work ─────────────────────────────────────────────────── */}
      <Section title={t("profile.sectionWork")}>
        {/* My Team (SVC-321). Here and not on Home: almost every SP works
            alone and never invites anyone, so it stays one tap deep. */}
        <Link
          to="/provider/team"
          className="flex items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
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

        {/* Services picker carries its own heading + list; dropping it in
            the work section groups the two things that shape "what this
            provider does" together. */}
        <ServicesPicker />
      </Section>

      {/* ── Settings ──────────────────────────────────────────────────── */}
      <Section title={t("profile.sectionSettings")}>
        {/* The only way back from a declined notification prompt. The row
            has existed since SVC-67 but was mounted solely on the consumer
            profile, and `__root.tsx` bounces a provider off every
            non-provider route — so the one persona that depends on push
            had no route to the control that restores it. Android prompts
            once; after that the OS settings were the only recovery, with
            nothing in the app saying so. */}
        <NotificationsRow />

        {/* SVC-375: the SP's language. Only while i18n_enabled — the
            wrapper too, so with the switch off the screen's spacing is
            exactly as before. */}
        {user?.i18n_enabled === true && <LanguageRow />}
      </Section>

      {/* ── Referral card ─────────────────────────────────────────────── */}
      {/* SVC-494: invite-a-friend. Backend code generator is a recommendation
          in the PR body; this ships a stable placeholder derived from the
          user id so the surface is live and the swap-in is one component
          away. */}
      <ReferralCard userId={user?.id ?? null} />

      {/* ── Account ──────────────────────────────────────────────────── */}
      <Section title={t("profile.sectionAccount")}>
        {/* Sign out (SVC-269). Bottom of the screen, matching the consumer
            profile — signing out should not be the first thing a thumb
            lands on.

            `isOnline` makes this more than a button. Nothing else clears
            `is_online` on the way out, and the booking broadcast filters on
            that flag alone, so a signed-out provider would keep being
            matched to jobs they can no longer receive. */}
        <LogoutButton isOnline={profile?.is_online ?? false} />

        {/* SVC-367. No go-offline step: the delete itself sets is_online
            false, and a refusal changes nothing. */}
        <DeleteAccountButton persona="provider" />
      </Section>

      {/* Running bundle version, same as the consumer profile. Doubles as a
          live check that the release pipeline (SVC-227.2) landed the intended
          bundle — worth having on the provider surface too, since providers
          are the ones we ask "which version are you on?" when a job goes
          missing. */}
      <p className="pb-6 pt-6 text-center text-[10px] text-muted-foreground">{versionLabel}</p>
    </div>
  );
}
