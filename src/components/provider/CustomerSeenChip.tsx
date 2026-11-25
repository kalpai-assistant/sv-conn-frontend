/**
 * "Customer saw your ETA Xm ago" read-receipt chip (SVC-493).
 *
 * The audit called for a reciprocal trust signal — the consumer tracks
 * the provider live (see `frontend_integration_guide.md`), so the
 * provider ought to see when the consumer last opened the live map.
 * That read-receipt field does not exist on the backend today; this
 * component is the frontend half, written null-safe so it renders
 * nothing until the backend lands the timestamp.
 *
 * Deferred backend work (recommendation only in the PR body — Tushar's
 * hands-off epics SVC-406/407 cover the booking dispatch surface):
 *   - `customer_notified_at` / `customer_last_seen_at: string | null`
 *     on the BookingResponse mapper. UTC ISO 8601 or epoch ms, either
 *     works — this component accepts a `Date` built from whatever the
 *     mapper decides.
 *
 * Failure mode this component locks:
 *   - a chip that reads "Customer saw your ETA Xm ago" when the chip
 *     has never seen a real timestamp. `seenAt == null` must render
 *     nothing, not a "just now" placeholder — a pleasing-looking lie
 *     is worse than silence.
 */
import { Eye } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

export function CustomerSeenChip({
  seenAt,
  now = () => new Date(),
}: {
  /**
   * When the consumer last opened the tracking map. `null` / `undefined`
   * means the backend hasn't shipped the timestamp yet (or the consumer
   * has never opened the screen) — the chip renders nothing in both
   * cases. The caller does not need to branch on null before mounting.
   */
  seenAt: Date | string | null | undefined;
  /** Injectable clock for the deterministic test. */
  now?: () => Date;
}) {
  const { t } = useT("provider");

  if (seenAt == null) return null;

  const seenDate = seenAt instanceof Date ? seenAt : new Date(seenAt);
  if (Number.isNaN(seenDate.getTime())) return null;

  const diffMs = now().getTime() - seenDate.getTime();
  // A future timestamp (clock skew) reads as "just now" — safer than
  // "-3 min ago" which looks like a UI bug and makes the whole chip
  // untrustworthy.
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs text-foreground dark:bg-success/20 dark:text-foreground"
    >
      <Eye className="h-3 w-3 text-success" aria-hidden="true" />
      {diffMinutes < 1
        ? t("jobDetail.customerSeenJustNow")
        : t("jobDetail.customerSeenAgo", { minutes: diffMinutes })}
    </span>
  );
}
