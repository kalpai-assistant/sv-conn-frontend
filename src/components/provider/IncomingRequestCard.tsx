/**
 * The Incoming Request Card (SVC-69).
 *
 * A provider gets a push saying a job is available nearby. Tapping it opens
 * this: what the job is, how far, what it pays, and how long they have to take
 * it — with Accept and Ignore.
 *
 * Opened via `showIncomingRequest(bookingId)` or `?incomingBookingId=<uuid>`;
 * see `src/lib/incoming-request.ts`. All of the fetching, status-code and
 * countdown-seed rules live in `useBookingOffer` — read the header there first.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, MapPin, Navigation, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeamPicker } from "@/components/provider/TeamPicker";
import type { TeamPickPro } from "@/hooks/useTeam";
import { formatRupees } from "@/i18n/format";
import { hapticWarning } from "@/lib/haptics";
import { useT } from "@/i18n/LanguageProvider";
import {
  acceptErrorMessage,
  dismissReasonForOfferError,
  readSecondsRemaining,
  useAcceptOffer,
  useBookingOffer,
  type DismissReason,
} from "@/hooks/useBookingOffer";

interface IncomingRequestCardProps {
  bookingId: string;
  /** Called exactly once, with why the card closed. */
  onDismiss: (reason: DismissReason) => void;
  /**
   * SVC-492 — "why this job" chip. One short string explaining why the
   * provider was offered this booking (e.g. "Closest provider · 1.2km",
   * "Repeat customer", "Preferred service"). Null or undefined falls back
   * to the generic "Nearest match" placeholder, which is what we ship
   * today — real match reasons live downstream of Tushar's dispatch
   * logic (SVC-406/407, hands-off). When the backend eventually ships
   * `match_reason` on the offer payload, the host passes it through
   * here and the placeholder disappears.
   */
  matchReason?: string | null;
}

/**
 * Tick a server-supplied duration down locally.
 *
 * `seed` comes from `seconds_remaining`, which is computed server-side at
 * response time. That is the whole point: a countdown derived from `expires_at`
 * would subtract the *device* clock, and clock skew is unbounded — a phone 40
 * seconds off shows a 40-second-wrong timer on a 120-second window.
 *
 * Elapsed time is measured with `performance.now()`, a monotonic clock. Not
 * `Date.now()` (which jumps when the OS corrects the wall clock) and not a
 * naive `n => n - 1` per tick (which drifts whenever the timer is throttled, as
 * it is in a backgrounded tab). Both would corrupt the one number the provider
 * is relying on.
 *
 * Returns null when there is nothing trustworthy to show, and the caller hides
 * the timer rather than inventing a value.
 */
function useLocalCountdown(seed: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(seed);

  useEffect(() => {
    if (seed === null) {
      setRemaining(null);
      return;
    }
    setRemaining(seed);

    const startedAt = performance.now();
    const id = window.setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const left = Math.max(0, Math.ceil(seed - elapsed));
      setRemaining(left);
      // Nothing left to count; stop rather than leaving a timer running for
      // as long as the card stays open.
      if (left === 0) window.clearInterval(id);
      // Sub-second so the displayed second changes promptly, without the drift
      // a 1000ms decrement accumulates.
    }, 250);

    return () => window.clearInterval(id);
  }, [seed]);

  return remaining;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * SVC-492 — the countdown pill escalates as time runs out. Pre-Phase-3
 * the pill stayed `bg-white/20` the whole window; a provider glancing
 * had to read the digits to know they were running late. Three tiers:
 *
 *   > 30s   → default translucent chip. Comfortable zone.
 *   ≤ 30s   → amber. "Time to decide."
 *   ≤ 10s   → destructive red + pulse. "Now or never."
 *
 * Reduced motion is honoured in the caller — the pulse only animates
 * when `reduceMotion` is false; the colour escalation still happens
 * because colour is the signal, pulse is the amplifier.
 */
function countdownTone(seconds: number): "calm" | "amber" | "urgent" {
  if (seconds <= 10) return "urgent";
  if (seconds <= 30) return "amber";
  return "calm";
}

const COUNTDOWN_PILL_CLASS: Record<ReturnType<typeof countdownTone>, string> = {
  calm: "bg-white/20 text-primary-foreground",
  amber: "bg-amber-500 text-white",
  urgent: "bg-destructive text-destructive-foreground",
};

export function IncomingRequestCard({
  bookingId,
  onDismiss,
  matchReason,
}: IncomingRequestCardProps) {
  const { data: offer, error, isLoading } = useBookingOffer(bookingId);
  const { t, lang } = useT("provider");
  const acceptOffer = useAcceptOffer();
  const reduceMotion = useReducedMotion();
  const [acceptError, setAcceptError] = useState<string | null>(null);
  // SVC-321: set when accept answered 202 — this SP has a team and must pick
  // who does the job. Null is the ordinary offer view.
  const [pickPros, setPickPros] = useState<TeamPickPro[] | null>(null);

  // `readSecondsRemaining` returns null when the deployed backend predates
  // SVC-166 and omits the field — the timer is then hidden, not guessed.
  const countdown = useLocalCountdown(offer ? readSecondsRemaining(offer) : null);
  const hasCountdown = countdown !== null;
  const hasExpired = countdown === 0;

  // 410 → dismiss quietly (someone else won; the common outcome).
  // 403/404 → do not render; the card should never have opened.
  useEffect(() => {
    if (!error) return;
    const reason = dismissReasonForOfferError(error);
    if (reason) onDismiss(reason);
  }, [error, onDismiss]);

  // SVC-492 — fire a Warning haptic the first time the offer is on screen.
  // The native push already vibrated the device on arrival; this is the
  // *in-app* signal that the card is now visible + actionable, through
  // pocket if the user hasn't looked at the screen yet. Guarded on
  // `offer` (not loading / not errored) because the card reads nothing
  // without it. Fires once per booking id — if the provider dismisses
  // and the host re-opens the same card (never happens today, but if the
  // host ever grew retry), they don't get buzzed a second time.
  const hapticFiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!offer) return;
    if (hapticFiredFor.current === offer.booking_id) return;
    hapticFiredFor.current = offer.booking_id;
    hapticWarning();
  }, [offer]);

  const handleAccept = () => {
    setAcceptError(null);
    acceptOffer.mutate(bookingId, {
      // Won or lost, the card closes without error UI; the host decides what
      // is worth logging. A team SP's accept instead opens the picker in place.
      onSuccess: (result) => {
        if (result.outcome === "pick") setPickPros(result.pros);
        else onDismiss(result.outcome);
      },
      onError: (err) => setAcceptError(acceptErrorMessage(err, t, lang)),
    });
  };

  // Nothing to show until the offer loads. A spinner would flash for the ~100ms
  // this takes and then be replaced by the card, so render nothing instead.
  if (isLoading || !offer) return null;
  // A load error has already triggered onDismiss above; never render past it.
  if (error) return null;

  const acceptDisabled = hasExpired || acceptOffer.isPending;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-request-title"
    >
      <motion.div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-background shadow-xl"
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
      >
        <div className="flex items-center justify-between bg-primary px-5 py-3 text-primary-foreground">
          <span className="text-sm font-semibold">{t("incoming.title")}</span>
          {/* Hidden entirely when the backend has not shipped the expiry
                fields yet — the rest of the card still works. */}
          {hasCountdown && (
            <motion.span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums transition-colors ${COUNTDOWN_PILL_CLASS[countdownTone(countdown)]}`}
              // Pulse only when the window is tight. Reduced-motion: the
              // colour-escalation already carries the signal, so we drop
              // the pulse but keep the tint.
              animate={
                countdownTone(countdown) === "urgent" && !reduceMotion
                  ? { opacity: [1, 0.6, 1] }
                  : { opacity: 1 }
              }
              transition={{
                duration: 0.8,
                repeat: countdownTone(countdown) === "urgent" && !reduceMotion ? Infinity : 0,
                ease: "easeInOut",
              }}
            >
              <Clock className="h-3.5 w-3.5" />
              {formatCountdown(countdown)}
            </motion.span>
          )}
        </div>

        {pickPros ? (
          <div className="px-5 py-5">
            <TeamPicker
              bookingId={bookingId}
              pros={pickPros}
              expired={hasExpired}
              onBack={() => setPickPros(null)}
              onDismiss={onDismiss}
            />
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <div>
              <h2 id="incoming-request-title" className="text-xl font-bold text-foreground">
                {offer.service_name}
              </h2>
              {/* `service_amount` is plain rupees (not paise); formatRupees
                  applies Indian digit grouping — ₹10,00,000, not ₹1,000,000. */}
              <p className="mt-1 text-2xl font-bold text-primary">
                {formatRupees(offer.service_amount, lang)}
              </p>

              {/* SVC-492 "why this job" chip. Pre-Phase-3 the card told the
                  provider what / where / how far / how much, but not why
                  this offer landed with them. One line of that reasoning
                  turns the gesture from "blind tap" to "informed pick".
                  Placeholder "Nearest match" until SVC-406 ships a real
                  `match_reason` field. */}
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary dark:bg-primary/20">
                <Target className="h-3 w-3" aria-hidden />
                {matchReason ?? t("incoming.matchReasonPlaceholder")}
              </span>
            </div>

            <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
              <p className="flex items-start gap-2 text-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{offer.full_address}</span>
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Navigation className="h-4 w-4 shrink-0" />
                {t("incoming.away", { km: offer.distance_km.toFixed(1) })}
              </p>
            </div>

            {hasExpired && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                {t("incoming.expired")}
              </p>
            )}

            {acceptError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {acceptError}
              </p>
            )}

            {/* Accept above, Ignore below — not side by side (SVC-295).

              These used to be two equal-width buttons in one row, with Ignore
              immediately left of Accept. Reported as "tapping outside Accept
              rejects the job"; what actually happens is a thumb aimed at
              Accept landing a few millimetres left, on a screen with a
              countdown the provider is hurrying to answer. One tap, no
              confirmation, job gone.

              Stacking removes the horizontal adjacency that is the whole
              failure geometry, and the ghost variant matches how this app
              already renders a secondary action under a primary one
              (LocationGate, PayoutStep). Ignore stays full-width and a real
              button rather than a text link: this makes it harder to hit by
              *accident*, not harder to hit on purpose. */}
            <div className="flex flex-col gap-2 pt-1">
              <Button className="w-full" onClick={handleAccept} disabled={acceptDisabled}>
                {acceptOffer.isPending
                  ? t("incoming.accepting")
                  : hasExpired
                    ? t("incoming.expiredButton")
                    : t("incoming.accept")}
              </Button>
              {/* Records a refusal server-side — but not immediately. The host
                holds the decline for a few seconds behind an Undo, because
                `decline_offer` is write-once and nothing can clear it. See
                IncomingRequestHost. */}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => onDismiss("ignored")}
                disabled={acceptOffer.isPending}
              >
                {t("incoming.ignore")}
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
