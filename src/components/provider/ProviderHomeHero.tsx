/**
 * Hero at the top of Provider Home (SVC-491, Phase 2 of SVC-378).
 *
 * The pre-Phase-2 header was "Provider Home" + an avatar — the title of the
 * screen the provider is already on. That is the wrong first thing to see
 * 15× a day. UC Partner (and Rapido Captain) both open with the day's
 * numbers as the hero — earnings and jobs — so the app reads as "the app
 * knows me" rather than "the app knows itself".
 *
 * ## What this shows, and what it does not
 *
 * - **Greeting + name + avatar**: who they are to us. The avatar keeps its
 *   SVC-273 role as the one path to Profile now that it left the tab bar.
 * - **Lifetime earned (₹)**: the single most motivating number a provider
 *   has. Pulls from `useEarningsSummary` (same key as the Earnings tab, so
 *   the two cannot drift — SVC-275 AC3).
 * - **Jobs completed (count)**: the second most motivating number; also
 *   gates the streak sentence below.
 * - **Streak sentence**: "N jobs done — nice run" when there's any history;
 *   "your first job is coming" for a brand-new provider. Deliberately no
 *   day-based streak ("3 days online") until the backend ships a field
 *   that supports it — faking a streak with client-side storage is
 *   exactly the dishonesty the Phase-1 placeholder-earnings decision
 *   avoids.
 *
 * ## What it does NOT show (and why)
 *
 * - **Today's earnings**: no backend field for same-day totals today, and
 *   filtering `bookings` client-side would double-count across pagination
 *   caps. Lifetime is the honest hero number until a dedicated endpoint
 *   lands. Flagged as a follow-up in Phase 5 (SVC-494) earnings scope.
 * - **Day-of-week target progress**: requires a target-setting UX we don't
 *   have yet. Also a Phase 5 follow-up.
 */
import { AccountAvatar } from "@/components/AccountAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupees } from "@/i18n/format";
import { useT } from "@/i18n/LanguageProvider";
import { useEarningsSummary } from "@/hooks/useApi";

interface ProviderHomeHeroProps {
  name?: string | null;
  photoUrl?: string | null;
}

export function ProviderHomeHero({ name, photoUrl }: ProviderHomeHeroProps) {
  const { t, lang } = useT("provider");
  // `useEarningsSummary` is already cached on first mount via the Earnings
  // tab's own query key — this call dedupes into the same request.
  const { data, isLoading, isError } = useEarningsSummary();

  const lifetime = data?.lifetime_payout ?? 0;
  const completed = data?.completed_count ?? 0;

  return (
    <section className="mt-2" aria-label={t("hero.sectionLabel")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("hero.greeting")}
          </p>
          <h1 className="mt-1 truncate text-2xl font-semibold text-foreground">
            {name || t("hero.fallbackName")}
          </h1>
        </div>
        <AccountAvatar to="/provider/profile" name={name} photoUrl={photoUrl} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatCard
          label={t("hero.lifetimeLabel")}
          value={isLoading ? null : isError ? t("hero.statError") : formatRupees(lifetime, lang)}
        />
        <StatCard
          label={t("hero.jobsLabel")}
          value={isLoading ? null : isError ? t("hero.statError") : String(completed)}
        />
      </div>

      {/* Streak line. Only when a provider has completed at least one job
          — a bare "your first job is coming" for a fresh provider still
          reads as warmer than blank space, but the sentence changes shape
          so the two cases don't look like the same message. Hidden on
          error so a failed fetch can't lie about history. */}
      {!isLoading && !isError && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {completed > 0
            ? t("hero.streakWithJobs", { count: completed })
            : t("hero.firstJobComing")}
        </p>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {value === null ? (
        <Skeleton className="mt-1.5 h-6 w-20" />
      ) : (
        <p className="mt-1 truncate text-lg font-bold tabular-nums text-foreground">{value}</p>
      )}
    </div>
  );
}
