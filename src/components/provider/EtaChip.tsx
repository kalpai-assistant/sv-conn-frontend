/**
 * Approximate ETA chip for the provider job screen (SVC-493).
 *
 * The audit's Priority Surface 4 called for a live ETA, with a note that
 * Google Distance Matrix is a paid service and forbidden by contract §6.
 * The honest alternative: a straight-line distance divided by an
 * assumed-average urban speed, labelled `approx` so the provider is never
 * misled into treating this as a routing engine.
 *
 * Failure mode this component locks:
 *   - a provider sees a precise-looking ETA with no "approx" qualifier and
 *     commits to an arrival time they then miss. The chip's prefix
 *     (`etaApproxLabel`) + the tilde (`~`) in `etaApprox` together say
 *     "guess", not "promise".
 *
 * `distanceKm` may be undefined if the backend hasn't supplied a straight-
 * line distance yet (older offers pre-SVC-396 went without it). In that
 * case we render a neutral unavailable state rather than a fake `0`.
 */
import { Clock } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

/**
 * Urban-average assumption used to convert km → minutes. 30 kmh is what
 * Rapido / Dunzo / UC Partner's own ETA engines hover around for
 * motorbike + two-wheeler mixed traffic in Bangalore/Pune. Not a routing
 * figure — see the comment at the top on why we're honest about this.
 */
const AVG_URBAN_KMH = 30;

export function EtaChip({ distanceKm }: { distanceKm: number | null | undefined }) {
  const { t } = useT("provider");

  if (distanceKm == null || distanceKm < 0) {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        {t("jobDetail.etaUnavailable")}
      </span>
    );
  }

  // Minimum 1 min: 0 min reads as "already here" and confuses the
  // en-route chip the provider is still looking at. Math.ceil also
  // keeps the pessimistic-by-default posture.
  const minutes = Math.max(1, Math.ceil((distanceKm / AVG_URBAN_KMH) * 60));

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary dark:bg-primary/20"
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">{t("jobDetail.etaApproxLabel")}: </span>
      {t("jobDetail.etaApprox", { minutes })}
    </span>
  );
}
