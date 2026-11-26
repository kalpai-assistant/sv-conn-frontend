/**
 * Profile hero (SVC-494, Phase 5 of SVC-378).
 *
 * The pre-Phase-5 `/provider/profile` opened cold on the Business section —
 * a form the provider edits, not an image of who they are to the platform.
 * UC Partner's Profile opens with the one view a provider sees of themselves
 * as the platform sees them: photo, name, rating, jobs completed.
 *
 * ## What this shows, and what it does not
 *
 * - **Photo**: pulled from `useProviderProfile().profile_photo_url`. Falls
 *   back to initials (same `initialsFrom` the `AccountAvatar` uses) so an
 *   unphoto'd provider doesn't see a broken `<img>`.
 * - **Name**: `user.name` from the caller — same source the home hero reads,
 *   so a mid-session rename never leaves the two screens disagreeing.
 * - **Rating**: `profile.avg_rating` to one decimal, with `heroRatingNone`
 *   when a brand-new provider has zero of each. Zero rating with zero jobs
 *   is pre-first-job, not a real zero — showing "0.0 ★" there would read
 *   as a bad score.
 * - **Jobs completed**: `profile.total_completed_jobs` via the plural
 *   `heroJobs` key.
 *
 * ## What it does NOT show (and why)
 *
 * - **"Serving since <date>"** (requested by the audit) — the frontend
 *   `ProviderProfile` and the backend `ProviderResponse` have **no
 *   `created_at`**. Backend work owns the join-date field; filed as a
 *   recommendation in the PR body. Hero ships without rather than faking.
 */
import { Star, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/LanguageProvider";
import { useProviderProfile } from "@/hooks/useApi";
import { initialsFrom } from "@/lib/initials";

interface ProfileHeroProps {
  name?: string | null;
}

export function ProfileHero({ name }: ProfileHeroProps) {
  const { t } = useT("provider");
  const { data: profile, isLoading } = useProviderProfile();

  const displayName = name && name.trim() ? name : t("profile.heroNameFallback");
  const initials = initialsFrom(displayName);
  const rating = profile?.avg_rating ?? 0;
  const completed = profile?.total_completed_jobs ?? 0;
  // A brand-new provider hasn't been rated yet. Zero/zero would paint
  // "0.0 ★" and read as a bad score rather than no score. The rating
  // cluster hides until there's a real signal.
  const hasRating = rating > 0 || completed > 0;

  return (
    <section
      data-testid="profile-hero"
      className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-card p-5"
      aria-label={t("profile.title")}
    >
      {isLoading ? (
        <>
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-40" />
          </div>
        </>
      ) : (
        <>
          <Avatar className="h-16 w-16 shrink-0 border border-border">
            {/* Radix swaps in the fallback only once the image errors or is
                absent, so a slow photo shows initials rather than a blank
                hole. Same pattern as `AccountAvatar`. */}
            {profile?.profile_photo_url && (
              <AvatarImage src={profile.profile_photo_url} alt={t("profile.heroAvatarAlt")} />
            )}
            <AvatarFallback className="bg-secondary text-lg font-semibold text-foreground">
              {initials ?? <UserIcon className="h-6 w-6 text-muted-foreground" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-lg font-semibold text-foreground"
              data-testid="profile-hero-name"
            >
              {displayName}
            </p>
            {hasRating ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                {/* Amber star in light, lighter amber in dark so the icon
                    stays recognisable on both grounds. Pattern established
                    in `IncomingRequestCard` and `PayoutSummary`. */}
                <span
                  className="inline-flex items-center gap-1 text-foreground"
                  data-testid="profile-hero-rating"
                >
                  <Star
                    className="h-4 w-4 fill-amber-400 text-amber-500 dark:fill-amber-300 dark:text-amber-300"
                    aria-hidden="true"
                  />
                  <span className="font-semibold tabular-nums">{rating.toFixed(1)}</span>
                </span>
                <span className="text-muted-foreground" data-testid="profile-hero-jobs">
                  {t("profile.heroJobs", { count: completed })}
                </span>
              </div>
            ) : (
              <p
                className="mt-1 text-sm text-muted-foreground"
                data-testid="profile-hero-rating-none"
              >
                {t("profile.heroRatingNone")}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
