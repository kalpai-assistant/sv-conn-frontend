/**
 * The online-toggle CTA on Provider Home (SVC-491).
 *
 * Replaces the shadcn `Switch` that lived in a bordered card pre-Phase-2.
 * The toggle is the single most important commitment a provider makes per
 * session — "I am accepting jobs" — and the UI should match that weight:
 * a full-width primary CTA, ambient glow pulsing while offline to invite
 * the tap, settled drop-shadow while online to confirm the state.
 *
 * ## Why the glow lives outside the Button
 *
 * The visible glow is an absolutely-positioned sibling under the Button
 * (`absolute inset-0 -z-10 blur-xl`), animated via framer-motion. Putting
 * `box-shadow` directly on the Button would (a) animate a composited
 * property that Android WebView repaints expensively, and (b) couple the
 * glow radius to the Button's own shadow — tricky to tune. The sibling
 * pattern keeps the Button a plain primitive and the glow a visual
 * concern.
 *
 * ## Reduced-motion
 *
 * `useReducedMotion()` collapses the pulse to a static glow. The glow
 * itself stays (the user still needs the signal), only the animation
 * drops — matches the SVC-390 Celebration policy and the frontend
 * CLAUDE.md "reduced motion is not no motion" rule.
 *
 * ## Haptic
 *
 * Fires `hapticImpactMedium` (SVC-491-added) on every tap, pre-API call.
 * The server PATCH will still complete / fail / revert — the haptic
 * acknowledges the *gesture*, not the outcome. Louder than SVC-490's
 * Light taps because this gesture materially changes the dispatch filter.
 */
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { hapticImpactMedium } from "@/lib/haptics";
import { useT } from "@/i18n/LanguageProvider";

interface OnlineToggleCtaProps {
  isOnline: boolean;
  isVerified: boolean;
  /** True while the PATCH is in flight. Caller is the source of truth. */
  pending: boolean;
  /** Called with the intended next state. Caller handles the PATCH. */
  onToggle: (next: boolean) => void | Promise<void>;
}

export function OnlineToggleCta({ isOnline, isVerified, pending, onToggle }: OnlineToggleCtaProps) {
  const { t } = useT("provider");
  const reduceMotion = useReducedMotion();
  const disabled = !isVerified || pending;

  const handleClick = () => {
    if (disabled) return;
    hapticImpactMedium();
    void onToggle(!isOnline);
  };

  // While offline, the glow pulses — opacity cycles between 0.3 and 0.75
  // over 2.4s, infinitely. While online, it settles to a quiet 0.2
  // (visible drop-shadow but no pulse). Reduced-motion keeps the online
  // value in both states so the signal stays without the motion.
  const glowAnimate = reduceMotion
    ? { opacity: isOnline ? 0.2 : 0.4 }
    : isOnline
      ? { opacity: 0.2 }
      : { opacity: [0.3, 0.75, 0.3] };

  return (
    <section className="relative mt-6" aria-label={t("home.toggleLabel")}>
      {/* The glow. Behind the button via -z-10; blurred so edges feel
          halo-like, not boxy. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-primary blur-xl"
        animate={glowAnimate}
        transition={{
          duration: 2.4,
          repeat: reduceMotion || isOnline ? 0 : Infinity,
          ease: "easeInOut",
        }}
      />

      <Button
        size="lg"
        className="h-14 w-full rounded-xl text-base font-semibold shadow-lg"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={isOnline}
        aria-label={t("home.toggleLabel")}
      >
        {isOnline ? t("home.online") : t("home.offline")}
      </Button>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        {isVerified ? t("home.verifiedHint") : t("home.unverifiedHint")}
      </p>
    </section>
  );
}
