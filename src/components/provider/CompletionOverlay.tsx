/**
 * COMPLETED-state overlay on the provider job screen (SVC-493).
 *
 * Replaces the plain "Paid out" footer that ended the job on a line of
 * muted text with a full moment-of-pride: the SVC-390 `Celebration`
 * (reused via its new optional title/subtitle props — Celebration is
 * NOT forked), a spring-rolled earnings number that counts up from 0,
 * and a Success haptic that fires once per booking.
 *
 * Why spring-roll the number: a static figure reads as "amount shown".
 * A number that climbs under a spring reads as "amount earned" —
 * perceived agency, not a database value.
 *
 * Failure modes locked by this component:
 *   - haptic fires on every re-render (poll-triggered React Query
 *     refresh). `hapticSuccess` is strong iOS triple-buzz and would
 *     turn into a 4-second buzz loop on a route that polls every 4s.
 *     Guarded by a `firedForBookingId` ref — one fire per booking id
 *     per mount. SVC-492 uses the same pattern for `hapticWarning`.
 *   - `useReducedMotion()` disables the number spring — the overlay
 *     still renders the earnings figure, just without the roll. The
 *     Celebration component already honours reduced-motion for its
 *     own confetti / scale-in.
 *   - `providerPayout == null` on an older booking: render the overlay
 *     with `—` as the amount and no spring. A silent crash on a
 *     successful job is a worse experience than an honest blank.
 *   - overlay auto-dismisses after `Celebration`'s 1.5s hold, then
 *     calls `onDismissed` so the host screen can swap the overlay
 *     for the `EarningsBreakdown` body. Dismiss is one-way: the
 *     overlay never re-shows for the same booking id after fire.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Celebration } from "@/components/Celebration";
import { hapticSuccess } from "@/lib/haptics";
import { formatRupees } from "@/i18n/format";
import { useT } from "@/i18n/LanguageProvider";

export function CompletionOverlay({
  bookingId,
  payoutAmount,
  onDismissed,
}: {
  bookingId: string;
  /** Provider's actual earnings on this job. Null-safe. */
  payoutAmount: number | null | undefined;
  onDismissed: () => void;
}) {
  const { t, lang } = useT("provider");
  const reduceMotion = useReducedMotion();
  const firedForBookingId = useRef<string | null>(null);
  const [rolled, setRolled] = useState<number>(reduceMotion ? (payoutAmount ?? 0) : 0);

  // Haptic once per booking id. Mount-only effect by design — React
  // Query's 4s poll remounts data, not the overlay, but a defensive
  // guard on the booking id covers the edge case where the host swaps
  // bookings underneath without a parent-level unmount.
  useEffect(() => {
    if (firedForBookingId.current === bookingId) return;
    firedForBookingId.current = bookingId;
    hapticSuccess();
  }, [bookingId]);

  // Spring-roll the earnings number. `framer-motion`'s animate() would
  // be the "clean" path, but we already mock `motion.*` in tests and
  // the number is a value, not a style — a plain rAF tween is easier
  // to test and has no runtime dependency to mock. Reduced-motion skips
  // the tween entirely (initial state = final state).
  useEffect(() => {
    if (payoutAmount == null) return;
    if (reduceMotion) {
      setRolled(payoutAmount);
      return;
    }
    const start = performance.now();
    const duration = 700;
    let rafId = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic — snappy at the start, settles to the final
      // value. Matches the "spring" felt on neighbouring surfaces
      // (SVC-399) without needing an actual spring solver.
      const eased = 1 - Math.pow(1 - t, 3);
      setRolled(Math.round(payoutAmount * eased));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [payoutAmount, reduceMotion]);

  const amountText =
    payoutAmount == null ? "—" : formatRupees(rolled, lang);

  return (
    <>
      <Celebration
        onComplete={onDismissed}
        title={t("jobDetail.completionTitle")}
        subtitle={t("jobDetail.completionSubtitle", { amount: amountText })}
      />
      {/* An invisible live-region carries the final amount to screen
          readers. Celebration's subtitle is a static <p>, so the
          spring-rolling number would otherwise re-announce every
          frame. We pin a single polite announcement at the final
          value only. */}
      <motion.span
        className="sr-only"
        aria-live="polite"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {t("jobDetail.completionSubtitle", {
          amount: payoutAmount == null ? "—" : formatRupees(payoutAmount, lang),
        })}
      </motion.span>
    </>
  );
}
