/**
 * Celebration overlay + inline pulse (SVC-390).
 *
 * `Celebration` is the full-screen takeover after a booking is confirmed:
 * big primary-blue circle with a drawn-in checkmark, confetti dots fanning
 * outward, 1.5s hold, then `onComplete` fires so the caller can advance to
 * tracking.
 *
 * `InlineCelebration` is the subtle sibling for smaller wins (OTP verified,
 * coupon applied). Checkmark pulse + label, no overlay, no auto-dismiss —
 * the caller unmounts it when they're ready.
 *
 * Both honour `prefers-reduced-motion`: Celebration drops the confetti and
 * shortens the checkmark draw-in, but keeps the full 1.5s hold so the user
 * still *sees* the confirmation state rather than it flashing past. Reduced
 * motion is not "no motion" — it's "no superfluous motion".
 *
 * Confetti deliberately uses the brand-primary token at varied opacities
 * rather than Tailwind's sky/indigo palette. The whole app lives on hue 262
 * (see styles.css); confetti in a different hue would feel grafted on.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

// Six confetti pieces, hand-placed so no two land on the same vector —
// clustering reads as a bug, not a celebration.
const CONFETTI_PIECES = [
  { x: -116, y: -126, rotate: 16, opacity: 1 },
  { x: 122, y: -104, rotate: -24, opacity: 0.6 },
  { x: -145, y: 14, rotate: 32, opacity: 0.8 },
  { x: 145, y: 36, rotate: -10, opacity: 0.7 },
  { x: -72, y: 126, rotate: -38, opacity: 0.5 },
  { x: 83, y: 130, rotate: 18, opacity: 0.9 },
];

const AUTO_DISMISS_MS = 1500;

export function Celebration({ onComplete }: { onComplete?: () => void }) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="status"
          aria-live="polite"
        >
          <div className="relative flex size-32 items-center justify-center">
            {!reduceMotion &&
              CONFETTI_PIECES.map((piece, index) => (
                <motion.span
                  key={index}
                  className="absolute h-2.5 w-5 rounded-full bg-primary"
                  style={{ opacity: piece.opacity }}
                  initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                  animate={{
                    x: piece.x,
                    y: piece.y,
                    opacity: [0, piece.opacity, piece.opacity, 0],
                    rotate: piece.rotate,
                  }}
                  transition={{ duration: 1.15, delay: index * 0.025, ease: "easeOut" }}
                  aria-hidden="true"
                />
              ))}
            <motion.div
              className="flex size-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
              initial={{ scale: reduceMotion ? 0.9 : 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 18,
                duration: reduceMotion ? 0.18 : undefined,
              }}
            >
              <motion.div
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{
                  duration: reduceMotion ? 0.15 : 0.42,
                  delay: reduceMotion ? 0 : 0.18,
                }}
              >
                <Check aria-hidden="true" className="size-11 stroke-[2.5]" />
              </motion.div>
            </motion.div>
          </div>
          <motion.h1
            className="mt-8 text-2xl font-bold tracking-tight text-foreground"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.18 }}
          >
            Booking confirmed!
          </motion.h1>
          <p className="mt-2 text-base text-muted-foreground">Your pro is on the way</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function InlineCelebration({ label = "Done" }: { label?: string }) {
  return (
    <motion.span
      className="inline-flex items-center gap-2 text-sm font-medium text-primary"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 350, damping: 18 }}
      role="status"
    >
      <motion.span
        className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
        initial={{ scale: 0.5 }}
        animate={{ scale: [0.5, 1.12, 1] }}
        transition={{ duration: 0.45 }}
      >
        <Check aria-hidden="true" className="size-3.5 stroke-[3]" />
      </motion.span>
      {label}
    </motion.span>
  );
}
