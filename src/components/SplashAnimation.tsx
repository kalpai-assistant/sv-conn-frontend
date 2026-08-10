/**
 * Animated splash — the mark shrinks and unrotates into place on a
 * white surface, then the wordmark fades in below.
 *
 * Palette is the source design's colours with the bg/fg swapped: the
 * source draws the mark bright-blue on navy; the splash draws it
 * bright-blue on white with the wordmark rendered in the source's
 * navy. Same three colours, cleaner inversion for an app-open
 * moment — a white splash reads as "app opening" while a coloured
 * splash reads as "brand billboard." See
 * `brand/eazyserv-logo-source.svg`.
 *
 * Timing (~1.8s total; matches the `AuthFlow` splash hold):
 *   0.00–0.90s  mark: scale 3.5 → 1, rotate 180° → 0°, opacity 0 → 1
 *   0.90–1.30s  wordmark: opacity 0 → 1, slide y+8 → 0
 *   1.30–1.70s  tagline: opacity 0 → 1
 *   1.70–1.90s  hold
 *   (parent's AnimatePresence handles the fade-out)
 *
 * The mark rotation is a full 180° so the animation resolves to
 * upright — a smaller angle (say 90°) would ambiguously read as
 * "landed sideways then straightened" rather than "spun in and
 * arrived." Spring physics on scale so the settle feels organic
 * rather than metronome-tween.
 */
import { motion } from "framer-motion";

// Colours pulled from the source SVG so a designer change to the brand
// palette only needs to update `brand/eazyserv-logo-source.svg` and
// these constants — nothing in the animation code changes.
const SPLASH_BG = "#FFFFFF";
const WORDMARK_COLOR = "#011346"; // source's navy, used here as text
const TAGLINE_COLOR = "#6B7280"; // muted gray, ~30% darker than app muted-fg on white

export function SplashAnimation() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: SPLASH_BG }}
    >
      {/* The mark. Rendered via <img> pointing at the extracted SVG
          in public/ so the browser can rasterise per-DPI — no raster
          fallbacks to ship. */}
      <motion.img
        src="/eazyserv-mark.svg"
        alt=""
        aria-hidden
        initial={{ scale: 3.5, rotate: 180, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{
          // Spring for scale — feels like a physical object landing.
          // The tween on rotate/opacity is default (linear + duration
          // derived from the spring) which is fine here: the eye keys
          // off scale and reads rotation/opacity as ambient support.
          type: "spring",
          damping: 12,
          stiffness: 90,
          mass: 0.9,
        }}
        style={{
          width: 120,
          height: 120,
          // Subtle blue glow — on white the mark can look thin
          // without a little bit of atmospheric drop-shadow. Kept
          // low-radius so the source's flat aesthetic is preserved.
          filter: "drop-shadow(0 8px 24px rgba(2, 158, 247, 0.25))",
        }}
      />

      {/* Wordmark. Fades in after the mark has settled — delay
          starts once the mark's spring is roughly done (0.9s). */}
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.4, ease: "easeOut" }}
        // Inter is already loaded (see index.mobile.html); tracking
        // and weight tuned to visually approximate the source
        // wordmark without shipping a custom font.
        style={{
          marginTop: 24,
          color: WORDMARK_COLOR,
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        EazyServ
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3, duration: 0.4, ease: "easeOut" }}
        style={{ marginTop: 8, color: TAGLINE_COLOR, fontSize: 14 }}
      >
        Home services at your doorstep
      </motion.p>
    </div>
  );
}
