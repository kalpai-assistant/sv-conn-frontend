/**
 * What a team Pro is told when they decline a job (SVC-322), for
 * `DeclineProJob`. Kept apart from the component so it can be tested alone.
 */
import { ApiError } from "@/lib/api";
import type { DeclineJobResult } from "@/hooks/usePro";
import { englishT, type Translate } from "@/i18n";
import { errorText } from "@/i18n/errors";
import type { AppLanguage } from "@/i18n/languages";

/** What the Pro is told once the decline lands, by where the job went. */
export function declinedMessage(
  outcome: DeclineJobResult["outcome"],
  t: Translate = englishT("pro"),
): string {
  return outcome === "awaiting_repick" ? t("decline.repick") : t("decline.reopened");
}

/** Why a decline failed, in words a Pro can act on. */
export function declineErrorMessage(
  err: unknown,
  t: Translate = englishT("pro"),
  lang: AppLanguage = "en",
): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return t("decline.enRoute");
    if (err.status === 404) return t("decline.gone");
  }
  return errorText(err, t("decline.failed"), lang);
}
