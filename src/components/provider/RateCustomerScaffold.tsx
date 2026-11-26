/**
 * Rate-the-customer scaffold on the COMPLETED provider job screen
 * (SVC-493, frontend-only; backend endpoint does not exist).
 *
 * The audit called for a UC-Partner-style "rate the customer" step on
 * the completion overlay. Backend has no `POST /provider/bookings/:id
 * /customer-rating` today; filing a backend PR into one of Tushar's
 * owned epics (SVC-406/407) is off-limits by shared contract §4.
 *
 * So this is a frontend-visible scaffold: the star widget works, the
 * note textarea works, and Submit is disabled with a "Coming soon"
 * note. Deliberately NOT stored to localStorage — a draft that never
 * submits is worse than no draft at all (the provider thinks they
 * submitted and the customer never gets the rating).
 *
 * Recommendation to backend owner (PR body only, not a cross-repo PR):
 *   - `POST /api/v1/provider/bookings/{id}/customer-rating`
 *     body: `{ stars: 1..5, note?: string (<=500 chars) }`
 *     returns: 204 No Content; idempotent per booking id (one rating
 *     per booking per rating direction). Side-effect: surfaces on the
 *     consumer's profile aggregate, not visible back to the consumer
 *     for this booking.
 *
 * Failure modes locked by this component:
 *   - star state leaks across bookings: resets on bookingId change.
 *   - note exceeds backend field length: a `maxLength={500}` on the
 *     textarea is the input-layer guard. If the backend ever ships
 *     with a smaller limit, tighten here.
 *   - Submit button is enabled without a star selection: disabled
 *     when `stars === 0` AND the "Coming soon" note is visible so a
 *     user who clicked stars still sees why nothing happens.
 */
import { useId, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LanguageProvider";

const MAX_NOTE_CHARS = 500;

export function RateCustomerScaffold({ bookingId }: { bookingId: string }) {
  const { t } = useT("provider");
  const titleId = useId();
  // Scope state to this booking id — the host passes `key={bookingId}`
  // on the overlay host so a navigation to a different completed job
  // starts from zero stars rather than inheriting the last customer's
  // rating. useState defaults suffice.
  const [stars, setStars] = useState<number>(0);
  const [note, setNote] = useState<string>("");
  void bookingId; // documented as the remount key; read by the host.

  return (
    <div
      className="mt-4 rounded-xl border border-border bg-card p-4"
      role="group"
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="text-sm font-semibold text-foreground">
        {t("jobDetail.rateCustomerTitle")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("jobDetail.rateCustomerHint")}</p>

      <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-labelledby={titleId}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= stars;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={t("jobDetail.rateCustomerStarLabel", { stars: n })}
              onClick={() => setStars(n)}
              className="rounded-md p-1 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Star
                className={
                  filled ? "h-6 w-6 fill-primary text-primary" : "h-6 w-6 text-muted-foreground"
                }
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      <label className="mt-3 block">
        <span className="sr-only">{t("jobDetail.rateCustomerNotePlaceholder")}</span>
        <textarea
          className="mt-1 w-full resize-none rounded-lg border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          placeholder={t("jobDetail.rateCustomerNotePlaceholder")}
          rows={2}
          maxLength={MAX_NOTE_CHARS}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <Button
        type="button"
        disabled
        aria-disabled="true"
        className="mt-3 w-full"
        /* onClick intentionally omitted: submit endpoint doesn't exist.
           A tap on a disabled button is a no-op and the "Coming soon"
           line below explains why. */
      >
        {t("jobDetail.rateCustomerSubmit")}
      </Button>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("jobDetail.rateCustomerComingSoon")}
      </p>
    </div>
  );
}
